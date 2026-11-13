import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { OpenAIAgentsProvider } from '@/server/provider';
import { demoAnalysis } from '@/server/demo';
import { validateResearch } from '@/lib/policy';
import type { InitialContext, ResearchData } from '@/lib/contracts';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const initial = {
  kind: 'analysis',
  image: { hash: 'fixture', metadata: [] },
  context: 'PRIVATE_CONTEXT',
} as unknown as InitialContext;
const analysis = demoAnalysis(initial);

describe('adaptador Agents API — SDK real com HTTP controlado', () => {
  it('isola ferramentas e envia imagem somente à sessão visual; eventos mantêm a sessão', async () => {
    const calls: { url: URL; body: Record<string, any>; headers: Headers }[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        url: new URL(String(input)),
        body: JSON.parse(String(init?.body ?? '{}')),
        headers: new Headers(init?.headers),
      });
      return response({ id: calls.length === 1 ? 'as_visual' : 'as_research', deleted: true });
    };
    const provider = new OpenAIAgentsProvider(
      new OpenAI({ apiKey: 'test-key-not-a-credential', fetch: fetchMock, maxRetries: 0 }),
      'fixture-model',
    );
    await provider.start({
      stage: 'analysis',
      data: { ...initial },
      image: 'data:image/jpeg;base64,AA==',
      key: 'create-visual',
    });
    await provider.start({
      stage: 'research',
      data: { seeds: analysis.seeds },
      domains: ['example.org'],
      key: 'create-research',
    });
    await provider.start({
      stage: 'synthesis',
      sessionId: 'as_visual',
      data: { findings: [] },
      key: 'synthesis-1',
    });
    await provider.cancel('as_visual');
    await provider.delete('as_research');
    expect(calls[0].url.pathname).toBe('/v1/agents/sessions');
    expect(calls[0].body.environment).toEqual({ type: 'none' });
    expect(calls[0].body.agent.tools).toEqual([]);
    expect(calls[0].body.agent.multi_agent).toEqual({ enabled: false });
    expect(calls[0].body.input[0].content[1].type).toBe('input_image');
    expect(calls[0].body.agent.text.format.schema.properties).toHaveProperty('synthesis');
    expect(calls[1].body.agent.tools).toEqual([
      { type: 'web_search', mode: 'live', allowed_domains: ['example.org'] },
    ]);
    expect(JSON.stringify(calls[1].body)).not.toContain('PRIVATE_CONTEXT');
    expect(JSON.stringify(calls[1].body)).not.toContain('input_image');
    expect(calls[2].url.pathname).toBe('/v1/agents/sessions/as_visual/events');
    expect(calls[2].body.events[0].type).toBe('agent.session.input.message');
    expect(calls[2].headers.get('Idempotency-Key')).toBe('synthesis-1');
    expect(calls[3].body.events).toEqual([{ type: 'agent.session.input.cancel' }]);
    for (const c of calls)
      expect(JSON.stringify(c.body)).not.toContain('test-key-not-a-credential');
  });
  it('recupera histórico paginado, turno principal, schema e URLs realmente abertas', async () => {
    const paths: string[] = [];
    const message = (id: string, role: string, text: string, turn_id = 'turn_1') => ({
      id,
      type: 'message',
      role,
      status: 'completed',
      phase: 'final_answer',
      turn_id,
      content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
    });
    const fetchMock: typeof fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.href);
      if (url.pathname.endsWith('/turns'))
        return response({
          object: 'list',
          has_more: false,
          data: [
            {
              id: 'turn_2',
              subagent_id: null,
              status: 'completed',
              started_at: 10,
              completed_at: 12,
            },
          ],
        });
      if (url.pathname.endsWith('/items'))
        return response(
          url.searchParams.has('after')
            ? {
                object: 'list',
                has_more: false,
                data: [
                  {
                    id: 'tool_1',
                    type: 'web_search_call',
                    action: { type: 'open_page', url: 'https://example.org/event' },
                  },
                  message(
                    'answer_2',
                    'assistant',
                    JSON.stringify({
                      analysis: null,
                      synthesis: {
                        summary: 'fixture',
                        findings: [],
                        recommendations: [],
                        limitations: [],
                        questionResolutions: [],
                      },
                    }),
                    'turn_2',
                  ),
                ],
              }
            : {
                object: 'list',
                has_more: true,
                last_id: 'answer_1',
                data: [
                  message('input_1', 'user', JSON.stringify(initial)),
                  message('answer_1', 'assistant', JSON.stringify({ analysis, synthesis: null })),
                ],
              },
        );
      return response({ id: 'as_fixture', status: 'idle', usage: { total_tokens: 345 } });
    };
    const provider = new OpenAIAgentsProvider(
      new OpenAI({ apiKey: 'test-key-not-a-credential', fetch: fetchMock, maxRetries: 0 }),
      'fixture-model',
    );
    const snapshot = await provider.read('as_fixture');
    expect(snapshot.activeMs).toBe(2000);
    expect(snapshot.outputs).toHaveLength(2);
    expect(snapshot.output).toHaveProperty('summary', 'fixture');
    expect(snapshot.initial.context).toBe('PRIVATE_CONTEXT');
    expect(snapshot.visitedUrls).toEqual(['https://example.org/event']);
    expect(snapshot.usageTokens).toBe(345);
    expect(paths.some((p) => p.includes('after=answer_1'))).toBe(true);
  });
  it('não aceita fonte inventada ou corroboração sem cadeia até a foto', () => {
    const source = {
      id: 'W1',
      seedId: 'S1',
      round: 1,
      semanticDepth: 1,
      url: 'https://example.org/event',
      title: 'fixture',
      excerpt: 'fixture',
      accessedAt: '',
      publishedAt: null,
      retrievalState: 'retrieved',
      limitation: '',
    } as const;
    const research: ResearchData = {
      sources: [source],
      findings: [{ ...analysis.findings[0], status: 'corroborated', evidenceIds: ['V1', 'W1'] }],
      limitations: [],
      followup: null,
    };
    expect(() => validateResearch(research, analysis, ['S1'], [], 'openai', [])).toThrow(
      'referências',
    );
    expect(validateResearch(research, analysis, ['S1'], [], 'openai', [source.url])).toBe(research);
    research.findings[0].evidenceIds = ['W1'];
    expect(() => validateResearch(research, analysis, ['S1'], [], 'openai', [source.url])).toThrow(
      'cadeia',
    );
  });
});
