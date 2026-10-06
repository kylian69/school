import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0B6B66"/></svg>';

// Un seul parcours, sur ordinateur : l'apparence est partagée par tous les tests de la fausse API.
test.describe('E-01-09 Apparence', () => {
  test('US-01-14 choisit une couleur conforme, dépose un logo, puis revient à l’apparence de Scolaly', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Apparence partagée : un seul parcours');
    await seConnecter(page);
    await page.goto('/parametres/apparence');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apparence');
    await expectNoAccessibilityViolations(page);

    // RG-01-24 : une couleur peu contrastée est refusée, avec une teinte proche proposée.
    await page.getByLabel('Code de la couleur (#RRGGBB)').fill('#FFD700');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/pas assez contrastée/)).toBeVisible();
    await page.getByRole('button', { name: 'Utiliser #806600' }).click();
    await expect(page.getByLabel('Code de la couleur (#RRGGBB)')).toHaveValue('#806600');

    await page.getByRole('radio', { name: 'Sarcelle' }).click();
    await expect(page.getByRole('radio', { name: 'Sarcelle' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByLabel('Nom affiché').fill('EGL Lumerac');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Apparence enregistrée : elle s’applique dès maintenant.',
    );
    // La couleur s'applique à toute l'interface (thème clair ; le sombre en a une variante).
    await page.emulateMedia({ colorScheme: 'light' });
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ),
      )
      .toBe('#0B6B66');

    await page.getByLabel('Déposer un fichier SVG ou PNG').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(SVG),
    });
    await expect(page.getByRole('img', { name: 'Logo actuel de EGL Lumerac' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Retirer le logo' }).click();
    await expect(page.getByRole('img', { name: 'Logo actuel de EGL Lumerac' })).toHaveCount(0);
    await page.getByLabel('Nom affiché').fill('EGL');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('button', { name: 'Revenir à la couleur de Scolaly' }).click();
    await expect(page.getByRole('button', { name: 'Revenir à la couleur de Scolaly' })).toHaveCount(
      0,
    );
  });
});
