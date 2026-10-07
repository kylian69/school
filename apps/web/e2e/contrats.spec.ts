import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { preparerAlternance } from './preparation-alternance';
import { seConnecter } from './session';

test.describe('Module 03 · contrats et conventions de stage', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-03-02 enregistre le contrat d’un alternant depuis sa fiche, le signe puis le rompt (US-03-12)', async ({
    page,
  }) => {
    const { apprenant, raisonSociale, nom } = await preparerAlternance(page);
    await page.goto(`/personnes/${apprenant.id}`);
    await page.getByRole('button', { name: 'Ajouter un contrat' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Ajouter un contrat' });
    await dialogue.getByLabel('Entreprise').selectOption({ label: `${raisonSociale} · Lumerac` });
    await expect(dialogue.getByLabel('Iris Maître')).toBeChecked();
    await dialogue.getByLabel('Début').fill('2050-09-01');
    await dialogue.getByLabel('Fin', { exact: true }).fill('2052-08-31');
    await dialogue.getByLabel('Rechercher une personne (nom ou email)').fill('Camille');
    await dialogue.getByRole('button', { name: 'Choisir Camille Fictive' }).click();
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nom);
    await expect(page.getByText('Brouillon', { exact: true })).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: 'Camille Fictive' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByRole('button', { name: 'Marquer signé' }).click();
    await expect(page.getByText('Signé', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Enregistrer une rupture' }).click();
    const rupture = page.getByRole('dialog', { name: 'Enregistrer une rupture' });
    await rupture.getByLabel('Date de la rupture').fill('2051-01-15');
    await rupture.getByLabel('Motif').selectOption('accord_commun');
    await expectNoAccessibilityViolations(page);
    await rupture.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Rompu le 15/01/2051 · D’un commun accord')).toBeVisible();
    await expect(page.getByText('du 01/09/2050 au 15/01/2051 (exclu)')).toBeVisible();

    await page.goto('/contrats');
    await expect(page.getByRole('link', { name: nom })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('US-03-15 RG-03-23 bloque un stage de 400 h sans gratification, sauf dérogation', async ({
    page,
  }) => {
    const { apprenant, raisonSociale, nom } = await preparerAlternance(page);
    await page.goto(`/personnes/${apprenant.id}`);
    await page.getByRole('button', { name: 'Ajouter une convention de stage' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Ajouter une convention de stage' });
    await dialogue.getByLabel('Entreprise').selectOption({ label: `${raisonSociale} · Lumerac` });
    await dialogue.getByLabel('Tuteur', { exact: true }).selectOption({ label: 'Iris Maître' });
    await dialogue.getByLabel('Début').fill('2051-04-01');
    await dialogue.getByLabel('Fin', { exact: true }).fill('2051-06-30');
    await dialogue.getByLabel('Heures de présence').fill('400');
    await dialogue.getByLabel('Rechercher une personne (nom ou email)').fill('Camille');
    await dialogue.getByRole('button', { name: 'Choisir Camille Fictive' }).click();
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialogue.getByText(/une gratification est obligatoire/)).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await dialogue
      .getByLabel('Motif de dérogation à la gratification (facultatif)')
      .fill('Stage obligatoire, accord du rectorat');
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nom);
    await expect(page.getByText(/Gratification obligatoire : 400 h/)).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByRole('button', { name: 'Marquer signée' }).click();
    await expect(page.getByText('Signée', { exact: true })).toBeVisible();
  });
});
