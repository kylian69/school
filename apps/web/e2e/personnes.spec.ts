import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-04 et E-01-05 Personnes', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('la liste est accessible depuis la navigation, sans violation d’accessibilité', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Navigation latérale propre au bureau');
    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Personnes' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personnes');
    await expect(page.getByRole('link', { name: 'Fictive Camille' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('RG-01-07 crée une fiche, signale un doublon, puis modifie l’identité', async ({ page }) => {
    const suffixe = Math.random().toString(36).slice(2, 7);
    const nom = `Benali${suffixe}`;
    await page.goto('/personnes/nouvelle');
    const remplir = async (email: string) => {
      await page.getByLabel('Prénom').fill('Inès');
      await page.getByLabel('Nom de naissance').fill(nom);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Date de naissance').fill('2006-03-14');
    };
    await remplir(`ines.${suffixe}@exemple.test`);
    await expectNoAccessibilityViolations(page);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Inès ${nom}`);
    // RG-01-06 : un matricule est attribué à la création.
    await expect(page.getByRole('definition').filter({ hasText: /^\d{6}$/ })).toBeVisible();

    // Même nom, même date : la fiche existante est proposée avant toute création.
    await page.goto('/personnes/nouvelle');
    await remplir(`homonyme.${suffixe}@exemple.test`);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByRole('link', { name: `Ouvrir la fiche de Inès ${nom}` })).toBeVisible();
    await page
      .getByRole('button', { name: 'Ce n’est pas la même personne : créer la fiche' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Inès ${nom}`);

    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByLabel('Nom d’usage (facultatif)').fill(`Morel${suffixe}`);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText('Fiche enregistrée.');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Inès Morel${suffixe}`);

    await page.goto(`/personnes?q=${nom}`);
    await expect(page.getByText('2 personnes')).toBeVisible();
  });

  test('US-01-06 invite en masse depuis la liste et exporte la sélection filtrée', async ({
    page,
  }) => {
    const suffixe = Math.random().toString(36).slice(2, 7);
    await page.goto('/personnes/nouvelle');
    await page.getByLabel('Prénom').fill('Lou');
    await page.getByLabel('Nom de naissance').fill(`Masse${suffixe}`);
    await page.getByLabel('Email').fill(`lou.${suffixe}@exemple.test`);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Lou Masse${suffixe}`);

    await page.goto(`/personnes?q=Masse${suffixe}`);
    await page.getByRole('checkbox', { name: `Sélectionner Masse${suffixe} Lou` }).check();
    await expect(page.getByText('1 sélectionnée')).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByRole('button', { name: 'Inviter ou relancer' }).click();
    await expect(page.getByText('1 action réussie.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: `Masse${suffixe}` })).toContainText(
      'Invité',
    );

    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter' }).click();
    expect((await telechargement).suggestedFilename()).toBe('personnes.csv');
  });

  test('US-01-09 attribue un rôle sur un établissement, le retire, puis invite la personne', async ({
    page,
  }) => {
    const suffixe = Math.random().toString(36).slice(2, 7);
    await page.goto('/personnes/nouvelle');
    await page.getByLabel('Prénom').fill('Noa');
    await page.getByLabel('Nom de naissance').fill(`Roux${suffixe}`);
    await page.getByLabel('Email').fill(`noa.${suffixe}@exemple.test`);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByText('Aucun rôle : cette personne ne voit aucune donnée')).toBeVisible();

    await page.getByLabel('Rôle', { exact: true }).selectOption({ label: 'Scolarité' });
    await page
      .getByLabel('Périmètre')
      .selectOption({ label: 'Établissement : Campus des Tilleuls' });
    await page.getByRole('button', { name: 'Attribuer un rôle' }).click();
    const role = page.getByRole('listitem').filter({ hasText: 'Scolarité' });
    await expect(role.getByText(/Établissement : Campus des Tilleuls · depuis le/)).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Retirer le rôle « Scolarité »' }).click();
    await expect(role.getByText('Terminé')).toBeVisible();

    await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
    await expect(page.getByRole('status')).toHaveText('Invitation envoyée.');
    await expect(page.getByRole('button', { name: 'Renvoyer l’invitation' })).toBeVisible();
  });
});
