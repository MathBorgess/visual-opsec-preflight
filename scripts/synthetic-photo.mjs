import sharp from 'sharp';
import { randomFillSync } from 'node:crypto';
export async function syntheticPhoto() {
  const svg =
    '<svg width="2048" height="2048" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="80" width="1888" height="650" fill="white"/><text x="160" y="300" font-family="sans-serif" font-size="150" fill="black">Mozilla Firefox</text><text x="160" y="480" font-family="sans-serif" font-size="90" fill="black">mozilla.org</text><text x="160" y="610" font-family="sans-serif" font-size="48" fill="black">SYNTHETIC PRIVACY EDUCATION TEST</text></svg>';
  const bytes = await sharp(randomFillSync(Buffer.alloc(2048 * 2048 * 3)), {
    raw: { width: 2048, height: 2048, channels: 3 },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 70 })
    .withExif({ IFD0: { Make: 'Synthetic Camera', Artist: 'Fictitious fixture author' } })
    .toBuffer();
  return bytes;
}
