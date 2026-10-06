import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-02 Organisation et établissements', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('« Paramètres » puis « Organisation », sans violation d’accessibilité', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Navigation latérale propre au bureau');
    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Paramètres' })
      .click();
    const sections = page.getByRole('navigation', { name: 'Sections des paramètres' });
    await expect(sections.getByRole('link')).toHaveText([
      'Démarrage',
      'Organisation',
      'Calendrier',
      'Apparence',
      'Rôles et permissions',
      'Journal d’audit',
    ]);
    await sections.getByRole('link', { name: 'Organisation' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Organisation et établissements',
    );
    await expectNoAccessibilityViolations(page);
  });

  test('US-01-02 ajoute un établissement, signale l’UAI invalide puis l’archive', async ({
    page,
  }) => {
    const nom = `Campus ${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/parametres/organisation');
    await page.getByRole('button', { name: 'Ajouter un établissement' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvel établissement' });
    await dialogue.getByLabel('Nom de l’établissement').fill(nom);
    await dialogue.getByLabel('Adresse', { exact: true }).fill('3 quai Fictif');
    await dialogue.getByLabel('Code postal').fill('69000');
    await dialogue.getByLabel('Ville').fill('Lumerac');
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Enregistrer l’établissement' }).click();

    const carte = page.getByRole('listitem').filter({ hasText: nom });
    await expect(carte.getByText('À compléter : UAI, SIRET, NDA')).toBeVisible();

    await carte.getByRole('button', { name: `Modifier ${nom}` }).click();
    const modification = page.getByRole('dialog', { name: `Modifier « ${nom} »` });
    await modification.getByLabel('UAI (facultatif)').fill('075A');
    await modification.getByRole('button', { name: 'Enregistrer l’établissement' }).click();
    await expect(modification.getByText(/7 chiffres suivis d’une lettre/)).toBeVisible();
    await expect(modification.getByLabel('UAI (facultatif)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await modification.getByLabel('UAI (facultatif)').fill('0750654d');
    await modification.getByRole('button', { name: 'Enregistrer l’établissement' }).click();
    await expect(carte.getByText('0750654D')).toBeVisible();

    await carte.getByRole('button', { name: `Archiver ${nom}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
    await expect(carte.getByText('Archivé')).toBeVisible();
    await carte.getByRole('button', { name: `Réactiver ${nom}` }).click();
    await expect(carte.getByText('Actif', { exact: true })).toBeVisible();
  });
});
