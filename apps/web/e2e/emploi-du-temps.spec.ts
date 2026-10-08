import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { preparerAlternance } from './preparation-alternance';
import { seConnecter } from './session';

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
          data: { nom: `Duo${suffixe}`, prenom, email: `${prenom}.${suffixe}@exemple.test` },
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
