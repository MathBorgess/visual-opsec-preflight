import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  isIdentitySeed,
  type AnalysisData,
  type ResearchData,
  type InitialContext,
  type DiscoveryData,
  type FindingData,
  type SourceData,
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
    subjects: {
      facesVisible: 1,
      note: 'Simulação: um rosto em primeiro plano; contagem fictícia, sem identificação.',
    },
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
// Fictional exposure of a declared identity. Only `.invalid` fixture URLs are
// used; no person is searched in demo mode.
function demoIdentityResearch(seeds: AnalysisData['seeds'], round: number) {
  const declared = seeds.filter(isIdentitySeed);
  if (!declared.length)
    return {
      sources: [] as SourceData[],
      findings: () => [] as FindingData[],
      discovered: [] as DiscoveryData[],
    };
  const profile = declared[0];
  const activity = declared.find((s) => s.classification === 'declared_activity') ?? profile;
  const base = {
    round,
    semanticDepth: 1,
    accessedAt: new Date().toISOString(),
    publishedAt: null,
    retrievalState: 'fixture' as const,
    limitation: 'Fonte fictícia; nenhuma pessoa foi pesquisada.',
  };
  const sources: SourceData[] = [
    {
      ...base,
      id: 'W2',
      seedId: profile.id,
      url: 'https://perfil-profissional.invalid/pessoa-exemplo',
      title: 'Perfil profissional público — fonte fictícia',
      excerpt:
        'Conteúdo sintético: nome completo, cargo, organização, cidade e foto de perfil visíveis.',
      exposure: {
        category: 'professional_profile',
        dataClasses: ['full_name', 'photo', 'role', 'employer', 'city'],
        match: 'declared_identity',
      },
    },
    {
      ...base,
      id: 'W3',
      seedId: activity.id,
      url: 'https://evento-aurora.invalid/palestrantes',
      title: 'Lista de palestrantes — fonte fictícia',
      excerpt: 'Conteúdo sintético: nome, minibiografia e horário da palestra na edição 2026.',
      exposure: {
        category: 'event_participation',
        dataClasses: ['full_name', 'biography', 'schedule', 'affiliations'],
        match: 'declared_identity',
      },
    },
    {
      ...base,
      id: 'W4',
      seedId: profile.id,
      url: 'https://noticias-exemplo.invalid/homonimo',
      title: 'Notícia com nome igual — fonte fictícia',
      excerpt: 'Conteúdo sintético: mesmo nome, outra profissão e outra cidade.',
      limitation: 'Fonte fictícia; ilustra um possível homônimo, fora da contagem.',
      exposure: {
        category: 'media_mention',
        dataClasses: ['full_name'],
        match: 'possible_homonym',
      },
    },
    {
      ...base,
      id: 'W5',
      seedId: profile.id,
      url: 'https://registro-publico.invalid/busca-por-nome',
      title: 'Agregador de diário oficial — fonte fictícia',
      excerpt:
        'Conteúdo sintético: o nome aparece em uma publicação de diário oficial; número, partes e assunto omitidos.',
      exposure: {
        category: 'public_record',
        dataClasses: ['full_name', 'legal_mention'],
        match: 'declared_identity',
      },
    },
  ];
  const finding = (photoSeeds: AnalysisData['seeds']): FindingData[] => [
    {
      id: 'FW2',
      title: 'Nome e profissão levam a um perfil público — simulação',
      category: 'identity',
      statement:
        'Somente na simulação, a identidade declarada aparece em um perfil profissional com foto, cargo, organização e cidade.',
      status: 'corroborated',
      evidenceIds: [profile.evidenceIds[0], 'W2'],
      explanation:
        'A semente derivada da identidade declarada encontrou uma fonte fictícia atribuída.',
      alternatives: ['Perfil de homônimo; confirme cada fonte antes de agir.'],
      limitations: ['Fonte fictícia; não demonstra exposição real.'],
      priority: 'medium',
      priorityReason: 'Foto e cidade reduzem a ambiguidade sobre a pessoa.',
      recommendation:
        'Revise a visibilidade do perfil: oculte cidade e use foto diferente da compartilhada.',
      review: 'pending',
      correction: '',
    },
    ...(photoSeeds.length
      ? [
          {
            id: 'FW3',
            title: 'Etiqueta da foto e lista de palestrantes se reforçam — simulação',
            category: 'combination' as const,
            statement:
              'Somente na simulação, o evento visível na etiqueta também lista a identidade declarada com horário de palestra.',
            status: 'corroborated' as const,
            evidenceIds: [photoSeeds[0].evidenceIds[0], activity.evidenceIds[0], 'W3'],
            explanation:
              'Sinal da foto e identidade declarada convergem na mesma fonte fictícia; não comprova presença atual.',
            alternatives: ['Edição anterior do evento ou homônimo.'],
            limitations: ['Uma agenda pública não comprova presença nem rotina.'],
            priority: 'medium' as const,
            priorityReason: 'Foto e agenda pública permitem associar a imagem a um horário.',
            recommendation:
              'Evite publicar a foto do crachá durante o evento; peça ao organizador para omitir horários.',
            review: 'pending' as const,
            correction: '',
          },
        ]
      : []),
  ];
  // Proactive discovery from the name alone, all fictional.
  const discovered: DiscoveryData[] = [
    {
      facet: 'profession',
      value: 'Pesquisadora em segurança da informação (fictício)',
      sourceIds: ['W2'],
      match: 'declared_identity',
    },
    {
      facet: 'employer',
      value: 'Instituto Exemplo (fictício)',
      sourceIds: ['W2'],
      match: 'declared_identity',
    },
    {
      facet: 'activity',
      value: 'Palestrante no Encontro Aurora 2026 (fictício)',
      sourceIds: ['W3'],
      match: 'declared_identity',
    },
    {
      facet: 'profession',
      value: 'Outra profissão de um homônimo (fictício)',
      sourceIds: ['W4'],
      match: 'possible_homonym',
    },
  ];
  return { sources, findings: finding, discovered };
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
      const all = req.data.seeds as AnalysisData['seeds'];
      const seeds = all.filter((s) => !isIdentitySeed(s));
      const identity = demoIdentityResearch(all, Number(req.data.round));
      output = {
        sources: [
          ...(seeds.length
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
                } satisfies SourceData,
              ]
            : []),
          ...identity.sources,
        ],
        findings: [
          ...(seeds.length
            ? [
                {
                  ...demoAnalysis({ image: { metadata: [] } } as unknown as InitialContext)
                    .findings[0],
                  id: 'FW1',
                  status: 'corroborated' as const,
                  evidenceIds: [seeds[0].evidenceIds[0], 'W1'],
                  statement: 'Somente na simulação, a fonte fictícia associa a etiqueta ao evento.',
                },
              ]
            : []),
          ...identity.findings(seeds),
        ],
        limitations: ['Pesquisa simulada; não demonstra exposição real.'],
        followup: null,
        discovered: identity.discovered,
      } satisfies ResearchData;
    } else
      output = {
        questionResolutions: [],
        summary:
          'Simulação educativa concluída. O arquivo foi processado, mas as observações visuais e a fonte web são fictícias; nenhuma IA ou busca real foi executada.' +
          (req.data.identityExposure
            ? ' Na trilha de identidade simulada, nome e profissão declarados levam a um perfil público fictício com foto, cargo e cidade, e a atividade declarada a uma lista de palestrantes com horário: o exemplo mostra como foto e identidade se reforçam.'
            : ''),
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
