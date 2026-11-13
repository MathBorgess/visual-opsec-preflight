import { beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import piexif from 'piexifjs';
import { createApi } from '@/server/api';
import { DemoProvider } from '@/server/demo';
import { readManifest, signManifest } from '@/server/security';
import { reportMarkdown } from '@/lib/report';
import { identitySeeds, readDeclaredIdentity } from '@/lib/identity';
import { Analysis, AppError, LIMITS, type CaseView, type Manifest } from '@/lib/contracts';
import type { AgentsProvider, ProviderRequest, Snapshot } from '@/server/provider';
import { ProviderError } from '@/server/provider-error';

let photo: Buffer;
let different: Buffer;
beforeAll(async () => {
  const jpeg = await sharp({
    create: { width: 800, height: 500, channels: 3, background: '#bed495' },
  })
    .jpeg()
    .toBuffer();
  const exif = piexif.dump({
    '0th': {
      [piexif.ImageIFD.Make]: 'Synthetic Camera',
      [piexif.ImageIFD.Orientation]: 6,
      [piexif.ImageIFD.Artist]: 'PRIVATE_AUTHOR',
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [
        [11, 1],
        [22, 1],
        [33, 1],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: [
        [44, 1],
        [55, 1],
        [6, 1],
      ],
    },
  });
  photo = Buffer.from(piexif.insert(exif, jpeg.toString('binary')), 'binary');
  different = await sharp({
    create: { width: 100, height: 80, channels: 3, background: '#112233' },
  })
    .jpeg()
    .toBuffer();
});
function harness(
  p: AgentsProvider & { calls: ProviderRequest[] } = new DemoProvider(),
  now = () => Date.now(),
) {
  const api = createApi(() => p, now);
  let cookie = '';
  return {
    provider: p,
    cookie: () => cookie,
    setCookie: (v: string) => {
      cookie = v;
    },
    async call(
      endpoint: Parameters<typeof api>[1],
      body?: unknown,
      override?: Record<string, string>,
    ) {
      const method =
        endpoint === 'get' || endpoint === 'config'
          ? 'GET'
          : endpoint === 'delete'
            ? 'DELETE'
            : 'POST';
      const headers: Record<string, string> = {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        ...(cookie ? { cookie } : {}),
        ...override,
      };
      const req = new Request('http://localhost:3000/api/case', {
        method,
        headers:
          body instanceof FormData ? headers : { ...headers, 'Content-Type': 'application/json' },
        body:
          method === 'GET' || method === 'DELETE'
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body ?? {}),
      });
      const response = await api(req, endpoint);
      const set = response.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: response.status, data: await response.json(), headers: response.headers };
    },
  };
}
function form(bytes = photo, consent = true) {
  const f = new FormData();
  f.set('image', new File([new Uint8Array(bytes)], 'personal-name.jpg', { type: 'image/jpeg' }));
  f.set('consent', consent ? 'yes' : 'no');
  f.set('context', 'PRIVATE_CONTEXT owner@example.invalid');
  // Every case declares who appears in the photo under its own authorization.
  // The interface asks only for the name; the search discovers the rest.
  f.set('identityName', 'Bruna Ficticia');
  f.set('identityRelation', 'self');
  f.set('identityConsent', 'yes');
  return f;
}
// Photo-research mechanics are tested in isolation from the fictional identity
// sources that the demo adds to every research round.
function photoResearchOnly(output: unknown) {
  if (!output || typeof output !== 'object' || !('sources' in output)) return output;
  const research = output as { sources: { id: string }[]; findings: { id: string }[] };
  research.sources = research.sources.filter((s) => s.id === 'W1');
  research.findings = research.findings.filter((f) => f.id === 'FW1');
  return research;
}
function region(bytes = photo) {
  const f = new FormData();
  f.set('image', new File([new Uint8Array(bytes)], 'private.jpg'));
  f.set('regionId', 'R1');
  return f;
}
async function toReview(h = harness()) {
  expect((await h.call('create', form())).status).toBe(201);
  const v = await h.call('get');
  expect(v.data.phase).toBe('exploring');
  expect((await h.call('region', region())).status).toBe(202);
  expect((await h.call('get')).data.phase).toBe('awaiting_search_review');
  return h;
}

describe('API do caso — jornada e fronteiras', () => {
  it('gera diagnóstico e log sanitizado antes de criar caso ou chamar o provedor', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = harness();
      const result = await h.call('create', form(Buffer.alloc(LIMITS.bytes + 1)));
      expect(result.data.diagnostic).toMatchObject({
        stage: 'image_validation',
        code: 'IMAGE_SIZE',
        providerInvoked: false,
        bounds: { actual: LIMITS.bytes + 1, maximum: LIMITS.bytes },
      });
      expect(result.headers.get('x-opsec-request-id')).toBe(result.data.diagnostic.requestId);
      expect(result.headers.get('set-cookie')).toBeNull();
      expect(h.provider.calls).toHaveLength(0);
      const log = logs.mock.calls.flat().join(' ');
      expect(log).toContain(result.data.diagnostic.requestId);
      expect(log).not.toContain('PRIVATE_CONTEXT');
      expect(log).not.toContain('personal-name.jpg');
    } finally {
      logs.mockRestore();
    }
  });
  it('rejeição OpenAI confirmada não cria referência incerta e permite nova tentativa manual', async () => {
    class Rejected extends DemoProvider {
      async start(): Promise<string> {
        throw new ProviderError('OPENAI_INVALID_REQUEST', 'Parâmetro rejeitado.', 502, true, {
          status: 400,
          code: 'invalid_request_error',
          param: 'agent.text.format',
          requestId: 'req_fixture',
        });
      }
    }
    const h = harness(new Rejected());
    const result = await h.call('create', form());
    expect(result.status).toBe(502);
    expect(result.data.uncertain).toBe(false);
    expect(result.data.diagnostic.provider).toMatchObject({
      requestId: 'req_fixture',
      status: 400,
    });
    expect(result.headers.get('set-cookie')).toBeNull();
    expect((await h.call('create', form())).data.error.code).toBe('OPENAI_INVALID_REQUEST');
  });
  it.each(['completed', 'partial'] as const)(
    'dossiê %s preserva caixas decimais e números ao minimizar textos privados',
    async (status) => {
      const bbox = [0.12345, 0.23456, 0.4, 0.3];
      class PreciseProvider extends DemoProvider {
        async read(id: string) {
          const s = await super.read(id);
          if (s.initial.kind === 'research' && status === 'partial') throw Error('fixture outage');
          return {
            ...s,
            usageTokens: s.initial.kind === 'research' ? 0 : 123456789012,
            outputs: s.outputs.map((output) => {
              const parsed = Analysis.safeParse(output);
              if (!parsed.success) return output;
              parsed.data.evidence[0].bbox = [0.12345, 0.23456, 0.4, 0.3];
              parsed.data.evidence[0].description =
                'Contato pessoa@example.invalid; posição -12.34567, -45.67891.\nTexto "entre aspas" e documento 123456789012.';
              return parsed.data;
            }),
          };
        }
      }
      const h = await toReview(harness(new PreciseProvider()));
      await h.call('advance', { action: 'search', seedIds: ['S1'] });
      let done = await h.call('get');
      if (status === 'completed') {
        await h.call('advance', { action: 'synthesize' });
        done = await h.call('get');
      }
      expect(done.status).toBe(200);
      const report = done.data.report;
      expect(report.status).toBe(status);
      expect(report.visual[0].bbox).toEqual(bbox);
      expect(report.coverage.usageTokens).toBe(123456789012);
      expect(report.coverage.cost).toBeNull();
      expect(report.metadata.find((m: { field: string }) => m.field === 'GPS').private).toBe(true);
      expect(report.visual[0].description).toContain('[e-mail omitido]');
      expect(report.visual[0].description).toContain('[coordenadas omitidas]');
      expect(report.visual[0].description).toContain('[documento omitido]');
      expect(report.visual[0].description).toContain('\nTexto "entre aspas"');
      expect(JSON.stringify(report)).not.toContain('pessoa@example.invalid');
      expect(JSON.stringify(report)).not.toContain('-12.34567');
    },
  );
  it('processa arquivo real, explora, pesquisa isoladamente, entrega oito seções e encerra', async () => {
    const h = await toReview();
    expect(
      (await h.call('advance', { action: 'search', seedIds: ['S1'], domains: [] })).status,
    ).toBe(202);
    const search = h.provider.calls.find((c) => c.stage === 'research')!;
    expect(search.image).toBeUndefined();
    expect(JSON.stringify(search)).not.toContain('PRIVATE_CONTEXT');
    expect(JSON.stringify(search)).not.toContain('owner@example');
    expect(JSON.stringify(search)).not.toContain('GPS');
    expect((await h.call('get')).data.phase).toBe('research_ready');
    await h.call('advance', { action: 'synthesize' });
    const done = await h.call('get');
    const view = done.data as CaseView;
    expect(view.phase).toBe('completed');
    expect(view.report?.mode).toBe('demo');
    expect(view.report?.research.sources[0].retrievalState).toBe('fixture');
    expect(view.report?.scope.image.width).toBe(500);
    expect(view.report?.scope.image.height).toBe(800);
    expect(view.report?.metadata.find((m) => m.field === 'GPS')?.state).toBe('present');
    const output = JSON.stringify(view.report);
    expect(
      view.report?.metadata.find((m) => m.field === 'Autoria/identificadores')?.providedValue,
    ).toContain('Artist: PRIVATE_AUTHOR');
    expect(view.report?.metadata.find((m) => m.field === 'GPS')?.providedValue).toContain(
      'latitude: 11.375833',
    );
    expect(JSON.stringify(search)).not.toContain('PRIVATE_AUTHOR');
    expect(output).not.toContain('personal-name.jpg');
    expect(output).not.toContain('visualId');
    expect(reportMarkdown(view.report!).match(/^## [1-8]\./gm)).toHaveLength(8);
    expect(done.headers.get('cache-control')).toBe('no-store');
    expect(done.headers.get('set-cookie')).toContain('HttpOnly');
    const close = await h.call('delete');
    expect(close.data.closed).toBe(true);
    expect(close.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('preserva nome e cargo transcritos com região, sem repassá-los à pesquisa pública', async () => {
    class Badge extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs) {
          const parsed = Analysis.safeParse(o);
          if (parsed.success)
            parsed.data.evidence.push({
              id: 'V_BADGE',
              kind: 'visual',
              sensitivity: 'private',
              description: 'Nome e cargo escritos em um crachá.',
              verbatimText: 'Ana Exemplo — Engenheira de software',
              bbox: [0.2, 0.2, 0.1, 0.1],
              limitation: 'Leitura do modelo; não confirma identidade nem vínculo atual.',
            });
          if (parsed.success) Object.assign(o as object, parsed.data);
        }
        return s;
      }
    }
    const h = await toReview(harness(new Badge()));
    await h.call('advance', { action: 'search', seedIds: ['S1'] });
    expect(JSON.stringify(h.provider.calls.find((r) => r.stage === 'research'))).not.toContain(
      'Ana Exemplo',
    );
    await h.call('get');
    await h.call('advance', { action: 'synthesize' });
    const result = await h.call('get');
    const evidence = result.data.report.visual.find((e: { id: string }) => e.id === 'V_BADGE');
    expect(evidence.verbatimText).toBe('Ana Exemplo — Engenheira de software');
    expect(evidence.bbox).toEqual([0.2, 0.2, 0.1, 0.1]);
    expect(reportMarkdown(result.data.report)).toContain('Ana Exemplo');
    expect(reportMarkdown(result.data.report)).toContain('não confirma identidade');
  });
  it('valida consentimento, formato, corrupção e tamanho antes de chamar IA', async () => {
    const h = harness();
    expect((await h.call('create', form(photo, false))).data.error.code).toBe('CONSENT_REQUIRED');
    expect((await h.call('create', form(Buffer.from('not a jpeg')))).data.error.code).toBe(
      'IMAGE_FORMAT',
    );
    expect((await h.call('create', form(Buffer.from([255, 216, 255, 0])))).data.error.code).toBe(
      'CORRUPT_IMAGE',
    );
    expect((await h.call('create', form(Buffer.alloc(LIMITS.bytes + 1)))).data.error.code).toBe(
      'IMAGE_SIZE',
    );
    expect(h.provider.calls).toHaveLength(0);
  });
  it('recusa origem diferente, ausência, adulteração e expiração de caso', async () => {
    const h = harness();
    expect((await h.call('create', form(), { origin: 'https://attacker.example' })).status).toBe(
      403,
    );
    expect((await h.call('get')).status).toBe(404);
    await h.call('create', form());
    const saved = h.cookie();
    h.setCookie(saved + 'tampered');
    expect((await h.call('get')).status).toBe(401);
    h.setCookie(saved);
    const m = readManifest(new Request('http://localhost', { headers: { cookie: saved } }))!;
    m.expiresAt = 1;
    h.setCookie('opsec_case=' + signManifest(m));
    expect((await h.call('get')).status).toBe(410);
  });
  it('não inicia outro caso sobre o atual nem aceita arquivo diferente no recorte', async () => {
    const h = harness();
    await h.call('create', form());
    await h.call('get');
    expect((await h.call('create', form())).status).toBe(409);
    expect((await h.call('region', region(different))).data.error.code).toBe('IMAGE_CHANGED');
    expect(h.provider.calls.filter((c) => c.stage === 'region')).toHaveLength(0);
  });
  it('recusa caixa fora da imagem e pergunta inexistente', async () => {
    const h = harness();
    await h.call('create', form());
    await h.call('get');
    const f = region();
    f.delete('regionId');
    f.set('bbox', '[0.9,0.1,0.5,0.5]');
    f.set('questionId', 'Q1');
    expect((await h.call('region', f)).data.error.code).toBe('INVALID_BOX');
    f.set('bbox', '[0,0,0.5,0.5]');
    f.set('questionId', 'nonexistent');
    expect((await h.call('region', f)).data.error.code).toBe('BRANCH_CLOSED');
  });
  it('sem sinais da foto selecionados, a pesquisa cobre só a identidade autorizada', async () => {
    const h = await toReview();
    await h.call('advance', { action: 'search', seedIds: [] });
    const search = h.provider.calls.find((c) => c.stage === 'research')!;
    const seeds = search.data.seeds as { id: string; text: string; purpose: string }[];
    expect(seeds.map((seed) => [seed.id, seed.text])).toEqual([['PID1', '"Bruna Ficticia"']]);
    expect(seeds[0].purpose).toContain('proativamente');
    await h.call('get');
    await h.call('advance', { action: 'synthesize' });
    const report = (await h.call('get')).data.report;
    expect(report.research.state).toBe('executed');
    expect(report.scope.selectedSeeds).toEqual(['PID1']);
    expect(report.identity.state).toBe('executed');
    expect(report.research.sources.map((s: { id: string }) => s.id)).not.toContain('W1');
    expect(report.findings.map((f: { id: string }) => f.id)).not.toContain('FW3');
  });
  it('caso anterior à identificação obrigatória continua legível e não alega pesquisa', async () => {
    class Legacy extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        return { ...s, initial: { ...s.initial, declaredIdentity: undefined } };
      }
    }
    const h = await toReview(harness(new Legacy()));
    expect((await h.call('get')).data.identity).toBeNull();
    await h.call('advance', { action: 'search', seedIds: [] });
    const report = (await h.call('get')).data.report;
    expect(report.research.state).toBe('not_authorized');
    expect(report.identity.state).toBe('not_requested');
    expect(reportMarkdown(report)).toContain('o caso analisou somente a foto');
    expect(h.provider.calls.some((c) => c.stage === 'research')).toBe(false);
  });
  it('não permite semear identificador privado ou domínio interno', async () => {
    class PrivateProvider extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs)
          if (o && typeof o === 'object' && 'seeds' in o)
            (o as { seeds: { text: string }[] }).seeds[0].text = 'owner@example.org';
        return s;
      }
    }
    const h = await toReview(harness(new PrivateProvider()));
    expect((await h.call('advance', { action: 'search', seedIds: ['S1'] })).data.error.code).toBe(
      'SENSITIVE_QUERY',
    );
    const other = await toReview();
    expect(
      (await other.call('advance', { action: 'search', seedIds: ['S1'], domains: ['127.0.0.1'] }))
        .data.error.code,
    ).toBe('INVALID_DOMAIN');
  });
  it('saturação encerra novas explorações e torna a pergunta inconclusiva', async () => {
    class RepeatedProvider extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        const first = s.outputs[0];
        if (s.outputs.length > 1) {
          s.output = first;
          s.outputs = s.outputs.map(() => structuredClone(first));
        }
        return s;
      }
    }
    const h = harness(new RepeatedProvider());
    await h.call('create', form());
    await h.call('get');
    await h.call('region', region());
    expect((await h.call('get')).data.budget.noGain).toBe(1);
    await h.call('region', region());
    const v = await h.call('get');
    expect(v.data.budget.noGain).toBe(2);
    expect(v.data.stopReason).toBe('no_information_gain');
    expect(v.data.analysis.questions[0].status).toBe('inconclusive');
    expect((await h.call('region', region())).status).toBe(409);
  });
  it('resultado inválido de síntese vira parcial e não propaga fonte inventada', async () => {
    class InvalidProvider extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs)
          if (o && typeof o === 'object' && 'summary' in o)
            (o as unknown as { findings: { evidenceIds: string[] }[] }).findings[0].evidenceIds = [
              'INVENTED',
            ];
        return s;
      }
    }
    const h = await toReview(harness(new InvalidProvider()));
    await h.call('advance', { action: 'synthesize' });
    const done = await h.call('get');
    expect(done.data.phase).toBe('partial');
    expect(JSON.stringify(done.data.report)).not.toContain('INVENTED');
  });
  it('falha na pesquisa preserva a análise e expõe documento parcial', async () => {
    class SearchFailure extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        if (s.initial.kind === 'research') throw Error('PRIVATE provider detail');
        return s;
      }
    }
    const h = await toReview(harness(new SearchFailure()));
    await h.call('advance', { action: 'search', seedIds: ['S1'] });
    const done = await h.call('get');
    expect(done.data.phase).toBe('partial');
    expect(done.data.report.visual.length).toBeGreaterThan(0);
    expect(JSON.stringify(done.data)).not.toContain('PRIVATE provider detail');
  });
  it('cancelamento não confirmado permanece pendente; novas fases param', async () => {
    class PendingProvider extends DemoProvider {
      async read(id: string) {
        return {
          ...(await super.read(id)),
          status: 'in_progress',
          turnStatus: 'in_progress',
          output: null,
          outputs: [],
        };
      }
      async cancel() {}
    }
    const h = harness(new PendingProvider());
    await h.call('create', form());
    const cancelled = await h.call('cancel');
    expect(cancelled.data.cancellation).toBe('pending');
    expect(cancelled.data.report.coverage.remoteStatus).toBe('cancelling');
    expect((await h.call('advance', { action: 'search', seedIds: ['S1'] })).status).toBe(409);
  });
  it('prazo alcançado impede novas fases e tenta cancelar o turno ativo', async () => {
    let clock = Date.now();
    class PendingProvider extends DemoProvider {
      async read(id: string) {
        return {
          ...(await super.read(id)),
          status: 'in_progress',
          turnStatus: 'in_progress',
          output: null,
          outputs: [],
        };
      }
    }
    const h = harness(new PendingProvider(), () => clock);
    await h.call('create', form());
    clock += LIMITS.activeMs + 1;
    const result = await h.call('get');
    expect(result.data.phase).toBe('partial');
    expect(result.data.stopReason).toBe('deadline_reached');
    expect(result.data.cancellation).toBe('pending');
  });
  it('exclusão recusada mantém referência para nova tentativa', async () => {
    class DeleteFailure extends DemoProvider {
      fail = true;
      async delete(id: string) {
        return this.fail ? false : super.delete(id);
      }
    }
    const p = new DeleteFailure();
    const h = await toReview(harness(p));
    const first = await h.call('delete');
    expect(first.status).toBe(409);
    expect(first.data.closed).toBe(false);
    expect(h.cookie()).toContain('opsec_case=');
    p.fail = false;
    expect((await h.call('delete')).data.closed).toBe(true);
  });
  it('resultado incerto não é reenviado automaticamente ao consultar', async () => {
    class LostAcknowledgement extends DemoProvider {
      async start(req: ProviderRequest) {
        const id = await super.start(req);
        if (req.stage === 'region') throw Error('lost acknowledgement');
        return id;
      }
    }
    const h = harness(new LostAcknowledgement());
    await h.call('create', form());
    await h.call('get');
    const result = await h.call('region', region());
    expect(result.data.uncertain).toBe(true);
    await h.call('get');
    await h.call('get');
    expect(h.provider.calls.filter((c) => c.stage === 'region')).toHaveLength(1);
  });
  it('criação sem confirmação não anuncia exclusão remota', async () => {
    class LostCreation extends DemoProvider {
      async start(req: ProviderRequest): Promise<string> {
        await super.start(req);
        throw Error('lost creation');
      }
    }
    const h = harness(new LostCreation());
    expect((await h.call('create', form())).status).toBe(502);
    expect((await h.call('get')).data.error.code).toBe('UNKNOWN_REMOTE_SESSION');
    const close = await h.call('delete');
    expect(close.data.closed).toBe(true);
    expect(close.data.remoteDeletionConfirmed).toBe(false);
    expect(close.data.message).toContain('sem ID');
    expect(h.provider.calls).toHaveLength(1);
  });
  it('falha remota persistida chega ao documento parcial e ao diagnóstico exportável', async () => {
    class FailedTurn extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        return {
          ...s,
          status: 'failed',
          turnStatus: 'failed',
          failure: new ProviderError('OPENAI_TURN_FAILED', 'Turno falhou.', 502, true, {
            code: 'rate_limit_exceeded',
            sessionId: id,
            turnId: s.turnId,
          }),
        };
      }
    }
    const h = harness(new FailedTurn());
    await h.call('create', form());
    const v = await h.call('get');
    expect(v.data.phase).toBe('partial');
    expect(v.data.report).not.toBeNull();
    expect(v.data.diagnostic).toMatchObject({
      code: 'OPENAI_TURN_FAILED',
      provider: { code: 'rate_limit_exceeded' },
    });
    expect(v.data.execution.turnStatus).toBe('failed');
  });
  it('erro de consulta não confirma exclusão de uma criação de pesquisa sem ID', async () => {
    class UnknownResearch extends DemoProvider {
      failed = false;
      async start(r: ProviderRequest) {
        if (r.stage === 'research') {
          this.failed = true;
          throw new ProviderError('OPENAI_TIMEOUT', 'Criação não confirmada.', 504, false, {});
        }
        return super.start(r);
      }
      async read(id: string) {
        if (this.failed)
          throw new ProviderError('OPENAI_RATE_LIMIT', 'Consulta limitada.', 429, true, {});
        return super.read(id);
      }
    }
    const h = await toReview(harness(new UnknownResearch()));
    expect((await h.call('advance', { action: 'search', seedIds: ['S1'] })).status).toBe(504);
    expect((await h.call('get')).status).toBe(429);
    const closed = await h.call('delete');
    expect(closed.data).toMatchObject({ closed: true, remoteDeletionConfirmed: false });
    expect(closed.data.message).toContain('sem ID confirmado');
  });
  it('resumo de rejeição fica na resposta autenticada e nunca entra nos logs de runtime', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      class Rejected extends DemoProvider {
        async start(): Promise<string> {
          throw new ProviderError('OPENAI_INVALID_REQUEST', 'Rejeitado.', 502, true, {
            summary: 'PRIVATE_ECHO',
            status: 400,
          });
        }
      }
      const h = harness(new Rejected());
      const result = await h.call('create', form());
      expect(result.data.diagnostic.provider.summary).toBe('PRIVATE_ECHO');
      expect([...info.mock.calls, ...error.mock.calls].flat().join(' ')).not.toContain(
        'PRIVATE_ECHO',
      );
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });
  it.each(['analysis', 'research'])(
    'histórico pendente de %s mantém a sessão e retoma sem reenviar',
    async (stage) => {
      class DelayedHistory extends DemoProvider {
        pendingId = '';
        remaining = 0;
        async start(r: ProviderRequest) {
          const id = await super.start(r);
          if (r.stage === stage) {
            this.pendingId = id;
            this.remaining = 1;
          }
          return id;
        }
        async read(id: string) {
          if (id === this.pendingId && this.remaining-- > 0)
            throw new AppError('CONTEXT_PENDING', 'Aguardando histórico.', 503, {
              retryable: true,
            });
          return super.read(id);
        }
      }
      const h = harness(new DelayedHistory());
      await h.call('create', form());
      if (stage === 'research') {
        await h.call('get');
        await h.call('advance', { action: 'finish_visual' });
        await h.call('advance', { action: 'search', seedIds: ['S1'] });
      }
      const before = h.provider.calls.length;
      const pending = await h.call('get');
      expect(pending.status).toBe(202);
      expect(pending.data).toMatchObject({
        pending: true,
        phase: stage === 'analysis' ? 'analyzing' : 'researching',
      });
      const ready = await h.call('get');
      expect(ready.status).toBe(200);
      expect(ready.data.phase).not.toBe('partial');
      expect(h.provider.calls).toHaveLength(before);
    },
  );
  it('histórico pendente respeita o prazo e solicita cancelamento sem recriar sessão', async () => {
    class Pending extends DemoProvider {
      async read(): Promise<never> {
        throw new AppError('CONTEXT_PENDING', 'Aguardando.', 503);
      }
    }
    let clock = Date.now();
    const provider = new Pending();
    const cancel = vi.spyOn(provider, 'cancel');
    const h = harness(provider, () => clock);
    await h.call('create', form());
    clock += LIMITS.activeMs + 1;
    const ended = await h.call('get');
    expect(ended.status).toBe(502);
    expect(ended.data.error.code).toBe('CONTEXT_TIMEOUT');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(provider.calls).toHaveLength(1);
  });
  it('encerra sessão conhecida mesmo antes de o histórico inicial estar disponível', async () => {
    class Pending extends DemoProvider {
      async read(): Promise<never> {
        throw new AppError('CONTEXT_PENDING', 'Aguardando.', 503);
      }
    }
    const provider = new Pending();
    const cancel = vi.spyOn(provider, 'cancel');
    const h = harness(provider);
    await h.call('create', form());
    const ended = await h.call('delete');
    expect(ended.data.remoteDeletionConfirmed).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('turno concluído sem mensagem persistida aguarda e depois retoma a mesma sessão', async () => {
    class DelayedOutput extends DemoProvider {
      reads = 0;
      async read(id: string) {
        const s = await super.read(id);
        return this.reads++ === 0 ? { ...s, output: null, outputs: [] } : s;
      }
    }
    const h = harness(new DelayedOutput());
    await h.call('create', form());
    expect((await h.call('get')).data.phase).toBe('analyzing');
    expect((await h.call('get')).data.phase).toBe('exploring');
    expect(h.provider.calls).toHaveLength(1);
  });
  it('espera por mensagem final persistida também respeita o prazo ativo', async () => {
    class NoOutput extends DemoProvider {
      async read(id: string) {
        return { ...(await super.read(id)), output: null, outputs: [] };
      }
    }
    let clock = Date.now();
    const h = harness(new NoOutput(), () => clock);
    await h.call('create', form());
    clock += LIMITS.activeMs + 1;
    const v = await h.call('get');
    expect(v.data.phase).toBe('partial');
    expect(v.data.stopReason).toBe('deadline_reached');
  });
  it('auditoria de URLs aparece no diagnóstico e é omitida de todos os logs', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      class BadSource extends DemoProvider {
        async read(): Promise<never> {
          throw new AppError('UNVERIFIED_SOURCE', 'Não confirmada.', 502, {
            sourceAudit: {
              reportedUrl: 'https://example.org/report',
              recordedUrls: ['https://example.org/opened'],
            },
          });
        }
      }
      const h = harness(new BadSource());
      await h.call('create', form());
      const v = await h.call('get');
      expect(v.data.diagnostic.sourceAudit.reportedUrl).toBe('https://example.org/report');
      expect(logs.mock.calls.flat().join(' ')).not.toContain('example.org');
    } finally {
      logs.mockRestore();
    }
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    'verificação de fonte usa só a segunda rodada e mantém o limite: falha=%s',
    async (neverVerified, outOfScope) => {
      const demo = new DemoProvider();
      const p: AgentsProvider & { calls: ProviderRequest[] } = {
        mode: 'openai',
        model: 'fixture-model',
        calls: demo.calls,
        start: (r) => demo.start(r),
        cancel: (id) => demo.cancel(id),
        delete: (id) => demo.delete(id),
        read: async (id) => {
          const s = structuredClone(await demo.read(id));
          if (s.initial.kind === 'research') {
            for (const o of s.outputs)
              if (o && typeof o === 'object' && 'sources' in o)
                for (const source of (o as { sources: Record<string, unknown>[] }).sources) {
                  source.url = outOfScope
                    ? 'https://outside.net/event'
                    : 'https://example.org/event';
                  source.retrievalState = 'retrieved';
                }
            const latest = demo.calls.filter((r) => r.stage === 'research').at(-1);
            s.visitedUrls =
              !neverVerified && latest?.data.urlsToVerify ? ['https://example.org/event'] : [];
          }
          return s;
        },
      };
      const h = await toReview(harness(p));
      await h.call('advance', { action: 'search', seedIds: ['S1'], domains: ['example.org'] });
      const first = await h.call('get');
      if (outOfScope) {
        expect(first.data.phase).toBe('partial');
        expect(first.data.verificationPending).toBe(false);
        expect(p.calls.filter((r) => r.stage === 'research')).toHaveLength(1);
        return;
      }
      expect(first.data).toMatchObject({
        phase: 'research_ready',
        verificationPending: true,
        budget: { rounds: 1 },
      });
      expect(first.data.research.sources).toEqual([]);
      expect(first.data.report).toBeNull();
      await h.call('advance', { action: 'research_more' });
      expect(p.calls.at(-1)?.data.urlsToVerify).toEqual(['https://example.org/event']);
      const second = await h.call('get');
      expect(second.data.phase).toBe(neverVerified ? 'partial' : 'research_ready');
      expect(second.data.budget.rounds).toBe(2);
      if (neverVerified)
        expect((await h.call('advance', { action: 'research_more' })).status).toBe(409);
      else expect(second.data.research.sources[0].retrievalState).toBe('retrieved');
      expect(p.calls.filter((r) => r.stage === 'research')).toHaveLength(2);
    },
  );
  it.each(['synthesize', 'cancel'] as const)(
    'verificação pendente preserva a decisão de %s após novas consultas',
    async (action) => {
      // Reuse a real-mode fixture to exercise the actual citation validator.
      const demo = new DemoProvider();
      const p: AgentsProvider & { calls: ProviderRequest[] } = {
        mode: 'openai',
        model: 'fixture-model',
        calls: demo.calls,
        start: (r) => demo.start(r),
        cancel: (id) => demo.cancel(id),
        delete: (id) => demo.delete(id),
        read: async (id) => {
          const s = structuredClone(await demo.read(id));
          if (s.initial.kind === 'research') {
            s.activeMs = 100_000;
            for (const o of s.outputs)
              if (o && typeof o === 'object' && 'sources' in o)
                for (const source of (o as { sources: Record<string, unknown>[] }).sources) {
                  source.url = 'https://example.org/event';
                  source.retrievalState = 'retrieved';
                }
          }
          return s;
        },
      };
      const h = await toReview(harness(p));
      await h.call('advance', { action: 'search', seedIds: ['S1'] });
      expect((await h.call('get')).data.phase).toBe('research_ready');
      if (action === 'cancel') await h.call('cancel');
      else await h.call('advance', { action });
      for (let i = 0; i < 2; i++)
        expect((await h.call('get')).data.phase).toBe(
          action === 'cancel' ? 'cancelled' : 'completed',
        );
      expect(p.calls.filter((r) => r.stage === 'synthesis')).toHaveLength(
        action === 'cancel' ? 0 : 1,
      );
    },
  );
  it.each(['in_progress', 'failed', 'cancelled'])(
    'mantém fontes aceitas quando a segunda rodada está %s',
    async (turnStatus) => {
      class LaterTurn extends DemoProvider {
        async read(id: string) {
          const s = await super.read(id);
          if (s.initial.kind !== 'research') return s;
          s.outputs.forEach(photoResearchOnly);
          photoResearchOnly(s.output);
          if (this.calls.filter((r) => r.stage === 'research').length === 1) {
            (s.output as { followup: string }).followup = 'Conferir uma alternativa pública.';
            return s;
          }
          return {
            ...s,
            turnStatus,
            status: turnStatus === 'in_progress' ? 'in_progress' : 'idle',
            output: null,
            outputs: [s.outputs[0]],
          };
        }
      }
      const h = await toReview(harness(new LaterTurn()));
      await h.call('advance', { action: 'search', seedIds: ['S1'] });
      expect((await h.call('get')).data.research.sources).toHaveLength(1);
      await h.call('advance', { action: 'research_more' });
      const result = await h.call('get');
      expect(result.data.research.sources).toHaveLength(1);
      expect(result.data.phase).toBe(turnStatus === 'in_progress' ? 'researching' : 'partial');
      if (turnStatus !== 'in_progress') expect(result.data.report.research.sources).toHaveLength(1);
    },
  );
  it('após duas rodadas preserva apenas fontes verificadas e conclui sem achados dependentes de citação descartada', async () => {
    const demo = new DemoProvider();
    const p: AgentsProvider & { calls: ProviderRequest[] } = {
      mode: 'openai',
      model: 'fixture-model',
      calls: demo.calls,
      start: (r) => demo.start(r),
      cancel: (id) => demo.cancel(id),
      delete: (id) => demo.delete(id),
      read: async (id) => {
        const s = structuredClone(await demo.read(id));
        if (s.initial.kind === 'research') {
          for (const o of s.outputs) {
            if (!o || typeof o !== 'object' || !('sources' in o)) continue;
            photoResearchOnly(o);
            const research = o as {
              sources: Record<string, unknown>[];
              findings: Record<string, unknown>[];
            };
            research.sources[0].url = 'https://example.org/verified';
            research.sources[0].retrievalState = 'retrieved';
            research.sources.push({
              ...research.sources[0],
              id: 'W2',
              url: 'https://example.org/unverified',
            });
            research.findings.push({
              ...research.findings[0],
              id: 'FW2',
              evidenceIds: ['V1', 'W2'],
              statement: 'UNVERIFIED_CLAIM',
            });
          }
          s.visitedUrls = ['https://example.org/verified'];
        }
        return s;
      },
    };
    const h = await toReview(harness(p));
    await h.call('advance', { action: 'search', seedIds: ['S1'] });
    expect((await h.call('get')).data.verificationPending).toBe(true);
    await h.call('advance', { action: 'research_more' });
    const ready = await h.call('get');
    expect(ready.data.phase).toBe('research_ready');
    expect(ready.data.verificationPending).toBe(false);
    expect(ready.data.research.sources.map((s: { id: string }) => s.id)).toEqual(['W1']);
    expect(ready.data.research.findings.map((f: { id: string }) => f.id)).toEqual(['FW1']);
    expect(ready.data.research.limitations.join(' ')).toContain('cobertura parcial');
    await h.call('advance', { action: 'synthesize' });
    for (let i = 0; i < 2; i++) {
      const done = await h.call('get');
      expect(done.data.phase).toBe('completed');
      expect(done.data.report.research.sources).toHaveLength(1);
      expect(JSON.stringify(done.data.report)).not.toContain('UNVERIFIED_CLAIM');
      expect(JSON.stringify(done.data.report)).not.toContain('https://example.org/unverified');
    }
    expect(p.calls.filter((r) => r.stage === 'research')).toHaveLength(2);
  });
  it('resposta visual malformada mantém inventário e encerra com documento parcial', async () => {
    class Malformed extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        return { ...s, outputs: [{ invalid: true }], output: { invalid: true } };
      }
    }
    const h = harness(new Malformed());
    await h.call('create', form());
    const v = await h.call('get');
    expect(v.status).toBe(200);
    expect(v.data.phase).toBe('partial');
    expect(v.data.report.metadata.length).toBeGreaterThan(0);
    expect(v.data.stopReason).toBe('policy_violation');
  });
  it('perguntas existentes não podem ser substituídas para contornar o limite', async () => {
    class Rotating extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        if (s.outputs.length > 1)
          (s.outputs[1] as { questions: { id: string }[] }).questions[0].id = 'Q_NEW';
        return s;
      }
    }
    const h = harness(new Rotating());
    await h.call('create', form());
    await h.call('get');
    await h.call('region', region());
    const v = await h.call('get');
    expect(v.data.phase).toBe('partial');
    expect(v.data.analysis.questions[0].id).toBe('Q1');
  });
  it('propósito livre do modelo não acompanha sementes para a pesquisa', async () => {
    class PrivatePurpose extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs)
          if (o && typeof o === 'object' && 'seeds' in o)
            (o as { seeds: { purpose: string }[] }).seeds[0].purpose =
              'PRIVATE_CONTEXT owner@example.invalid';
        return s;
      }
    }
    const h = await toReview(harness(new PrivatePurpose()));
    await h.call('advance', { action: 'search', seedIds: ['S1'] });
    expect(JSON.stringify(h.provider.calls.find((c) => c.stage === 'research'))).not.toContain(
      'PRIVATE_CONTEXT',
    );
  });
  it('instrução de ferramenta no conteúdo não muda as ferramentas da aplicação', async () => {
    class Injected extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        return {
          ...s,
          outputs: s.outputs.map((o) => ({
            ...(o as object),
            tools: [{ type: 'shell', command: 'exfiltrate secret' }],
          })),
        };
      }
    }
    const h = harness(new Injected());
    await h.call('create', form());
    const v = await h.call('get');
    expect(v.data.phase).toBe('partial');
    expect(h.provider.calls).toHaveLength(1);
    expect(JSON.stringify(v.data.report)).not.toContain('exfiltrate');
  });
  it('exporta conteúdo hostil como texto e preserva a revisão separada do original', async () => {
    const h = await toReview();
    await h.call('advance', { action: 'synthesize' });
    const v = await h.call('get');
    const original = v.data.report.findings[0].statement;
    v.data.report.findings[0].review = 'corrected';
    v.data.report.findings[0].correction = '<script>alert(1)</script> [link](javascript:alert(1))';
    const markdown = reportMarkdown(v.data.report);
    expect(markdown).not.toContain('<script>');
    expect(markdown).toContain('\\<script\\>');
    expect(v.data.report.findings[0].statement).toBe(original);
  });
  it('evidência web pode encerrar pergunta visual aberta na síntese com proveniência', async () => {
    class Resolution extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs)
          if (o && typeof o === 'object' && 'summary' in o)
            Object.assign(o, {
              questionResolutions: [
                {
                  questionId: 'Q1',
                  status: 'resolved',
                  evidenceIds: ['V1', 'W1'],
                  reason: 'Critério satisfeito na fixture pública aprovada.',
                },
              ],
            });
        return s;
      }
    }
    const h = harness(new Resolution());
    await h.call('create', form());
    await h.call('get');
    await h.call('advance', { action: 'finish_visual' });
    await h.call('advance', { action: 'search', seedIds: ['S1'] });
    await h.call('get');
    await h.call('advance', { action: 'synthesize' });
    const v = await h.call('get');
    expect(v.data.report.status).toBe('completed');
    expect(v.data.analysis.questions[0].status).toBe('resolved');
    expect(v.data.stopReason).toBe('sufficient_evidence');
    expect(v.data.report.coverage.limitations.join(' ')).toContain('W1');
  });
});

function identityForm(patch: Record<string, string> = {}) {
  const f = form();
  const fields = {
    identityName: 'Ana Exemplo',
    identityProfession: 'professora de física',
    identityActivities: 'palestrante em eventos\ncorrida de rua',
    identityRelation: 'self',
    identityConsent: 'yes',
    ...patch,
  };
  for (const [key, value] of Object.entries(fields)) f.set(key, value);
  return f;
}
async function identityReview(h = harness()) {
  expect((await h.call('create', identityForm())).status).toBe(201);
  expect((await h.call('get')).data.phase).toBe('exploring');
  await h.call('region', region());
  const v = await h.call('get');
  expect(v.data.phase).toBe('awaiting_search_review');
  return { h, view: v.data as CaseView };
}

describe('trilha de identidade autorizada', () => {
  it('exige identidade e as autorizações de ambiente e identificação antes de chamar IA', async () => {
    const h = harness();
    expect((await h.call('create', identityForm({ consent: 'no' }))).data.error.code).toBe(
      'CONSENT_REQUIRED',
    );
    expect((await h.call('create', identityForm({ identityName: '' }))).data.error.code).toBe(
      'IDENTITY_REQUIRED',
    );
    expect((await h.call('create', identityForm({ identityConsent: 'no' }))).data.error.code).toBe(
      'IDENTITY_CONSENT_REQUIRED',
    );
    expect(
      (await h.call('create', identityForm({ identityName: 'ana@example.org' }))).data.error.code,
    ).toBe('IDENTITY_INVALID');
    expect(
      (await h.call('create', identityForm({ identityActivities: 'contato (81) 99999-1234' }))).data
        .error.code,
    ).toBe('IDENTITY_INVALID');
    expect(h.provider.calls).toHaveLength(0);
    expect(h.cookie()).toBe('');
  });
  it('pesquisa a identidade liberada sem foto e mede a exposição no dossiê', async () => {
    const { h, view } = await identityReview();
    expect(h.provider.calls[0].data.declaredIdentity).toMatchObject({
      name: 'Ana Exemplo',
      relation: 'self',
    });
    expect(view.identity?.name).toBe('Ana Exemplo');
    expect(view.analysis.seeds.map((s) => s.id)).toEqual(['S1', 'PID1', 'PID2', 'PID3']);
    expect(view.analysis.evidence.find((e) => e.id === 'UID1')?.description).toContain(
      'Ana Exemplo',
    );
    // The author selects photo signals; the identification authorization adds the identity.
    expect((await h.call('advance', { action: 'search', seedIds: ['S1'] })).status).toBe(202);
    const search = h.provider.calls.find((c) => c.stage === 'research')!;
    const payload = JSON.stringify(search);
    expect(search.image).toBeUndefined();
    expect(payload).toContain('\\"Ana Exemplo\\" professora de física');
    expect(payload).toContain('\\"Ana Exemplo\\" corrida de rua');
    for (const hidden of ['PRIVATE_CONTEXT', 'owner@example', 'GPS', 'PRIVATE_AUTHOR'])
      expect(payload).not.toContain(hidden);
    expect(String((search.data.identityScope as Record<string, unknown>).permittedSources)).toMatch(
      /Escavador\/Jusbrasil/,
    );
    expect(String((search.data.identityScope as Record<string, unknown>).outOfScope)).toContain(
      'familiares, colegas',
    );
    expect(search.data.identityScope).toMatchObject({
      relation: 'self',
      declaredSeedIds: ['PID1', 'PID2', 'PID3'],
    });
    const questions = search.data.questions as { seedId: string; question: string }[];
    expect(questions.filter((q) => q.seedId === 'S1').map((q) => q.question)).toHaveLength(2);
    const ready = await h.call('get');
    expect(ready.data.phase).toBe('research_ready');
    expect(
      ready.data.research.sources.find((s: { id: string }) => s.id === 'W2').exposure.match,
    ).toBe('declared_identity');
    await h.call('advance', { action: 'synthesize' });
    const synthesis = h.provider.calls.find((c) => c.stage === 'synthesis')!;
    expect(synthesis.data.identityExposure).toMatchObject({ state: 'executed' });
    expect(String(synthesis.data.instruction)).toContain('homônimo');
    const done = await h.call('get');
    const report = done.data.report;
    expect(report.version).toBe('exposure-report/1.1');
    expect(report.scope.identity.name).toBe('Ana Exemplo');
    expect(report.identity).toMatchObject({
      state: 'executed',
      attributedSources: ['W2', 'W3', 'W5'],
      homonymSources: ['W4'],
      // 3 categories + legal mention (2) + photo + city + schedule = 8 points.
      breadth: 'high',
    });
    expect(report.scope.facesVisible).toBe(1);
    expect(report.identity.discovered.map((d: { facet: string }) => d.facet)).toEqual([
      'profession',
      'employer',
      'activity',
    ]);
    expect(report.identity.homonymDiscoveries).toBe(1);
    expect(
      report.identity.categories.find((c: { category: string }) => c.category === 'public_record')
        .sourceIds,
    ).toEqual(['W5']);
    expect(report.findings.map((f: { id: string }) => f.id)).toEqual(
      expect.arrayContaining(['FW2', 'FW3']),
    );
    const markdown = reportMarkdown(report);
    expect(markdown.match(/^## [1-8]\./gm)).toHaveLength(8);
    expect(markdown).toContain('### 5.1 Exposição da identidade autorizada');
    expect(markdown).toContain('Amplitude observada: Alta');
    expect(markdown).toContain('Rostos visíveis: 1');
    expect(markdown).toContain('Processo ou diário oficial: W5');
    expect(markdown).toContain('Organização: Instituto Exemplo (fictício) (W2)');
    expect(markdown).toContain('possível homônimo');
  });
  it('a autorização de identificação não aceita sementes de identidade inventadas', async () => {
    const { h } = await identityReview();
    expect(
      (await h.call('advance', { action: 'search', seedIds: ['S1', 'PID9'] })).data.error.code,
    ).toBe('SENSITIVE_QUERY');
    expect(h.provider.calls.some((c) => c.stage === 'research')).toBe(false);
    // Repeating a declared seed is harmless: each identity seed is sent once.
    await h.call('advance', { action: 'search', seedIds: ['PID1', 'S1', 'PID1'] });
    const search = h.provider.calls.find((c) => c.stage === 'research')!;
    expect((search.data.seeds as { id: string }[]).map((seed) => seed.id)).toEqual([
      'S1',
      'PID1',
      'PID2',
      'PID3',
    ]);
  });
  it('semente de identidade proposta pelo modelo invalida a análise', async () => {
    class Impostor extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs)
          if (o && typeof o === 'object' && 'seeds' in o)
            (o as { seeds: unknown[] }).seeds.push({
              id: 'S2',
              text: 'Pessoa Desconhecida',
              evidenceIds: ['V1'],
              purpose: 'Buscar a pessoa da foto.',
              classification: 'declared_identity',
            });
        return s;
      }
    }
    const h = harness(new Impostor());
    await h.call('create', form());
    const v = await h.call('get');
    expect(v.data.phase).toBe('partial');
    expect(v.data.stopReason).toBe('policy_violation');
    // Only the backend-derived seed of the declared identity remains.
    expect(v.data.analysis.seeds.map((seed: { id: string }) => seed.id)).toEqual(['PID1']);
  });
  it('recorte não devolve sementes de identidade ao modelo e tolera eco exato', async () => {
    class Echo extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        const identity = readDeclaredIdentity(s.initial.declaredIdentity);
        for (const o of s.outputs) {
          const parsed = Analysis.safeParse(o);
          if (parsed.success && parsed.data.evidence.some((e) => e.id === 'V2'))
            (o as { seeds: unknown[] }).seeds.push(identitySeeds(identity)[0]);
        }
        return s;
      }
    }
    const { h, view } = await identityReview(harness(new Echo()));
    const crop = h.provider.calls.find((c) => c.stage === 'region')!;
    const previous = (crop.data.previous as { seeds: { id: string }[] }).seeds;
    expect(previous.map((seed) => seed.id)).toEqual(['S1']);
    expect(view.error).toBeNull();
    expect(view.analysis.seeds.map((seed) => seed.id)).toEqual(['S1', 'PID1', 'PID2', 'PID3']);
  });
  it('outras pessoas visíveis ficam fora da pesquisa e o dossiê registra isso', async () => {
    class Group extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        for (const o of s.outputs) {
          const parsed = Analysis.safeParse(o);
          if (parsed.success)
            (o as { subjects: unknown }).subjects = {
              facesVisible: 3,
              note: 'Um rosto em primeiro plano e dois ao fundo.',
            };
        }
        return s;
      }
    }
    const { h } = await identityReview(harness(new Group()));
    await h.call('advance', { action: 'search', seedIds: ['S1'] });
    const search = JSON.stringify(h.provider.calls.find((c) => c.stage === 'research'));
    expect(search).not.toContain('dois ao fundo');
    await h.call('get');
    await h.call('advance', { action: 'synthesize' });
    const report = (await h.call('get')).data.report;
    expect(report.scope.facesVisible).toBe(3);
    expect(report.identity.limitations.join(' ')).toContain('2 outra(s) pessoa(s) visível(is)');
  });
  it('fonte de buscador de pessoas é descartada com os achados dependentes', async () => {
    class Broker extends DemoProvider {
      async read(id: string) {
        const s = await super.read(id);
        if (s.initial.kind === 'research')
          for (const o of s.outputs)
            for (const source of (o as ResearchLike).sources)
              if (source.id === 'W2') source.url = 'https://www.spokeo.com/Ana-Exemplo';
        return s;
      }
    }
    const { h } = await identityReview(harness(new Broker()));
    await h.call('advance', { action: 'search', seedIds: ['PID1', 'PID2'] });
    const ready = await h.call('get');
    expect(ready.data.research.sources.map((s: { id: string }) => s.id)).toEqual([
      'W3',
      'W4',
      'W5',
    ]);
    expect(ready.data.research.findings.map((f: { id: string }) => f.id)).not.toContain('FW2');
    expect(ready.data.research.limitations.join(' ')).toContain('buscador de pessoas');
  });
});
type ResearchLike = { sources: { id: string; url: string }[] };
