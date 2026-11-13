import { test, expect, type Page } from '@playwright/test';
import { LIMITS, type CaseView } from '../src/lib/contracts';

function scenario(): CaseView {
  return {
    caseId: 'branch-eligibility-fixture',
    mode: 'demo',
    phase: 'exploring',
    image: {
      width: 1600,
      height: 1000,
      derivedWidth: 1600,
      derivedHeight: 1000,
      format: 'jpeg',
      metadata: [],
      limitations: [],
    },
    analysis: {
      evidence: [
        {
          id: 'V1',
          kind: 'visual',
          description: 'Duas etiquetas fictícias.',
          sensitivity: 'public',
          bbox: null,
          limitation: 'Fixture de interface.',
        },
      ],
      questions: ['Q1', 'Q2'].map((id) => ({
        id,
        text: `Ler etiqueta ${id}`,
        evidenceIds: ['V1'],
        sufficientWhen: 'Texto legível.',
        alternative: 'Pode ser outra edição.',
        status: 'open',
        attempts: 0,
      })),
      regions: ['Q1', 'Q2'].map((questionId, i) => ({
        id: `R${i + 1}`,
        questionId,
        bbox: [0.1, 0.1, 0.3, 0.3],
        reason: 'Ler etiqueta.',
        expectedGain: 'Esclarecer a edição.',
        dataDisclosure: 'image_crop_only',
      })),
      findings: [],
      seeds: [],
      limitations: [],
    },
    research: null,
    report: null,
    limits: LIMITS,
    budget: { crops: 0, rounds: 0, activeMs: 0, noGain: 0 },
    stopReason: null,
    cancellation: 'none',
    deletion: {},
    error: null,
  };
}

// Controlled case responses isolate the browser's choice of branch. The server
// rejects exhausted questions just as the real API does; it never silently accepts them.
async function controlledCase(page: Page, view: CaseView, refine?: (v: CaseView) => void) {
  let started = false;
  const selectedQuestions: string[] = [];
  await page.route('**/api/cases', async (route) => {
    started = true;
    await route.fulfill({ status: 201, json: { caseId: view.caseId } });
  });
  await page.route('**/api/case', async (route) => {
    await route.fulfill(
      started
        ? { json: view }
        : { status: 404, json: { error: { code: 'NO_CASE', message: 'Nenhum caso ativo.' } } },
    );
  });
  await page.route('**/api/case/region', async (route) => {
    const req = route.request();
    const form = await new Response(new Uint8Array(req.postDataBuffer()!), {
      headers: { 'Content-Type': (await req.headerValue('content-type'))! },
    }).formData();
    const region = view.analysis.regions.find((r) => r.id === form.get('regionId'));
    const questionId = region?.questionId ?? String(form.get('questionId'));
    selectedQuestions.push(questionId);
    const question = view.analysis.questions.find((q) => q.id === questionId);
    if (!question || question.attempts >= 2) {
      await route.fulfill({
        status: 409,
        json: { error: { code: 'BRANCH_CLOSED', message: 'A pergunta excedeu as tentativas.' } },
      });
      return;
    }
    question.attempts++;
    view.budget.crops++;
    // Both crops on Q1 produce gain but leave it open: the remaining crop must
    // go to Q2. This is distinct from the no-gain/inconclusive stopping path.
    view.budget.noGain = 0;
    if (view.budget.crops === LIMITS.crops) view.phase = 'awaiting_search_review';
    refine?.(view);
    await route.fulfill({ status: 202, json: view });
  });
  return selectedQuestions;
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await page.getByRole('checkbox', { name: /Esta foto é própria/ }).check();
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
}

test('exploração automática usa o terceiro recorte em outra pergunta quando a primeira esgota tentativas', async ({
  page,
}) => {
  const selected = await controlledCase(page, scenario());
  await start(page);
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible();
  expect(selected).toEqual(['Q1', 'Q1', 'Q2']);
  await expect(page.getByRole('checkbox', { name: 'Exploração automática' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Explorar região R1', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('recorte manual ignora pergunta esgotada e usa a próxima elegível', async ({ page }) => {
  const view = scenario();
  view.phase = 'awaiting_search_review';
  view.budget.crops = 2;
  view.analysis.questions[0].attempts = 2;
  const selected = await controlledCase(page, view);
  await start(page);
  await expect(page.getByRole('button', { name: 'Explorar região R1', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Explorar região R2', exact: true })).toBeVisible();
  await page.getByText('Indicar uma região manualmente', { exact: true }).click();
  await page.getByRole('button', { name: 'Explorar recorte manual', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Explorar recorte manual', exact: true }),
  ).toBeDisabled();
  expect(selected).toEqual(['Q2']);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

const oldSeed = {
  id: 'S1',
  text: 'Evento antigo',
  evidenceIds: ['V1'],
  purpose: 'Contexto público.',
  classification: 'public_event' as const,
};
const newSeed = { ...oldSeed, id: 'S2', text: 'Evento revisado' };

for (const replacement of [[newSeed], []]) {
  test(`revisão remove sementes obsoletas após recorte: ${replacement.length ? 'substituição' : 'remoção total'}`, async ({
    page,
  }) => {
    const view = scenario();
    view.analysis.seeds = [oldSeed];
    await controlledCase(page, view, (v) => {
      v.analysis.seeds = replacement;
      v.phase = 'awaiting_search_review';
    });
    let submitted: string[] | null = null;
    await page.route('**/api/case/advance', async (route) => {
      const body = route.request().postDataJSON();
      submitted = body.seedIds;
      if (body.seedIds.some((id: string) => !view.analysis.seeds.some((s) => s.id === id))) {
        await route.fulfill({
          status: 400,
          json: { error: { code: 'SENSITIVE_QUERY', message: 'Semente removida.' } },
        });
        return;
      }
      view.phase = body.seedIds.length ? 'researching' : 'synthesizing';
      await route.fulfill({ status: 202, json: view });
    });
    await start(page);
    await expect(
      page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
    ).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Evento antigo/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gerar dossiê sem pesquisa' })).toBeVisible();
    if (replacement.length) {
      const checkbox = page.getByRole('checkbox', { name: /Evento revisado/ });
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
    }
    await page
      .getByRole('button', {
        name: replacement.length ? 'Autorizar sinais e pesquisar' : 'Gerar dossiê sem pesquisa',
      })
      .click();
    await expect.poll(() => submitted).toEqual(replacement.map((s) => s.id));
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  });
}

test('atualizar sementes preserva exclusões do autor e deixa novas opções desmarcadas', async ({
  page,
}) => {
  const view = scenario();
  view.phase = 'awaiting_search_review';
  view.analysis.seeds = [oldSeed, newSeed];
  await controlledCase(page, view);
  await start(page);
  const existing = page.getByRole('checkbox', { name: /Evento antigo/ });
  const excluded = page.getByRole('checkbox', { name: /Evento revisado/ });
  await expect(existing).toBeChecked();
  await excluded.uncheck();
  view.analysis.seeds = [
    ...view.analysis.seeds,
    { ...newSeed, id: 'S3', text: 'Evento adicional' },
  ];
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Evento adicional/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Evento adicional/ })).not.toBeChecked();
  await expect(existing).toBeChecked();
  await expect(excluded).not.toBeChecked();
});
