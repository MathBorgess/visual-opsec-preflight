import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processImage } from '@/server/image';

describe('parser e derivada reais', () => {
  it('aceita PNG estático, remove metadados e declara a cobertura do extrator', async () => {
    const png = await sharp({
      create: { width: 320, height: 180, channels: 4, background: '#aabbcc88' },
    })
      .png()
      .toBuffer();
    const result = await processImage(png);
    const derived = await sharp(Buffer.from(result.dataUrl.split(',')[1], 'base64')).metadata();
    expect(derived.format).toBe('jpeg');
    expect(derived.exif).toBeUndefined();
    expect(derived.xmp).toBeUndefined();
    expect(derived.width).toBe(320);
    expect(result.info.metadata.find((m) => m.field === 'Texto PNG')?.state).toBe('not_supported');
  });
  it('rejeita animação antes de IA e decodificação', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    const actl = Buffer.alloc(20);
    actl.writeUInt32BE(8, 0);
    actl.write('acTL', 4);
    await expect(
      processImage(Buffer.concat([png.subarray(0, 33), actl, png.subarray(33)])),
    ).rejects.toMatchObject({ code: 'ANIMATION' });
  });
  it('rejeita imagem comprimida que ultrapassa o limite de pixels', async () => {
    const png = await sharp({
      create: { width: 4100, height: 4000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(processImage(png)).rejects.toMatchObject({ code: 'CORRUPT_IMAGE' });
  });
});
