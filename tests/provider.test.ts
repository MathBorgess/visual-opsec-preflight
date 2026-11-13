import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { OpenAIAgentsProvider } from '@/server/provider';
import { ProviderError, summarizeProviderMessage } from '@/server/provider-error';
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
  it('resume somente vocabulário técnico e remove dados ecoados pelo provedor', () => {
    const summary = summarizeProviderMessage(
      'The request body is too large: 4194304 owner@example.invalid PRIVATE_CONTEXT sk-fictitiousSecret12345678901234567890',
    );
    expect(summary).toContain('The request body is too large');
    expect(summarizeProviderMessage('Invalid value: "The project has no billing"')).not.toContain(
      'billing',
    );
    for (const value of ['4194304', 'owner', 'example', 'PRIVATE', 'fictitious'])
      expect(summary).not.toContain(value);
  });
  it.each([
    [400, 'invalid_request_error', 'OPENAI_INVALID_REQUEST', false],
    [401, 'invalid_api_key', 'OPENAI_AUTHENTICATION', false],
    [403, 'forbidden', 'OPENAI_PERMISSION', false],
    [429, 'insufficient_quota', 'OPENAI_QUOTA', false],
    [429, 'rate_limit_exceeded', 'OPENAI_RATE_LIMIT', true],
    [503, 'server_overloaded', 'OPENAI_UNAVAILABLE', true],
  ])(
    'preserva diagnóstico sanitizado para HTTP %s / %s',
    async (status, code, expected, retryable) => {
      const client = new OpenAI({
        apiKey: 'test-key-not-a-credential',
        maxRetries: 0,
        fetch: async () =>
          new Response(
            JSON.stringify({
              error: {
                code,
                param: 'agent.text.format',
                message:
                  'Invalid schema prefixItems. PRIVATE_PROVIDER_MESSAGE pessoa@example.invalid',
              },
            }),
            {
              status: Number(status),
              headers: {
                'Content-Type': 'application/json',
                'x-request-id': 'req_fixture',
                'retry-after': '3',
              },
            },
          ),
      });
      const provider = new OpenAIAgentsProvider(client, 'fixture-model');
      const failure = await provider
        .start({ stage: 'analysis', data: {}, key: 'fixture' })
        .catch((e) => e);
      expect(failure).toBeInstanceOf(ProviderError);
      expect(failure).toMatchObject({
        code: expected,
        definitive: Number(status) < 500,
        details: {
          retryable,
          provider: {
            status,
            code,
            param: 'agent.text.format',
            requestId: 'req_fixture',
            hints: ['schema', 'prefixItems'],
          },
        },
      });
      expect(JSON.stringify(failure)).not.toContain('PRIVATE_PROVIDER_MESSAGE');
    },
  );
  it('eventos expõem apenas ciclo de vida, sem texto do modelo ou argumentos', async () => {
    const encoder = new TextEncoder();
    const payload = [
      { type: 'agent.session.turn.output_text.delta', delta: 'PRIVATE_REASONING' },
      { type: 'agent.session.turn.in_progress', turn_id: 'turn_fixture', input: 'PRIVATE_IMAGE' },
      { type: 'agent.session.turn.completed', turn_id: 'turn_fixture' },
    ];
    const body =
      payload.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
    const client = new OpenAI({
      apiKey: 'test-key-not-a-credential',
      maxRetries: 0,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode(body));
              c.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    });
    const events = [];
    for await (const event of new OpenAIAgentsProvider(client, 'fixture-model').events(
      'as_fixture',
      new AbortController().signal,
    ))
      events.push(event);
    expect(events.map((e) => e.type)).toEqual([
      'agent.session.turn.in_progress',
      'agent.session.turn.completed',
    ]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
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
    const schema = calls[0].body.agent.text.format.schema;
    expect(JSON.stringify(schema)).not.toContain('prefixItems');
    const bbox = schema.properties.analysis.anyOf[0].properties.regions.items.properties.bbox;
    expect(bbox).toMatchObject({
      type: 'array',
      items: { type: 'number' },
      minItems: 4,
      maxItems: 4,
    });
    expect(Array.isArray(bbox.items)).toBe(false);
    expect(calls[1].body.agent.tools).toEqual([
      { type: 'web_search', mode: 'live', allowed_domains: ['example.org'] },
    ]);
    expect(JSON.stringify(calls[1].body)).not.toContain('PRIVATE_CONTEXT');
    expect(JSON.stringify(calls[1].body)).not.toContain('input_image');
    // The visual agent cannot propose identity seeds; only the backend derives them.
    expect(JSON.stringify(calls[0].body.agent.text.format.schema)).not.toContain(
      'declared_identity',
    );
    expect(calls[0].body.agent.instructions).toContain('Não a confirme pelo rosto');
    expect(calls[0].body.agent.instructions).toContain('nunca identificação');
    expect(schema.properties.analysis.anyOf[0].required).toContain('subjects');
    // Research sources always declare exposure under strict Structured Outputs.
    const sourceSchema = calls[1].body.agent.text.format.schema.properties.sources.items;
    expect(sourceSchema.required).toContain('exposure');
    expect(calls[1].body.agent.instructions).toContain('declared_identity');
    expect(calls[1].body.agent.instructions).toContain('Não pivote para familiares');
    expect(calls[1].body.agent.instructions).toContain('Escavador e Jusbrasil são permitidos');
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
            { id: 'turn_1', subagent_id: null, status: 'completed' },
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
                    status: 'completed',
                    turn_id: 'turn_2',
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
  it('lê a resposta final depois do status para não tornar parcial uma síntese recém-concluída', async () => {
    let completed = false;
    const message = (role: string, value: unknown) => ({
      id: role,
      type: 'message',
      role,
      phase: 'final_answer',
      status: 'completed',
      turn_id: 'turn_new',
      content: [
        { type: role === 'user' ? 'input_text' : 'output_text', text: JSON.stringify(value) },
      ],
    });
    const client = new OpenAI({
      apiKey: 'test-key-not-a-credential',
      maxRetries: 0,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/turns')) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          completed = true;
          return response({
            data: [{ id: 'turn_new', subagent_id: null, status: 'completed' }],
            has_more: false,
          });
        }
        if (path.endsWith('/items'))
          return response({
            has_more: false,
            data: [
              message('user', initial),
              ...(completed
                ? [
                    message('assistant', {
                      analysis: null,
                      synthesis: { summary: 'just completed' },
                    }),
                  ]
                : []),
            ],
          });
        return response({ id: 'as_fixture', status: 'idle' });
      },
    });
    const state = await new OpenAIAgentsProvider(client, 'fixture-model').read('as_fixture');
    expect(state.turnStatus).toBe('completed');
    expect(state.output).toMatchObject({ summary: 'just completed' });
  });
  it.each([
    ['in_progress', 'CONTEXT_PENDING'],
    ['failed', 'OPENAI_TURN_FAILED'],
  ])('diferencia histórico vazio de uma sessão %s', async (status, code) => {
    const client = new OpenAI({
      apiKey: 'test-key-not-a-credential',
      maxRetries: 0,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/turns') || path.endsWith('/items'))
          return response({ data: [], has_more: false });
        return response({
          id: 'as_fixture',
          status,
          error: status === 'failed' ? 'static failure' : null,
        });
      },
    });
    await expect(
      new OpenAIAgentsProvider(client, 'fixture-model').read('as_fixture'),
    ).rejects.toMatchObject({ code });
  });
  it.each(['', '{"kind":'])(
    'mantém a espera quando a mensagem já existe mas o conteúdo ainda é incompleto: %s',
    async (text) => {
      const client = new OpenAI({
        apiKey: 'test-key-not-a-credential',
        maxRetries: 0,
        fetch: async (input) => {
          const path = new URL(String(input)).pathname;
          if (path.endsWith('/turns')) return response({ data: [], has_more: false });
          if (path.endsWith('/items'))
            return response({
              data: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
              has_more: false,
            });
          return response({ id: 'as_fixture', status: 'in_progress' });
        },
      });
      await expect(
        new OpenAIAgentsProvider(client, 'fixture-model').read('as_fixture'),
      ).rejects.toMatchObject({
        code: 'CONTEXT_PENDING',
        details: {
          provider: {
            history: { items: 1, userMessages: 1, inputTextChars: text.length, parseFailures: 1 },
          },
        },
      });
    },
  );
  it.each(['multipart', 'encoded'])(
    'recupera checkpoint multimodal sem concatenar anotação adicional: %s',
    async (mode) => {
      const payload = JSON.stringify(initial);
      const content =
        mode === 'multipart'
          ? [
              { type: 'input_text', text: payload },
              { type: 'input_text', text: 'Synthetic image annotation.' },
            ]
          : [{ type: 'input_text', text: JSON.stringify(payload) }];
      const client = new OpenAI({
        apiKey: 'test-key-not-a-credential',
        maxRetries: 0,
        fetch: async (input) => {
          const path = new URL(String(input)).pathname;
          if (path.endsWith('/turns')) return response({ data: [], has_more: false });
          if (path.endsWith('/items'))
            return response({
              data: [{ type: 'message', role: 'user', content }],
              has_more: false,
            });
          return response({ id: 'as_fixture', status: 'in_progress' });
        },
      });
      expect(
        (await new OpenAIAgentsProvider(client, 'fixture-model').read('as_fixture')).initial,
      ).toMatchObject(initial);
    },
  );
  it('aguarda confirmação do turno antes de validar uma resposta já publicada', async () => {
    let completed = false;
    const client = new OpenAI({
      apiKey: 'test-key-not-a-credential',
      maxRetries: 0,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/turns'))
          return response({
            data: [
              {
                id: 'turn_live',
                subagent_id: null,
                status: completed ? 'completed' : 'in_progress',
              },
            ],
            has_more: false,
          });
        if (path.endsWith('/items'))
          return response({
            data: [
              {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: JSON.stringify(initial) }],
              },
              {
                type: 'message',
                role: 'assistant',
                phase: 'final_answer',
                status: 'completed',
                turn_id: 'turn_live',
                content: [{ type: 'output_text', text: '{"sources":[]}' }],
              },
              {
                type: 'web_search_call',
                status: completed ? 'completed' : 'in_progress',
                turn_id: 'turn_live',
                action: { type: 'open_page', url: 'https://example.org/event' },
              },
            ],
            has_more: false,
          });
        return response({ id: 'as_fixture', status: completed ? 'idle' : 'in_progress' });
      },
    });
    const provider = new OpenAIAgentsProvider(client, 'fixture-model');
    const pending = await provider.read('as_fixture');
    expect(pending.outputs).toEqual([]);
    expect(pending.output).toBeNull();
    expect(pending.visitedUrls).toEqual([]);
    completed = true;
    const ready = await provider.read('as_fixture');
    expect(ready.output).toMatchObject({ sources: [] });
    expect(ready.visitedUrls).toEqual(['https://example.org/event']);
  });
  it('recupera falha persistida do turno com código e IDs, sem a mensagem privada', async () => {
    const client = new OpenAI({
      apiKey: 'test-key-not-a-credential',
      maxRetries: 0,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/turns'))
          return response({
            object: 'list',
            has_more: false,
            data: [
              {
                id: 'turn_failed',
                subagent_id: null,
                status: 'failed',
                error: { code: 'rate_limit_exceeded', message: 'PRIVATE_ERROR' },
              },
            ],
          });
        if (path.endsWith('/items'))
          return response({
            object: 'list',
            has_more: false,
            data: [
              {
                id: 'input',
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: JSON.stringify(initial) }],
              },
            ],
          });
        return response({ id: 'as_fixture', status: 'failed' });
      },
    });
    const state = await new OpenAIAgentsProvider(client, 'fixture-model').read('as_fixture');
    expect(state.failure).toMatchObject({
      code: 'OPENAI_TURN_FAILED',
      details: {
        provider: {
          code: 'rate_limit_exceeded',
          sessionId: 'as_fixture',
          turnId: 'turn_failed',
        },
      },
    });
    expect(JSON.stringify(state.failure)).not.toContain('PRIVATE_ERROR');
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
