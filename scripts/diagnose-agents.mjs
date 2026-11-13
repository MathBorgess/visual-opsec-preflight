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
async function cleanup(id) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const state = await client.beta.agents.sessions.retrieve(id);
      if (['in_progress', 'requires_action'].includes(state.status)) {
        await client.beta.agents.sessions.events.create(id, {
          events: [{ type: 'agent.session.input.cancel' }],
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const deleted = await client.beta.agents.sessions.delete(id);
      if (deleted.deleted) {
        log({ stage: 'cleanup', sessionId: id, confirmed: true });
        return true;
      }
    } catch (error) {
      if (error.status === 404) {
        log({ stage: 'cleanup', sessionId: id, confirmed: true });
        return true;
      }
      log({ stage: 'cleanup_pending', sessionId: id, status: error.status, code: error.code });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  log({ stage: 'cleanup_failed', sessionId: id });
  return false;
}
for (const id of (process.env.OPSEC_PROBE_CLEANUP_IDS ?? '').split(',').filter(Boolean)) {
  if (!/^sess_[a-z0-9]+$/.test(id)) throw Error('Invalid synthetic cleanup ID.');
  if (!(await cleanup(id))) throw Error('Previous synthetic cleanup unconfirmed.');
}
const firstProbe = Number(process.env.OPSEC_PROBE_START_AT ?? 0);
if (!Number.isInteger(firstProbe) || firstProbe < 0 || firstProbe > 2)
  throw Error('Invalid probe selection.');
for (const probe of probes.slice(firstProbe)) {
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
  } finally {
    if (id && !(await cleanup(id))) process.exitCode = 1;
  }
  if (process.exitCode) break;
}
