import {
  AppError,
  isIdentitySeed,
  type AnalysisData,
  type FindingData,
  type ResearchData,
  type SeedData,
  type SourceData,
} from './contracts';

// Phone numbers with area/country code, or Brazilian mobile numbers. Year
// ranges such as 2025-2026 deliberately do not match.
const phone = /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]\d{4}\b|\b9\d{4}-\d{4}\b/g;
const address =
  /\b(?:Rua|Avenida|Av\.|Travessa|Alameda|Rodovia|Estrada)\s+[^,;\n]{2,60}?,?\s*(?:n[º°o.]?\s*)?\d{1,5}\b/giu;
const sensitive =
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk-|ghp_|AKIA|Bearer\s)[\w-]{8,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11,}\b|(?:latitude|longitude|password|senha|token|api.?key)\s*[:=]|-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,})/i;
export function isSensitive(value: string) {
  return sensitive.test(value) || new RegExp(phone.source).test(value);
}
export function minimize(value: string) {
  return maskCredentials(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[e-mail omitido]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11,}\b/g, '[documento omitido]')
    .replace(/-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/g, '[coordenadas omitidas]')
    .replace(phone, '[telefone omitido]')
    .replace(address, '[endereço omitido]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP omitido]');
}
// People-search/data brokers, face search engines, leak indexes and legal
// record aggregators. The research prompt forbids them first; this short,
// non-exhaustive list is a deterministic second barrier on reported sources.
export const EXCLUDED_SOURCE_HOSTS = [
  'spokeo.com',
  'whitepages.com',
  'pipl.com',
  'beenverified.com',
  'radaris.com',
  'mylife.com',
  'peoplefinders.com',
  'intelius.com',
  'truepeoplesearch.com',
  'fastpeoplesearch.com',
  'thatsthem.com',
  'peekyou.com',
  'instantcheckmate.com',
  'truthfinder.com',
  'ussearch.com',
  'zabasearch.com',
  'familytreenow.com',
  'clustrmaps.com',
  'nuwber.com',
  'socialcatfish.com',
  'pimeyes.com',
  'facecheck.id',
  'search4faces.com',
  'findclone.ru',
  'escavador.com',
  'jusbrasil.com.br',
  'consultasocio.com',
  'tudosobretodos.se',
  'dehashed.com',
  'intelx.io',
  'leakcheck.io',
  'snusbase.com',
] as const;
export function excludedSource(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EXCLUDED_SOURCE_HOSTS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
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
export function approveSeeds(
  analysis: AnalysisData,
  ids: string[],
  domains: string[],
  // Seeds the backend derived from the identity declared at case creation.
  declaredSeeds: SeedData[] = [],
) {
  const unique = [...new Set(ids)];
  if (unique.length > 16 || domains.length > 20)
    throw new AppError('INVALID_SELECTION', 'Seleção excede o limite.');
  const seeds = unique.map((id) => analysis.seeds.find((s) => s.id === id));
  if (
    seeds.some(
      (s) =>
        !s ||
        isSensitive(s.text) ||
        (isIdentitySeed(s)
          ? !declaredSeeds.some(
              (d) => d.id === s.id && d.text === s.text && d.classification === s.classification,
            )
          : s.evidenceIds.some(
              (id) => analysis.evidence.find((e) => e.id === id)?.sensitivity !== 'public',
            )),
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
const identityLimits =
  'Registre em exposure a categoria da fonte e as classes de dados visíveis, sem copiar contato, endereço, documento ou agenda no trecho. Indique homônimos. Não use buscadores de pessoas, agregadores de processos ou vazamentos; não colete endereço residencial, telefone pessoal, documentos, familiares, relacionamentos, rotina, localização atual nem atributos sensíveis; não pivote para outras pessoas.';
export const crossIdentityPurpose =
  'Com identidade autorizada: verificar se fontes públicas deste sinal da foto mencionam a identidade declarada (programação, equipe, autoria), mostrando como foto e identidade se reforçam. Uma menção não comprova presença, vínculo atual, localização ou rotina.';
export function publicResearchPurpose(
  classification: AnalysisData['seeds'][number]['classification'],
) {
  const purposes = {
    declared_identity:
      'Medir a exposição pública da identidade declarada: procurar o nome com a profissão declarada em páginas institucionais, perfis profissionais/acadêmicos públicos, publicações, notícias e perfis públicos. ' +
      identityLimits,
    declared_activity:
      'Verificar se a atividade declarada aparece publicamente associada ao nome: eventos, projetos, grupos, competições, publicações ou portfólios. ' +
      identityLimits,
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
  const excluded = new Set(result.sources.filter((s) => excludedSource(s.url)).map((s) => s.id));
  if (excluded.size) {
    result.sources = result.sources.filter((s) => !excluded.has(s.id));
    result.findings = result.findings.filter((f) => !f.evidenceIds.some((id) => excluded.has(id)));
    result.limitations = [
      ...result.limitations.slice(0, 11),
      `${excluded.size} fonte(s) de buscador de pessoas, agregador de dados ou vazamento descartada(s) com os achados dependentes; esses serviços ficam fora da coleta automática.`,
    ];
  }
  const seedOf = (id: string) => analysis.seeds.find((seed) => seed.id === id);
  const identityApproved = approvedIds.some((id) => {
    const seed = seedOf(id);
    return !!seed && isIdentitySeed(seed);
  });
  for (const s of result.sources) {
    const seed = seedOf(s.seedId);
    // Identity exposure is classified only under an approved declared identity.
    // An unclassified identity source counts conservatively as a possible homonym.
    if (seed && isIdentitySeed(seed))
      s.exposure = s.exposure
        ? { ...s.exposure, dataClasses: [...new Set(s.exposure.dataClasses)] }
        : { category: 'other', dataClasses: [], match: 'possible_homonym' };
    else
      s.exposure =
        identityApproved && s.exposure
          ? { ...s.exposure, dataClasses: [...new Set(s.exposure.dataClasses)] }
          : null;
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
