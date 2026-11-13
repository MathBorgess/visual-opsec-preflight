import sharp from 'sharp';
import { randomFillSync, randomUUID } from 'node:crypto';

// One synthetic case per explicit invocation. Never reads or exports API keys.
const origin = 'https://visual-opsec-preflight.vercel.app';
const expected = process.env.EXPECTED_REVISION;
let cookie = '';
let created = false;
let webVerified = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (data) => console.log(JSON.stringify({ check: 'production-smoke', ...data }));
async function request(path, { body, method = body ? 'POST' : 'GET' } = {}) {
  const headers = {
    Origin: origin,
    'x-opsec-request-id': randomUUID(),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
  };
  const res = await fetch(origin + path, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(55_000),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error(`HTTP_${res.status}: resposta não JSON; verifique a proteção do deployment.`);
  }
  if (!res.ok) {
    log({
      path,
      status: res.status,
      diagnostic: data.diagnostic,
      errorCode: data.error?.code,
      deletion: data.deletion,
    });
    throw Error(data.error?.code ?? `HTTP_${res.status}`);
  }
  return data;
}
function form(bytes, crop) {
  const body = new FormData();
  body.set('image', new Blob([bytes], { type: 'image/jpeg' }), 'synthetic.jpg');
  body.set('consent', 'yes');
  if (crop) body.set('regionId', crop);
  return body;
}
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const config = await request('/api/config');
    if (
      (!expected || config.revision === expected) &&
      config.mode === 'openai' &&
      config.available
    ) {
      ready = true;
      log({ stage: 'deployment_ready', revision: config.revision });
      break;
    }
    await sleep(5000);
  }
  if (!ready) throw Error('Deployment esperado não ficou pronto/configurado.');
  const svg =
    '<svg width="2048" height="2048" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="80" width="1888" height="650" fill="white"/><text x="160" y="300" font-family="sans-serif" font-size="150" fill="black">Mozilla Firefox</text><text x="160" y="480" font-family="sans-serif" font-size="90" fill="black">mozilla.org</text><text x="160" y="610" font-family="sans-serif" font-size="48" fill="black">SYNTHETIC PRIVACY EDUCATION TEST</text></svg>';
  const bytes = await sharp(randomFillSync(Buffer.alloc(2048 * 2048 * 3)), {
    raw: { width: 2048, height: 2048, channels: 3 },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 70 })
    .withExif({ IFD0: { Make: 'Synthetic Camera', Artist: 'Fictitious fixture author' } })
    .toBuffer();
  if (bytes.length > 3 * 1024 ** 2) throw Error('Fixture excedeu o limite de entrada.');
  const initial = await request('/api/cases', { body: form(bytes) });
  created = true;
  log({ stage: 'case_created', bytes: bytes.length, diagnostic: initial.diagnostic });
  const deadline = Date.now() + 210_000;
  let done = false;
  while (Date.now() < deadline) {
    const view = await request('/api/case');
    log({ stage: view.phase, budget: view.budget, execution: view.execution });
    if (view.phase === 'exploring') {
      const crop = view.analysis.regions.find((r) =>
        view.analysis.questions.some(
          (q) => q.id === r.questionId && q.status === 'open' && q.attempts < 2,
        ),
      );
      if (crop && view.budget.crops < 3)
        await request('/api/case/region', { body: form(bytes, crop.id) });
      else await request('/api/case/advance', { body: { action: 'finish_visual' } });
    } else if (view.phase === 'awaiting_search_review') {
      const seeds = view.analysis.seeds
        .filter((s) => /mozilla|firefox/i.test(s.text))
        .map((s) => s.id)
        .slice(0, 1);
      await request('/api/case/advance', {
        body: { action: 'search', seedIds: seeds, domains: seeds.length ? ['mozilla.org'] : [] },
      });
    } else if (view.phase === 'research_ready') {
      webVerified =
        (view.execution?.toolCalls ?? 0) > 0 && (view.research?.sources.length ?? 0) > 0;
      if (!webVerified)
        throw Error('Busca web sem ferramenta/fonte recuperada para a semente pública.');
      await request('/api/case/advance', { body: { action: 'synthesize' } });
    } else if (view.phase === 'completed') {
      if (
        !view.report ||
        view.report.version !== 'exposure-report/1.0' ||
        !view.report.visual.some((e) => e.kind === 'visual') ||
        !webVerified
      )
        throw Error('Dossiê sem observações visuais válidas.');
      log({
        stage: 'report_verified',
        reportStatus: view.report.status,
        findings: view.report.findings.length,
        sources: view.report.research.sources.length,
        dimensions: [view.image.derivedWidth, view.image.derivedHeight],
        usageTokens: view.report.coverage.usageTokens,
      });
      done = true;
      break;
    } else if (['partial', 'failed', 'cancelled', 'uncertain'].includes(view.phase)) {
      log({ stage: 'case_failed', diagnostic: view.diagnostic, stopReason: view.stopReason });
      throw Error('Caso não concluiu a análise/síntese.');
    }
    await sleep(2500);
  }
  if (!done) throw Error('Prazo do teste encerrado.');
} finally {
  if (cookie) {
    let deleted = false;
    for (let i = 0; i < 3; i++) {
      try {
        const result = await request('/api/case', { method: 'DELETE' });
        deleted = result.closed && result.remoteDeletionConfirmed;
        log({ stage: 'cleanup', closed: result.closed, confirmed: result.remoteDeletionConfirmed });
        if (deleted) break;
      } catch {
        /* bounded cleanup retry */
      }
      await sleep(3000);
    }
    if (!deleted) throw Error('Exclusão remota não confirmada; conferir diagnóstico do teste.');
  } else if (created) throw Error('Referência local perdida antes da limpeza.');
}
