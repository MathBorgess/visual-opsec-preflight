import {
  AppError,
  DeclaredIdentity,
  IDENTITY_EVIDENCE_PREFIX,
  IDENTITY_LIMITS,
  IDENTITY_SEED_PREFIX,
  isIdentitySeed,
  type AnalysisData,
  type DeclaredIdentityData,
  type ExposedDataClass,
  type ExposureCategory,
  type IdentityExposure,
  type ResearchData,
  type SeedData,
} from './contracts';
import { isSensitive, publicResearchPurpose } from './policy';

// Authorized identity track: the author declares who appears in the photo
// (themselves or someone who explicitly authorized it). The application never
// infers identity from a face; it measures what public sources associate with
// the declared name, profession and activities, for an educational review.

export const relationLabels: Record<DeclaredIdentityData['relation'], string> = {
  self: 'titular',
  authorized: 'pessoa que autorizou expressamente',
};
export const categoryLabels: Record<ExposureCategory, string> = {
  professional_profile: 'Perfil profissional',
  academic_output: 'Produção acadêmica',
  institutional_page: 'Página institucional',
  event_participation: 'Participação em evento',
  media_mention: 'Menção na imprensa',
  social_profile: 'Perfil em rede social',
  code_or_portfolio: 'Código ou portfólio',
  other: 'Outra',
};
export const dataClassLabels: Record<ExposedDataClass, string> = {
  full_name: 'Nome completo',
  photo: 'Foto',
  role: 'Cargo/função',
  employer: 'Empregador/organização',
  education: 'Formação',
  city: 'Cidade',
  contact: 'Contato',
  social_handle: 'Usuário em rede social',
  schedule: 'Agenda/horário',
  biography: 'Minibiografia',
  affiliations: 'Vínculos e grupos',
};
export const breadthLabels: Record<IdentityExposure['breadth'], string> = {
  not_assessed: 'Não avaliada',
  undetermined: 'Indeterminada',
  low: 'Baixa',
  moderate: 'Moderada',
  high: 'Alta',
};
// Classes with high linking power: they let a stranger reach, place or time
// the person. Weights are a declared curation rule, not a calibrated risk.
const weightedClasses: Partial<Record<ExposedDataClass, number>> = {
  contact: 2,
  city: 1,
  schedule: 1,
  photo: 1,
};

const namePattern = /^\p{L}[\p{L}\p{M}'’. -]*$/u;
const qualifierPattern = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’ .,&/()+#-]*$/u;
const tidy = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
function invalid(message: string): never {
  throw new AppError('IDENTITY_INVALID', message);
}
function checkName(name: string) {
  if (
    name.length < 2 ||
    name.length > IDENTITY_LIMITS.name ||
    !namePattern.test(name) ||
    (name.match(/\p{L}/gu) ?? []).length < 2 ||
    isSensitive(name)
  )
    invalid(
      `Informe somente o nome da pessoa, com letras, até ${IDENTITY_LIMITS.name} caracteres e sem contatos ou documentos.`,
    );
}
function checkQualifier(value: string, label: string) {
  if (
    value.length < 2 ||
    value.length > IDENTITY_LIMITS.qualifier ||
    !qualifierPattern.test(value) ||
    isSensitive(value)
  )
    invalid(
      `${label}: use até ${IDENTITY_LIMITS.qualifier} caracteres, sem e-mail, telefone, documento ou link.`,
    );
}

/** Parses the optional identity fields of the case form. */
export function parseIdentityForm(
  fields: {
    name?: unknown;
    profession?: unknown;
    activities?: unknown;
    relation?: unknown;
    consent?: unknown;
  },
  authorizedAt: string,
): DeclaredIdentityData | null {
  const name = tidy(fields.name);
  const profession = tidy(fields.profession);
  const activities = String(fields.activities ?? '')
    .split(/[\n;]+/)
    .map(tidy)
    .filter(Boolean);
  if (!name) {
    if (profession || activities.length)
      invalid('Informe o nome da pessoa para pesquisar profissão e atividades declaradas.');
    return null;
  }
  if (fields.consent !== 'yes')
    throw new AppError(
      'IDENTITY_CONSENT_REQUIRED',
      'Confirme que a identidade é sua ou que a pessoa autorizou expressamente a pesquisa educativa.',
    );
  if (fields.relation !== 'self' && fields.relation !== 'authorized')
    invalid('Indique se a identidade é sua ou de alguém que autorizou a pesquisa.');
  checkName(name);
  if (profession) checkQualifier(profession, 'Profissão');
  if (activities.length > IDENTITY_LIMITS.activities)
    invalid(`Informe até ${IDENTITY_LIMITS.activities} atividades, uma por linha.`);
  activities.forEach((a) => checkQualifier(a, 'Atividade'));
  return DeclaredIdentity.parse({
    relation: fields.relation,
    name,
    profession,
    activities: [...new Set(activities)],
    authorizedAt,
  });
}

/** Re-validates the identity recorded in the remote session history. */
export function readDeclaredIdentity(value: unknown): DeclaredIdentityData | null {
  if (value === undefined || value === null) return null;
  try {
    const identity = DeclaredIdentity.parse(value);
    checkName(identity.name);
    if (identity.profession) checkQualifier(identity.profession, 'Profissão');
    identity.activities.forEach((a) => checkQualifier(a, 'Atividade'));
    return identity;
  } catch {
    throw new AppError('INVALID_CONTEXT', 'Identidade declarada não corresponde ao caso.', 502);
  }
}

export function identityEvidence(identity: DeclaredIdentityData): AnalysisData['evidence'] {
  const declared =
    'Fornecida pelo autor sob autorização; não identificada pelo rosto nem confirmada pela foto.';
  return [
    {
      id: IDENTITY_EVIDENCE_PREFIX + '1',
      kind: 'user_context',
      description: `Identidade declarada (${relationLabels[identity.relation]}): ${identity.name}.`,
      sensitivity: 'unknown',
      bbox: null,
      limitation:
        declared +
        ' A pesquisa mede o que fontes públicas associam a este nome; homônimos são possíveis.',
    },
    ...(identity.profession
      ? [
          {
            id: IDENTITY_EVIDENCE_PREFIX + '2',
            kind: 'user_context' as const,
            description: `Profissão declarada: ${identity.profession}.`,
            sensitivity: 'unknown' as const,
            bbox: null,
            limitation: declared + ' Não é inferida da imagem.',
          },
        ]
      : []),
    ...identity.activities.map((activity, i) => ({
      id: IDENTITY_EVIDENCE_PREFIX + (i + 3),
      kind: 'user_context' as const,
      description: `Atividade declarada: ${activity}.`,
      sensitivity: 'unknown' as const,
      bbox: null,
      limitation: declared + ' Não é inferida da imagem.',
    })),
  ];
}

/** Search seeds derived deterministically from the declared identity. */
export function identitySeeds(identity: DeclaredIdentityData | null): SeedData[] {
  if (!identity) return [];
  const quoted = `"${identity.name}"`;
  const name = IDENTITY_EVIDENCE_PREFIX + '1';
  return [
    {
      id: IDENTITY_SEED_PREFIX + '1',
      text: identity.profession ? `${quoted} ${identity.profession}` : quoted,
      evidenceIds: identity.profession ? [name, IDENTITY_EVIDENCE_PREFIX + '2'] : [name],
      purpose: publicResearchPurpose('declared_identity'),
      classification: 'declared_identity',
    },
    ...identity.activities.map((activity, i) => ({
      id: IDENTITY_SEED_PREFIX + (i + 2),
      text: `${quoted} ${activity}`,
      evidenceIds: [name, IDENTITY_EVIDENCE_PREFIX + (i + 3)],
      purpose: publicResearchPurpose('declared_activity'),
      classification: 'declared_activity' as const,
    })),
  ];
}

/**
 * Backend-owned identity evidence replaces any model text under reserved IDs.
 * An exact echo of a backend identity seed is dropped as benign; any other
 * identity seed from the model still fails validation.
 */
export function withIdentityEvidence(
  analysis: AnalysisData,
  identity: DeclaredIdentityData | null,
): AnalysisData {
  if (!identity) return analysis;
  const declared = identitySeeds(identity);
  return {
    ...analysis,
    seeds: analysis.seeds.filter(
      (s) =>
        !declared.some(
          (d) => d.id === s.id && d.text === s.text && d.classification === s.classification,
        ),
    ),
    evidence: [
      ...analysis.evidence.filter((e) => !e.id.startsWith(IDENTITY_EVIDENCE_PREFIX)),
      ...identityEvidence(identity),
    ],
  };
}

/** The visual agent continues only its own analysis, never backend identity seeds. */
export function withoutIdentitySeeds(analysis: AnalysisData): AnalysisData {
  return { ...analysis, seeds: analysis.seeds.filter((s) => !isIdentitySeed(s)) };
}

export function attachIdentity(
  analysis: AnalysisData,
  identity: DeclaredIdentityData | null,
): AnalysisData {
  if (!identity) return analysis;
  const merged = withIdentityEvidence(analysis, identity);
  return {
    ...merged,
    seeds: [
      ...merged.seeds.filter((s) => !isIdentitySeed(s) && !s.id.startsWith(IDENTITY_SEED_PREFIX)),
      ...identitySeeds(identity),
    ],
  };
}

export function identityExposure(
  identity: DeclaredIdentityData | null,
  seeds: SeedData[],
  research: ResearchData | null,
  allowedSeedIds: string[],
  rounds: number,
): IdentityExposure {
  const approved = seeds.filter((s) => isIdentitySeed(s) && allowedSeedIds.includes(s.id));
  const state: IdentityExposure['state'] = !identity
    ? 'not_requested'
    : !approved.length
      ? 'not_authorized'
      : research
        ? 'executed'
        : rounds
          ? 'failed'
          : 'not_executed';
  const relevant = (research?.sources ?? []).filter(
    (s) => s.exposure && s.retrievalState !== 'unavailable',
  );
  const attributed = relevant.filter((s) => s.exposure!.match === 'declared_identity');
  const homonyms = relevant.filter((s) => s.exposure!.match === 'possible_homonym');
  const group = <K extends string>(keys: (s: (typeof attributed)[number]) => K[]) => {
    const map = new Map<K, string[]>();
    for (const s of attributed)
      for (const key of new Set(keys(s))) map.set(key, [...(map.get(key) ?? []), s.id]);
    return [...map.entries()];
  };
  const categories = group((s) => [s.exposure!.category]).map(([category, sourceIds]) => ({
    category,
    sourceIds,
  }));
  const dataClasses = group((s) => s.exposure!.dataClasses).map(([dataClass, sourceIds]) => ({
    dataClass,
    sourceIds,
  }));
  const heavy = dataClasses.filter((d) => weightedClasses[d.dataClass]);
  const points =
    categories.length + heavy.reduce((sum, d) => sum + (weightedClasses[d.dataClass] ?? 0), 0);
  const breadth: IdentityExposure['breadth'] =
    state !== 'executed'
      ? 'not_assessed'
      : !attributed.length
        ? 'undetermined'
        : points >= 6
          ? 'high'
          : points >= 3
            ? 'moderate'
            : 'low';
  const reasons: Record<IdentityExposure['state'], string> = {
    not_requested: 'Nenhuma identidade foi declarada; o caso analisou somente a foto.',
    not_authorized: 'A identidade foi declarada, mas nenhuma semente de identidade foi liberada.',
    not_executed: 'A pesquisa da identidade não foi executada.',
    failed: 'A pesquisa da identidade não pôde ser validada; nada foi concluído sobre exposição.',
    executed: '',
  };
  const breadthReason =
    state !== 'executed'
      ? reasons[state]
      : !attributed.length
        ? 'Nenhuma fonte atribuível à identidade foi validada nesta busca limitada. Isso não comprova baixa exposição.'
        : `${attributed.length} fonte(s) atribuída(s) em ${categories.length} categoria(s) (${categories
            .map((c) => categoryLabels[c.category])
            .join(', ')}); classes de maior poder de associação: ${
            heavy.map((d) => dataClassLabels[d.dataClass]).join(', ') || 'nenhuma'
          }. Critério declarado: categorias distintas + contato (2) + cidade, agenda e foto (1 cada); até 2 baixa, 3 a 5 moderada, 6 ou mais alta.`;
  return {
    state,
    seeds: approved.map((s) => s.text),
    attributedSources: attributed.map((s) => s.id),
    homonymSources: homonyms.map((s) => s.id),
    categories,
    dataClasses,
    breadth,
    breadthReason,
    limitations: identity
      ? [
          'Amplitude observada em busca limitada a duas rodadas; não é probabilidade de dano nem cobertura completa da internet.',
          'A atribuição de cada fonte à identidade é do modelo e pode conter homônimos; revise as fontes antes de agir.',
          ...(homonyms.length
            ? [`${homonyms.length} fonte(s) com possível homônimo ficaram fora da contagem.`]
            : []),
          'Buscadores de pessoas, agregadores de processos e bases de vazamentos não são consultados automaticamente.',
        ]
      : [],
  };
}
