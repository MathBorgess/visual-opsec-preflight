import {
  LIMITS,
  type AnalysisData,
  type InitialContext,
  type Manifest,
  type Report,
  type ResearchData,
} from './contracts';
import { maskCredentials, minimize, presentEvidence } from './policy';
import {
  breadthLabels,
  categoryLabels,
  dataClassLabels,
  facetLabels,
  identityExposure,
  relationLabels,
} from './identity';

export function minimizeReport(report: Report): Report {
  // Redact string values while JSON still knows their types. Rewriting the
  // serialized document can corrupt numeric boxes, counters or escaped text.
  const clean = JSON.parse(
    JSON.stringify(report, (_key, value: unknown) =>
      typeof value === 'string' ? minimize(value) : value,
    ),
  ) as Report;
  // Preserve only explicitly supplied readings, separately from derived claims.
  clean.visual = report.visual.map((e, i) => ({
    ...clean.visual[i],
    verbatimText: presentEvidence(e).verbatimText,
  }));
  clean.metadata = report.metadata.map((m, i) => ({
    ...clean.metadata[i],
    ...(m.state === 'present' && m.providedValue
      ? { providedValue: maskCredentials(m.providedValue) }
      : { providedValue: undefined }),
  }));
  return clean;
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
  const identity = initial.declaredIdentity ?? null;
  const facesVisible = analysis.subjects?.facesVisible ?? null;
  const exposure = identityExposure(identity, analysis.seeds, research, m.allowedSeedIds, m.rounds);
  if (identity && facesVisible !== null && facesVisible > 1)
    exposure.limitations.push(
      `${facesVisible - 1} outra(s) pessoa(s) visível(is) na foto ficou(aram) fora da pesquisa por não ter(em) autorizado; considere desfocá-la(s) antes de compartilhar.`,
    );
  const report: Report = {
    version: 'exposure-report/1.1',
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
      objective: identity
        ? 'Curadoria educativa de exposição virtual a partir de uma foto própria ou autorizada e da identidade declarada com autorização: o que foto e identidade, juntas, permitem encontrar em fontes públicas.'
        : 'Curadoria educativa de exposição virtual a partir de uma foto própria ou autorizada.',
      authorizedAt: initial.authorizedAt,
      selectedSeeds: m.allowedSeedIds,
      image: {
        width: initial.image.width,
        height: initial.image.height,
        format: initial.image.format,
      },
      identity,
      facesVisible,
    },
    summary:
      synthesis?.summary ??
      'Documento parcial com as evidências disponíveis. Consulte o motivo de parada e as perguntas não resolvidas.',
    visual: analysis.evidence.map(presentEvidence),
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
    identity: exposure,
    findings: findings.map((f) =>
      f.evidenceIds.some((id) =>
        analysis.evidence.some((e) => e.id === id && e.sensitivity === 'private'),
      )
        ? {
            ...f,
            title: 'Dado privado que merece revisão',
            statement:
              'Há informação pessoal na evidência; consulte os valores fornecidos e sua origem nas seções 3 e 4.',
            explanation:
              'A transcrição ou o registro no arquivo não confirma a identidade de alguém na foto.',
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
      promptVersion: '3',
      imageProcessor: 'Sharp + exifr; extração determinística e visão sujeita a erro',
      sourceCatalog: [
        'Foto e metadados',
        'Fontes públicas pertinentes via web search',
        ...(identity
          ? ['Identidade declarada pelo autor; pesquisada via web search somente se liberada']
          : []),
        'Google/HIBP: orientação manual, sem consulta automática',
      ],
    },
  };
  return minimizeReport(report);
}

const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>|#!])/g, '\\$1');

export function reportMarkdown(r: Report): string {
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
    'Rostos visíveis: ' +
      (r.scope.facesVisible ?? 'não informado') +
      '. Somente a pessoa autorizada é pesquisada; nenhum rosto é usado para identificar.',
    '## 2. Resumo de exposição',
    clean(r.summary),
    '## 3. O que a foto mostra',
    list(
      r.visual.map(
        (e) =>
          `${e.id}: ${e.description}${e.verbatimText ? `; texto legível fornecido: ${e.verbatimText} (leitura do modelo; não confirma identidade)` : ''} — ${e.limitation}`,
      ),
    ),
    '## 4. O que o arquivo registra',
    list(
      r.metadata.map(
        (m) =>
          `${m.field} (${m.state}): ${m.providedValue ? m.providedValue + '; ' : ''}${m.value}`,
      ),
    ),
    '## 5. O que a web acrescentou',
    'Estado: ' + r.research.state,
    list(
      r.research.sources.map(
        (s) =>
          `${s.id}: ${s.title}; semente ${s.seedId}; rodada ${s.round}; profundidade ${s.semanticDepth}; acesso ${s.accessedAt}; ${s.url}; ${s.retrievalState}; ${s.excerpt}; ${s.limitation}${s.exposure ? `; exposição: ${categoryLabels[s.exposure.category]} — ${s.exposure.dataClasses.map((d) => dataClassLabels[d]).join(', ') || 'sem classes registradas'} (${s.exposure.match === 'declared_identity' ? 'atribuída à identidade' : 'possível homônimo'})` : ''}`,
      ),
    ),
    '### 5.1 Exposição da identidade autorizada',
    ...identitySection(r),
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

function identitySection(r: Report): string[] {
  const id = r.scope.identity;
  const x = r.identity;
  if (!id) return [clean(x.breadthReason)];
  const list = (items: string[]) =>
    items.length ? items.map((v) => '- ' + clean(v)).join('\n') : '- Nenhum registro.';
  return [
    clean(
      `Identidade declarada (${relationLabels[id.relation]}): ${id.name}${id.profession ? ' · ' + id.profession : ''}${id.activities.length ? ' · ' + id.activities.join('; ') : ''}. Fornecida pelo autor; não identificada pelo rosto.`,
    ),
    'Estado: ' + x.state,
    clean(`Amplitude observada: ${breadthLabels[x.breadth]}. ${x.breadthReason}`),
    'Sementes de identidade liberadas:',
    list(x.seeds),
    'O que a busca descobriu a partir do nome:',
    list(
      x.discovered.map((d) => `${facetLabels[d.facet]}: ${d.value} (${d.sourceIds.join(', ')})`),
    ),
    'Onde a identidade aparece:',
    list(x.categories.map((c) => `${categoryLabels[c.category]}: ${c.sourceIds.join(', ')}`)),
    'Dados alcançáveis a partir da foto e da identidade:',
    list(x.dataClasses.map((d) => `${dataClassLabels[d.dataClass]}: ${d.sourceIds.join(', ')}`)),
    'Limites da medição:',
    list(x.limitations),
  ];
}
