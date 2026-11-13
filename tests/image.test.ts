import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { randomFillSync } from 'node:crypto';
import { LIMITS } from '@/lib/contracts';
import { preflightImage } from '@/lib/upload';
import { processImage } from '@/server/image';

describe('parser e derivada reais', () => {
  it.each([
    'senha="segredoficticio com espaços"',
    '{"token":"segredoficticio"}',
    "api_key='segredoficticio'",
  ])('mascara credencial entre aspas no campo de autoria: %s', async (artist) => {
    const jpeg = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'white' },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'Ana Exemplo; ' + artist } })
      .toBuffer();
    const result = await processImage(jpeg);
    const value = result.info.metadata.find(
      (m) => m.field === 'Autoria/identificadores',
    )?.providedValue;
    expect(value).toContain('Ana Exemplo');
    expect(value).toContain('[segredo omitido]');
    expect(JSON.stringify(result.info)).not.toContain('segredoficticio');
  });
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
    await expect(processImage(png)).rejects.toMatchObject({
      code: 'IMAGE_DIMENSIONS',
      details: { bounds: { actual: 16_400_000, maximum: 16_000_000, width: 4100, height: 4000 } },
    });
    await expect(
      preflightImage(new File([new Uint8Array(png)], 'fixture.png')),
    ).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS' });
  });
  it('aceita foto detalhada abaixo de 3 MiB e reduz resolução até respeitar imagem inline', async () => {
    const bytes = randomFillSync(Buffer.alloc(2048 * 2048 * 3));
    const input = await sharp(bytes, { raw: { width: 2048, height: 2048, channels: 3 } })
      .jpeg({ quality: 70 })
      .withExif({ IFD0: { Artist: 'PRIVATE_FIXTURE', Make: 'Synthetic Camera' } })
      .toBuffer();
    expect(input.length).toBeLessThan(LIMITS.bytes);
    const result = await processImage(input);
    const output = Buffer.from(result.dataUrl.split(',')[1], 'base64');
    const metadata = await sharp(output).metadata();
    expect(output.length).toBeLessThanOrEqual(LIMITS.derivative);
    expect(result.dataUrl.length).toBeLessThanOrEqual(LIMITS.imageUrlChars);
    expect(result.info.derivedWidth).toBeLessThan(2048);
    expect(result.info.metadata.find((row) => row.field === 'Autoria/identificadores')?.state).toBe(
      'present',
    );
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(
      result.info.metadata.find((row) => row.field === 'Autoria/identificadores')?.providedValue,
    ).toContain('Artist: PRIVATE_FIXTURE');
    await expect(
      preflightImage(new File([new Uint8Array(input)], 'fixture.jpg')),
    ).resolves.toMatchObject({ width: 2048, height: 2048 });
  });
});
