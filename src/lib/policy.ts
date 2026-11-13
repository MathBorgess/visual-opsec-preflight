import {
  AppError,
  type AnalysisData,
  type FindingData,
  type ResearchData,
  type SourceData,
} from './contracts';

const sensitive =
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk-|ghp_|AKIA|Bearer\s)[\w-]{8,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11,}\b|(?:latitude|longitude|password|senha|token|api.?key)\s*[:=]|-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,})/i;
export function isSensitive(value: string) {
  return sensitive.test(value);
}
export function minimize(value: string) {
  return maskCredentials(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[e-mail omitido]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11,}\b/g, '[documento omitido]')
    .replace(/-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/g, '[coordenadas omitidas]');
}
export function maskCredentials(value: string) {
  return value
    .replace(/\b(?:sk-|ghp_|AKIA)[\w-]{8,}|\bBearer\s+[\w.-]+/gi, '[credencial omitida]')
    .replace(
      /\b(?:password|senha|token|api[ _.-]?key)\b["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|[^\s\\"',;}\]]+)/gi,
      '[segredo omitido]',
    );
}
export function presentEvidence(e: AnalysisData['evidence'][number]) {
  return {
    ...e,
    description:
      e.sensitivity === 'private'
        ? 'Dado pessoal presente no material fornecido; consulte a transcrição e sua limitação.'
        : minimize(e.description),
    // Only direct visual readings have an exemption from generic minimization.
    verbatimText:
      e.kind === 'visual' && e.bbox && e.verbatimText ? maskCredentials(e.verbatimText) : null,
  };
}
export function publicDomain(host: string): boolean {
  return (
    host.length <= 253 &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(host) &&
    host
      .split('.')
      .every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) &&
    !/(?:^|\.)(localhost|local|internal|test|invalid|example)$/i.test(host) &&
    !/^\d+\./.test(host)
  );
}
export function safeUrl(value: string, fixture = false): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      isSensitive(decodeURIComponent(u.pathname + u.search + u.hash))
    )
      return null;
    if (!publicDomain(u.hostname) && !(fixture && u.hostname.endsWith('.invalid'))) return null;
    return u.href;
  } catch {
    return null;
  }
}
export function approveSeeds(analysis: AnalysisData, ids: string[], domains: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length > 12 || domains.length > 20)
    throw new AppError('INVALID_SELECTION', 'Seleção excede o limite.');
  const seeds = unique.map((id) => analysis.seeds.find((s) => s.id === id));
  if (
    seeds.some(
      (s) =>
        !s ||
        isSensitive(s.text) ||
        s.evidenceIds.some(
          (id) => analysis.evidence.find((e) => e.id === id)?.sensitivity !== 'public',
        ),
    )
  )
    throw new AppError('SENSITIVE_QUERY', 'Termo não elegível para pesquisa pública.');
  if (domains.join(',').length > 512 || domains.some((d) => !publicDomain(d)))
    throw new AppError(
      'INVALID_DOMAIN',
      'Use domínios públicos, sem protocolo, porta ou caminho, com até 512 caracteres no total.',
    );
  return seeds as AnalysisData['seeds'];
}
export function publicResearchPurpose(
  classification: AnalysisData['seeds'][number]['classification'],
) {
  const purposes = {
    public_event:
      'Confirmar nome, edição, organizador e contexto público do evento; procurar alternativas, sem atribuir presença ou rotina a pessoas.',
    public_organization:
      'Verificar atividade declarada e contexto público da organização em fonte oficial; não atribuir vínculo profissional a pessoas da foto.',
    public_domain:
      'Verificar a entidade e a finalidade pública do domínio aprovado; não consultar contas, contatos ou identificadores pessoais.',
    public_place:
      'Verificar denominação e características públicas do local e possíveis homônimos; não localizar residência nem inferir presença atual ou deslocamentos.',
    product:
      'Verificar fabricante, modelo e documentação do produto legível; explicar exposição contextual sem inferir profissão, renda ou hábitos de pessoas.',
  };
  return purposes[classification];
}
export function validateResearch(
  result: ResearchData,
  analysis: AnalysisData,
  approvedIds: string[],
  domains: string[],
  mode: string,
  citedUrls: string[],
) {
  const known = new Set(analysis.evidence.map((e) => e.id));
  const sourceIds = new Set<string>();
  for (const s of result.sources) {
    const url = safeUrl(s.url, mode === 'demo');
    if (!url || !approvedIds.includes(s.seedId) || sourceIds.has(s.id) || known.has(s.id))
      throw new AppError('INVALID_SOURCE', 'Fonte sem vínculo ou URL válida.', 502);
    if (mode !== 'demo' && s.retrievalState === 'fixture')
      throw new AppError(
        'FABRICATED_SOURCE',
        'Fonte sintética não pode aparecer em execução real.',
        502,
      );
    if (
      mode !== 'demo' &&
      s.retrievalState !== 'unavailable' &&
      !citedUrls.some((v) => safeUrl(v) === url)
    )
      throw new AppError(
        'UNVERIFIED_SOURCE',
        'A fonte não consta nas referências retornadas pela ferramenta.',
        502,
        {
          sourceAudit: {
            reportedUrl: url,
            recordedUrls: citedUrls
              .flatMap((v) => {
                const safe = safeUrl(v);
                return safe ? [safe] : [];
              })
              .slice(0, 12),
          },
        },
      );
    if (
      domains.length &&
      !domains.some((d) => new URL(url).hostname === d || new URL(url).hostname.endsWith('.' + d))
    )
      throw new AppError('SOURCE_OUT_OF_SCOPE', 'Fonte fora dos domínios liberados.', 502);
    s.url = url;
    sourceIds.add(s.id);
  }
  validateFindings(result.findings, analysis, result.sources);
  return result;
}
export function validateFindings(
  findings: FindingData[],
  analysis: AnalysisData,
  sources: SourceData[],
) {
  const known = new Set([...analysis.evidence.map((e) => e.id), ...sources.map((s) => s.id)]);
  if (new Set(findings.map((f) => f.id)).size !== findings.length)
    throw new AppError('DUPLICATE_FINDING', 'Achados com IDs duplicados.', 502);
  for (const f of findings) {
    if (f.evidenceIds.some((id) => !known.has(id)))
      throw new AppError('INVALID_EVIDENCE', 'Achado sem evidência existente.', 502);
    if (f.status === 'corroborated') {
      const refs = sources.filter(
        (s) => f.evidenceIds.includes(s.id) && s.retrievalState !== 'unavailable',
      );
      if (
        !refs.length ||
        !refs.some((s) =>
          analysis.seeds
            .find((seed) => seed.id === s.seedId)
            ?.evidenceIds.some((id) => f.evidenceIds.includes(id)),
        )
      )
        throw new AppError(
          'UNSUPPORTED_CORROBORATION',
          'Corroboração sem cadeia até a imagem.',
          502,
        );
    }
  }
}

export function curateVerifiedResearch(
  result: ResearchData,
  analysis: AnalysisData,
  approvedIds: string[],
  domains: string[],
  mode: string,
  citedUrls: string[],
): ResearchData | null {
  const sources = result.sources.filter(
    (s) =>
      s.retrievalState !== 'unavailable' && citedUrls.some((v) => safeUrl(v) === safeUrl(s.url)),
  );
  if (!sources.length) return null;
  const sourceIds = new Set(sources.map((s) => s.id));
  const known = new Set([...analysis.evidence.map((e) => e.id), ...sourceIds]);
  const findings = result.findings.filter((f) => {
    if (
      !f.evidenceIds.every((id) => known.has(id)) ||
      !f.evidenceIds.some((id) => sourceIds.has(id))
    )
      return false;
    try {
      validateFindings([f], analysis, sources);
      return true;
    } catch {
      return false;
    }
  });
  try {
    return validateResearch(
      {
        sources,
        findings,
        followup: null,
        limitations: [
          ...result.limitations.slice(0, 11),
          `${result.sources.length - sources.length} fonte(s) sem comprovação nas ações web e os achados dependentes foram descartados após a conferência limitada. A síntese usa somente o restante validado; cobertura parcial.`,
        ],
      },
      analysis,
      approvedIds,
      domains,
      mode,
      citedUrls,
    );
  } catch {
    return null;
  }
}
