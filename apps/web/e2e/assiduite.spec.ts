import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('I4.4 Assiduité : retards et absences', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-06-13 l’apprenant consulte ses absences et son décompte en demi-journées', async ({
    page,
  }) => {
    await page.goto('/mes-absences');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes absences');
    const decompte = page.getByRole('region', { name: 'Décompte' });
    await expect(decompte.getByText('Demi-journées d’absence')).toBeVisible();
    await expect(decompte.getByText('3 h', { exact: true })).toBeVisible();
    await expect(decompte.getByText('20 min', { exact: true })).toBeVisible();
    // RG-03-15 : l'alternant voit que ces heures servent au suivi de son contrat.
    await expect(page.getByText('Vous êtes alternant')).toBeVisible();
    const detail = page.getByRole('region', { name: 'Détail des retards et absences' });
    const algo = detail.getByRole('listitem').filter({ hasText: 'Algorithmique' });
    await expect(algo).toContainText('Absence');
    await expect(algo).toContainText('Non justifiée');
    await expect(algo).toContainText('12/10/2026');
    await expect(algo).toContainText('matin');
    await expect(detail.getByRole('listitem').filter({ hasText: 'Réseaux' })).toContainText(
      'Retard',
    );
    await expectNoAccessibilityViolations(page);
  });

  test('E-06-07 la scolarité filtre les retards et absences par promotion, nature et période', async ({
    page,
  }) => {
    await page.goto('/assiduite');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Assiduité');
    const detail = page.getByRole('region', { name: 'Détail des retards et absences' });
    await expect(detail.getByRole('row')).toHaveCount(4);
    const parApprenant = page.getByRole('region', { name: 'Par apprenant' });
    await expect(
      parApprenant.getByRole('listitem').filter({ hasText: 'Léa Martin' }),
    ).toContainText('Alternant');
    await expect(parApprenant.getByRole('listitem').filter({ hasText: 'Noé Petit' })).toContainText(
      '8 h',
    );
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Promotion').selectOption({ label: 'Bachelor Web 2e année' });
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page).toHaveURL(/promotionId=/);
    await expect(detail.getByRole('row')).toHaveCount(2);
    await expect(detail).toContainText('Noé Petit');
    await expect(detail).toContainText('journée');

    await page.goto('/assiduite?nature=retard');
    await expect(page.getByLabel('Retard ou absence')).toHaveValue('retard');
    await expect(detail.getByRole('row')).toHaveCount(2);
    await expect(detail).toContainText('Réseaux');

    await page.goto('/assiduite?du=2026-11-01');
    await expect(page.getByText('Aucun retard ni aucune absence pour ces critères.')).toBeVisible();
  });

  test('US-06-10 RG-06-23 la scolarité voit les apprenants au-dessus des seuils et traite l’alerte', async ({
    page,
    context,
  }) => {
    // Alerte propre à ce test : la fausse API garde un état par jeu (projets en parallèle).
    await context.addCookies([
      {
        name: 'e2e-alertes',
        value: `a${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
        url: new URL(page.url()).origin,
      },
    ]);
    // RG-03-20 : l'alerte apparaît sur l'accueil.
    await page.goto('/');
    await page.getByRole('link', { name: 'Voir les alertes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alertes d’assiduité');
    const indicateurs = page.getByRole('region', { name: 'Indicateurs' });
    await expect(indicateurs.getByText('Alertes à traiter')).toBeVisible();
    const apprenants = page.getByRole('region', { name: 'Apprenants à suivre' });
    const noe = apprenants.getByRole('listitem').filter({ hasText: 'Noé Petit' }).first();
    await expect(noe).toContainText('Niveau 1');
    await expect(noe).toContainText('2 demi-journées non justifiées sur 30 jours');
    await expect(noe).toContainText('Alerte de niveau 1 du 09/10/2026');
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Niveau atteint').selectOption('2');
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page).toHaveURL(/niveau=2/);
    await expect(
      page.getByText('Aucun apprenant n’atteint un seuil d’alerte pour ces critères.'),
    ).toBeVisible();

    await page.goto('/assiduite/tableau-de-bord?alertes=ouvertes');
    await page.getByRole('button', { name: 'Marquer comme traitée l’alerte de Noé Petit' }).click();
    await expect(
      page.getByText('Aucun apprenant n’atteint un seuil d’alerte pour ces critères.'),
    ).toBeVisible();
  });
});
