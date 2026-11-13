import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareCase } from './case-entry';
import type { CaseView } from '../src/lib/contracts';

test('cartão ignora descobertas de homônimos e páginas indisponíveis, preservando apenas referências atribuíveis', async ({
  page,
}) => {
  await page.route('**/api/case', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const data = (await response.json()) as CaseView;
    if (data.research) {
      const supporting = data.research.sources.find(
        (s) => s.exposure?.match === 'declared_identity' && s.retrievalState !== 'unavailable',
      );
      if (supporting?.exposure) {
        data.research.sources.push(
          {
            ...supporting,
            id: 'W_UI_HOMONYM',
            exposure: { ...supporting.exposure, match: 'possible_homonym' },
          },
          { ...supporting, id: 'W_UI_UNAVAILABLE', retrievalState: 'unavailable' },
        );
        data.research.discovered = [
          ...(data.research.discovered ?? []),
          {
            facet: 'employer',
            value: 'Empresa somente do homônimo',
            sourceIds: ['W_UI_HOMONYM'],
            match: 'declared_identity',
          },
          {
            facet: 'profession',
            value: 'Profissão sem página disponível',
            sourceIds: ['W_UI_UNAVAILABLE'],
            match: 'declared_identity',
          },
          {
            facet: 'education',
            value: 'Formação com fonte atribuível',
            sourceIds: [supporting.id, 'W_UI_HOMONYM', 'W_UI_UNAVAILABLE'],
            match: 'declared_identity',
          },
        ];
      }
    }
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await prepareCase(page);
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dossiê, com limites claros.' })).toBeVisible({
    timeout: 30000,
  });
  const card = page.locator('.identity-card');
  await expect(card.getByRole('list', { name: 'Descoberto a partir do nome' })).toContainText(
    'Formação com fonte atribuível',
  );
  await expect(card).not.toContainText('Empresa somente do homônimo');
  await expect(card).not.toContainText('Profissão sem página disponível');
  await expect(card).not.toContainText('W_UI_HOMONYM');
  await expect(card).not.toContainText('W_UI_UNAVAILABLE');
  await page.getByRole('button', { name: 'Encerrar e excluir sessões' }).click();
});

test('com mais de um rosto a pesquisa aguarda confirmação, sem busca autônoma', async ({
  page,
}) => {
  await page.route('**/api/case', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const data = (await response.json()) as CaseView;
    if (data.analysis?.subjects)
      data.analysis.subjects = { facesVisible: 2, note: 'Dois rostos fictícios.' };
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await prepareCase(page);
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('status').filter({ hasText: 'Há 2 rostos na foto' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'começa automaticamente' })).toHaveCount(
    0,
  );
  // Longer than the countdown: nothing starts without the author.
  await page.waitForTimeout(6000);
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Autorizar sinais e pesquisar' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dossiê, com limites claros.' })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Encerrar e excluir sessões' }).click();
});

test('fluxo principal com identidade: foto + nome + autorizações → exposição no dossiê', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await expect(page.getByText(/cenario-sintetico.jpg/)).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Nome usado publicamente', exact: true })
    .fill('Ana Exemplo');
  // Only the name is asked: profession and activities are discovered by the search.
  await expect(page.getByRole('textbox', { name: 'Profissão' })).toHaveCount(0);
  const start = page.getByRole('button', { name: 'Iniciar simulação' });
  // Both authorizations are required: environment and identification.
  await page.getByRole('checkbox', { name: /^Ambiente\./ }).check();
  await expect(start).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Identificação\./ }).check();
  await expect(start).toBeEnabled();
  await page.getByRole('textbox', { name: 'Nome usado publicamente', exact: true }).fill('');
  await expect(start).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Nome usado publicamente', exact: true })
    .fill('Ana Exemplo');
  await page.screenshot({ path: 'artifacts/identity-entry-desktop.png', fullPage: true });
  await start.click();
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Ana Exemplo', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Identidade autorizada', exact: true }),
  ).toBeVisible();
  // Identity searches come from the identification authorization, not from a checkbox.
  await expect(page.getByRole('list', { name: 'Buscas da identidade autorizada' })).toContainText(
    'profissão e atividades a descobrir',
  );
  await expect(page.getByRole('checkbox', { name: /"Ana Exemplo"/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Encontro Aurora/ })).toBeChecked();
  await expect(page.getByText('Rostos visíveis: 1.', { exact: false }).first()).toBeVisible();
  // A face is present and both authorizations were granted: the search starts on its own.
  await expect(
    page.getByRole('status').filter({ hasText: 'começa automaticamente' }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/identity-review-desktop.png', fullPage: true });
  await expect(page.getByRole('heading', { name: 'Seu dossiê, com limites claros.' })).toBeVisible({
    timeout: 30000,
  });
  const dossier = page.locator('#dossier');
  await expect(
    dossier.getByRole('heading', { name: '5.1 Exposição da identidade autorizada' }),
  ).toBeVisible();
  await expect(dossier.locator('.breadth')).toContainText('Alta');
  await expect(dossier.getByRole('list', { name: 'Descobertas a partir do nome' })).toContainText(
    'Profissão: Pesquisadora em segurança da informação',
  );
  await expect(page.getByRole('list', { name: 'Descoberto a partir do nome' })).toContainText(
    'Organização: Instituto Exemplo',
  );
  await expect(dossier.getByRole('list', { name: 'Categorias de exposição' })).toContainText(
    'Processo ou diário oficial',
  );
  await expect(dossier.locator('.identity-callout')).toContainText(
    'Partindo da foto e da identidade autorizada de Ana Exemplo',
  );
  await expect(dossier.getByRole('list', { name: 'Categorias de exposição' })).toContainText(
    'Perfil profissional',
  );
  await expect(dossier.getByRole('list', { name: 'Classes de dados expostos' })).toContainText(
    'Agenda/horário',
  );
  await expect(dossier.getByText('Possível homônimo; fora da contagem.')).toBeVisible();
  const mdEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Markdown' }).click();
  const md = await readFile((await (await mdEvent).path())!, 'utf8');
  expect(md.match(/^## [1-8]\./gm)).toHaveLength(8);
  expect(md).toContain('### 5.1 Exposição da identidade autorizada');
  expect(md).toContain('Ana Exemplo');
  expect(md).not.toContain('base64');
  await page.screenshot({ path: 'artifacts/identity-dossier-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/identity-dossier-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.getByRole('button', { name: 'Encerrar e excluir sessões' }).click();
  await expect(page.getByRole('status')).toContainText('Encerramento confirmado');
  expect(errors).toEqual([]);
});
