import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

/** SIRET fictif de 14 chiffres (l'annuaire factice connaît ceux qui commencent par 999). */
const siret = (debut: string) =>
  `${debut}${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`.slice(0, 14);

test.describe('Module 03 · entreprises et tuteurs', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-03-01 crée une entreprise par son SIRET, ajoute et invite un tuteur (US-03-03)', async ({
    page,
  }) => {
    await page.goto('/entreprises');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entreprises');
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Nouvelle entreprise' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle entreprise' });
    await dialogue.getByLabel('SIRET (14 chiffres)').fill(siret('999'));
    await dialogue.getByRole('button', { name: 'Rechercher' }).click();
    await expect(dialogue.getByText('ATELIERS FICTIFS DE LUMERAC')).toBeVisible();
    await expect(dialogue.getByLabel('OPCO')).toHaveValue('atlas');
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Créer l’entreprise' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ATELIERS FICTIFS DE LUMERAC');
    await expect(page.getByText('Atlas')).toBeVisible();

    const prenom = `Sam${Math.random().toString(36).slice(2, 6)}`;
    await page.getByRole('button', { name: 'Ajouter un contact' }).click();
    const contact = page.getByRole('dialog', { name: 'Ajouter un contact' });
    await contact.getByLabel('Prénom').fill(prenom);
    await contact.getByLabel('Nom', { exact: true }).fill('Tuteur');
    await contact.getByLabel('Email').fill(`${prenom.toLowerCase()}@entreprise.test`);
    await contact.getByLabel('Fonction').fill('Chef d’atelier');
    await expectNoAccessibilityViolations(page);
    await contact.getByRole('button', { name: 'Enregistrer' }).click();
    const ligne = page.getByRole('listitem').filter({ hasText: `${prenom} Tuteur` });
    await expect(ligne.getByText('Sans compte')).toBeVisible();
    await ligne.getByRole('button', { name: `Inviter ${prenom} Tuteur` }).click();
    await expect(page.getByText('Invitation envoyée.')).toBeVisible();
    await expect(ligne.getByText('Invité')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('section 7 : SIRET inconnu, saisie manuelle marquée « à vérifier »', async ({ page }) => {
    await page.goto('/entreprises');
    await page.getByRole('button', { name: 'Nouvelle entreprise' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle entreprise' });
    await dialogue.getByLabel('SIRET (14 chiffres)').fill(siret('123'));
    await dialogue.getByRole('button', { name: 'Rechercher' }).click();
    await expect(dialogue.getByText(/inconnu de l’annuaire/)).toBeVisible();
    const nom = `Boulangerie ${Math.random().toString(36).slice(2, 6)}`;
    await dialogue.getByLabel('Raison sociale').fill(nom);
    await dialogue.getByLabel('Ville').fill('Lumerac');
    await dialogue.getByRole('button', { name: 'Créer l’entreprise' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nom);
    await expect(page.getByText('À vérifier')).toBeVisible();

    await page.goto(`/entreprises?q=${encodeURIComponent(nom)}`);
    await expect(page.getByRole('link', { name: nom })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
