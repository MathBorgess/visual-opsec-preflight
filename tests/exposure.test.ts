import { describe, expect, it } from 'vitest';
import { minimizeReport } from '@/lib/report';
import { presentEvidence } from '@/lib/policy';
import type { AnalysisData, Report } from '@/lib/contracts';

describe('dados fornecidos e inferências no dossiê', () => {
  const evidence: AnalysisData['evidence'][number] = {
    id: 'V1',
    kind: 'visual',
    sensitivity: 'private',
    bbox: [0, 0, 1, 1],
    description: 'Texto em uma placa.',
    verbatimText: 'Ana Exemplo',
    limitation: 'Leitura visual sujeita a erro; não confirma identidade.',
  };
  it('não trata texto gerado de outra origem ou sem região como transcrição visual', () => {
    expect(presentEvidence({ ...evidence, kind: 'web' }).verbatimText).toBeNull();
    expect(presentEvidence({ ...evidence, bbox: null }).verbatimText).toBeNull();
    expect(presentEvidence(evidence).verbatimText).toBe('Ana Exemplo');
  });
  it('exporta valores fornecidos com origem e mascara credenciais mesmo nesses campos', () => {
    const report = {
      summary: 'Contato externo pessoa@example.invalid; -12.34567, 45.67890',
      visual: [
        { ...evidence, verbatimText: 'Ana Exemplo; sk-fakeabcdefghijk; senha=segredoficticio' },
      ],
      metadata: [
        {
          id: 'M1',
          field: 'GPS',
          state: 'present',
          private: true,
          value: 'Registro editável do arquivo.',
          providedValue: 'latitude: -12.34567; longitude: 45.67890',
        },
        {
          id: 'M2',
          field: 'Autoria',
          state: 'present',
          private: true,
          value: 'Não confirma identidade.',
          providedValue: 'Artist: Ana Exemplo; token=segredoficticio',
        },
      ],
    } as Report;
    const clean = minimizeReport(report);
    expect(clean.metadata[0].providedValue).toContain('latitude: -12.34567');
    expect(clean.metadata[1].providedValue).toContain('Artist: Ana Exemplo');
    expect(clean.visual[0].verbatimText).toContain('Ana Exemplo');
    expect(JSON.stringify(clean)).not.toContain('sk-fakeabcdefghijk');
    expect(JSON.stringify(clean)).not.toContain('segredoficticio');
    expect(clean.summary).not.toContain('pessoa@example.invalid');
    expect(clean.summary).not.toContain('-12.34567');
    expect(minimizeReport(clean)).toEqual(clean);
  });
});
