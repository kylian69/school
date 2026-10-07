import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

/** Un apprenant inscrit et une entreprise avec un tuteur, préparés par l'API. */
async function preparer(page: Page) {
  const suffixe = Math.random().toString(36).slice(2, 7);
  const poster = async <T>(url: string, data?: unknown) =>
    (await (await page.request.post(url, data === undefined ? {} : { data })).json()) as T;
  const annee = await poster<{ id: string }>('/api/annees', {
    libelle: `2050-2051 ${suffixe}`,
    dateDebut: '2050-09-01',
    dateFin: '2051-08-31',
    periodes: [{ libelle: 'S1', dateDebut: '2050-09-01', dateFin: '2051-06-30' }],
  });
  const formation = await poster<{ id: string; versions: { id: string }[] }>('/api/formations', {
    intitule: `BTS alternance ${suffixe}`,
    type: 'bts',
    niveau: 5,
    dureeAnnees: 2,
    modes: ['initial', 'apprentissage'],
  });
  const version = formation.versions[0]?.id ?? '';
  const ue = await poster<{ id: string }>(`/api/maquettes/${version}/ues`, {
    code: 'UE1',
    intitule: 'Atelier',
    ects: 30,
  });
  await poster(`/api/maquettes/${version}/modules`, { ueId: ue.id, code: 'M1', intitule: 'Bois' });
  await poster(`/api/maquettes/${version}/publication`);
  const organisation = (await (await page.request.get('/api/organisation')).json()) as {
    etablissements: { id: string }[];
  };
  const promotion = await poster<{ id: string }>('/api/promotions', {
    formationId: formation.id,
    anneeFormation: 1,
    anneeScolaireId: annee.id,
    etablissementId: organisation.etablissements[0]?.id,
  });
  const apprenant = await poster<{ id: string; prenom: string; nom: string }>('/api/personnes', {
    prenom: 'Noé',
    nom: `Alternant${suffixe}`,
    email: `noe.${suffixe}@exemple.test`,
    dateNaissance: '2005-02-01',
    ...Object.fromEntries(
      [
        'civilite',
        'nomUsage',
        'telephone',
        'adresseLigne1',
        'codePostal',
        'ville',
        'lieuNaissance',
        'ine',
      ].map((champ) => [champ, null]),
    ),
  });
  await poster(`/api/promotions/${promotion.id}/inscriptions`, {
    personneId: apprenant.id,
    statut: 'initial',
  });
  const raisonSociale = `Menuiserie ${suffixe}`;
  const entreprise = await poster<{ id: string }>('/api/entreprises', {
    siret: `1234${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`,
    raisonSociale,
    ville: 'Lumerac',
  });
  await poster(`/api/entreprises/${entreprise.id}/contacts`, {
    type: 'tuteur',
    personne: { nom: 'Maître', prenom: 'Iris', email: `iris.${suffixe}@entreprise.test` },
  });
  return { apprenant, raisonSociale, nom: `Noé Alternant${suffixe}` };
}

test.describe('Module 03 · contrats et conventions de stage', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-03-02 enregistre le contrat d’un alternant depuis sa fiche, le signe puis le rompt (US-03-12)', async ({
    page,
  }) => {
    const { apprenant, raisonSociale, nom } = await preparer(page);
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
    const { apprenant, raisonSociale, nom } = await preparer(page);
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
