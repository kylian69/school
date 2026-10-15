import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('I4.4 Justificatifs d’absence : dépôt, traitement, statut', () => {
  test.beforeEach(async ({ page, context }) => {
    await seConnecter(page);
    // Justificatifs propres à ce test : la fausse API garde un état par jeu (projets en parallèle).
    await context.addCookies([
      {
        name: 'e2e-justificatifs',
        value: `j${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
        url: new URL(page.url()).origin,
      },
    ]);
  });

  test('US-06-07 US-06-08 RG-06-21 l’apprenant justifie, la scolarité accepte, l’absence devient justifiée', async ({
    page,
  }) => {
    await page.goto('/mes-absences');
    const formulaire = page.getByRole('form', { name: 'Justifier des absences' });
    await expect(page.getByText('dans les 48 heures', { exact: false })).toBeVisible();
    // RG-06-19 : rien n'est envoyé sans absence, motif ni document.
    await formulaire.getByRole('button', { name: 'Déposer le justificatif' }).click();
    await expect(formulaire.getByRole('alert')).toHaveText(
      'Cochez au moins un retard ou une absence.',
    );
    await formulaire.getByRole('checkbox', { name: /Algorithmique/ }).check();
    await formulaire.getByLabel('Motif').selectOption({ label: 'Maladie' });
    await expect(formulaire.getByText('N’indiquez aucun détail médical')).toBeVisible();
    await formulaire.getByLabel('Photo ou PDF du justificatif').setInputFiles({
      name: 'certificat.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% fictif\n%%EOF\n'),
    });
    await expectNoAccessibilityViolations(page);
    await formulaire.getByRole('button', { name: 'Déposer le justificatif' }).click();
    await expect(page.getByRole('status')).toContainText('Justificatif déposé');
    const miens = page.getByRole('region', { name: 'Mes justificatifs' });
    const depose = miens.getByRole('listitem').filter({ hasText: 'Maladie' });
    await expect(depose).toContainText('À traiter');
    await expect(depose).toContainText('Hors délai');
    await expect(depose).toContainText('Algorithmique');
    // L'absence n'est plus proposée tant que le justificatif est en cours.
    await expect(formulaire.getByRole('checkbox', { name: /Algorithmique/ })).toHaveCount(0);

    await page.goto('/assiduite/justificatifs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Justificatifs d’absence');
    const file = page.getByRole('region', { name: 'File de traitement' });
    const carte = file.getByRole('listitem').filter({ hasText: 'Léa Martin' }).first();
    await expect(carte).toContainText('Maladie');
    await expect(carte).toContainText('BTS SIO 1re année');
    await expect(carte.getByRole('button', { name: 'Ouvrir le document' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
    // RG-06-21 : un refus exige un motif.
    await carte.getByRole('button', { name: 'Refuser' }).click();
    await expect(carte.getByRole('alert')).toContainText('Données invalides');
    await carte.getByRole('button', { name: 'Accepter' }).click();
    await expect(file.getByText('Aucun justificatif pour ces critères.')).toBeVisible();
    await page.getByLabel('Statut').selectOption({ label: 'Accepté' });
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(
      file.getByRole('listitem').filter({ hasText: 'Léa Martin' }).first(),
    ).toContainText('Accepté');

    await page.goto('/mes-absences');
    const detail = page.getByRole('region', { name: 'Détail des retards et absences' });
    await expect(detail.getByRole('listitem').filter({ hasText: 'Algorithmique' })).toContainText(
      'Justifiée',
    );
    await expect(miens.getByRole('listitem').filter({ hasText: 'Maladie' })).toContainText(
      'Accepté',
    );
  });
});
