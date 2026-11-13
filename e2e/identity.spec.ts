import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('jornada com identidade autorizada: foto + nome → exposição medida no dossiê', async ({
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
  await page.getByRole('textbox', { name: 'Profissão', exact: true }).fill('professora de física');
  await page
    .getByRole('textbox', { name: /^Atividades/ })
    .fill('palestrante em eventos\ncorrida de rua');
  await page.getByRole('checkbox', { name: /Esta foto é própria/ }).check();
  const start = page.getByRole('button', { name: 'Iniciar simulação' });
  // The identity needs its own authorization, separate from the photo consent.
  await expect(start).toBeDisabled();
  await page.getByRole('checkbox', { name: /Declaro que esta identidade é minha/ }).check();
  await page.screenshot({ path: 'artifacts/identity-entry-desktop.png', fullPage: true });
  await start.click();
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Ana Exemplo', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Identidade autorizada', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /"Ana Exemplo" professora de física/ }),
  ).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Encontro Aurora/ })).toBeChecked();
  await page.screenshot({ path: 'artifacts/identity-review-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Autorizar sinais e pesquisar' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dossiê, com limites claros.' })).toBeVisible({
    timeout: 30000,
  });
  const dossier = page.locator('#dossier');
  await expect(
    dossier.getByRole('heading', { name: '5.1 Exposição da identidade autorizada' }),
  ).toBeVisible();
  await expect(dossier.locator('.breadth')).toContainText('Moderada');
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
