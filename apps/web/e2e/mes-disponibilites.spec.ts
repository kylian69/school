import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

/** Jour AAAA-MM-JJ dans n jours. */
const dansJours = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const enFrancais = (iso: string) => iso.split('-').reverse().join('/');

test.describe('US-04-10 Mes disponibilités', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('RG-04-18 déclare puis retire créneaux et indisponibilités', async ({ page }, info) => {
    // La fausse API est partagée entre projets : un jour et des dates propres à chacun.
    const mobile = info.project.name === 'mobile-360';
    const jour = mobile ? 'Jeudi' : 'Mardi';
    const ecart = mobile ? 40 : 20;

    await page.goto('/mes-disponibilites');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes disponibilités');
    if (!mobile)
      await expect(page.getByRole('link', { name: 'Mes disponibilités' }).first()).toBeVisible();
    await expectNoAccessibilityViolations(page);

    // Une demi-journée en un geste (heures de l'établissement : 08:00 – 13:00).
    const ligne = page.getByRole('listitem').filter({ hasText: jour }).first();
    await page.getByRole('button', { name: `Ajouter ${jour.toLowerCase()} matin` }).click();
    await expect(page.getByRole('status')).toHaveText('Créneau ajouté.');
    await expect(ligne.getByText('08:00 – 13:00')).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Ajouter ${jour.toLowerCase()} matin` }),
    ).toHaveCount(0);

    // Créneau libre : bornes incohérentes refusées avec la marche à suivre, puis corrigées.
    await page.getByLabel('Jour', { exact: true }).selectOption({ label: jour });
    await page.getByLabel('Début', { exact: true }).fill('15:00');
    await page.getByLabel('Fin', { exact: true }).fill('14:00');
    await page.getByRole('button', { name: 'Ajouter le créneau' }).click();
    await expect(page.getByText('L’heure de fin doit suivre l’heure de début.')).toBeVisible();
    await page.getByLabel('Fin', { exact: true }).fill('18:00');
    await page.getByRole('button', { name: 'Ajouter le créneau' }).click();
    await expect(ligne.getByText('15:00 – 18:00')).toBeVisible();

    // Chevauchement refusé.
    await page.getByLabel('Jour', { exact: true }).selectOption({ label: jour });
    await page.getByLabel('Début', { exact: true }).fill('12:00');
    await page.getByLabel('Fin', { exact: true }).fill('16:00');
    await page.getByRole('button', { name: 'Ajouter le créneau' }).click();
    await expect(page.getByText(/chevauche un créneau déjà déclaré/)).toBeVisible();
    await expectNoAccessibilityViolations(page);

    // Indisponibilité ponctuelle avec motif, visible de l'intervenant seul.
    const debut = dansJours(ecart);
    const fin = dansJours(ecart + 1);
    await page.getByLabel('Début le').fill(debut);
    await page.getByLabel('à', { exact: true }).first().fill('09:00');
    await page.getByLabel('Fin le').fill(fin);
    await page.getByLabel('à', { exact: true }).last().fill('12:00');
    await page.getByLabel('Motif (facultatif)').fill('Jury fictif');
    await page.getByRole('button', { name: 'Déclarer', exact: true }).click();
    const indispo = page.getByRole('listitem').filter({ hasText: `Du ${enFrancais(debut)}` });
    await expect(indispo).toContainText(`au ${enFrancais(fin)}`);
    await expect(indispo).toContainText('Jury fictif');
    await expectNoAccessibilityViolations(page);

    // Retraits.
    await indispo.getByRole('button', { name: /Retirer l’indisponibilité/ }).click();
    await expect(page.getByRole('status')).toHaveText('Indisponibilité retirée.');
    await expect(indispo).toHaveCount(0);
    for (const creneau of ['08:00 – 13:00', '15:00 – 18:00']) {
      await page.getByRole('button', { name: `Retirer le créneau ${jour} ${creneau}` }).click();
      await expect(ligne.getByText(creneau)).toHaveCount(0);
    }
    await expect(
      page.getByRole('button', { name: `Ajouter ${jour.toLowerCase()} matin` }),
    ).toBeVisible();
  });
});
