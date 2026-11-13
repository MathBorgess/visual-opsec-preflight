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
import { minimize } from '@/lib/policy';

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
  if (!bytes.length || bytes.length > LIMITS.bytes)
    throw new AppError('IMAGE_SIZE', 'A foto deve ter até 3 MiB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new AppError('IMAGE_FORMAT', 'Selecione um JPEG ou PNG estático.');
  if (png && pngAnimated(bytes))
    throw new AppError('ANIMATION', 'Imagens animadas não são aceitas.');
  try {
    const meta = await sharp(bytes, {
      limitInputPixels: LIMITS.pixels,
      failOn: 'warning',
    }).metadata();
    if (
      !['jpeg', 'png'].includes(meta.format) ||
      (meta.pages ?? 1) > 1 ||
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > LIMITS.pixels
    )
      throw new AppError('IMAGE_DIMENSIONS', 'A imagem deve ser estática e ter até 16 megapixels.');
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
    const add = (field: string, present: boolean, value: string, privateValue = false) =>
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
      });
    add(
      'GPS',
      !!parsed &&
        ['GPSLatitude', 'GPSLongitude', 'latitude', 'longitude'].some(
          (k) => parsed[k] !== undefined,
        ),
      'Coordenadas presentes; valores omitidos e não enviados à busca.',
      true,
    );
    for (const key of ['Make', 'Model', 'Software'])
      add(key, parsed?.[key] !== undefined, minimize(String(parsed?.[key] ?? '').slice(0, 120)));
    add(
      'Data de captura',
      parsed?.DateTimeOriginal !== undefined,
      'Data registrada no arquivo; fuso e autenticidade não confirmados.',
    );
    add(
      'Autoria/identificadores',
      !!parsed &&
        ['Artist', 'OwnerName', 'BodySerialNumber', 'ImageUniqueID', 'Copyright'].some(
          (k) => parsed[k] !== undefined,
        ),
      'Campo pessoal ou identificador presente; valor omitido.',
      true,
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
    const resized = pipeline.resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    });
    let result = await resized.clone().jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (result.data.length > LIMITS.derivative) {
      result = await resized.clone().jpeg({ quality: 55 }).toBuffer({ resolveWithObject: true });
      limitations.push('Derivada comprimida adicionalmente; detalhes pequenos podem se perder.');
    }
    if (result.data.length > LIMITS.derivative)
      throw new AppError(
        'DERIVATIVE_SIZE',
        'A imagem ainda excede o limite após compressão; selecione uma cópia menor.',
      );
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
      dataUrl: 'data:image/jpeg;base64,' + result.data.toString('base64'),
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      'CORRUPT_IMAGE',
      'Não foi possível decodificar a imagem dentro dos limites.',
    );
  }
}
