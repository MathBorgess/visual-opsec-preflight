import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  type AnalysisData,
  type ResearchData,
  type InitialContext,
  type FindingData,
} from '@/lib/contracts';
import type { AgentsProvider, ProviderRequest, Snapshot } from './provider';

export function demoAnalysis(initial: InitialContext, refined = false): AnalysisData {
  const finding: FindingData = {
    id: 'F1',
    title: 'Contexto público em uma etiqueta — simulação',
    category: 'public_context',
    statement: 'No cenário fictício, a etiqueta contém Encontro Aurora.',
    status: 'observed',
    evidenceIds: ['V1'],
    explanation: 'Texto fictício usado para demonstrar a ligação entre uma região e uma pergunta.',
    alternatives: ['Etiqueta antiga ou material emprestado.'],
    limitations: ['Não é uma leitura real da foto enviada.'],
    priority: 'medium',
    priorityReason: 'Possível associação contextual, sem comprovar presença.',
    recommendation: 'Revisar a etiqueta antes de publicar.',
    review: 'pending',
    correction: '',
  };
  return {
    evidence: [
      {
        id: 'V1',
        kind: 'visual',
        description: 'Simulação: etiqueta com Encontro Aurora; leitura visual não executada.',
        sensitivity: 'public',
        bbox: [0.1, 0.1, 0.6, 0.3],
        limitation: 'Cenário fixo de demonstração, não resultado desta foto.',
      },
      ...initial.image.metadata
        .filter((m) => m.state === 'present')
        .map((m) => ({
          id: m.id,
          kind: 'metadata' as const,
          description: m.field + ': ' + m.value,
          sensitivity: m.private ? ('private' as const) : ('unknown' as const),
          bbox: null,
          limitation: 'Extração real do arquivo; metadados podem ser alterados.',
        })),
      ...(refined
        ? [
            {
              id: 'V2',
              kind: 'visual' as const,
              description: 'Simulação de recorte: edição 2026 legível no cenário de teste.',
              sensitivity: 'public' as const,
              bbox: [0.1, 0.1, 0.6, 0.3] as [number, number, number, number],
              limitation: 'Leitura simulada.',
            },
          ]
        : []),
    ],
    questions: [
      {
        id: 'Q1',
        text: 'Qual edição aparece na etiqueta fictícia?',
        evidenceIds: ['V1'],
        sufficientWhen: 'Nome e edição legíveis correspondem à página oficial.',
        alternative: 'Pode ser outra edição.',
        status: refined ? 'resolved' : 'open',
        attempts: refined ? 1 : 0,
      },
    ],
    seeds: [
      {
        id: 'S1',
        text: 'Encontro Aurora',
        evidenceIds: ['V1'],
        purpose: 'Contextualizar o evento fictício.',
        classification: 'public_event',
      },
    ],
    regions: refined
      ? []
      : [
          {
            id: 'R1',
            questionId: 'Q1',
            bbox: [0.1, 0.1, 0.6, 0.3],
            reason: 'Demonstrar uma nova leitura da mesma foto.',
            expectedGain: 'Distinguir a edição indicada na etiqueta fictícia.',
            dataDisclosure: 'image_crop_only',
          },
        ],
    findings: [finding],
    limitations: ['Modo de simulação: nenhuma inferência visual ou pesquisa real foi executada.'],
  };
}
export class DemoProvider implements AgentsProvider {
  readonly mode = 'demo' as const;
  readonly model = 'simulacao-local-sem-IA';
  private sessions = new Map<string, Snapshot & { expires: number }>();
  calls: ProviderRequest[] = [];
  async start(req: ProviderRequest) {
    for (const [id, s] of this.sessions) if (s.expires < Date.now()) this.sessions.delete(id);
    if (this.sessions.size > 200)
      throw new AppError('DEMO_CAPACITY', 'Encerre casos anteriores da simulação.', 429);
    this.calls.push(
      structuredClone({
        ...req,
        image: req.image ? '[pixels locais omitidos do registro de teste]' : undefined,
      }),
    );
    const id = req.sessionId ?? 'demo_' + randomUUID();
    const previous = this.sessions.get(id);
    const initial = (previous?.initial ?? { kind: req.stage, ...req.data }) as Record<
      string,
      unknown
    >;
    let output: unknown;
    if (req.stage === 'analysis' || req.stage === 'region')
      output = demoAnalysis(initial as unknown as InitialContext, req.stage === 'region');
    else if (req.stage === 'research') {
      const seeds = req.data.seeds as AnalysisData['seeds'];
      output = {
        sources: seeds.length
          ? [
              {
                id: 'W1',
                seedId: seeds[0].id,
                round: Number(req.data.round),
                semanticDepth: 1,
                url: 'https://evento-aurora.invalid/programacao',
                title: 'Programação Aurora — fonte fictícia',
                excerpt: 'Conteúdo sintético de teste: evento anual, edição 2026.',
                accessedAt: new Date().toISOString(),
                publishedAt: null,
                retrievalState: 'fixture',
                limitation: 'Nenhuma página real foi consultada.',
              },
            ]
          : [],
        findings: seeds.length
          ? [
              {
                ...demoAnalysis({ image: { metadata: [] } } as unknown as InitialContext)
                  .findings[0],
                id: 'FW1',
                status: 'corroborated',
                evidenceIds: [seeds[0].evidenceIds[0], 'W1'],
                statement: 'Somente na simulação, a fonte fictícia associa a etiqueta ao evento.',
              },
            ]
          : [],
        limitations: ['Pesquisa simulada; não demonstra exposição real.'],
        followup: null,
      } satisfies ResearchData;
    } else
      output = {
        questionResolutions: [],
        summary:
          'Simulação educativa concluída. O arquivo foi processado, mas as observações visuais e a fonte web são fictícias; nenhuma IA ou busca real foi executada.',
        findings: req.data.findings ?? [],
        recommendations: [
          'Revise textos e telas ao fundo.',
          'Remova metadados de uma cópia antes de compartilhar e verifique o resultado.',
        ],
        limitations: ['Este modo demonstra o fluxo; não analisa o conteúdo real da foto.'],
      };
    const snap: Snapshot & { expires: number } = {
      id,
      status: 'idle',
      turnId: 'turn_' + randomUUID(),
      turnStatus: 'completed',
      activeMs: 25,
      output,
      outputs: [...(previous?.outputs ?? []), output],
      initial,
      requests: [...(previous?.requests ?? []), { kind: req.stage, ...req.data }],
      visitedUrls: [],
      usageTokens: null,
      expires: Date.now() + 24 * 3600_000,
    };
    this.sessions.set(id, snap);
    return id;
  }
  async read(id: string) {
    const value = this.sessions.get(id);
    if (!value)
      throw new AppError('DEMO_EXPIRED', 'A simulação expirou ou o servidor foi reiniciado.', 410);
    return structuredClone(value);
  }
  async cancel(id: string) {
    const s = this.sessions.get(id);
    if (s) {
      s.status = 'idle';
      s.turnStatus = 'cancelled';
    }
  }
  async delete(id: string) {
    this.sessions.delete(id);
    return true;
  }
}
const globalDemo = globalThis as typeof globalThis & { __opsecDemo?: DemoProvider };
export function demoProvider() {
  return (globalDemo.__opsecDemo ??= new DemoProvider());
}
