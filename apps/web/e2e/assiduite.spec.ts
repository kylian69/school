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
});
