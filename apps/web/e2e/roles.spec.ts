import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-07 Rôles et permissions', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('accessible depuis « Paramètres », sans violation d’accessibilité', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Navigation latérale propre au bureau');
    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Paramètres' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rôles et permissions');
    await expectNoAccessibilityViolations(page);
  });

  test('RG-01-12 l’administrateur est verrouillé ; une modification se signale avant d’être enregistrée', async ({
    page,
  }) => {
    await page.goto('/parametres/roles');
    await expect(
      page.getByRole('checkbox', { name: 'Attribuer et retirer des rôles' }),
    ).toBeDisabled();

    await page.getByRole('button', { name: /^Scolarité/ }).click();
    const fiches = page.getByRole('checkbox', { name: 'Consulter les fiches des personnes' });
    await expect(fiches).toBeChecked();
    await fiches.uncheck();
    await expect(page.getByRole('status')).toHaveText(
      'Modifications non enregistrées sur le rôle « Scolarité » · 6 personnes concernées',
    );
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(fiches).toBeChecked();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('US-01-10 duplique un rôle, modifie ses permissions puis le supprime', async ({ page }) => {
    const nom = `Vie scolaire ${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/parametres/roles');
    await page.getByRole('button', { name: /^Scolarité/ }).click();
    await page.getByRole('button', { name: 'Dupliquer ce rôle' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Dupliquer « Scolarité »' });
    await expect(dialogue.getByLabel('Nom du rôle')).toHaveValue('Scolarité (copie)');
    await expect(
      dialogue.getByRole('checkbox', { name: 'Exiger la double authentification' }),
    ).toBeChecked();
    await expectNoAccessibilityViolations(page);
    await dialogue.getByLabel('Nom du rôle').fill(nom);
    await dialogue.getByRole('button', { name: 'Créer le rôle' }).click();

    await expect(page.getByRole('heading', { level: 2, name: nom })).toBeVisible();
    await expect(page.getByText('Rôle personnalisé')).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'Consulter les années, périodes et fermetures' })
      .check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`^${nom}`) }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Consulter les années, périodes et fermetures' }),
    ).toBeChecked();

    await page.getByRole('button', { name: 'Supprimer ce rôle' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${nom}`) })).toHaveCount(0);
  });
});
