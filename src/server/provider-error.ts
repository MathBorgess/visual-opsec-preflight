import 'server-only';
import OpenAI from 'openai';
import { AppError, type ProviderDiagnostic } from '@/lib/contracts';
import { providerDiagnostic, safeId } from './diagnostics';

export class ProviderError extends AppError {
  constructor(
    code: string,
    message: string,
    status: number,
    public definitive: boolean,
    provider: ProviderDiagnostic,
    retryable = false,
  ) {
    super(code, message, status, { provider, retryable });
  }
}
export function normalizeProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const code = safeId(error.code);
    const retry = Number(error.headers?.get('retry-after'));
    // Fixed protocol keywords only; never copy the provider's free-form message.
    const hints = [
      'schema',
      'prefixItems',
      'model',
      'image',
      'environment',
      'tool',
      'limit',
      'quota',
    ].filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(error.message));
    const provider = {
      ...(hints.length ? { hints } : {}),
      status,
      code,
      param: safeId(error.param),
      requestId: safeId(error.requestID),
      ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.min(retry, 3600) } : {}),
    };
    providerDiagnostic(provider);
    if (status === 401)
      return new ProviderError(
        'OPENAI_AUTHENTICATION',
        'A OpenAI recusou a autenticação. Revise a credencial do servidor.',
        502,
        true,
        provider,
      );
    if (status === 403)
      return new ProviderError(
        'OPENAI_PERMISSION',
        'O projeto OpenAI não tem permissão para esta operação.',
        502,
        true,
        provider,
      );
    if (status === 404)
      return new ProviderError(
        'OPENAI_NOT_FOUND',
        'Modelo ou sessão indisponível no projeto OpenAI.',
        502,
        true,
        provider,
      );
    if (status === 429 && code === 'insufficient_quota')
      return new ProviderError(
        'OPENAI_QUOTA',
        'O projeto OpenAI está sem quota ou saldo disponível.',
        503,
        true,
        provider,
      );
    if (status === 429)
      return new ProviderError(
        'OPENAI_RATE_LIMIT',
        'A OpenAI limitou a frequência. Aguarde antes de tentar novamente.',
        429,
        true,
        provider,
        true,
      );
    if (status && status >= 400 && status < 500)
      return new ProviderError(
        'OPENAI_INVALID_REQUEST',
        'A OpenAI rejeitou um parâmetro da integração. Copie o diagnóstico para identificar o campo.',
        502,
        true,
        provider,
      );
    if (error instanceof OpenAI.APIConnectionTimeoutError || error.name === 'APIUserAbortError')
      return new ProviderError(
        'OPENAI_TIMEOUT',
        'A operação OpenAI excedeu o prazo. Consulte o estado existente antes de reenviar.',
        504,
        false,
        provider,
        true,
      );
    return new ProviderError(
      'OPENAI_UNAVAILABLE',
      'A comunicação com a OpenAI não foi confirmada. Consulte o estado antes de reenviar.',
      502,
      false,
      provider,
      true,
    );
  }
  return new ProviderError(
    'PROVIDER_FAILURE',
    'A operação não foi confirmada. Consulte o estado do caso antes de tentar novamente.',
    502,
    false,
    {},
    true,
  );
}
export function savedProviderError(
  error: unknown,
  sessionId: string,
  turnId?: string,
): AppError | undefined {
  if (!error) return undefined;
  const code =
    typeof error === 'object' && error && 'code' in error ? safeId(error.code) : undefined;
  const provider = { code, sessionId: safeId(sessionId), turnId: safeId(turnId) };
  return new ProviderError(
    'OPENAI_TURN_FAILED',
    'O turno da OpenAI falhou. O diagnóstico contém os identificadores para investigar no provedor.',
    502,
    true,
    provider,
  );
}
