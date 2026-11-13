import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('jornada local: fixture → exploração → sementes → pesquisa → revisão e download → encerramento', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  const mdEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Markdown' }).click();
  const md = await mdEvent;
  const mdText = await readFile((await md.path())!, 'utf8');
  expect(mdText.match(/^## [1-8]\./gm)).toHaveLength(8);
  expect(mdText).toContain('SIMULAÇÃO');
  expect(mdText).not.toContain('base64');
  const jsonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar JSON' }).click();
  const json = JSON.parse(await readFile((await (await jsonEvent).path())!, 'utf8'));
  expect(json.findings.find((f: { id: string }) => f.id === 'F1').review).toBe('accepted');
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
