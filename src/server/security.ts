import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, LIMITS, type Manifest } from '@/lib/contracts';

const globals = globalThis as typeof globalThis & { __opsecSigning?: string };
function signingKey() {
  if (process.env.CASE_SIGNING_SECRET && process.env.CASE_SIGNING_SECRET.length >= 32)
    return process.env.CASE_SIGNING_SECRET;
  if (process.env.VERCEL)
    throw new AppError('SIGNING_NOT_CONFIGURED', 'Configure CASE_SIGNING_SECRET no backend.', 503);
  return (globals.__opsecSigning ??= randomBytes(32).toString('hex'));
}
export function signManifest(m: Manifest): string {
  const body = Buffer.from(JSON.stringify(m)).toString('base64url');
  const signature = createHmac('sha256', signingKey()).update(body).digest('base64url');
  return body + '.' + signature;
}
export function readManifest(
  req: Request,
  optional = false,
  allowExpired = false,
): Manifest | null {
  const value = req.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('opsec_case='))
    ?.slice(11);
  if (!value) {
    if (optional) return null;
    throw new AppError('NO_CASE', 'Nenhum caso ativo neste navegador.', 404);
  }
  try {
    if (value.length > 4000) throw Error();
    const [body, signature, extra] = value.split('.');
    const expected = createHmac('sha256', signingKey()).update(body).digest();
    const received = Buffer.from(signature ?? '', 'base64url');
    if (extra || received.length !== expected.length || !timingSafeEqual(received, expected))
      throw Error();
    const m = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (
      m.version !== 1 ||
      typeof m.caseId !== 'string' ||
      !['demo', 'openai'].includes(m.provider) ||
      typeof m.expiresAt !== 'number'
    )
      throw Error();
    if (!allowExpired && Date.now() > m.expiresAt)
      throw new AppError(
        'CASE_EXPIRED',
        'A referência local expirou; isso não confirma exclusão remota.',
        410,
      );
    return m as Manifest;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('INVALID_CASE', 'Referência do caso inválida ou servidor reiniciado.', 401);
  }
}
export function guard(req: Request, mutation = false) {
  const host = req.headers.get('host') ?? new URL(req.url).host;
  if (!process.env.VERCEL && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
    throw new AppError(
      'LOCAL_ACCESS_ONLY',
      'A execução local aceita apenas acesso por localhost.',
      403,
    );
  if (process.env.VERCEL && process.env.OPSEC_DEPLOYMENT_PROTECTED !== 'true')
    throw new AppError(
      'DEPLOYMENT_NOT_PROTECTED',
      'Verifique a proteção do deployment antes de habilitar a aplicação.',
      503,
    );
  if (mutation) {
    let valid = false;
    try {
      const origin = new URL(req.headers.get('origin') ?? '');
      valid = origin.host === host && ['http:', 'https:'].includes(origin.protocol);
    } catch {
      /* malformed origin */
    }
    if (!valid) throw new AppError('INVALID_ORIGIN', 'Origem da solicitação não autorizada.', 403);
  }
}
export function jsonResponse(value: unknown, status = 200, m?: Manifest | null, clear = false) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (clear)
    headers.set(
      'Set-Cookie',
      'opsec_case=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' +
        (process.env.VERCEL ? '; Secure' : ''),
    );
  else if (m)
    headers.set(
      'Set-Cookie',
      `opsec_case=${signManifest(m)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor((m.expiresAt - Date.now()) / 1000))}${process.env.VERCEL ? '; Secure' : ''}`,
    );
  return new Response(JSON.stringify(value), { status, headers });
}
export async function boundedBody(req: Request, max = LIMITS.body): Promise<Buffer> {
  if (Number(req.headers.get('content-length') ?? 0) > max)
    throw new AppError('BODY_TOO_LARGE', 'Solicitação excede o tamanho permitido.', 413);
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError('BODY_TOO_LARGE', 'Solicitação excede o tamanho permitido.', 413);
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
export async function imageForm(req: Request) {
  const bytes = await boundedBody(req);
  try {
    return await new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': req.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    throw new AppError('INVALID_UPLOAD', 'Envie a imagem como formulário multipart.');
  }
}
