import type { Page } from '@playwright/test';

/** Un apprenant inscrit et une entreprise avec un tuteur, préparés par l'API. */
export async function preparerAlternance(page: Page, debut = '2050') {
  const suffixe = Math.random().toString(36).slice(2, 7);
  const poster = async <T>(url: string, data?: unknown) =>
    (await (await page.request.post(url, data === undefined ? {} : { data })).json()) as T;
  const annee = await poster<{ id: string }>('/api/annees', {
    libelle: `${debut}-${String(Number(debut) + 1)} ${suffixe}`,
    dateDebut: `${debut}-09-01`,
    dateFin: `${String(Number(debut) + 1)}-08-31`,
    periodes: [
      { libelle: 'S1', dateDebut: `${debut}-09-01`, dateFin: `${String(Number(debut) + 1)}-06-30` },
    ],
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
  return { apprenant, raisonSociale, promotion, nom: `Noé Alternant${suffixe}` };
}
