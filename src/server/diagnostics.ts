import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { AppError, type Diagnostic, type ProviderDiagnostic } from '@/lib/contracts';

type Context = {
  id: string;
  started: number;
  stage: string;
  providerInvoked: boolean;
  provider?: ProviderDiagnostic;
  signal: AbortSignal;
};
const context = new AsyncLocalStorage<Context>();
export function safeId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_.:\[\]-]{1,160}$/.test(value)
    ? value
    : undefined;
}
export function snapshotDiagnostic(error?: AppError): Diagnostic | undefined {
  const c = context.getStore();
  return c
    ? {
        requestId: c.id,
        stage: c.stage,
        elapsedMs: Date.now() - c.started,
        providerInvoked: c.providerInvoked,
        ...(error ? { code: error.code, ...error.details } : {}),
        ...(c.provider || error?.details?.provider
          ? { provider: { ...c.provider, ...error?.details?.provider } }
          : {}),
      }
    : undefined;
}
function logDiagnostic(error?: AppError) {
  const diagnostic = snapshotDiagnostic(error);
  if (!diagnostic?.provider) return diagnostic;
  const { summary: _summary, ...provider } = diagnostic.provider;
  return { ...diagnostic, provider };
}
export function diagnosticEvent(stage: string, measurements?: Record<string, number>) {
  const c = context.getStore();
  if (!c) return;
  c.stage = stage;
  // Only numerical measurements from application code. Never log payloads or exceptions.
  console.info(
    JSON.stringify({
      event: 'opsec.stage',
      ...logDiagnostic(),
      ...(measurements ? { measurements } : {}),
    }),
  );
}
export function providerDiagnostic(data: ProviderDiagnostic = {}) {
  const c = context.getStore();
  if (!c) return;
  c.providerInvoked = true;
  c.provider = { ...c.provider, ...data };
}
export function operationSignal(): AbortSignal | undefined {
  return context.getStore()?.signal;
}
export function withDiagnostics(req: Request, endpoint: string, fn: () => Promise<Response>) {
  const supplied = req.headers.get('x-opsec-request-id');
  const id = supplied && /^[a-f0-9-]{36}$/i.test(supplied) ? supplied : randomUUID();
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]);
  return context.run(
    {
      id,
      started: Date.now(),
      stage: endpoint === 'create' ? 'upload' : endpoint,
      providerInvoked: false,
      signal,
    },
    async () => {
      diagnosticEvent(endpoint === 'create' ? 'upload' : endpoint);
      const response = await fn();
      response.headers.set('x-opsec-request-id', id);
      console.info(
        JSON.stringify({
          event: 'opsec.response',
          ...logDiagnostic(),
          status: response.status,
        }),
      );
      return response;
    },
  );
}
export function logFailure(error: AppError) {
  console.error(JSON.stringify({ event: 'opsec.failure', ...logDiagnostic(error) }));
}
