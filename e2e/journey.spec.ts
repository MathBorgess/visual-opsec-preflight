import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CaseView } from '../src/lib/contracts';

test('jornada local: fixture → exploração → sementes → pesquisa → revisão e download → encerramento', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The real demo API drives the journey. A precise box in its returned report
  // also exercises the browser export boundary independently of the API tests.
  const preciseBox = [0.12345, 0.23456, 0.4, 0.3];
  await page.route('**/api/case', async (route) => {
    const response = await route.fetch();
    if (route.request().method() !== 'GET' || !response.ok()) {
      await route.fulfill({ response });
      return;
    }
    const view = (await response.json()) as CaseView;
    if (view.report) view.report.visual[0].bbox = [0.12345, 0.23456, 0.4, 0.3];
    await route.fulfill({ response, json: view });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Uma foto/ })).toBeVisible();
  await expect(page.getByText('Modo de simulação', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await expect(page.getByText(/cenario-sintetico.jpg/)).toBeVisible();
  const consent = page.getByRole('checkbox', { name: /Esta foto é própria/ });
  await consent.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible({ timeout: 30000 });
  const seed = page.getByRole('checkbox', { name: /Encontro Aurora/ });
  await seed.check();
  await page.getByRole('button', { name: 'Autorizar sinais e pesquisar' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dossiê, com limites claros.' })).toBeVisible({
    timeout: 30000,
  });
  for (const text of [
    '1. Identificação e escopo',
    '2. Resumo de exposição',
    '3. O que a foto mostra',
    '4. O que o arquivo registra',
    '5. O que a web acrescentou',
    '6. Achados e correlações',
    '7. Redução de exposição',
    '8. Cobertura e limites',
  ])
    await expect(page.getByRole('heading', { name: text, exact: true })).toBeVisible();
  await page.getByLabel('Revisão do achado F1', { exact: true }).selectOption('accepted');
  await page.getByLabel('Revisão do achado F1', { exact: true }).selectOption('corrected');
  await page
    .getByLabel('Correção do autor', { exact: true })
    .fill('Correção: pessoa@example.invalid; posição -12.34567, -45.67891.\nTexto "entre aspas".');
  const mdEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Markdown' }).click();
  const md = await mdEvent;
  const mdText = await readFile((await md.path())!, 'utf8');
  expect(mdText.match(/^## [1-8]\./gm)).toHaveLength(8);
  expect(mdText).toContain('SIMULAÇÃO');
  expect(mdText).not.toContain('base64');
  expect(mdText).not.toContain('pessoa@example.invalid');
  expect(mdText).not.toContain('-12.34567');
  const jsonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar JSON' }).click();
  const json = JSON.parse(await readFile((await (await jsonEvent).path())!, 'utf8'));
  const corrected = json.findings.find((f: { id: string }) => f.id === 'F1');
  expect(corrected.review).toBe('corrected');
  expect(corrected.correction).toContain('[e-mail omitido]');
  expect(corrected.correction).toContain('[coordenadas omitidas]');
  expect(corrected.statement).toContain('No cenário fictício');
  expect(json.visual[0].bbox).toEqual(preciseBox);
  await page.screenshot({ path: 'artifacts/dossier-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/dossier-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.getByRole('button', { name: 'Encerrar e excluir sessões' }).click();
  await expect(page.getByRole('status')).toContainText('Encerramento confirmado');
  expect(errors).toEqual([]);
});
