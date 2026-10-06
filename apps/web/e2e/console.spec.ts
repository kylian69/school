import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { EQUIPE, seConnecter } from './session';

const unique = () => `e2e-${Math.random().toString(36).slice(2, 8)}`;

async function ouvrirConsole(page: Page, mobile: boolean) {
  await seConnecter(page, EQUIPE);
  if (mobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page
    .getByRole('link', { name: 'Console de la plateforme' })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/plateforme\/clients$/);
}

test.describe('Console de la plateforme (module 19)', () => {
  test("n'existe pas pour une personne d'école", async ({ page }) => {
    await seConnecter(page);
    await expect(page.getByRole('link', { name: 'Console de la plateforme' })).toHaveCount(0);
    const reponse = await page.goto('/plateforme/clients');
    expect(reponse?.status()).toBe(404);
  });

  test('E-19-01 liste les clients, sans violation d’accessibilité', async ({ page }, testInfo) => {
    await ouvrirConsole(page, testInfo.project.name === 'mobile-360');
    await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Groupe Lumerac Formation SAS/ })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('E-19-02 crée un client de groupe en une opération', async ({ page }, testInfo) => {
    await ouvrirConsole(page, testInfo.project.name === 'mobile-360');
    await page.getByRole('link', { name: 'Nouveau client' }).click();
    await expectNoAccessibilityViolations(page);
    const sousDomaine = unique();
    await page.getByLabel('Groupe d’écoles').check();
    await page.getByLabel('Raison sociale').fill('Groupe Horizon fictif');
    await page.getByLabel('Sous-domaine').fill(sousDomaine);
    await page.getByLabel('Volume d’apprenants').fill('1200');
    await page.getByLabel('Début du contrat').fill('2026-09-01');
    await page.getByLabel('Fin du contrat').fill('2027-08-31');
    await page.getByLabel('Nom et prénom').fill('Claire Fictive');
    await page.getByLabel('Adresse email').fill('claire@exemple.test');
    await page.getByLabel('Nom de l’école 1').fill('École Horizon Commerce');
    await page.getByLabel('Nom court').first().fill('EHC');
    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await page.getByLabel('Nom de l’école 2').fill('École Horizon Design');
    await page.getByLabel('Nom court').nth(1).fill('EHD');
    await page.getByRole('button', { name: 'Créer le client' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Groupe Horizon fictif');
    await expect(page.getByText(sousDomaine)).toBeVisible();
    await expect(page.getByText('École Horizon Design')).toBeVisible();
  });

  test('affiche le refus de l’API en français', async ({ page }, testInfo) => {
    await ouvrirConsole(page, testInfo.project.name === 'mobile-360');
    await page.goto('/plateforme/clients/nouveau');
    await page.getByLabel('Raison sociale').fill('École réservée');
    await page.getByLabel('Sous-domaine').fill('api');
    await page.getByLabel('Volume d’apprenants').fill('100');
    await page.getByLabel('Début du contrat').fill('2026-09-01');
    await page.getByLabel('Fin du contrat').fill('2027-08-31');
    await page.getByLabel('Nom et prénom').fill('Claire Fictive');
    await page.getByLabel('Adresse email').fill('claire@exemple.test');
    await page.getByLabel('Nom de l’école 1').fill('École réservée');
    await page.getByLabel('Nom court').fill('ER');
    await page.getByRole('button', { name: 'Créer le client' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /réservé à la plateforme/ }),
    ).toBeVisible();
  });

  test('E-19-03 suspend un client avec motif, puis ouvre un module par exception', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Même parcours sur les deux formats');
    await ouvrirConsole(page, false);
    await page.getByRole('link', { name: /Groupe Lumerac Formation SAS/ }).click();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Suspendre' }).click();
    const dialogue = page.getByRole('dialog');
    await dialogue.getByLabel('Motif (obligatoire, tracé)').fill('Impayé de septembre');
    await dialogue.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Suspendu');
    await expect(page.getByText('Lecture seule').first()).toBeVisible();
    await expect(page.getByText('Impayé de septembre')).toBeVisible();

    await page.getByRole('switch', { name: 'Activer Jurys et diplomation' }).click();
    await expect(
      page.getByRole('switch', { name: 'Désactiver Jurys et diplomation' }),
    ).toBeVisible();
    await expect(page.getByText('Exception').first()).toBeVisible();
  });
});
