import type { Page } from '@playwright/test';

// Every case declares who appears in the photo and grants two authorizations:
// environment (photo, scene and metadata) and identification (public research
// of the declared identity).
export async function declareIdentity(page: Page, name = 'Bruna Ficticia') {
  await page.getByRole('textbox', { name: 'Nome usado publicamente', exact: true }).fill(name);
}
export const authorizations = [/^Ambiente\./, /^Identificação\./];
export async function authorize(page: Page) {
  for (const name of authorizations) await page.getByRole('checkbox', { name }).check();
}
export async function prepareCase(page: Page) {
  await declareIdentity(page);
  await authorize(page);
}
