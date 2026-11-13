import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { randomFillSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prepareCase } from './case-entry';

test('excesso de pixels é identificado antes do upload com diagnóstico exportável', async ({
  page,
}) => {
  const png = await sharp({
    create: { width: 4100, height: 4000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  let posts = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/cases')) posts++;
  });
  await page.goto('/');
  await page
    .getByLabel('Selecionar foto', { exact: true })
    .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
  await prepareCase(page);
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('16 MP');
  expect(posts).toBe(0);
  await page.getByText(/Diagnóstico técnico/).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar diagnóstico' }).click();
  const diagnostic = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  expect(diagnostic).toMatchObject({
    code: 'IMAGE_DIMENSIONS',
    stage: 'client_validation',
    providerInvoked: false,
    bounds: { actual: 16400000, maximum: 16000000 },
  });
  expect(JSON.stringify(diagnostic)).not.toContain('fixture.png');
});

test('foto detalhada que excedia a derivada agora chega à análise e mostra progresso durante a espera', async ({
  page,
}) => {
  const input = await sharp(randomFillSync(Buffer.alloc(2048 * 2048 * 3)), {
    raw: { width: 2048, height: 2048, channels: 3 },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/cases', async (route) => {
    await gate;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page
    .getByLabel('Selecionar foto', { exact: true })
    .setInputFiles({ name: 'detailed.jpg', mimeType: 'image/jpeg', buffer: input });
  await prepareCase(page);
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(page.getByRole('status')).toContainText(/Enviando|Aguardando validação/);
  release();
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.getByText(/Diagnóstico técnico/).click();
  await expect(page.getByRole('button', { name: 'Baixar diagnóstico' })).toBeVisible();
});

test('rejeição 413 do servidor sem JSON recebe explicação e diagnóstico', async ({ page }) => {
  await page.route('**/api/cases', (route) =>
    route.fulfill({ status: 413, body: 'FUNCTION_PAYLOAD_TOO_LARGE' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await prepareCase(page);
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('tamanho do envio');
  await page.getByText(/Diagnóstico técnico/).click();
  await expect(page.getByRole('main')).toContainText('HTTP_413');
});

test('registro inicial atrasado continua o acompanhamento sem reenviar a foto', async ({
  page,
}) => {
  let created = false,
    posts = 0,
    pending = 0;
  await page.route('**/api/cases', async (route) => {
    const response = await route.fetch();
    if (response.status() === 201) {
      created = true;
      posts++;
    }
    await route.fulfill({ response });
  });
  await page.route('**/api/case', async (route) => {
    const response = await route.fetch();
    if (created && route.request().method() === 'GET' && response.ok() && pending++ < 2) {
      const v = await response.json();
      await route.fulfill({
        response,
        status: 202,
        json: { pending: true, caseId: v.caseId, mode: v.mode, phase: 'analyzing' },
      });
    } else await route.fulfill({ response });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar imagem sintética de exemplo' }).click();
  await prepareCase(page);
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(page.getByRole('status')).toContainText(/Aguardando registros iniciais/);
  await expect(
    page.getByRole('heading', { name: 'Quais sinais podem ser pesquisados?' }),
  ).toBeVisible({ timeout: 30000 });
  expect(posts).toBe(1);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});
