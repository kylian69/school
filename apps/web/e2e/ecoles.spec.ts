import { expect, test, type Page } from '@playwright/test';
import { EQUIPE, seConnecter } from './session';

const ouvrirMenuSiMobile = async (page: Page, mobile: boolean) => {
  if (mobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
};

test.describe('RG-01-29 sélecteur d’école', () => {
  test("change d'école sans se reconnecter", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile-360';
    await seConnecter(page);
    await ouvrirMenuSiMobile(page, mobile);
    const selecteur = page.getByLabel('Changer d’école').filter({ visible: true });
    await expect(selecteur).toHaveValue('01a10000-0000-7000-8000-0000000000e1');
    await selecteur.selectOption({ label: 'Institut numérique de Lumerac' });
    await expect(
      page.getByText('Institut numérique de Lumerac').filter({ visible: true }).last(),
    ).toBeVisible();
    await page.reload();
    await ouvrirMenuSiMobile(page, mobile);
    await expect(page.getByLabel('Changer d’école').filter({ visible: true })).toHaveValue(
      '01a10000-0000-7000-8000-0000000000e2',
    );
    // Remet l'école d'origine pour les autres tests (fausse API partagée).
    await page
      .getByLabel('Changer d’école')
      .filter({ visible: true })
      .selectOption({ label: 'École de gestion de Lumerac' });
  });

  test('un compte sans école est prévenu, sans sélecteur', async ({ page }) => {
    await seConnecter(page, EQUIPE);
    await expect(page.getByText(/rattaché à aucune école/)).toBeVisible();
    await expect(page.getByLabel('Changer d’école')).toHaveCount(0);
  });
});
