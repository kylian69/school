import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { preparerAlternance } from './preparation-alternance';
import { seConnecter } from './session';

/** Champs facultatifs d'une fiche personne, vides. */
const FICHE_VIDE = Object.fromEntries(
  [
    'civilite',
    'nomUsage',
    'telephone',
    'adresseLigne1',
    'codePostal',
    'ville',
    'dateNaissance',
    'lieuNaissance',
    'ine',
  ].map((champ) => [champ, null]),
);

/** Lundi de la semaine d'un jour AAAA-MM-JJ. */
const lundi = (jour: string) => {
  const date = new Date(`${jour}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
const plus = (jour: string, n: number) =>
  new Date(Date.parse(`${jour}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Promotion préparée, deux salles, et la grille de sa semaine du 8 septembre (année choisie). */
async function preparerGrille(page: Page, annee: string, avecSalles = true) {
  const { promotion } = await preparerAlternance(page, annee);
  const organisation = (await (await page.request.get('/api/organisation')).json()) as {
    etablissements: { id: string }[];
  };
  const etablissementId = organisation.etablissements[0]?.id ?? '';
  const suffixe = Math.random().toString(36).slice(2, 6);
  // La fausse API ne propose que les premières salles libres : n'en créer que si besoin.
  const salles = avecSalles ? ['A', 'B'].map((lettre) => `Salle ${lettre}${suffixe}`) : [];
  for (const nom of salles)
    await page.request.post('/api/salles', {
      data: { etablissementId, nom, capacite: 30, type: 'cours' },
    });
  const semaine = lundi(`${annee}-09-08`);
  await page.goto(
    `/emploi-du-temps?etablissement=${etablissementId}&vue=promotion&id=${promotion.id}&semaine=${semaine}`,
  );
  return { semaine, salles, promotion, etablissementId };
}

async function nouvelleSeance(
  page: Page,
  { jour, debut, fin, salle, activite }: Record<string, string>,
) {
  await page.getByRole('button', { name: 'Nouvelle séance' }).click();
  const dialogue = page.getByRole('dialog', { name: 'Nouvelle séance' });
  await dialogue.getByLabel('Date', { exact: true }).fill(jour ?? '');
  await dialogue.getByLabel('Début', { exact: true }).fill(debut ?? '');
  await dialogue.getByLabel('Fin', { exact: true }).fill(fin ?? '');
  if (activite) {
    await dialogue.getByLabel('Module').selectOption('hors-maquette');
    await dialogue.getByLabel('Activité', { exact: true }).fill(activite);
  } else {
    await dialogue.getByLabel('Module').selectOption({ label: 'M1 · Bois' });
  }
  if (salle)
    await dialogue
      .getByLabel('Salle', { exact: true })
      .selectOption({ label: `${salle} · 30 places` });
  return dialogue;
}

test.describe('Module 04 · grille de l’emploi du temps', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-04-01 place une séance, voit le conflit de salle (RG-04-05), bascule en salle libre (RG-04-07), force un cours commun (RG-04-06) et publie (US-04-06)', async ({
    page,
  }) => {
    const { semaine, salles } = await preparerGrille(page, '2058');
    const [salleA = '', salleB = ''] = salles;
    await expect(page.getByRole('heading', { name: 'Emploi du temps', level: 1 })).toBeVisible();
    await expect(page.getByText('Aucune séance cette semaine.')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    const premiere = await nouvelleSeance(page, {
      jour: semaine,
      debut: '09:00',
      fin: '12:00',
      salle: salleA,
    });
    await expect(premiere.getByText('Aucun conflit sur ce créneau.')).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await premiere.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
    await expect(premiere).toBeHidden();
    const bois = page.getByRole('button', { name: /^Bois, 09:00 – 12:00, Brouillon/ });
    await expect(bois).toBeVisible();

    // Même créneau, même salle et même promotion : deux conflits bloquants.
    const seconde = await nouvelleSeance(page, {
      jour: semaine,
      debut: '10:00',
      fin: '11:00',
      salle: salleA,
      activite: 'Réunion de rentrée',
    });
    await expect(seconde.getByText('Salle déjà occupée par « Bois ».')).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await seconde.getByRole('button', { name: `Basculer en ${salleB} (30 places)` }).click();
    await expect(seconde.getByText('Salle déjà occupée par « Bois ».')).toBeHidden();
    await expect(seconde.getByText(/déjà en séance \(« Bois »\)/)).toBeVisible();
    await seconde.getByLabel(/Forcer ce conflit \(cours commun\)/).check();
    await seconde.getByLabel('Motif du forçage').fill('Accueil commun aux deux groupes');
    await seconde.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
    await expect(seconde).toBeHidden();

    await page.getByRole('button', { name: /^Réunion de rentrée, 10:00 – 11:00/ }).click();
    const fiche = page.getByRole('region', { name: 'Séance choisie' });
    await expect(fiche.getByText('Forcé : Accueil commun aux deux groupes')).toBeVisible();
    await expect(fiche.getByText(salleB)).toBeVisible();
    await expectNoAccessibilityViolations(page);

    // Le forçage vaut pour une séance : « Bois » garde son conflit et bloque la publication.
    const publier = page.getByRole('button', { name: 'Publier les 2 brouillons de la semaine' });
    await publier.click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Publication impossible' }),
    ).toBeVisible();
    await bois.click();
    await fiche.getByRole('button', { name: 'Modifier' }).click();
    const modification = page.getByRole('dialog', { name: 'Modifier la séance' });
    await modification.getByLabel(/Forcer ce conflit \(cours commun\)/).check();
    await modification.getByLabel('Motif du forçage').fill('Accueil commun aux deux groupes');
    await modification.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(modification).toBeHidden();
    await publier.click();
    await expect(page.getByRole('status')).toHaveText('2 séances publiées.');
    await expect(page.getByRole('button', { name: /^Bois, 09:00 – 12:00, Publiée/ })).toBeVisible();
  });

  test('RG-04-01 place une séance co-animée par deux intervenants', async ({ page }) => {
    const { semaine, promotion } = await preparerGrille(page, '2060', false);
    const { modules } = (await (
      await page.request.get(`/api/promotions/${promotion.id}/affectations`)
    ).json()) as { modules: { id: string }[] };
    const suffixe = Math.random().toString(36).slice(2, 6);
    for (const prenom of ['Alix', 'Basile']) {
      const fiche = (await (
        await page.request.post('/api/personnes', {
          data: {
            ...FICHE_VIDE,
            nom: `Duo${suffixe}`,
            prenom,
            email: `${prenom}.${suffixe}@exemple.test`,
          },
        })
      ).json()) as { id: string };
      await page.request.post(`/api/promotions/${promotion.id}/affectations`, {
        data: { personneId: fiche.id, moduleId: modules[0]?.id },
      });
    }
    await page.reload();
    const dialogue = await nouvelleSeance(page, { jour: semaine, debut: '09:00', fin: '11:00' });
    const intervenants = dialogue.getByRole('group', { name: 'Intervenants' });
    await intervenants.getByLabel(`Alix Duo${suffixe}`).check();
    await intervenants.getByLabel(`Basile Duo${suffixe}`).check();
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
    await expect(dialogue).toBeHidden();
    await page.getByRole('button', { name: /^Bois, 09:00 – 11:00/ }).click();
    const fiche = page.getByRole('region', { name: 'Séance choisie' });
    await expect(fiche.getByText(`Alix Duo${suffixe}, Basile Duo${suffixe}`)).toBeVisible();
  });

  test('E-04-01 grise les jours en entreprise (RG-03-13), place un module depuis la barre « à placer » (RG-04-16) et montre les disponibilités (RG-04-18)', async ({
    page,
  }, testInfo) => {
    const { semaine, promotion, etablissementId } = await preparerGrille(page, '2061', false);
    const detail = (await (await page.request.get(`/api/promotions/${promotion.id}`)).json()) as {
      version: { id: string };
    };
    const { modules } = (await (
      await page.request.get(`/api/promotions/${promotion.id}/affectations`)
    ).json()) as { modules: { id: string }[] };
    const moduleId = modules[0]?.id ?? '';
    await page.request.put(`/api/maquettes/${detail.version.id}/modules/${moduleId}`, {
      data: {
        code: 'M1',
        intitule: 'Bois',
        heures: { cm: 6, td: 0, tp: 0, projet: 0, elearning: 0 },
      },
    });
    // Rythme fictif : lundi et mardi à l'école, du mercredi au vendredi en entreprise.
    await page.request.put(`/api/promotions/${promotion.id}/rythme`, {
      data: { modele: 'une-semaine-sur-deux' },
    });
    await page.reload();

    const entete = (jour: string) => page.locator(`#jour-${jour}`).locator('..');
    await expect(entete(plus(semaine, 2)).getByText('En entreprise')).toBeVisible();
    await expect(entete(semaine).getByText('En entreprise')).toBeHidden();
    const barre = page.getByRole('region', { name: 'Modules à placer' });
    await expect(barre.getByText('M1 · Bois')).toBeVisible();
    await expect(barre.getByText('6 h à placer sur 6 h')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await barre.getByRole('button', { name: 'Placer M1 · Bois, Cours' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle séance' });
    await expect(dialogue.getByLabel('Module')).toHaveValue(moduleId);
    await dialogue.getByLabel('Date', { exact: true }).fill(semaine);
    await dialogue.getByLabel('Début', { exact: true }).fill('09:00');
    await dialogue.getByLabel('Fin', { exact: true }).fill('12:00');
    await dialogue.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
    await expect(dialogue).toBeHidden();
    await expect(barre.getByText('3 h à placer sur 6 h')).toBeVisible();

    if (testInfo.project.name === 'ordinateur') {
      // Glisser le module sur le mardi à 13:00 : 2 heures proposées, formulaire prérempli.
      const mardi = page.locator(`section[aria-labelledby="jour-${plus(semaine, 1)}"]`);
      await barre
        .getByRole('listitem')
        .filter({ hasText: 'M1 · Bois' })
        .dragTo(mardi, { targetPosition: { x: 40, y: 5 * 56 + 4 } });
      const depot = page.getByRole('dialog', { name: 'Nouvelle séance' });
      await expect(depot.getByLabel('Date', { exact: true })).toHaveValue(plus(semaine, 1));
      await expect(depot.getByLabel('Début', { exact: true })).toHaveValue('13:00');
      await expect(depot.getByLabel('Fin', { exact: true })).toHaveValue('15:00');
      await depot.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
      await expect(depot).toBeHidden();
      await expect(barre.getByText('1 h à placer sur 6 h')).toBeVisible();
    }

    // Vue par intervenant : ses disponibilités en fond, dites en clair.
    const suffixe = Math.random().toString(36).slice(2, 6);
    const fiche = (await (
      await page.request.post('/api/personnes', {
        data: {
          ...FICHE_VIDE,
          nom: `Dispo${suffixe}`,
          prenom: 'Lina',
          email: `lina.${suffixe}@exemple.test`,
        },
      })
    ).json()) as { id: string };
    await page.request.post(`/api/promotions/${promotion.id}/affectations`, {
      data: { personneId: fiche.id, moduleId },
    });
    await page.goto(
      `/emploi-du-temps?etablissement=${etablissementId}&vue=intervenant&id=${fiche.id}&semaine=${semaine}`,
    );
    await expect(
      page
        .getByRole('list', { name: 'Légende du fond de la grille' })
        .getByText('Disponible', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(`section[aria-labelledby="jour-${semaine}"]`)
        .getByText('Disponible de 08:00 à 12:00'),
    ).toBeAttached();
    await expect(page.getByRole('region', { name: 'Modules à placer' })).toBeHidden();
    await expectNoAccessibilityViolations(page);
  });

  test('US-04-11 remplace un intervenant puis reporte une séance publiée vers un nouveau créneau', async ({
    page,
  }) => {
    const { semaine, promotion } = await preparerGrille(page, '2061', false);
    const { modules } = (await (
      await page.request.get(`/api/promotions/${promotion.id}/affectations`)
    ).json()) as { modules: { id: string }[] };
    const suffixe = Math.random().toString(36).slice(2, 6);
    for (const prenom of ['Alix', 'Camille']) {
      const fiche = (await (
        await page.request.post('/api/personnes', {
          data: {
            ...FICHE_VIDE,
            nom: `Relais${suffixe}`,
            prenom,
            email: `${prenom}.${suffixe}@exemple.test`,
          },
        })
      ).json()) as { id: string };
      await page.request.post(`/api/promotions/${promotion.id}/affectations`, {
        data: { personneId: fiche.id, moduleId: modules[0]?.id },
      });
    }
    await page.reload();
    const dialogue = await nouvelleSeance(page, { jour: semaine, debut: '09:00', fin: '11:00' });
    await dialogue
      .getByRole('group', { name: 'Intervenants' })
      .getByLabel(`Alix Relais${suffixe}`)
      .check();
    await dialogue.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
    await expect(dialogue).toBeHidden();
    await page.getByRole('button', { name: /^Bois, 09:00 – 11:00, Brouillon/ }).click();
    const fiche = page.getByRole('region', { name: 'Séance choisie' });
    await fiche.getByRole('button', { name: 'Publier' }).click();
    await expect(fiche.getByRole('button', { name: 'Reporter' })).toBeVisible();

    await fiche.getByRole('button', { name: 'Remplacer un intervenant' }).click();
    const remplacement = page.getByRole('dialog', { name: 'Remplacer un intervenant' });
    await remplacement.getByLabel('Remplaçant').selectOption({ label: `Camille Relais${suffixe}` });
    await expectNoAccessibilityViolations(page);
    await remplacement.getByRole('button', { name: 'Confirmer le remplacement' }).click();
    await expect(remplacement).toBeHidden();
    await expect(fiche.getByText(`Camille Relais${suffixe}`)).toBeVisible();

    await fiche.getByRole('button', { name: 'Reporter' }).click();
    const report = page.getByRole('dialog', { name: 'Reporter la séance' });
    await report.getByLabel('Nouvelle date').fill(plus(semaine, 2));
    await report.getByLabel('Début', { exact: true }).fill('14:00');
    await report.getByLabel('Fin', { exact: true }).fill('16:00');
    await report.getByLabel('Motif du report').fill('Intervenant en formation');
    await expectNoAccessibilityViolations(page);
    await report.getByRole('button', { name: 'Confirmer le report' }).click();
    await expect(report).toBeHidden();
    await expect(fiche.getByText('Reportée : Intervenant en formation')).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Reporter' })).toBeHidden();
    await fiche.getByRole('button', { name: 'Voir la séance de remplacement' }).click();
    await expect(fiche.getByText(/14:00 – 16:00|de 14:00 à 16:00/)).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Reporter' })).toBeVisible();
    // RG-04-14 : badge « modifié » sur la grille et dans la fiche, personnes concernées prévenues.
    await expect(
      fiche.getByText('Publiée, modifiée récemment (personnes concernées prévenues)'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /14:00 – 16:00, Publiée, modifiée récemment/ }),
    ).toContainText('Modifiée');
  });

  test('US-04-02 crée une série hebdomadaire, déplace une séance par glisser-déposer et en annule une (RG-04-04)', async ({
    page,
  }, testInfo) => {
    const { semaine } = await preparerGrille(page, '2059');
    const serie = await nouvelleSeance(page, { jour: semaine, debut: '14:00', fin: '16:00' });
    await serie.getByLabel('Répéter chaque semaine (série)').check();
    await serie.getByLabel('Jusqu’au').fill(plus(semaine, 21));
    await serie.getByRole('button', { name: 'Voir les dates' }).click();
    await expect(serie.getByText('4 séances seront créées.')).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await serie.getByRole('button', { name: 'Créer la série en brouillon' }).click();
    await expect(serie).toBeHidden();
    const seance = page.getByRole('button', { name: /^Bois, 14:00 – 16:00, Brouillon/ });
    await expect(seance).toBeVisible();

    if (testInfo.project.name === 'ordinateur') {
      // Glisser-déposer sur le mardi, une heure plus tôt : Scolaly vérifie avant d'enregistrer.
      const mardi = page.locator(`section[aria-labelledby="jour-${plus(semaine, 1)}"]`);
      await seance.dragTo(mardi, { targetPosition: { x: 40, y: 6 * 56 + 4 } });
      const deplacement = page.getByRole('dialog', { name: 'Déplacer la séance' });
      await expect(deplacement.getByLabel('Date', { exact: true })).toHaveValue(plus(semaine, 1));
      await expect(deplacement.getByLabel('Début', { exact: true })).toHaveValue('13:00');
      await expect(deplacement.getByText('Aucun conflit sur ce créneau.')).toBeVisible();
      await deplacement.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await expect(deplacement).toBeHidden();
      await expect(
        page.getByRole('button', { name: /^Bois, 13:00 – 15:00, Brouillon/ }),
      ).toBeVisible();
    }

    await page.getByRole('button', { name: /^Bois, 1\d:00 – 1\d:00, Brouillon/ }).click();
    await page.getByRole('button', { name: 'Annuler la séance' }).click();
    const annulation = page.getByRole('dialog', { name: 'Annuler la séance' });
    await annulation.getByLabel('Appliquer à').selectOption({ label: 'Cette séance seulement' });
    await annulation.getByLabel('Motif de l’annulation').fill('Intervenant malade');
    await expectNoAccessibilityViolations(page);
    await annulation.getByRole('button', { name: 'Confirmer l’annulation' }).click();
    await expect(annulation).toBeHidden();
    await expect(page.getByText('Annulée : Intervenant malade')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bois, .*, Annulée/ })).toBeVisible();
  });
});
