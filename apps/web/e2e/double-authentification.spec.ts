import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { CAMILLE } from './session';

const MOT_DE_PASSE = CAMILLE.motDePasse;

async function saisirIdentifiants(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test.describe('Double authentification (RG-01-11)', () => {
  test('RG-01-11 demande un code après le mot de passe, ou un code de secours', async ({
    page,
  }) => {
    await saisirIdentifiants(page, 'lina@exemple.test');
    await expect(page.getByRole('heading', { name: 'Code de vérification' })).toBeVisible();
    await expect(page.getByLabel('Code à 6 chiffres')).toHaveAttribute(
      'autocomplete',
      'one-time-code',
    );
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Code à 6 chiffres').fill('000000');
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Code incorrect/ })).toBeVisible();

    await page.getByRole('button', { name: 'Utiliser un code de secours' }).click();
    await page.getByLabel('Code de secours').fill('secours-0001');
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Lina.');
  });

  test('RG-00-13 impose la mise en place quand le rôle l’exige, avec QR code et 10 codes de secours', async ({
    page,
  }) => {
    await saisirIdentifiants(page, `sacha-${Math.random().toString(36).slice(2, 8)}@exemple.test`);
    await expect(page).toHaveURL(/\/securite$/);
    await expect(page.getByText(/Votre rôle exige la double authentification/)).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('1. Confirmez votre mot de passe').fill('pas le bon');
    await page.getByRole('button', { name: 'Commencer' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /Mot de passe incorrect/ }),
    ).toBeVisible();

    await page.getByLabel('1. Confirmez votre mot de passe').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Commencer' }).click();
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    await expect(
      page.getByRole('list', { name: '3. Conservez vos codes de secours' }).getByRole('listitem'),
    ).toHaveCount(10);
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('4. Saisissez le code affiché par l’application').fill('999999');
    await page.getByRole('button', { name: 'Activer la double authentification' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Code incorrect/ })).toBeVisible();

    await page.getByLabel('4. Saisissez le code affiché par l’application').fill('123456');
    await page.getByRole('button', { name: 'Activer la double authentification' }).click();
    await expect(page.getByRole('status')).toHaveText('La double authentification est activée.');
    await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Sacha.');
  });
});
