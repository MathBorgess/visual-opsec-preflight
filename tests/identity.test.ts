import { describe, expect, it } from 'vitest';
import {
  attachIdentity,
  identityExposure,
  identitySeeds,
  parseIdentityForm,
  readDeclaredIdentity,
} from '@/lib/identity';
import { approveSeeds, minimize, validateResearch } from '@/lib/policy';
import { demoAnalysis } from '@/server/demo';
import {
  AppError,
  validateAnalysis,
  type DeclaredIdentityData,
  type InitialContext,
  type ResearchData,
  type SourceData,
} from '@/lib/contracts';

const at = '2026-11-13T12:00:00.000Z';
const fields = {
  name: '  Ana   Exemplo ',
  profession: 'professora de física',
  activities: 'palestrante em eventos\ncorrida de rua\n\npalestrante em eventos',
  relation: 'self',
  consent: 'yes',
};
const identity = parseIdentityForm(fields, at)!;
const base = demoAnalysis({ image: { metadata: [] } } as unknown as InitialContext);
const analysis = attachIdentity(base, identity);
function code(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'UNEXPECTED';
  }
  return null;
}
function source(id: string, seedId: string, extra: Partial<SourceData> = {}): SourceData {
  return {
    id,
    seedId,
    round: 1,
    semanticDepth: 1,
    url: `https://perfil.example.org/${id}`,
    title: 'Fonte',
    excerpt: 'Trecho',
    accessedAt: at,
    publishedAt: null,
    retrievalState: 'retrieved',
    limitation: '',
    ...extra,
  };
}

describe('identidade declarada com autorização', () => {
  it('normaliza campos, remove atividades repetidas e registra a autorização', () => {
    expect(identity).toEqual({
      relation: 'self',
      name: 'Ana Exemplo',
      profession: 'professora de física',
      activities: ['palestrante em eventos', 'corrida de rua'],
      authorizedAt: at,
    });
    expect(code(() => parseIdentityForm({}, at))).toBe('IDENTITY_REQUIRED');
    expect(readDeclaredIdentity(identity)).toEqual(identity);
  });
  it('aceita a identidade fictícia usada pelos scripts de verificação ao vivo', () => {
    const fixture = { name: 'Personagem Sintetica Opsec', profession: 'fixture de teste' };
    expect(parseIdentityForm({ ...fixture, relation: 'self', consent: 'yes' }, at)).toMatchObject(
      fixture,
    );
  });
  it('exige consentimento próprio e recusa contatos, documentos e excesso', () => {
    expect(code(() => parseIdentityForm({ ...fields, consent: 'no' }, at))).toBe(
      'IDENTITY_CONSENT_REQUIRED',
    );
    expect(code(() => parseIdentityForm({ profession: 'engenheira' }, at))).toBe(
      'IDENTITY_REQUIRED',
    );
    for (const patch of [
      { name: 'ana@example.org' },
      { name: 'Ana 123.456.789-00' },
      { profession: '(81) 99999-1234' },
      { activities: 'contato +55 81 3333-4444' },
      { activities: 'a\nb\nc\nd' },
      { activities: 'um\ndois\ntrês\nquatro' },
      { relation: 'colega' },
      { name: 'x'.repeat(61) },
    ])
      expect(code(() => parseIdentityForm({ ...fields, ...patch }, at))).toBe('IDENTITY_INVALID');
    expect(code(() => readDeclaredIdentity({ ...identity, name: 'ana@example.org' }))).toBe(
      'INVALID_CONTEXT',
    );
  });
  it('deriva sementes determinísticas, com nome entre aspas e vínculo às evidências UID', () => {
    const seeds = identitySeeds(identity);
    expect(seeds.map((s) => [s.id, s.text, s.classification, s.evidenceIds])).toEqual([
      ['PID1', '"Ana Exemplo" professora de física', 'declared_identity', ['UID1', 'UID2']],
      ['PID2', '"Ana Exemplo" palestrante em eventos', 'declared_activity', ['UID1', 'UID3']],
      ['PID3', '"Ana Exemplo" corrida de rua', 'declared_activity', ['UID1', 'UID4']],
    ]);
    const longest = parseIdentityForm(
      { ...fields, name: 'A'.repeat(60), profession: 'b'.repeat(50), activities: '' },
      at,
    )!;
    expect(identitySeeds(longest)[0].text.length).toBeLessThanOrEqual(120);
    expect(analysis.evidence.filter((e) => e.kind === 'user_context').map((e) => e.id)).toEqual([
      'UID1',
      'UID2',
      'UID3',
      'UID4',
    ]);
  });
  it('a análise visual não pode propor sementes de identidade', () => {
    for (const seed of [
      { ...base.seeds[0], id: 'S9', classification: 'declared_identity' as const },
      { ...base.seeds[0], id: 'PID9' },
    ])
      expect(code(() => validateAnalysis({ ...base, seeds: [...base.seeds, seed] }))).toBe(
        'IDENTITY_SEED_FROM_MODEL',
      );
  });
  it('libera semente de identidade somente quando corresponde à identidade declarada', () => {
    const declared = identitySeeds(identity);
    expect(approveSeeds(analysis, ['S1', 'PID1'], [], declared).map((s) => s.id)).toEqual([
      'S1',
      'PID1',
    ]);
    expect(code(() => approveSeeds(analysis, ['PID1'], []))).toBe('SENSITIVE_QUERY');
    const tampered = {
      ...analysis,
      seeds: analysis.seeds.map((s) => (s.id === 'PID1' ? { ...s, text: '"Outra Pessoa"' } : s)),
    };
    expect(code(() => approveSeeds(tampered, ['PID1'], [], declared))).toBe('SENSITIVE_QUERY');
  });
  it('descarta buscadores de pessoas e classifica a exposição de forma conservadora', () => {
    const research: ResearchData = {
      sources: [
        source('W1', 'S1', {
          exposure: { category: 'other', dataClasses: ['full_name'], match: 'declared_identity' },
        }),
        source('W2', 'PID1'),
        source('W3', 'PID1', { url: 'https://www.spokeo.com/Ana-Exemplo' }),
      ],
      findings: [
        {
          ...base.findings[0],
          id: 'FW3',
          status: 'corroborated',
          evidenceIds: ['UID1', 'W3'],
        },
      ],
      limitations: [],
      followup: null,
    };
    const urls = research.sources.map((s) => s.url);
    const clean = validateResearch(research, analysis, ['S1', 'PID1'], [], 'openai', urls);
    expect(clean.sources.map((s) => s.id)).toEqual(['W1', 'W2']);
    expect(clean.findings).toHaveLength(0);
    expect(clean.limitations.at(-1)).toContain('buscador de pessoas');
    expect(clean.sources[1].exposure).toEqual({
      category: 'other',
      dataClasses: [],
      match: 'possible_homonym',
    });
    // Without an approved identity, photo sources never carry identity exposure.
    const photoOnly = validateResearch(
      { ...research, sources: [source('W1', 'S1', research.sources[0])], findings: [] },
      analysis,
      ['S1'],
      [],
      'openai',
      urls,
    );
    expect(photoOnly.sources[0].exposure).toBeNull();
  });
  it('mede amplitude com critério declarado e deixa homônimos fora da contagem', () => {
    const seeds = analysis.seeds;
    const exposure = (sources: SourceData[], id: DeclaredIdentityData | null = identity) =>
      identityExposure(
        id,
        seeds,
        { sources, findings: [], limitations: [], followup: null },
        ['PID1'],
        1,
      );
    expect(exposure([], null).state).toBe('not_requested');
    expect(identityExposure(identity, seeds, null, ['S1'], 1).state).toBe('not_authorized');
    expect(identityExposure(identity, seeds, null, ['PID1'], 1).state).toBe('failed');
    expect(exposure([]).breadth).toBe('undetermined');
    const profile = source('W1', 'PID1', {
      exposure: {
        category: 'professional_profile',
        dataClasses: ['full_name', 'role'],
        match: 'declared_identity',
      },
    });
    expect(exposure([profile]).breadth).toBe('low');
    const event = source('W2', 'PID1', {
      exposure: {
        category: 'event_participation',
        dataClasses: ['schedule', 'city'],
        match: 'declared_identity',
      },
    });
    expect(exposure([profile, event]).breadth).toBe('moderate');
    const contact = source('W3', 'PID1', {
      exposure: {
        category: 'social_profile',
        dataClasses: ['contact', 'photo'],
        match: 'declared_identity',
      },
    });
    const homonym = source('W4', 'PID1', {
      exposure: { category: 'media_mention', dataClasses: ['contact'], match: 'possible_homonym' },
    });
    const all = exposure([profile, event, contact, homonym]);
    expect(all.breadth).toBe('high');
    expect(all.attributedSources).toEqual(['W1', 'W2', 'W3']);
    expect(all.homonymSources).toEqual(['W4']);
    expect(all.categories.map((c) => c.category)).not.toContain('media_mention');
    expect(all.dataClasses.find((d) => d.dataClass === 'contact')?.sourceIds).toEqual(['W3']);
    expect(all.breadthReason).toContain('Critério declarado');
    expect(all.limitations.join(' ')).toContain('não é probabilidade de dano');
  });
  it('minimiza telefones, endereços e CEP sem confundir intervalos de anos', () => {
    const text = minimize(
      'Contato (81) 99999-1234, +55 81 3333-4444 ou 98765-4321; Rua das Flores, 123, CEP 50740-560. Edições 2025-2026.',
    );
    expect(text).not.toMatch(/9999|3333|98765|Flores|50740/);
    expect(text).toContain('[telefone omitido]');
    expect(text).toContain('[endereço omitido]');
    expect(text).toContain('[CEP omitido]');
    expect(text).toContain('2025-2026');
    expect(minimize(text)).toBe(text);
  });
});
