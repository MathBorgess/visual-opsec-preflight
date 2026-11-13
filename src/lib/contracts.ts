import { z } from 'zod';

export const LIMITS = {
  bytes: 3 * 1024 ** 2,
  body: 3.5 * 1024 ** 2,
  pixels: 16_000_000,
  derivative: 700 * 1024,
  imageUrlChars: 1_048_576,
  crops: 3,
  rounds: 2,
  questions: 5,
  activeMs: 180_000,
} as const;
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const text = z.string().max(2000);
export const Box = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().positive().max(1),
  z.number().positive().max(1),
]);
export const Evidence = z
  .object({
    id,
    kind: z.enum(['visual', 'metadata', 'user_context', 'web']),
    description: text,
    // Literal reading from an image region; never an inferred identity.
    verbatimText: text.nullable().optional(),
    sensitivity: z.enum(['public', 'private', 'unknown']),
    bbox: Box.nullable(),
    limitation: text,
  })
  .strict();
export const Question = z
  .object({
    id,
    text,
    evidenceIds: z.array(id).min(1),
    sufficientWhen: text,
    alternative: text,
    status: z.enum(['open', 'resolved', 'inconclusive', 'blocked', 'not_explored']),
    attempts: z.number().int().min(0).max(4),
  })
  .strict();
export const Seed = z
  .object({
    id,
    text: z.string().min(2).max(120),
    evidenceIds: z.array(id).min(1),
    purpose: text,
    classification: z.enum([
      'public_event',
      'public_organization',
      'public_domain',
      'public_place',
      'product',
    ]),
  })
  .strict();
export const Region = z
  .object({
    id,
    questionId: id,
    bbox: Box,
    reason: text,
    expectedGain: text,
    dataDisclosure: z.literal('image_crop_only'),
  })
  .strict();
export const Finding = z
  .object({
    id,
    title: text,
    category: z.enum([
      'text',
      'environment',
      'technology',
      'public_context',
      'metadata',
      'combination',
    ]),
    statement: text,
    status: z.enum(['observed', 'corroborated', 'hypothesis', 'contradicted', 'unknown']),
    evidenceIds: z.array(id).min(1),
    explanation: text,
    alternatives: z.array(text).max(5),
    limitations: z.array(text).max(8),
    priority: z.enum(['high', 'medium', 'low', 'undetermined']),
    priorityReason: text,
    recommendation: text,
    review: z.enum(['pending', 'accepted', 'rejected', 'corrected']),
    correction: text,
  })
  .strict();
export const Analysis = z
  .object({
    evidence: z.array(Evidence).max(30),
    questions: z.array(Question).max(5),
    seeds: z.array(Seed).max(12),
    regions: z.array(Region).max(3),
    findings: z.array(Finding).max(20),
    limitations: z.array(text).max(12),
  })
  .strict();
export const Source = z
  .object({
    id,
    seedId: id,
    round: z.number().int().min(1).max(2),
    semanticDepth: z.number().int().min(1).max(2),
    url: z.string().max(2000),
    title: text,
    excerpt: text,
    accessedAt: z.string().max(80),
    publishedAt: z.string().max(80).nullable(),
    retrievalState: z.enum(['snippet_only', 'retrieved', 'unavailable', 'fixture']),
    limitation: text,
  })
  .strict();
export const Research = z
  .object({
    sources: z.array(Source).max(12),
    findings: z.array(Finding).max(15),
    limitations: z.array(text).max(12),
    followup: text.nullable(),
  })
  .strict();
export const Synthesis = z
  .object({
    summary: text,
    findings: z.array(Finding).max(30),
    recommendations: z.array(text).max(20),
    limitations: z.array(text).max(20),
    questionResolutions: z
      .array(
        z
          .object({
            questionId: id,
            status: z.enum(['resolved', 'inconclusive', 'blocked', 'not_explored']),
            evidenceIds: z.array(id).min(1),
            reason: text,
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type AnalysisData = z.infer<typeof Analysis>;
export type ResearchData = z.infer<typeof Research>;
export type FindingData = z.infer<typeof Finding>;
export type BoxData = z.infer<typeof Box>;
export type SourceData = z.infer<typeof Source>;
export type Stage = 'analysis' | 'region' | 'research' | 'synthesis';
export type Phase =
  | 'analyzing'
  | 'exploring'
  | 'awaiting_search_review'
  | 'researching'
  | 'research_ready'
  | 'synthesizing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'uncertain';
export type StopReason =
  | 'sufficient_evidence'
  | 'no_useful_action'
  | 'no_information_gain'
  | 'scope_boundary'
  | 'budget_exhausted'
  | 'deadline_reached'
  | 'user_cancelled'
  | 'provider_failure'
  | 'policy_violation'
  | null;
export type MetadataRow = {
  id: string;
  field: string;
  state: 'present' | 'not_present' | 'failed' | 'not_supported';
  value: string;
  providedValue?: string;
  private: boolean;
};
export type ImageInfo = {
  width: number;
  height: number;
  derivedWidth: number;
  derivedHeight: number;
  format: string;
  hash: string;
  metadata: MetadataRow[];
  limitations: string[];
};
export type InitialContext = {
  kind: 'analysis';
  image: ImageInfo;
  context: string;
  authorizedAt: string;
};
export type Manifest = {
  version: 1;
  caseId: string;
  visualId: string;
  researchId: string | null;
  remoteCreationUnknown?: boolean;
  provider: 'demo' | 'openai';
  phase: Phase;
  stage: Stage;
  createdAt: number;
  expiresAt: number;
  activeMs: number;
  pendingStartedAt: number;
  questionAttempts: Record<string, number>;
  crops: number;
  rounds: number;
  noGain: number;
  lastTurnId: string;
  priorFingerprint: string;
  stopReason: StopReason;
  pendingKey: string;
  allowedSeedIds: string[];
  allowedDomains: string[];
  cancellation: 'none' | 'pending' | 'confirmed';
  deletion: Record<string, 'pending' | 'deleted' | 'failed'>;
};
export type Report = {
  version: 'exposure-report/1.0';
  caseId: string;
  generatedAt: string;
  mode: 'demo' | 'openai';
  status: 'completed' | 'partial' | 'cancelled';
  scope: {
    objective: string;
    authorizedAt: string;
    selectedSeeds: string[];
    image: { width: number; height: number; format: string };
  };
  summary: string;
  visual: AnalysisData['evidence'];
  metadata: MetadataRow[];
  research: {
    state: 'executed' | 'not_authorized' | 'not_executed' | 'failed';
    seeds: z.infer<typeof Seed>[];
    sources: SourceData[];
  };
  findings: FindingData[];
  recommendations: string[];
  coverage: {
    stopReason: StopReason;
    closedQuestions: string[];
    unresolvedQuestions: string[];
    blockedBranches: string[];
    unexploredSignals: string[];
    crops: number;
    rounds: number;
    activeMs: number;
    limits: typeof LIMITS;
    limitations: string[];
    remoteStatus: string;
    deletion: Manifest['deletion'];
    usageTokens: number | null;
    cost: null;
  };
  method: { model: string; promptVersion: '2'; imageProcessor: string; sourceCatalog: string[] };
};
export type PendingCaseView = {
  pending: true;
  caseId: string;
  mode: 'demo' | 'openai';
  phase: string;
  diagnostic?: Diagnostic;
};
export type CaseView = {
  verificationPending?: boolean;
  diagnostic?: Diagnostic;
  execution?: { sessionStatus: string; turnStatus: string; toolCalls: number; checkedAt: string };
  caseId: string;
  mode: 'demo' | 'openai';
  phase: Phase;
  image: Omit<ImageInfo, 'hash'>;
  analysis: AnalysisData;
  research: ResearchData | null;
  report: Report | null;
  limits: typeof LIMITS;
  budget: { crops: number; rounds: number; activeMs: number; noGain: number };
  stopReason: StopReason;
  cancellation: Manifest['cancellation'];
  deletion: Manifest['deletion'];
  error: string | null;
};

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status = 400,
    public details?: {
      bounds?: { name: string; actual: number; maximum: number; width?: number; height?: number };
      provider?: ProviderDiagnostic;
      retryable?: boolean;
      sourceAudit?: { reportedUrl: string; recordedUrls: string[] };
    },
  ) {
    super(message);
  }
}
export type ProviderDiagnostic = {
  history?: { items: number; userMessages: number; inputTextChars: number; parseFailures: number };
  summary?: string;
  hints?: string[];
  status?: number;
  code?: string;
  param?: string;
  requestId?: string;
  sessionId?: string;
  turnId?: string;
  retryAfterSeconds?: number;
};
export type Diagnostic = {
  requestId: string;
  stage: string;
  elapsedMs: number;
  providerInvoked: boolean | null;
  code?: string;
  bounds?: NonNullable<AppError['details']>['bounds'];
  provider?: ProviderDiagnostic;
  retryable?: boolean;
  sourceAudit?: { reportedUrl: string; recordedUrls: string[] };
};
export function validBox(box: BoxData) {
  return (
    box.every(Number.isFinite) && box[0] + box[2] <= 1.00000001 && box[1] + box[3] <= 1.00000001
  );
}
export function assertRefs(ids: string[], known: Set<string>) {
  if (ids.some((id) => !known.has(id)))
    throw new AppError(
      'INVALID_EVIDENCE',
      'A resposta contém referências de evidência inexistentes.',
      502,
    );
}
export function validateAnalysis(data: AnalysisData, previous?: AnalysisData) {
  for (const group of [data.questions, data.seeds, data.regions, data.findings])
    if (new Set(group.map((x) => x.id)).size !== group.length)
      throw new AppError('DUPLICATE_ID', 'IDs repetidos na resposta.', 502);
  if (
    previous &&
    (previous.evidence.some((e) => !data.evidence.some((next) => next.id === e.id)) ||
      previous.questions.some(
        (q) => !data.questions.some((next) => next.id === q.id && next.text === q.text),
      ))
  )
    throw new AppError(
      'HISTORY_CHANGED',
      'A resposta removeu evidências ou substituiu perguntas existentes.',
      502,
    );
  const ids = data.evidence.map((e) => e.id);
  if (new Set(ids).size !== ids.length)
    throw new AppError('DUPLICATE_ID', 'IDs de evidência repetidos.', 502);
  const known = new Set(ids);
  for (const e of data.evidence)
    if (e.bbox && !validBox(e.bbox))
      throw new AppError('INVALID_BOX', 'Uma região saiu dos limites da imagem.', 502);
  for (const q of data.questions) assertRefs(q.evidenceIds, known);
  for (const s of data.seeds) {
    assertRefs(s.evidenceIds, known);
    if (
      s.evidenceIds.some((id) => data.evidence.find((e) => e.id === id)?.sensitivity !== 'public')
    )
      throw new AppError(
        'PRIVATE_SEED',
        'Uma semente contém evidência que não foi classificada como pública.',
        502,
      );
  }
  for (const r of data.regions)
    if (!validBox(r.bbox) || !data.questions.some((q) => q.id === r.questionId))
      throw new AppError('INVALID_REGION', 'Pedido de região inválido.', 502);
  for (const f of data.findings) {
    assertRefs(f.evidenceIds, known);
    if (f.status === 'corroborated')
      throw new AppError('UNSUPPORTED_CORROBORATION', 'Corroboração externa sem fonte web.', 502);
  }
  return data;
}
