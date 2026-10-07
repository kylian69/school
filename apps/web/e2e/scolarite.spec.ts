import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

/** Une année et une formation publiée, préparées par l'API (la saisie est testée ailleurs). */
async function preparer(page: Page) {
  const suffixe = Math.random().toString(36).slice(2, 7);
  const poster = async <T>(url: string, data?: unknown) =>
    (await (await page.request.post(url, data === undefined ? {} : { data })).json()) as T;
  const annee = await poster<{ id: string }>('/api/annees', {
    libelle: `2040-2041 ${suffixe}`,
    dateDebut: '2040-09-01',
    dateFin: '2041-08-31',
    periodes: [{ libelle: 'S1', dateDebut: '2040-09-01', dateFin: '2041-06-30' }],
  });
  const formation = await poster<{ intitule: string; versions: { id: string }[] }>(
    '/api/formations',
    {
      intitule: `BTS scolarité ${suffixe}`,
      type: 'bts',
      niveau: 5,
      dureeAnnees: 2,
      modes: ['initial', 'apprentissage'],
    },
  );
  const version = formation.versions[0]?.id ?? '';
  const ue = await poster<{ id: string }>(`/api/maquettes/${version}/ues`, {
    code: 'UE1',
    intitule: 'Vente',
    ects: 30,
  });
  await poster(`/api/maquettes/${version}/modules`, {
    ueId: ue.id,
    code: 'M1',
    intitule: 'Techniques de vente',
    heures: { cm: 20 },
  });
  await poster(`/api/maquettes/${version}/publication`);
  return { annee: annee.id, intitule: formation.intitule };
}

test.describe('Module 02 · promotions, groupes et inscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-02-06 à US-02-08 crée une promotion, inscrit, répartit et affecte un intervenant', async ({
    page,
  }) => {
    const { annee, intitule } = await preparer(page);
    await page.goto(`/promotions?annee=${annee}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Promotions');
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Nouvelle promotion' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle promotion' });
    await dialogue.getByLabel('Formation', { exact: true }).selectOption({ label: intitule });
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${intitule} · 1re année`);

    // Onglet « Apprenants » : inscription avec un statut.
    await page.getByRole('button', { name: 'Inscrire un apprenant' }).click();
    const inscrire = page.getByRole('dialog', { name: 'Inscrire un apprenant' });
    await inscrire.getByLabel('Rechercher une personne (nom ou email)').fill('Camille');
    await inscrire.getByRole('button', { name: 'Choisir Camille Fictive' }).click();
    await inscrire.getByLabel('Statut').selectOption('apprenti');
    await expectNoAccessibilityViolations(page);
    await inscrire.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('row', { name: /Camille Fictive/ })).toContainText('Apprenti');

    // Onglet « Groupes » : un TD, puis la répartition automatique avec aperçu.
    await page.getByRole('link', { name: 'Groupes' }).click();
    await page.getByRole('button', { name: 'Nouveau groupe' }).click();
    const groupe = page.getByRole('dialog', { name: 'Nouveau groupe' });
    await groupe.getByLabel('Libellé').fill('TD 1');
    await groupe.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('button', { name: 'Répartir automatiquement' }).click();
    const repartition = page.getByRole('dialog', { name: 'Répartir automatiquement' });
    await repartition.getByRole('button', { name: 'Voir la proposition' }).click();
    await expect(repartition.getByText('1 apprenant à répartir.')).toBeVisible();
    await repartition.getByRole('button', { name: 'Appliquer la répartition' }).click();
    await expect(page.getByLabel('Groupe TD de Camille Fictive')).toHaveValue(/.+/);
    await expectNoAccessibilityViolations(page);

    // Onglet « Intervenants » : écart signalé, puis affectation conforme.
    await page.getByRole('link', { name: 'Intervenants' }).click();
    await expect(page.getByText('CM : Écart -20 h')).toBeVisible();
    await page.getByRole('button', { name: 'Affecter un intervenant · M1' }).click();
    const affecter = page.getByRole('dialog', { name: 'Affecter un intervenant · M1' });
    await affecter.getByLabel('Rechercher une personne (nom ou email)').fill('Camille');
    await affecter.getByRole('button', { name: 'Choisir Camille Fictive' }).click();
    await affecter.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Conforme')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('E-02-06 décrit une salle', async ({ page }) => {
    await page.goto('/parametres/salles');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Salles');
    await page.getByRole('button', { name: 'Nouvelle salle' }).click();
    const salle = page.getByRole('dialog', { name: 'Nouvelle salle' });
    const nom = `Amphi ${Math.random().toString(36).slice(2, 6)}`;
    await salle.getByLabel('Nom').fill(nom);
    await salle.getByLabel('Capacité').fill('120');
    await salle.getByLabel('Équipements (séparés par des virgules)').fill('vidéoprojecteur, sono');
    await salle.getByLabel('Accessible PMR').check();
    await expectNoAccessibilityViolations(page);
    await salle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { level: 2, name: nom })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('US-02-10 et US-02-11 « Ma formation » et « Mes enseignements », y compris à 360 px', async ({
    page,
  }) => {
    await page.goto('/ma-formation');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ma formation');
    await expectNoAccessibilityViolations(page);
    await page.goto('/mes-enseignements');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes enseignements');
    await expectNoAccessibilityViolations(page);
  });
});
