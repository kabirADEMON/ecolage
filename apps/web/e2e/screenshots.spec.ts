import { devices, expect, test } from '@playwright/test';

// Captures d'écran du README : `SCREENSHOTS=1 npx playwright test screenshots`.
test.skip(!process.env.SCREENSHOTS, 'Lancé seulement pour régénérer les captures.');

const out = (name: string) => `../../docs/screens/${name}.png`;

test('captures', async ({ page, browser }) => {
  await page.goto('/');
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('site') });

  await page.getByRole('button', { name: 'Essayer avec une école d’exemple' }).click();
  await expect(page.getByTestId('rate')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('tableau-de-bord') });

  await page.getByRole('complementary', { name: 'Navigation' }).getByRole('link', { name: 'Élèves' }).click();
  await expect(page.getByRole('table', { name: 'Liste des élèves' })).toBeVisible();
  await page.screenshot({ path: out('eleves') });

  await page.getByRole('button', { name: 'En retard' }).click();
  await page.getByRole('table', { name: 'Liste des élèves' }).getByRole('row').nth(1).click();
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('fiche-eleve') });

  await page.getByRole('main').getByRole('button', { name: 'Encaisser' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('encaissement') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Encaisser .* et émettre le reçu/ })
    .click();
  await page.getByRole('button', { name: 'Imprimer le reçu' }).click();
  await expect(page.getByTestId('receipt-number')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('recu') });

  await page.getByRole('complementary', { name: 'Navigation' }).getByRole('link', { name: 'Caisse du jour' }).click();
  await expect(page.getByTestId('cash-total')).toBeVisible();
  await page.screenshot({ path: out('caisse') });

  await page
    .getByRole('complementary', { name: 'Navigation' })
    .getByRole('link', { name: 'Classes et tarifs' })
    .click();
  await expect(page.getByRole('table', { name: 'Classes' })).toBeVisible();
  await page.screenshot({ path: out('classes') });

  await page.getByRole('complementary', { name: 'Navigation' }).getByRole('link', { name: 'Élèves' }).click();
  await page.getByRole('table', { name: 'Liste des élèves' }).getByRole('row').nth(2).click();
  await page.getByRole('button', { name: 'Portail parent' }).click();
  const url = await page.getByLabel('Lien du portail').inputValue();
  const phone = await browser.newPage({ ...devices['Pixel 7'] });
  await phone.goto(url);
  await expect(phone.getByTestId('portal-balance')).toBeVisible();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: out('portail-parent') });
  await phone.close();
});
