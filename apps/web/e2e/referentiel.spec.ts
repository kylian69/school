import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('Module 02 · formations et maquettes', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-02-01 crée une formation, construit sa maquette, la publie et simule les résultats', async ({
    page,
  }) => {
    const intitule = `Bachelor fictif ${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/formations');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Formations');
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Nouvelle formation' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle formation' });
    await dialogue.getByLabel('Intitulé').fill(intitule);
    await dialogue.getByLabel('Type').selectOption('bachelor');
    await dialogue.getByLabel('Durée (années)').fill('3');
    await dialogue.getByLabel('Code RNCP ou RS').fill('ABC');
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialogue.getByText('Code attendu au format RNCP12345 ou RS1234.')).toBeVisible();
    await dialogue.getByLabel('Code RNCP ou RS').fill('');
    await dialogue.getByLabel('Apprentissage').check();
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();

    // E-02-02 : la formation s'ouvre sur sa maquette vide, version 1 en brouillon.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(intitule);
    await expect(page.getByRole('link', { name: /Version 1 Brouillon/ })).toBeVisible();
    await expect(page.getByText(/La maquette est vide/)).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une UE' }).click();
    const ue = page.getByRole('dialog', { name: 'Nouvelle UE' });
    await ue.getByLabel('Code').fill('UE1');
    await ue.getByLabel('Intitulé').fill('Fondamentaux');
    await ue.getByLabel('ECTS').fill('24');
    await ue.getByRole('button', { name: 'Enregistrer' }).click();
    // RG-02-03 : avertissements non bloquants, recalculés à chaque modification.
    await expect(page.getByText('Semestre 1 totalise 24 ECTS au lieu de 30.')).toBeVisible();
    await expect(page.getByText('L’UE UE1 n’a encore aucun module.')).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter un module · UE1' }).click();
    const nouveauModule = page.getByRole('dialog', { name: 'Nouveau module' });
    await nouveauModule.getByLabel('Code').fill('M1');
    await nouveauModule.getByLabel('Intitulé').fill('Comptabilité');
    await nouveauModule.getByLabel('CM').fill('20');
    await nouveauModule.getByLabel('TD').fill('10.5');
    await expectNoAccessibilityViolations(page);
    await nouveauModule.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('row', { name: /M1 · Comptabilité/ })).toContainText('30,5');
    await expect(page.getByText('L’UE UE1 n’a encore aucun module.')).toBeHidden();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Publier' }).click();
    await page
      .getByRole('dialog', { name: 'Publier · Version 1' })
      .getByRole('button', { name: 'Publier' })
      .click();
    await expect(page.getByRole('link', { name: /Version 1 Publiée/ })).toBeVisible();

    // E-02-03 : règles de validation et simulateur.
    await page.getByRole('link', { name: 'Règles de validation' }).click();
    await expect(page.getByLabel('Mode de validation')).toHaveValue('lmd');
    await page.getByLabel('Seuil de validation (sur 20)').fill('12');
    await page.getByRole('button', { name: 'Enregistrer les règles' }).click();
    await expect(page.getByText('Règles enregistrées.')).toBeVisible();
    await page.getByLabel('Note de M1 Comptabilité').fill('13');
    await page.getByRole('button', { name: 'Simuler' }).click();
    const resultat = page.getByRole('region', { name: 'Résultat' });
    await expect(resultat.getByText('Admis')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('US-02-15 décrit les compétences d’un bloc', async ({ page }) => {
    await page.goto('/formations');
    await page.getByRole('button', { name: 'Nouvelle formation' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle formation' });
    await dialogue.getByLabel('Intitulé').fill('Titre RNCP fictif');
    await dialogue.getByLabel('Type').selectOption('titre_rncp');
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Titre RNCP fictif');

    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    const bloc = page.getByRole('dialog', { name: 'Nouveau bloc' });
    await bloc.getByLabel('Code').fill('BC1');
    await bloc.getByLabel('Intitulé').fill('Piloter un projet');
    await bloc.getByRole('button', { name: 'Enregistrer' }).click();

    await page.getByRole('link', { name: 'Compétences' }).click();
    await page.getByRole('button', { name: 'Ajouter une compétence · BC1' }).click();
    const competence = page.getByRole('dialog', { name: 'Nouvelle compétence' });
    await competence.getByLabel('Code').fill('C1.1');
    await competence.getByLabel('Intitulé').fill('Planifier les tâches');
    await competence.getByLabel('Critères d’évaluation').fill('Planning réaliste\nJalons suivis');
    await competence.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Jalons suivis')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('US-02-02 vérifie puis importe une maquette depuis un fichier', async ({ page }) => {
    await page.goto('/formations');
    await page.getByRole('button', { name: 'Nouvelle formation' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle formation' });
    await dialogue.getByLabel('Intitulé').fill('BTS importé');
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('BTS importé');

    await page.getByRole('button', { name: 'Importer une maquette' }).click();
    const importer = page.getByRole('dialog', { name: 'Importer une maquette (Excel ou CSV)' });
    await expect(importer.getByRole('link', { name: 'Télécharger le modèle (CSV)' })).toBeVisible();
    await importer.getByLabel(/^Fichier/).setInputFiles({
      name: 'maquette.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('UE;Intitulé de l’UE;Semestre\nUE1;Relation client;S1\n'),
    });
    await expectNoAccessibilityViolations(page);
    await importer.getByRole('button', { name: 'Vérifier le fichier' }).click();
    await expect(
      importer.getByText('Fichier valide : 0 bloc, 1 UE, 0 module à ajouter.'),
    ).toBeVisible();
    await importer.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(
      importer.getByText('Import terminé : 0 bloc, 1 UE, 0 module ajoutés.'),
    ).toBeVisible();
    await importer.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('heading', { name: /UE1 · Relation client/ })).toBeVisible();
  });

  test('E-02-10 enregistre l’échelle de maîtrise et une règle de la bibliothèque', async ({
    page,
  }) => {
    await page.goto('/parametres/regles-ecole');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Règles de l’école');
    await page.getByRole('button', { name: 'Enregistrer l’échelle' }).click();
    await expect(page.getByText('Enregistré.')).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une règle' }).click();
    const regle = page.getByRole('dialog', { name: 'Nouvelle règle' });
    const libelle = `Rattrapage plafonné ${Math.random().toString(36).slice(2, 6)}`;
    await regle.getByLabel('Libellé affiché à l’apprenant').fill(libelle);
    await regle.getByLabel('Type de règle').selectOption('plafond');
    await expectNoAccessibilityViolations(page);
    await regle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: libelle })).toContainText(
      'rattrapage : plafond 10',
    );
    await expectNoAccessibilityViolations(page);
  });
});
