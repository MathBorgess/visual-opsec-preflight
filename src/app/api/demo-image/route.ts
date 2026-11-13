import sharp from 'sharp';
import { guard, jsonResponse } from '@/server/security';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    guard(req);
    if (process.env.OPSEC_PROVIDER !== 'demo' || process.env.VERCEL)
      return jsonResponse(
        { error: { message: 'Fixture disponível somente na simulação local.' } },
        404,
      );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#e8e2d8"/><rect x="120" y="95" width="900" height="300" rx="20" fill="#fffdf8"/><text x="175" y="205" font-family="sans-serif" font-size="66" fill="#1c302d">Encontro Aurora</text><text x="175" y="305" font-family="sans-serif" font-size="46" fill="#566b65">Edição 2026 · cenário fictício</text><rect x="180" y="530" width="1180" height="340" rx="30" fill="#263c37"/>${Array.from({ length: 40 }, (_, i) => `<rect x="${225 + (i % 10) * 110}" y="${575 + Math.floor(i / 10) * 65}" width="80" height="40" rx="7" fill="#e0e7d7"/>`).join('')}<text x="100" y="955" font-family="sans-serif" font-size="28" fill="#566b65">VISUAL OPSEC · IMAGEM SINTÉTICA PARA TESTE LOCAL</text></svg>`;
    const image = await sharp(Buffer.from(svg))
      .jpeg()
      .withExif({ IFD0: { Make: 'Fixture sintética', Model: 'Aurora Demo' } })
      .toBuffer();
    return new Response(new Uint8Array(image), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
    });
  } catch {
    return jsonResponse({ error: { message: 'Não foi possível gerar a fixture.' } }, 500);
  }
}
