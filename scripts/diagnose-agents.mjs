import OpenAI from 'openai';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

// Explicit build-only probe. No customer input and no exported credential.
if (process.env.OPSEC_SYNTHETIC_DIAGNOSTIC !== '1')
  throw Error('Explicit diagnostic flag required.');
const key = process.env.OPENAI_API_KEY;
if (!key || !process.env.OPENAI_MODEL) throw Error('Existing backend integration required.');
const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 20000 });
const log = (data) => console.log(JSON.stringify({ check: 'static-agents-probe', ...data }));
function reason(error) {
  if (![400, 422].includes(error.status)) return 'See status/code and request ID.';
  return String(error.message)
    .split(key)
    .join('[key omitted]')
    .replace(/(?:sk-|Bearer\s+)[\w.-]+/gi, '[credential omitted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email omitted]')
    .replace(/\b(?:org|proj)-[\w-]+/g, '[account omitted]')
    .slice(0, 2000);
}
const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#dddddd' } })
  .jpeg()
  .toBuffer();
const probes = [
  { name: 'minimal_text', body: { input: 'Reply only OK.' } },
  {
    name: 'inline_image',
    body: {
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Describe the color.' },
            { type: 'input_image', image_url: 'data:image/jpeg;base64,' + jpeg.toString('base64') },
          ],
        },
      ],
    },
  },
  {
    name: 'structured_output',
    body: {
      input: 'Return status OK.',
      agent: {
        text: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
              required: ['status'],
              additionalProperties: false,
            },
          },
        },
        multi_agent: { enabled: false },
        tools: [],
      },
      metadata: { application: 'visual-opsec', stage: 'synthetic_probe' },
      stream: false,
    },
  },
];
for (const probe of probes) {
  let id;
  try {
    const result = await client.beta.agents.sessions
      .create(
        {
          environment: { type: 'none' },
          ...probe.body,
          agent: {
            model: process.env.OPENAI_MODEL,
            instructions: 'Static synthetic integration test. Return a short answer.',
            ...probe.body.agent,
          },
        },
        { headers: { 'Idempotency-Key': randomUUID() } },
      )
      .withResponse();
    id = result.data.id;
    log({ stage: probe.name, accepted: true, sessionId: id, requestId: result.request_id });
  } catch (error) {
    log({
      stage: probe.name,
      accepted: false,
      status: error.status,
      code: error.code,
      param: error.param,
      requestId: error.requestID,
      reason: reason(error),
    });
    process.exitCode = 1;
    break;
  } finally {
    if (id) {
      try {
        await client.beta.agents.sessions.events.create(id, {
          events: [{ type: 'agent.session.input.cancel' }],
        });
      } catch {
        /* deletion still attempted */
      }
      try {
        const deleted = await client.beta.agents.sessions.delete(id);
        log({ stage: 'cleanup', sessionId: id, confirmed: deleted.deleted });
        if (!deleted.deleted) process.exitCode = 1;
      } catch (error) {
        log({ stage: 'cleanup_failed', sessionId: id, status: error.status, code: error.code });
        process.exitCode = 1;
      }
    }
  }
  if (process.exitCode) break;
}
