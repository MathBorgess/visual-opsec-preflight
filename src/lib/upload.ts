import { AppError, LIMITS } from './contracts';

// Header-only preflight. The server still validates the complete file and decode.
export async function preflightImage(file: File) {
  if (!file.size || file.size > LIMITS.bytes)
    throw new AppError(
      'IMAGE_SIZE',
      `Arquivo com ${file.size} bytes; máximo de ${LIMITS.bytes} bytes (3 MiB).`,
      400,
      { bounds: { name: 'bytes', actual: file.size, maximum: LIMITS.bytes } },
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const data = new DataView(bytes.buffer);
  let width: number | undefined, height: number | undefined;
  const png =
    bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (png) {
    width = data.getUint32(16);
    height = data.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 255) {
        offset++;
        continue;
      }
      if (marker === 217 || marker === 218) break;
      const length = data.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker) && length >= 7) {
        height = data.getUint16(offset + 5);
        width = data.getUint16(offset + 7);
        break;
      }
      offset += 2 + length;
    }
  } else throw new AppError('IMAGE_FORMAT', 'Selecione um JPEG ou PNG estático.');
  if (width && height && width * height > LIMITS.pixels)
    throw new AppError(
      'IMAGE_DIMENSIONS',
      `Foto com ${width} × ${height} (${((width * height) / 1_000_000).toFixed(2)} MP); máximo de 16 MP.`,
      400,
      { bounds: { name: 'pixels', actual: width * height, maximum: LIMITS.pixels, width, height } },
    );
  return { bytes: file.size, width, height };
}
