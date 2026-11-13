import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  Analysis,
  Research,
  Synthesis,
  Box,
  AppError,
  LIMITS,
  EXPOSED_DATA,
  EXPOSURE_CATEGORIES,
  isIdentitySeed,
  validateAnalysis,
  type AnalysisData,
  type CaseView,
  type DeclaredIdentityData,
  type InitialContext,
  type Manifest,
  type ResearchData,
} from '@/lib/contracts';
import {
  approveSeeds,
  validateFindings,
  validateResearch,
  isSensitive,
  safeUrl,
  presentEvidence,
  publicResearchPurpose,
  curateVerifiedResearch,
  crossIdentityPurpose,
  excludedSource,
  minimize,
} from '@/lib/policy';
import {
  attachIdentity,
  identityExposure,
  identitySeeds,
  parseIdentityForm,
  readDeclaredIdentity,
  withIdentityEvidence,
  withoutIdentitySeeds,
} from '@/lib/identity';
import { buildReport } from '@/lib/report';
import { processImage } from './image';
import { guard, readManifest, jsonResponse, imageForm, boundedBody } from './security';
import {
  openAIProvider,
  record,
  type AgentsProvider,
  type ProviderRequest,
  type Snapshot,
} from './provider';
import { demoProvider } from './demo';
import { diagnosticEvent, logFailure, snapshotDiagnostic, withDiagnostics } from './diagnostics';
import { normalizeProviderError, ProviderError } from './provider-error';

const empty: AnalysisData = {
  evidence: [],
  questions: [],
  seeds: [],
  regions: [],
  findings: [],
  limitations: [],
};
const actionSchema = z
  .object({
    action: z.enum(['finish_visual', 'search', 'research_more', 'synthesize']),
    seedIds: z.array(z.string().max(64)).max(12).optional(),
    domains: z.array(z.string().max(253)).max(20).optional(),
  })
  .strict();
function fingerprint(a: AnalysisData, r: ResearchData | null = null) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        a.evidence.map((e) => e.id).sort(),
        a.questions.map((q) => [q.id, q.status]),
        a.findings.map((f) => [f.id, f.status]),
        r ? [...new Set(r.sources.map((s) => s.excerpt.trim().toLowerCase()))].sort() : null,
        r?.findings.map((f) => [f.id, f.status]),
      ]),
    )
    .digest('hex');
}
function selectProvider(): AgentsProvider {
  if (process.env.OPSEC_PROVIDER === 'demo' && !process.env.VERCEL) return demoProvider();
  if (process.env.OPSEC_PROVIDER === 'openai') return openAIProvider();
  throw new AppError(
    'NOT_CONFIGURED',
    'Integração não configurada. Para validar localmente sem chave, inicie com npm run dev:demo.',
    503,
  );
}
type Loaded = {
  identity: DeclaredIdentityData | null;
  verificationIssue?: AppError;
  verificationUrls: string[];
  failure?: AppError;
  initial: InitialContext;
  analysis: AnalysisData;
  research: ResearchData | null;
  synthesis: z.infer<typeof Synthesis> | null;
  visual: Snapshot;
  search: Snapshot | null;
  error: string | null;
};
export function createApi(
  providerFactory: () => AgentsProvider = selectProvider,
  now = () => Date.now(),
) {
  async function handle(
    req: Request,
    endpoint: 'create' | 'get' | 'advance' | 'region' | 'cancel' | 'delete' | 'config' | 'events',
  ): Promise<Response> {
    let manifest: Manifest | null = null;
    let submissionAttempted = false;
    try {
      guard(req, !['get', 'config', 'events'].includes(endpoint));
      if (endpoint === 'config')
        return jsonResponse({
          revision: /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '')
            ? process.env.VERCEL_GIT_COMMIT_SHA
            : 'local',
          mode: process.env.OPSEC_PROVIDER === 'demo' && !process.env.VERCEL ? 'demo' : 'openai',
          available:
            (process.env.OPSEC_PROVIDER === 'demo' && !process.env.VERCEL) ||
            (process.env.OPSEC_PROVIDER === 'openai' &&
              !!process.env.OPENAI_API_KEY &&
              !!process.env.OPENAI_MODEL),
          limits: LIMITS,
        });
      const provider = providerFactory();
      const start: AgentsProvider['start'] = async (request) => {
        submissionAttempted = true;
        return provider.start(request);
      };
      if (endpoint === 'create') {
        try {
          if (readManifest(req, true))
            throw new AppError('CASE_EXISTS', 'Encerre o caso atual antes de abrir outro.', 409);
        } catch (e) {
          if (!(e instanceof AppError) || e.code !== 'CASE_EXPIRED') throw e;
        }
        const form = await imageForm(req);
        const file = form.get('image');
        if (!(file instanceof File) || form.get('consent') !== 'yes')
          throw new AppError(
            'CONSENT_REQUIRED',
            'Selecione uma foto própria/autorizada e confirme a autorização de ambiente.',
          );
        const context = String(form.get('context') ?? '');
        if (context.length > 600)
          throw new AppError('CONTEXT_SIZE', 'Use até 600 caracteres de contexto opcional.');
        const authorizedAt = new Date(now()).toISOString();
        // Identification is part of every case: it has its own authorization and
        // is validated before any image or provider work.
        const declaredIdentity = parseIdentityForm(
          {
            name: form.get('identityName'),
            profession: form.get('identityProfession'),
            activities: form.get('identityActivities'),
            relation: form.get('identityRelation'),
            consent: form.get('identityConsent'),
          },
          authorizedAt,
        );
        const image = await processImage(Buffer.from(await file.arrayBuffer()));
        const initial: InitialContext = {
          kind: 'analysis',
          image: image.info,
          context,
          authorizedAt,
          declaredIdentity,
        };
        manifest = {
          version: 1,
          caseId: randomUUID(),
          visualId: '',
          researchId: null,
          provider: provider.mode,
          phase: 'uncertain',
          stage: 'analysis',
          createdAt: now(),
          expiresAt: now() + 24 * 3600_000,
          activeMs: 0,
          pendingStartedAt: now(),
          questionAttempts: {},
          crops: 0,
          rounds: 0,
          noGain: 0,
          lastTurnId: '',
          priorFingerprint: '',
          stopReason: null,
          pendingKey: randomUUID(),
          allowedSeedIds: [],
          allowedDomains: [],
          cancellation: 'none',
          deletion: {},
        };
        manifest.visualId = await start({
          stage: 'analysis',
          data: {
            image: initial.image,
            context,
            authorizedAt: initial.authorizedAt,
            declaredIdentity,
          },
          image: image.dataUrl,
          key: manifest.pendingKey,
        });
        manifest.phase = 'analyzing';
        return jsonResponse(
          { caseId: manifest.caseId, phase: manifest.phase, mode: provider.mode },
          201,
          manifest,
        );
      }
      try {
        manifest = readManifest(req, false, endpoint === 'delete')!;
      } catch (e) {
        if (endpoint === 'delete' && e instanceof AppError && e.code === 'INVALID_CASE')
          return jsonResponse(
            {
              closed: true,
              remoteDeletionConfirmed: false,
              message:
                'Referência local inválida removida. A exclusão remota não foi confirmada; confira sessões órfãs no projeto OpenAI.',
            },
            200,
            null,
            true,
          );
        throw e;
      }
      const m = manifest;
      if (provider.mode !== m.provider)
        throw new AppError(
          'MODE_CHANGED',
          'O modo mudou desde a criação do caso. Retome com a configuração anterior para encerrar as sessões.',
          409,
        );
      if (endpoint === 'events') {
        const id = m.stage === 'research' ? m.researchId : m.visualId;
        if (!id || !provider.events) return jsonResponse({ events: false }, 200);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        const signal = AbortSignal.any([req.signal, controller.signal]);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(target) {
            try {
              for await (const event of provider.events!(id, signal)) {
                if (signal.aborted) break;
                target.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              }
            } catch {
              if (!signal.aborted)
                target.enqueue(encoder.encode('data: {"type":"observer_unavailable"}\n\n'));
            } finally {
              clearTimeout(timer);
              try {
                target.close();
              } catch {
                /* disconnected observer */
              }
            }
          },
          cancel() {
            controller.abort();
            clearTimeout(timer);
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
          },
        });
      }
      if (endpoint === 'delete') {
        for (const id of [m.visualId, m.researchId].filter(Boolean) as string[]) {
          if (m.deletion[id] === 'deleted') continue;
          m.deletion[id] = 'pending';
          try {
            try {
              const s = await provider.read(id);
              if (['in_progress', 'requires_action'].includes(s.status)) await provider.cancel(id);
            } catch {
              // Missing initial history does not prevent cancelling a known session.
              try {
                await provider.cancel(id);
              } catch {
                /* terminal or unavailable */
              }
            }
            m.deletion[id] = (await provider.delete(id)) ? 'deleted' : 'failed';
          } catch {
            m.deletion[id] = 'failed';
          }
        }
        const done = Object.values(m.deletion).every((s) => s === 'deleted');
        const unknown =
          m.remoteCreationUnknown ??
          (!m.visualId || (m.stage === 'research' && m.rounds > 0 && !m.researchId));
        return jsonResponse(
          {
            closed: done,
            remoteDeletionConfirmed: done && !unknown,
            deletion: Object.values(m.deletion),
            message: !done
              ? 'Exclusão incompleta. O caso foi preservado para nova tentativa.'
              : unknown
                ? 'Referência local encerrada. Uma criação remota ficou sem ID confirmado; sua exclusão não pôde ser verificada. Confira sessões órfãs no projeto OpenAI.'
                : 'Encerramento confirmado pelo provedor. Isso não garante apagamento imediato de backups.',
          },
          done ? 200 : 409,
          done ? null : m,
          done,
        );
      }
      if (!m.visualId)
        throw new AppError(
          'UNKNOWN_REMOTE_SESSION',
          'A criação remota ficou sem ID confirmado. Não reenvie a foto automaticamente; encerre a referência local e confira sessões órfãs no projeto OpenAI.',
          409,
        );
      const loaded = await load(provider, m);
      const active = m.stage === 'research' ? loaded.search : loaded.visual;
      if (
        ['analyzing', 'researching', 'synthesizing'].includes(m.phase) &&
        active &&
        (['in_progress', 'requires_action'].includes(active.status) || active.output === null) &&
        m.activeMs + now() - m.pendingStartedAt >= LIMITS.activeMs
      ) {
        m.stopReason = 'deadline_reached';
        m.phase = 'partial';
        m.cancellation = 'pending';
        try {
          await provider.cancel(active.id);
          const state = await provider.read(active.id);
          if (!['in_progress', 'requires_action'].includes(state.status))
            m.cancellation = 'confirmed';
        } catch {
          /* expose pending status */
        }
      }
      reconcile(m, loaded, now());
      for (const q of loaded.analysis.questions) {
        q.attempts = m.questionAttempts[q.id] ?? 0;
        if (q.status === 'open' && q.attempts >= 2 && m.noGain > 0) q.status = 'inconclusive';
      }
      if (
        m.phase === 'exploring' &&
        (m.activeMs >= LIMITS.activeMs ||
          m.noGain >= 2 ||
          !loaded.analysis.regions.some((r) =>
            loaded.analysis.questions.some(
              (q) => q.id === r.questionId && q.status === 'open' && q.attempts < 2,
            ),
          ))
      )
        m.phase = 'awaiting_search_review';
      if (endpoint === 'get') return jsonResponse(view(m, loaded, provider.model), 200, m);
      if (endpoint === 'cancel') {
        m.stopReason = 'user_cancelled';
        m.phase = 'cancelled';
        m.cancellation = 'pending';
        const active = [loaded.visual, loaded.search].filter(Boolean) as Snapshot[];
        try {
          for (const s of active)
            if (['in_progress', 'requires_action'].includes(s.status)) await provider.cancel(s.id);
          const states = await Promise.all(active.map((s) => provider.read(s.id)));
          if (states.every((s) => !['in_progress', 'requires_action'].includes(s.status)))
            m.cancellation = 'confirmed';
        } catch {
          /* Keep pending; never claim cancellation from a request alone. */
        }
        return jsonResponse(view(m, loaded, provider.model), 200, m);
      }
      if (['cancelled', 'completed', 'partial', 'failed', 'uncertain'].includes(m.phase))
        throw new AppError(
          'CASE_NOT_ADVANCEABLE',
          'O caso não aceita novas fases. Revise o resultado ou encerre.',
          409,
        );
      if (['analyzing', 'researching', 'synthesizing'].includes(m.phase))
        throw new AppError(
          'TURN_RUNNING',
          'O turno ainda está em andamento; acompanhe o estado existente.',
          409,
        );
      const budgetStop =
        m.activeMs >= LIMITS.activeMs
          ? 'deadline_reached'
          : m.noGain >= 2
            ? 'no_information_gain'
            : null;
      if (endpoint === 'region') {
        if (
          budgetStop ||
          m.crops >= LIMITS.crops ||
          (m.phase !== 'exploring' && m.phase !== 'awaiting_search_review')
        )
          throw new AppError(
            'CROP_LIMIT',
            'Não há orçamento ou fase disponível para novo recorte.',
            409,
          );
        const form = await imageForm(req);
        const file = form.get('image');
        if (!(file instanceof File))
          throw new AppError(
            'IMAGE_REQUIRED',
            'Selecione novamente o mesmo arquivo para criar o recorte.',
          );
        const regionId = String(form.get('regionId') ?? '');
        let box;
        let questionId;
        if (regionId) {
          const r = loaded.analysis.regions.find((r) => r.id === regionId);
          if (!r) throw new AppError('INVALID_REGION', 'Pedido de região não encontrado.');
          box = r.bbox;
          questionId = r.questionId;
        } else {
          try {
            box = Box.parse(JSON.parse(String(form.get('bbox'))));
            questionId = String(form.get('questionId'));
          } catch {
            throw new AppError('INVALID_REGION', 'Informe uma caixa normalizada válida.');
          }
        }
        const question = loaded.analysis.questions.find((q) => q.id === questionId);
        if (!question || question.status !== 'open' || (m.questionAttempts[question.id] ?? 0) >= 2)
          throw new AppError(
            'BRANCH_CLOSED',
            'A pergunta já encerrou ou excedeu as tentativas.',
            409,
          );
        const image = await processImage(Buffer.from(await file.arrayBuffer()), box);
        if (image.info.hash !== loaded.initial.image.hash)
          throw new AppError('IMAGE_CHANGED', 'O recorte deve usar o mesmo arquivo original.');
        m.crops++;
        m.priorFingerprint = fingerprint(loaded.analysis);
        m.lastTurnId = loaded.visual.turnId;
        m.questionAttempts[question.id] = (m.questionAttempts[question.id] ?? 0) + 1;
        await submit(start, m, {
          stage: 'region',
          sessionId: m.visualId,
          image: image.dataUrl,
          data: {
            request: { questionId, bbox: box, attempt: question.attempts + 1 },
            previous: withoutIdentitySeeds(loaded.analysis),
            instructions:
              'Retorne análise cumulativa; incremente attempts da pergunta. Se continuar sem ganho, encerre-a como inconclusive.',
          },
          key: `${m.caseId}:region:${m.crops}`,
        });
      } else {
        let action: z.infer<typeof actionSchema>;
        try {
          action = actionSchema.parse(JSON.parse((await boundedBody(req, 24000)).toString()));
        } catch {
          throw new AppError('INVALID_ACTION', 'Ação inválida.');
        }
        if (action.action === 'finish_visual') {
          if (!['exploring', 'awaiting_search_review'].includes(m.phase))
            throw new AppError('INVALID_PHASE', 'Fase não permite revisão de sementes.', 409);
          m.phase = 'awaiting_search_review';
          return jsonResponse(view(m, loaded, provider.model), 200, m);
        }
        if (action.action === 'search') {
          if (m.phase !== 'awaiting_search_review')
            throw new AppError('INVALID_PHASE', 'Revise as sementes antes da busca.', 409);
          if (budgetStop) {
            m.stopReason = budgetStop;
            await synthesize(start, m, loaded);
          } else {
            const domains = (action.domains ?? []).map((s) => s.toLowerCase().trim());
            // The identification authorization granted at creation already covers
            // the declared identity: its seeds join every research round. The
            // author selects only which photo signals accompany them.
            const declared = identitySeeds(loaded.identity);
            const requested = [
              ...(action.seedIds ?? []).filter((id) => !declared.some((d) => d.id === id)),
              ...declared.map((d) => d.id),
            ];
            const seeds = approveSeeds(loaded.analysis, requested, domains, declared).map((s) => ({
              ...s,
              purpose: publicResearchPurpose(s.classification),
            }));
            m.allowedSeedIds = seeds.map((s) => s.id);
            m.allowedDomains = domains;
            if (!seeds.length) {
              m.stopReason = 'no_useful_action';
              await synthesize(start, m, loaded);
            } else {
              m.rounds++;
              m.lastTurnId = '';
              m.priorFingerprint = fingerprint(loaded.analysis, loaded.research);
              await submit(start, m, {
                stage: 'research',
                data: researchData(seeds, m.rounds, loaded.identity),
                domains,
                key: `${m.caseId}:research:${m.rounds}`,
              });
            }
          }
        } else if (action.action === 'research_more') {
          if (
            m.phase !== 'research_ready' ||
            !m.researchId ||
            !loaded.research?.followup ||
            m.rounds >= LIMITS.rounds ||
            budgetStop
          )
            throw new AppError(
              'RESEARCH_LIMIT',
              'Não há nova rodada útil ou orçamento disponível.',
              409,
            );
          m.rounds++;
          m.lastTurnId = loaded.search?.turnId ?? '';
          m.priorFingerprint = fingerprint(loaded.analysis, loaded.research);
          const seeds = loaded.analysis.seeds
            .filter((s) => m.allowedSeedIds.includes(s.id))
            .map((s) => ({
              ...s,
              purpose: publicResearchPurpose(s.classification),
            }));
          await submit(start, m, {
            stage: 'research',
            sessionId: m.researchId,
            data: {
              ...researchData(seeds, m.rounds, loaded.identity),
              instruction: loaded.verificationUrls.length
                ? 'As fontes da rodada anterior não foram aceitas. Abra exatamente os URLs de urlsToVerify usando web_search, confira o conteúdo e reconstrua Research com evidências efetivamente obtidas. Não apenas troque URLs mantendo trechos sem suporte. Use round atual; fonte inacessível fica unavailable. Não amplie sementes, domínios ou alvos.'
                : 'Tente resolver alternativas pendentes sem ampliar sementes; preserve IDs de fontes anteriores.',
              ...(loaded.verificationUrls.length ? { urlsToVerify: loaded.verificationUrls } : {}),
            },
            domains: m.allowedDomains,
            key: `${m.caseId}:research:${m.rounds}`,
          });
        } else {
          if (!['research_ready', 'awaiting_search_review', 'exploring'].includes(m.phase))
            throw new AppError('INVALID_PHASE', 'Fase inválida para síntese.', 409);
          m.stopReason ??=
            budgetStop ??
            (m.rounds >= LIMITS.rounds && loaded.research?.followup
              ? 'budget_exhausted'
              : loaded.analysis.questions.some((q) => q.status === 'open')
                ? 'no_useful_action'
                : 'sufficient_evidence');
          await synthesize(start, m, loaded);
        }
      }
      return jsonResponse({ ...view(m, loaded, provider.model), report: null }, 202, m);
    } catch (e) {
      let error = normalizeProviderError(e);
      if (error.code === 'CONTEXT_PENDING' && endpoint === 'get' && manifest) {
        if (manifest.activeMs + now() - manifest.pendingStartedAt < LIMITS.activeMs) {
          diagnosticEvent('provider_history_pending');
          return jsonResponse(
            {
              pending: true,
              caseId: manifest.caseId,
              mode: manifest.provider,
              phase: manifest.phase,
              diagnostic: snapshotDiagnostic(error),
            },
            202,
            manifest,
          );
        }
        manifest.phase = 'failed';
        manifest.stopReason = 'deadline_reached';
        manifest.cancellation = 'pending';
        try {
          await providerFactory().cancel(
            manifest.stage === 'research' ? manifest.researchId! : manifest.visualId,
          );
        } catch {
          /* deletion remains available */
        }
        error = new AppError(
          'CONTEXT_TIMEOUT',
          'O histórico inicial não foi registrado dentro do prazo. Encerre o caso e consulte o diagnóstico.',
          502,
        );
      }
      if (
        submissionAttempted &&
        error instanceof ProviderError &&
        error.definitive &&
        manifest?.phase === 'uncertain'
      ) {
        if (!manifest.visualId) manifest = null;
        else {
          manifest.remoteCreationUnknown = false;
          manifest.phase = 'partial';
          manifest.stopReason = 'provider_failure';
        }
      } else if (
        manifest?.phase === 'uncertain' &&
        (!manifest.visualId || (manifest.stage === 'research' && !manifest.researchId))
      )
        manifest.remoteCreationUnknown = true;
      logFailure(error);
      return jsonResponse(
        {
          error: { code: error.code, message: error.message },
          diagnostic: snapshotDiagnostic(error),
          uncertain: manifest?.phase === 'uncertain',
        },
        error.status,
        manifest,
      );
    }
  }
  return (req: Request, endpoint: Parameters<typeof handle>[1]) =>
    withDiagnostics(req, endpoint, () => handle(req, endpoint));
}

async function load(p: AgentsProvider, m: Manifest): Promise<Loaded> {
  const visual = await p.read(m.visualId);
  const initial = visual.initial as unknown as InitialContext;
  if (
    initial.kind !== 'analysis' ||
    !initial.image ||
    !initial.image.hash ||
    !Array.isArray(initial.image.metadata)
  )
    throw new AppError('INVALID_CONTEXT', 'Contexto da sessão não corresponde ao caso.', 502);
  const identity = readDeclaredIdentity(initial.declaredIdentity);
  let search: Snapshot | null = null,
    research: ResearchData | null = null,
    error: string | null = null;
  let failure = visual.failure;
  let verificationIssue: AppError | undefined;
  let verificationUrls: string[] = [];
  let analysis: AnalysisData = withIdentityEvidence(
    {
      ...empty,
      evidence: initial.image.metadata
        .filter((m) => m.state === 'present')
        .map((m) => ({
          id: m.id,
          kind: 'metadata' as const,
          description: m.field + ': ' + m.value,
          sensitivity: m.private ? ('private' as const) : ('unknown' as const),
          bbox: null,
          limitation: 'Extração do arquivo; autenticidade não confirmada.',
        })),
    },
    identity,
  );
  let previous: AnalysisData | undefined;
  for (const output of visual.outputs) {
    if (record(output) && typeof output.summary === 'string') continue;
    try {
      analysis = validateAnalysis(withIdentityEvidence(Analysis.parse(output), identity), previous);
      previous = analysis;
    } catch {
      error =
        'A análise não passou na validação; preservadas apenas as evidências anteriores e o inventário do arquivo.';
      m.phase = 'partial';
      m.stopReason = 'policy_violation';
      break;
    }
  }
  // Identity seeds come only from the declared identity, after model validation.
  analysis = attachIdentity(analysis, identity);
  if (m.researchId && m.deletion[m.researchId] !== 'deleted') {
    try {
      search = await p.read(m.researchId);
      // Completed prior turns remain usable while a later turn is pending,
      // cancelled or invalid. They do not complete that later turn.
      for (const output of search.outputs) {
        if (output === search.output) continue;
        const prior = Research.safeParse(output);
        if (!prior.success || prior.data.sources.some((s) => s.round > m.rounds)) continue;
        try {
          research = validateResearch(
            prior.data,
            analysis,
            m.allowedSeedIds,
            m.allowedDomains,
            m.provider,
            search.visitedUrls,
          );
        } catch {
          // A rejected previous answer must never become fallback evidence.
        }
      }
      const waitingNewTurn =
        m.stage === 'research' &&
        ['researching', 'uncertain'].includes(m.phase) &&
        search.turnId === m.lastTurnId;
      if (!waitingNewTurn && search.output !== null && search.turnStatus === 'completed') {
        const parsed = Research.parse(search.output);
        if (parsed.sources.some((s) => s.round > m.rounds)) throw new Error('invalid round');
        research = validateResearch(
          parsed,
          analysis,
          m.allowedSeedIds,
          m.allowedDomains,
          m.provider,
          search.visitedUrls,
        );
      }
    } catch (cause) {
      if (cause instanceof AppError && cause.code === 'CONTEXT_PENDING') throw cause;
      const issue = normalizeProviderError(cause);
      const candidate =
        search?.turnStatus === 'completed' ? Research.safeParse(search.output) : null;
      if (
        m.stage === 'research' &&
        search?.turnStatus === 'completed' &&
        search.turnId !== m.lastTurnId
      ) {
        m.activeMs += Math.max(0, search.activeMs);
        m.lastTurnId = search.turnId;
      }
      const safeSources =
        candidate?.success &&
        candidate.data.sources.every((s) => {
          const url = safeUrl(s.url, m.provider === 'demo');
          return (
            !!url &&
            m.allowedSeedIds.includes(s.seedId) &&
            (!m.allowedDomains.length ||
              m.allowedDomains.some(
                (d) => new URL(url).hostname === d || new URL(url).hostname.endsWith('.' + d),
              ))
          );
        });
      if (
        !failure &&
        issue.code === 'UNVERIFIED_SOURCE' &&
        safeSources &&
        m.rounds < LIMITS.rounds &&
        m.activeMs < LIMITS.activeMs &&
        m.noGain < 2
      ) {
        verificationUrls = [
          ...new Set(
            candidate.data.sources
              .map((s) => s.url)
              .filter(
                (url) =>
                  !excludedSource(url) &&
                  !search!.visitedUrls.some((v) => safeUrl(v) === safeUrl(url)),
              ),
          ),
        ];
        verificationIssue = new AppError(issue.code, issue.message, issue.status, {
          ...issue.details,
          retryable: true,
        });
        research = {
          sources: research?.sources ?? [],
          findings: research?.findings ?? [],
          limitations: [
            'As fontes citadas aguardam confirmação por uma ação web concluída. Nenhum achado dessa rodada foi aceito.',
          ],
          followup:
            'Abrir e verificar os endereços citados dentro da autorização e do orçamento restantes.',
        };
        if (m.stage === 'research' && ['researching', 'uncertain'].includes(m.phase))
          m.phase = 'research_ready';
        diagnosticEvent('research_verification_needed', {
          urls: verificationUrls.length,
          roundsRemaining: LIMITS.rounds - m.rounds,
        });
      } else {
        const curated =
          !failure && issue.code === 'UNVERIFIED_SOURCE' && safeSources
            ? curateVerifiedResearch(
                candidate.data,
                analysis,
                m.allowedSeedIds,
                m.allowedDomains,
                m.provider,
                search!.visitedUrls,
              )
            : null;
        if (curated) {
          research = curated;
          verificationIssue = new AppError(
            issue.code,
            'Citações sem comprovação foram descartadas; fontes verificadas preservadas.',
            issue.status,
            { ...issue.details, retryable: false },
          );
          if (m.stage === 'research' && ['researching', 'uncertain'].includes(m.phase))
            m.phase = 'research_ready';
          diagnosticEvent('research_sources_curated', {
            retained: curated.sources.length,
            discarded: candidate?.success
              ? candidate.data.sources.length - curated.sources.length
              : 0,
          });
        } else {
          failure = issue;
          logFailure(failure);
          error =
            'A pesquisa não pôde ser validada/recuperada. Os resultados visuais permanecem disponíveis.';
          m.phase = 'partial';
          m.stopReason = 'provider_failure';
        }
      }
    }
  }
  const synths = visual.outputs.filter((o) => record(o) && typeof o.summary === 'string');
  let synthesis = null;
  if (synths.length) {
    try {
      synthesis = Synthesis.parse(synths.at(-1));
      validateFindings(synthesis.findings, analysis, research?.sources ?? []);
      const known = new Set([
        ...analysis.evidence.map((e) => e.id),
        ...(research?.sources.map((s) => s.id) ?? []),
      ]);
      if (
        new Set(synthesis.questionResolutions.map((r) => r.questionId)).size !==
          synthesis.questionResolutions.length ||
        synthesis.questionResolutions.some(
          (r) =>
            !analysis.questions.some((q) => q.id === r.questionId) ||
            r.evidenceIds.some((id) => !known.has(id)),
        )
      )
        throw new Error('invalid resolution');
      for (const resolution of synthesis.questionResolutions)
        analysis.questions = analysis.questions.map((q) =>
          q.id === resolution.questionId ? { ...q, status: resolution.status } : q,
        );
    } catch {
      synthesis = null;
      error = 'A síntese não passou na validação; documento parcial com evidências existentes.';
      m.phase = 'partial';
      m.stopReason = 'policy_violation';
    }
  }
  if (search?.failure) failure = search.failure;
  if (failure) {
    error = failure.message;
    m.phase = 'partial';
    m.stopReason = 'provider_failure';
    logFailure(failure);
  }
  return {
    identity,
    initial,
    analysis,
    research,
    synthesis,
    visual,
    search,
    error,
    failure,
    verificationIssue,
    verificationUrls,
  };
}
function reconcile(m: Manifest, l: Loaded, now: number) {
  if (
    m.cancellation === 'pending' &&
    [l.visual, l.search]
      .filter(Boolean)
      .every((s) => !['in_progress', 'requires_action'].includes(s!.status))
  )
    m.cancellation = 'confirmed';
  if (!['analyzing', 'researching', 'synthesizing', 'uncertain'].includes(m.phase)) return;
  const s = m.stage === 'research' ? l.search : l.visual;
  if (!s || !s.turnId || s.turnId === m.lastTurnId) return;
  if (['failed', 'cancelled'].includes(s.turnStatus) || s.status === 'failed') {
    m.phase = 'partial';
    m.stopReason = s.turnStatus === 'cancelled' ? 'user_cancelled' : 'provider_failure';
    m.lastTurnId = s.turnId;
    return;
  }
  if (s.turnStatus !== 'completed') {
    // A bounded active turn can outlive a request; polling never re-submits it.
    if (now - m.createdAt > 24 * 3600_000) m.stopReason = 'deadline_reached';
    return;
  }
  // Turn metadata can precede the persisted final message. Keep polling the
  // same turn instead of committing an empty/invalid terminal document.
  if (s.output === null) return;
  m.activeMs += Math.max(0, s.activeMs);
  m.lastTurnId = s.turnId;
  const current = fingerprint(l.analysis, m.stage === 'research' ? l.research : null);
  if (m.priorFingerprint) m.noGain = current === m.priorFingerprint ? m.noGain + 1 : 0;
  if (m.noGain >= 2) m.stopReason = 'no_information_gain';
  if (
    (m.stage === 'analysis' || m.stage === 'region') &&
    !l.analysis.evidence.length &&
    !l.visual.outputs.length
  ) {
    m.phase = 'partial';
    m.stopReason = 'provider_failure';
    return;
  }
  if (m.stage === 'analysis' || m.stage === 'region')
    m.phase =
      l.analysis.regions.some((r) =>
        l.analysis.questions.some(
          (q) => q.id === r.questionId && q.status === 'open' && q.attempts < 2,
        ),
      ) &&
      m.crops < LIMITS.crops &&
      m.noGain < 2
        ? 'exploring'
        : 'awaiting_search_review';
  else if (m.stage === 'research') m.phase = 'research_ready';
  else {
    if (!l.synthesis) {
      m.phase = 'partial';
      m.stopReason = 'provider_failure';
    } else {
      m.phase = 'completed';
      if (
        m.stopReason === 'no_useful_action' &&
        l.analysis.questions.length &&
        l.analysis.questions.every((q) => q.status === 'resolved')
      )
        m.stopReason = 'sufficient_evidence';
    }
  }
}
async function submit(start: AgentsProvider['start'], m: Manifest, req: ProviderRequest) {
  m.stage = req.stage;
  m.pendingKey = req.key;
  m.phase = 'uncertain';
  m.pendingStartedAt = Date.now();
  try {
    const id = await start(req);
    if (req.stage === 'research') m.researchId = id;
    m.phase =
      req.stage === 'research'
        ? 'researching'
        : req.stage === 'synthesis'
          ? 'synthesizing'
          : 'analyzing';
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new AppError(
      'ACTION_UNCERTAIN',
      'O provedor não confirmou a operação. Acompanhe o estado; não haverá reenvio automático.',
      502,
    );
  }
}
function researchData(
  seeds: AnalysisData['seeds'],
  round: number,
  identity: DeclaredIdentityData | null,
) {
  const declared = identity ? seeds.filter(isIdentitySeed) : [];
  const questions = seeds.map((s) => ({ seedId: s.id, question: s.purpose }));
  if (!declared.length) return { seeds, questions, round };
  // Crossing approved photo signals with the declared identity shows how both
  // reinforce each other. The backend writes the question; the model cannot widen it.
  for (const s of seeds.filter((s) => !isIdentitySeed(s)))
    questions.push({ seedId: s.id, question: crossIdentityPurpose });
  return {
    seeds,
    questions,
    round,
    identityScope: {
      relation: identity!.relation,
      authorizedAt: identity!.authorizedAt,
      declaredSeedIds: declared.map((s) => s.id),
      objective:
        'Mostrar, para fins educativos, quanto da identidade autorizada está exposto em fontes públicas e como ela se combina aos sinais aprovados da foto.',
      exposureCategories: EXPOSURE_CATEGORIES,
      exposedData: EXPOSED_DATA,
      outOfScope:
        'Outras pessoas, homônimos como alvo, buscadores de pessoas, agregadores de processos, vazamentos, endereço residencial, telefone pessoal, documentos, familiares, rotina, localização atual e atributos sensíveis.',
    },
  };
}
async function synthesize(start: AgentsProvider['start'], m: Manifest, l: Loaded) {
  m.lastTurnId = l.visual.turnId;
  const findings = [...l.analysis.findings, ...(l.research?.findings ?? [])];
  await submit(start, m, {
    stage: 'synthesis',
    sessionId: m.visualId,
    data: {
      analysis: l.analysis,
      research: l.research,
      findings,
      stopReason: m.stopReason,
      ...(l.identity
        ? {
            identityExposure: identityExposure(
              l.identity,
              l.analysis.seeds,
              l.research,
              m.allowedSeedIds,
              m.rounds,
            ),
          }
        : {}),
      instruction:
        'Sintetize sem buscar novamente. Não invente fontes nem promova hipótese. Preserve review=pending, correction="". questionResolutions encerra perguntas existentes com IDs de evidências válidos e motivo; só resolva se o critério de suficiência foi atendido. Registre inconclusive quando houve exploração sem resposta.' +
        (l.identity
          ? ' Há identidade autorizada: o summary explica, conforme identityExposure, quanto dela ficou exposto, como foto e identidade se reforçam e quais ações reduzem a exposição. Achados sobre ela usam category=identity. Não trate possível homônimo como fato nem infira residência, rotina, localização atual ou atributos sensíveis.'
          : ''),
    },
    key: `${m.caseId}:synthesis`,
  });
}
function view(m: Manifest, l: Loaded, model: string): CaseView {
  const { hash: _hash, ...image } = l.initial.image;
  const terminal = ['completed', 'partial', 'cancelled', 'failed'].includes(m.phase);
  const report = terminal
    ? buildReport(
        m,
        { ...l.initial, declaredIdentity: l.identity },
        l.analysis,
        l.research,
        l.synthesis,
        model,
        l.visual.usageTokens === null ? null : l.visual.usageTokens + (l.search?.usageTokens ?? 0),
      )
    : null;
  return {
    diagnostic: snapshotDiagnostic(l.failure ?? l.verificationIssue),
    verificationPending: l.verificationUrls.length > 0,
    execution: {
      sessionStatus: (m.stage === 'research' ? l.search : l.visual)?.status ?? 'unknown',
      turnStatus: (m.stage === 'research' ? l.search : l.visual)?.turnStatus ?? 'unknown',
      toolCalls: l.search?.toolCalls ?? 0,
      checkedAt: new Date().toISOString(),
    },
    caseId: m.caseId,
    mode: m.provider,
    phase: m.phase,
    image,
    identity: l.identity,
    analysis: {
      ...l.analysis,
      seeds: l.analysis.seeds.filter((s) => !isSensitive(s.text)),
      evidence: l.analysis.evidence.map(presentEvidence),
    },
    research: l.research && {
      ...l.research,
      sources: l.research.sources.map((s) => ({
        ...s,
        title: minimize(s.title),
        excerpt: minimize(s.excerpt),
        limitation: minimize(s.limitation),
      })),
    },
    report,
    limits: LIMITS,
    budget: { crops: m.crops, rounds: m.rounds, activeMs: m.activeMs, noGain: m.noGain },
    stopReason: m.stopReason,
    cancellation: m.cancellation,
    deletion: Object.fromEntries(
      Object.entries(m.deletion).map(([_, value], i) => ['sessao_' + (i + 1), value]),
    ),
    error: l.error,
  };
}

export const api = createApi();
