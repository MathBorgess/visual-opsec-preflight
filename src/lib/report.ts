import {
  LIMITS,
  type AnalysisData,
  type InitialContext,
  type Manifest,
  type Report,
  type ResearchData,
} from './contracts';
import { minimize } from './policy';

export function minimizeReport(report: Report): Report {
  // Redact string values while JSON still knows their types. Rewriting the
  // serialized document can corrupt numeric boxes, counters or escaped text.
  return JSON.parse(
    JSON.stringify(report, (_key, value: unknown) =>
      typeof value === 'string' ? minimize(value) : value,
    ),
  ) as Report;
}

export function buildReport(
  m: Manifest,
  initial: InitialContext,
  analysis: AnalysisData,
  research: ResearchData | null,
  synthesis: {
    summary: string;
    findings: Report['findings'];
    recommendations: string[];
    limitations: string[];
    questionResolutions: {
      questionId: string;
      status: string;
      evidenceIds: string[];
      reason: string;
    }[];
  } | null,
  model: string,
  usage: number | null,
): Report {
  const sources = research?.sources ?? [];
  const findings = synthesis?.findings ?? [...analysis.findings, ...(research?.findings ?? [])];
  const unresolved = analysis.questions.filter((q) =>
    ['open', 'inconclusive', 'not_explored'].includes(q.status),
  );
  const report: Report = {
    version: 'exposure-report/1.0',
    caseId: m.caseId,
    generatedAt: new Date().toISOString(),
    mode: m.provider,
    status:
      m.phase === 'cancelled'
        ? 'cancelled'
        : m.phase === 'completed' && !unresolved.length
          ? 'completed'
          : 'partial',
    scope: {
      objective:
        'Curadoria educativa de exposição virtual a partir de uma foto própria ou autorizada.',
      authorizedAt: initial.authorizedAt,
      selectedSeeds: m.allowedSeedIds,
      image: {
        width: initial.image.width,
        height: initial.image.height,
        format: initial.image.format,
      },
    },
    summary:
      synthesis?.summary ??
      'Documento parcial com as evidências disponíveis. Consulte o motivo de parada e as perguntas não resolvidas.',
    visual: analysis.evidence.map((e) => ({
      ...e,
      description:
        e.sensitivity === 'private' ? 'Dado privado presente; conteúdo omitido.' : e.description,
    })),
    metadata: initial.image.metadata,
    research: {
      state: research
        ? 'executed'
        : m.rounds
          ? 'failed'
          : m.allowedSeedIds.length
            ? 'not_executed'
            : 'not_authorized',
      seeds: analysis.seeds.filter((s) => m.allowedSeedIds.includes(s.id)),
      sources,
    },
    findings: findings.map((f) =>
      f.evidenceIds.some((id) =>
        analysis.evidence.some((e) => e.id === id && e.sensitivity === 'private'),
      )
        ? {
            ...f,
            title: 'Dado privado que merece revisão',
            statement: 'Há informação privada na evidência; o valor foi omitido.',
            explanation: 'A evidência foi minimizada para não ampliar sua divulgação.',
            alternatives: ['O arquivo pode ter sido alterado; presença não comprova atualidade.'],
            limitations: ['Valores privados não são usados como termos de busca.'],
            priorityReason: 'Possível exposição direta de dado privado.',
            recommendation: 'Revise a região e os metadados pertinentes antes de compartilhar.',
          }
        : f,
    ),
    recommendations: synthesis?.recommendations ?? [
      ...new Set(findings.map((f) => f.recommendation)),
    ],
    coverage: {
      stopReason: m.stopReason,
      closedQuestions: analysis.questions.filter((q) => q.status === 'resolved').map((q) => q.text),
      unresolvedQuestions: unresolved.map((q) => q.text),
      blockedBranches: analysis.questions.filter((q) => q.status === 'blocked').map((q) => q.text),
      unexploredSignals: analysis.questions
        .filter((q) => q.status === 'not_explored')
        .map((q) => q.text),
      crops: m.crops,
      rounds: m.rounds,
      activeMs: m.activeMs,
      limits: LIMITS,
      limitations: [
        ...initial.image.limitations,
        ...analysis.limitations,
        ...(research?.limitations ?? []),
        ...(synthesis?.limitations ?? []),
        ...(synthesis?.questionResolutions.map(
          (r) =>
            `${r.questionId} (${r.status}): ${r.reason} Evidências: ${r.evidenceIds.join(', ')}.`,
        ) ?? []),
        'A cobertura é limitada; ausência de resultado não comprova ausência de exposição.',
        'Expirar o caso ou fechar a aba não exclui as sessões remotas.',
      ],
      remoteStatus:
        m.cancellation === 'pending'
          ? 'cancelling'
          : ['analyzing', 'researching', 'synthesizing'].includes(m.phase)
            ? 'running'
            : 'idle',
      deletion: Object.fromEntries(
        Object.values(m.deletion).map((v, i) => ['sessao_' + (i + 1), v]),
      ),
      usageTokens: usage,
      cost: null,
    },
    method: {
      model,
      promptVersion: '1',
      imageProcessor: 'Sharp + exifr; extração determinística e visão sujeita a erro',
      sourceCatalog: [
        'Foto e metadados',
        'Fontes públicas pertinentes via web search',
        'Google/HIBP: orientação manual, sem consulta automática',
      ],
    },
  };
  return minimizeReport(report);
}

export function reportMarkdown(r: Report): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>|#!])/g, '\\$1');
  const list = (items: string[]) =>
    items.length
      ? items.map((v) => '- ' + clean(v)).join('\n')
      : '- Não disponível ou não executado.';
  const lines = [
    '# Documento de exposição virtual',
    r.mode === 'demo'
      ? '> SIMULAÇÃO: dados visuais e web fictícios; não é análise real da foto.'
      : '> Revisão educativa, sem certificação de segurança.',
    '## 1. Identificação e escopo',
    'Caso: ' + r.caseId,
    'Estado: ' + r.status,
    'Gerado em: ' + r.generatedAt,
    clean(r.scope.objective),
    '## 2. Resumo de exposição',
    clean(r.summary),
    '## 3. O que a foto mostra',
    list(r.visual.map((e) => `${e.id}: ${e.description} — ${e.limitation}`)),
    '## 4. O que o arquivo registra',
    list(r.metadata.map((m) => `${m.field} (${m.state}): ${m.value}`)),
    '## 5. O que a web acrescentou',
    'Estado: ' + r.research.state,
    list(
      r.research.sources.map(
        (s) =>
          `${s.id}: ${s.title}; semente ${s.seedId}; rodada ${s.round}; profundidade ${s.semanticDepth}; acesso ${s.accessedAt}; ${s.url}; ${s.retrievalState}; ${s.excerpt}; ${s.limitation}`,
      ),
    ),
    '## 6. Achados e correlações',
    ...r.findings.map(
      (f) =>
        `### ${clean(f.title)}\n\nOriginal do modelo: ${clean(f.statement)}\n\n${f.review === 'corrected' ? 'Correção do autor: ' + clean(f.correction) : ''}\n\nEstado: ${f.status}; revisão: ${f.review}; prioridade: ${f.priority}.\n\nEvidências: ${f.evidenceIds.join(', ')}\n\n${clean(f.explanation)}\n\nAlternativas: ${clean(f.alternatives.join('; '))}\n\nLimites: ${clean(f.limitations.join('; '))}\n\nCritério de prioridade: ${clean(f.priorityReason)}\n\nRecomendação: ${clean(f.recommendation)}`,
    ),
    '## 7. Redução de exposição',
    list(r.recommendations),
    'Recomendações não significam alteração executada na foto.',
    '## 8. Cobertura e limites',
    'Motivo de parada: ' + (r.coverage.stopReason ?? 'unknown'),
    `Recortes: ${r.coverage.crops}; rodadas: ${r.coverage.rounds}; tempo ativo: ${r.coverage.activeMs}ms.`,
    'Estado remoto: ' + r.coverage.remoteStatus,
    'Custo: indisponível.',
    '### Perguntas pendentes',
    list(r.coverage.unresolvedQuestions),
    '### Sinais não explorados',
    list(r.coverage.unexploredSignals),
    '### Limitações',
    list(r.coverage.limitations),
    '### Encerramento',
    JSON.stringify(r.coverage.deletion),
  ];
  return lines.join('\n\n') + '\n';
}
