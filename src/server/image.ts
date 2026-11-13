import 'server-only';
import sharp from 'sharp';
import exifr from 'exifr';
import { createHash } from 'node:crypto';
import {
  AppError,
  LIMITS,
  type BoxData,
  type ImageInfo,
  type MetadataRow,
  validBox,
} from '@/lib/contracts';
import { maskCredentials, minimize } from '@/lib/policy';
import { diagnosticEvent } from './diagnostics';

function pngAnimated(buf: Buffer) {
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const size = buf.readUInt32BE(offset);
    if (offset + size + 12 > buf.length) throw new AppError('CORRUPT_IMAGE', 'PNG incompleto.');
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    offset += size + 12;
  }
  return false;
}
export async function processImage(
  bytes: Buffer,
  bbox?: BoxData,
): Promise<{ info: ImageInfo; dataUrl: string }> {
  diagnosticEvent('image_validation', { bytes: bytes.length });
  if (!bytes.length || bytes.length > LIMITS.bytes)
    throw new AppError(
      'IMAGE_SIZE',
      `A foto tem ${bytes.length} bytes; o limite é ${LIMITS.bytes} bytes (3 MiB).`,
      400,
      { bounds: { name: 'bytes', actual: bytes.length, maximum: LIMITS.bytes } },
    );
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new AppError('IMAGE_FORMAT', 'Selecione um JPEG ou PNG estático.');
  if (png && pngAnimated(bytes))
    throw new AppError('ANIMATION', 'Imagens animadas não são aceitas.');
  try {
    const meta = await sharp(bytes, {
      // Header inspection does not decode the raster. Check dimensions explicitly
      // before the bounded decoder, so excess pixels are never called corruption.
      limitInputPixels: false,
      failOn: 'warning',
    }).metadata();
    if (
      !['jpeg', 'png'].includes(meta.format) ||
      (meta.pages ?? 1) > 1 ||
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > LIMITS.pixels
    )
      throw new AppError(
        'IMAGE_DIMENSIONS',
        `A imagem mede ${meta.width ?? 0} × ${meta.height ?? 0}; o limite é 16 milhões de pixels, em imagem estática.`,
        400,
        {
          bounds: {
            name: 'pixels',
            actual: (meta.width ?? 0) * (meta.height ?? 0),
            maximum: LIMITS.pixels,
            width: meta.width,
            height: meta.height,
          },
        },
      );
    diagnosticEvent('metadata', {
      width: meta.width,
      height: meta.height,
      pixels: meta.width * meta.height,
    });
    const rows: MetadataRow[] = [];
    const limitations: string[] = [
      'Metadados podem ser alterados. Ausência não demonstra ausência de exposição.',
      'Leitura visual de texto é interpretação do modelo, sem OCR independente.',
    ];
    let parsed: Record<string, unknown> | undefined;
    let parseFailed = false;
    try {
      parsed = await exifr.parse(bytes, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: true,
        iptc: true,
        icc: false,
      });
    } catch {
      parseFailed = true;
    }
    const add = (
      field: string,
      present: boolean,
      value: string,
      privateValue = false,
      providedValue?: string,
    ) =>
      rows.push({
        id: 'M' + String(rows.length + 1).padStart(2, '0'),
        field,
        state: parseFailed ? 'failed' : present ? 'present' : 'not_present',
        value: parseFailed
          ? 'Não foi possível extrair; ausência não confirmada.'
          : present
            ? value
            : 'Não encontrado nos campos suportados.',
        private: privateValue,
        ...(!parseFailed && present && providedValue
          ? { providedValue: maskCredentials(providedValue).slice(0, 1000) }
          : {}),
      });
    const fields = (keys: string[]) =>
      keys
        .filter((key) => parsed?.[key] !== undefined)
        .map((key) => `${key}: ${String(parsed?.[key])}`)
        .join('; ');
    add(
      'GPS',
      !!parsed &&
        ['GPSLatitude', 'GPSLongitude', 'latitude', 'longitude'].some(
          (k) => parsed[k] !== undefined,
        ),
      'Coordenadas registradas no arquivo; não comprovam localização atual nem são enviadas à busca.',
      true,
      fields([
        'latitude',
        'longitude',
        'GPSLatitude',
        'GPSLatitudeRef',
        'GPSLongitude',
        'GPSLongitudeRef',
      ]),
    );
    for (const key of ['Make', 'Model', 'Software'])
      add(key, parsed?.[key] !== undefined, minimize(String(parsed?.[key] ?? '').slice(0, 120)));
    add(
      'Data de captura',
      parsed?.DateTimeOriginal !== undefined,
      'Data registrada no arquivo; fuso e autenticidade não confirmados.',
      false,
      fields(['DateTimeOriginal']),
    );
    add(
      'Autoria/identificadores',
      !!parsed &&
        ['Artist', 'OwnerName', 'BodySerialNumber', 'ImageUniqueID', 'Copyright'].some(
          (k) => parsed[k] !== undefined,
        ),
      'Campo de autoria ou identificador registrado no arquivo; não confirma identidade.',
      true,
      fields(['Artist', 'OwnerName', 'BodySerialNumber', 'ImageUniqueID', 'Copyright']),
    );
    rows.push({
      id: 'M07',
      field: 'Blocos embutidos',
      state: meta.exif || meta.iptc || meta.xmp ? 'present' : 'not_present',
      value:
        [meta.exif && 'EXIF', meta.iptc && 'IPTC', meta.xmp && 'XMP'].filter(Boolean).join(', ') ||
        'Nenhum desses blocos identificado.',
      private: false,
    });
    if (png)
      rows.push({
        id: 'M08',
        field: 'Texto PNG',
        state: 'not_supported',
        value:
          'Inventário completo de chunks de texto PNG não é suportado pelo extrator; a derivada não os copia.',
        private: false,
      });
    diagnosticEvent('normalization');
    const oriented = await sharp(bytes, { limitInputPixels: LIMITS.pixels, failOn: 'warning' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = oriented.info;
    let pipeline = sharp(oriented.data);
    if (bbox) {
      if (!validBox(bbox)) throw new AppError('INVALID_BOX', 'Região fora da imagem.');
      const left = Math.floor(bbox[0] * width),
        top = Math.floor(bbox[1] * height);
      pipeline = pipeline.extract({
        left,
        top,
        width: Math.max(1, Math.min(width - left, Math.ceil(bbox[2] * width))),
        height: Math.max(1, Math.min(height - top, Math.ceil(bbox[3] * height))),
      });
    }
    const attempts = [
      [2048, 82],
      [2048, 55],
      [1536, 65],
      [1024, 65],
      [768, 65],
      [512, 60],
    ] as const;
    let result;
    let attempt = 0;
    for (const [edge, quality] of attempts) {
      result = await pipeline
        .clone()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer({ resolveWithObject: true });
      diagnosticEvent('normalization', {
        attempt: ++attempt,
        edge,
        quality,
        bytes: result.data.length,
      });
      if (result.data.length <= LIMITS.derivative) break;
    }
    if (!result || result.data.length > LIMITS.derivative)
      throw new AppError(
        'DERIVATIVE_SIZE',
        'A derivada excede 700 KiB após as tentativas de compressão. Copie o diagnóstico.',
        400,
        {
          bounds: {
            name: 'derivativeBytes',
            actual: result?.data.length ?? 0,
            maximum: LIMITS.derivative,
          },
        },
      );
    if (attempt > 1)
      limitations.push(
        `Derivada adaptada para ${result.info.width} × ${result.info.height}; detalhes pequenos podem se perder e merecer recorte.`,
      );
    const dataUrl = 'data:image/jpeg;base64,' + result.data.toString('base64');
    if (dataUrl.length > LIMITS.imageUrlChars)
      throw new AppError('IMAGE_URL_SIZE', 'A imagem inline excede o contrato da OpenAI.', 400, {
        bounds: { name: 'imageUrlChars', actual: dataUrl.length, maximum: LIMITS.imageUrlChars },
      });
    diagnosticEvent('image_ready', {
      derivedWidth: result.info.width,
      derivedHeight: result.info.height,
      derivedBytes: result.data.length,
      imageUrlChars: dataUrl.length,
    });
    return {
      info: {
        width,
        height,
        derivedWidth: result.info.width,
        derivedHeight: result.info.height,
        format: meta.format,
        hash: createHash('sha256').update(bytes).digest('hex'),
        metadata: rows,
        limitations,
      },
      dataUrl,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      'CORRUPT_IMAGE',
      'Não foi possível decodificar a imagem dentro dos limites.',
    );
  }
}
