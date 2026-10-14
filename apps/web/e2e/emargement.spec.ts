import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('Module 06 Émargement', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-06-01 l’intervenant ouvre l’appel : QR rotatif, code de secours et présents en direct', async ({
    page,
  }) => {
    await page.goto('/seances');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes séances');
    // RG-04-14 : la séance modifiée depuis peu porte le badge.
    await expect(
      page.getByRole('heading', { name: 'Droit des affaires En cours Modifiée' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Droit des affaires');
    await expect(
      page.getByRole('img', { name: 'QR code d’émargement de la séance Droit des affaires' }),
    ).toBeVisible();
    await expect(page.getByTestId('code')).toHaveText(/^\d{6}$/);
    await expect(page.getByText(/Nouveau code dans \d+ s/)).toBeVisible();
    await expect(page.getByText(/\d \/ 2 présents/)).toBeVisible();
    await expect(page.getByText('Noé Petit')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('US-06-03 l’intervenant ouvre l’appel, l’apprenant émarge : la liste se met à jour en direct', async ({
    page,
    context,
  }) => {
    // Appel propre à ce test : la fausse API garde un état par appel (projets en parallèle).
    await context.addCookies([
      {
        name: 'e2e-appel',
        value: `t${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
        url: new URL(page.url()).origin,
      },
    ]);
    await page.goto('/seances');
    await expect(page.getByText('Vos séances du jour.', { exact: false })).toBeVisible();
    await expect(page.getByText('En cours')).toBeVisible();
    await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
    await expect(page.getByText('0 / 2 présents')).toBeVisible();
    const lea = page.getByRole('listitem').filter({ hasText: 'Léa Martin' });
    await expect(lea).toContainText('en attente');

    const apprenant = await context.newPage();
    await apprenant.goto('/emarger');
    await apprenant.getByLabel('Code à 6 chiffres').fill('123456');
    await apprenant.getByRole('button', { name: 'Valider le code' }).click();
    await expect(apprenant.getByText('Présence enregistrée')).toBeVisible();
    await apprenant.close();

    // Sans rechargement : le flux en direct pousse la présence à l'écran de l'intervenant.
    await expect(page.getByText('1 / 2 présents')).toBeVisible();
    await expect(lea).toContainText(/\d{2}:\d{2}/);
    await expect(page.getByRole('listitem').filter({ hasText: 'Noé Petit' })).toContainText(
      'en attente',
    );
    await expectNoAccessibilityViolations(page);
  });

  // Projet « mobile-360 » : parcours vérifié aussi sur un téléphone de 360 px.
  test('US-06-05 l’intervenant fait l’appel à la main sur la liste avec photos', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'e2e-appel',
        value: `m${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
        url: new URL(page.url()).origin,
      },
    ]);
    await page.goto('/seances');
    await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
    await page.getByRole('button', { name: 'Faire l’appel à la main' }).click();
    await expect(page.getByRole('img', { name: /QR code d’émargement/ })).toBeHidden();
    await expect(page.getByText('0 / 2 présents')).toBeVisible();
    // RG-01-27 : photo servie par adresse signée ; sans photo, les initiales.
    await expect(page.getByRole('img', { name: 'Photo de Léa Martin' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    const noe = page.getByRole('listitem').filter({ hasText: 'Noé Petit' });
    await noe.getByRole('button', { name: 'Présent' }).click();
    await expect(noe).toContainText('présent · marqué à la main');
    await expect(page.getByText('1 / 2 présents')).toBeVisible();

    // RG-06-12 : un retard, avec les minutes.
    const lea = page.getByRole('listitem').filter({ hasText: 'Léa Martin' });
    await lea.getByRole('button', { name: 'Retard' }).click();
    await lea.getByLabel('Minutes de retard').fill('12');
    await expectNoAccessibilityViolations(page);
    await lea.getByRole('button', { name: 'Noter le retard' }).click();
    await expect(lea).toContainText('en retard de 12 min');
    await expect(page.getByText('2 / 2 présents')).toBeVisible();
    await expect(lea.getByRole('button', { name: 'Retard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Correction : la décision suivante remplace la précédente.
    await lea.getByRole('button', { name: 'Absent' }).click();
    await expect(lea).toContainText('absent');
    await expect(page.getByText('1 / 2 présents')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test.describe('RG-06-09 contrôle de localisation à l’émargement', () => {
    /** Appel propre au test : la fausse API garde un état par appel (projets en parallèle). */
    const appelPropre = async (page: Page, context: BrowserContext) => {
      await context.addCookies([
        {
          name: 'e2e-appel',
          value: `l${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
          url: new URL(page.url()).origin,
        },
      ]);
    };

    const emargerParCode = async (page: Page) => {
      await page.goto('/emarger');
      // RGPD-03 : l'apprenant est informé avant toute demande d'autorisation.
      const info = page.getByRole('region', { name: 'Contrôle de présence sur place' });
      await expect(info).toContainText('Votre position n’est ni conservée ni partagée');
      await expect(info).toContainText('Vous pouvez refuser');
      await expectNoAccessibilityViolations(page);
      await page.getByLabel('Code à 6 chiffres').fill('123456');
      await page.getByRole('button', { name: 'Valider le code' }).click();
      await expect(page.getByText('Présence enregistrée')).toBeVisible();
    };

    test('RG-06-10 position sur le campus : présence enregistrée sans vérification', async ({
      page,
      context,
    }) => {
      await appelPropre(page, context);
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 45.7504, longitude: 4.8502, accuracy: 20 });
      const corps = page.waitForRequest('**/api/emargement/code');
      await emargerParCode(page);
      // Position arrondie (minimisation), précision augmentée de l'écart d'arrondi.
      expect((await corps).postDataJSON()).toMatchObject({
        position: { latitude: 45.7504, longitude: 4.8502, precisionMetres: 28 },
      });
      await expect(page.getByText(/l’intervenant la vérifiera/)).toHaveCount(0);
      await expectNoAccessibilityViolations(page);
    });

    test('RG-06-11 position hors du campus : enregistrée « à vérifier », signalée à l’intervenant', async ({
      page,
      context,
    }) => {
      await appelPropre(page, context);
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 45.79, longitude: 4.85, accuracy: 15 });
      await emargerParCode(page);
      await expect(page.getByText(/semble hors du campus/)).toBeVisible();
      await expectNoAccessibilityViolations(page);

      await page.goto('/seances');
      await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
      const lea = page.getByRole('listitem').filter({ hasText: 'Léa Martin' });
      await expect(lea).toContainText('hors site, à vérifier');
      // Sans décision, le scan à vérifier compte comme présent.
      await expect(page.getByText('1 / 2 présents')).toBeVisible();
      await expectNoAccessibilityViolations(page);

      // US-06-04 : l'intervenant tranche, le scan reste conservé.
      await lea.getByRole('button', { name: 'Absent' }).click();
      await expect(lea).toContainText('absent · scan retiré');
      await expect(lea.getByRole('button', { name: 'Absent' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByText('0 / 2 présents')).toBeVisible();
    });

    test('RGPD-03 un refus d’autorisation ne bloque pas l’émargement', async ({
      page,
      context,
    }) => {
      await appelPropre(page, context);
      await context.clearPermissions();
      const corps = page.waitForRequest('**/api/emargement/code');
      await emargerParCode(page);
      expect((await corps).postDataJSON()).not.toHaveProperty('position');
      await expect(page.getByText(/n’a pas pu être confirmée/)).toBeVisible();
    });
  });

  test.describe('US-06-06 émargement à distance', () => {
    /** Appel propre au test, séance fictive dans le mode voulu (cookies lus par la fausse API). */
    const appelEnMode = async (page: Page, context: BrowserContext, mode: string) => {
      const origine = new URL(page.url()).origin;
      await context.addCookies([
        {
          name: 'e2e-appel',
          value: `d${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
          url: origine,
        },
        { name: 'e2e-mode', value: mode, url: origine },
      ]);
      // La position est disponible : le test vérifie qu'elle n'est pas demandée à distance.
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 45.79, longitude: 4.85, accuracy: 15 });
    };

    test('RG-06-08 séance à distance : QR partagé dans la visio, code saisi sans localisation', async ({
      page,
      context,
    }) => {
      await appelEnMode(page, context, 'distanciel');
      await page.goto('/seances');
      await expect(page.getByText(/· À distance/)).toBeVisible();
      await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
      await expect(page.getByText(/Partagez cette fenêtre dans la visioconférence/)).toBeVisible();
      await expect(page.getByText(/il n’est valable que pendant la visio/)).toBeVisible();
      await expectNoAccessibilityViolations(page);

      const apprenant = await context.newPage();
      await apprenant.goto('/emarger');
      await expect(apprenant.getByText(/si vous suivez sur cet appareil/)).toBeVisible();
      await expect(
        apprenant.getByRole('region', { name: 'Contrôle de présence sur place' }),
      ).toHaveCount(0);
      await expectNoAccessibilityViolations(apprenant);
      const corps = apprenant.waitForRequest('**/api/emargement/code');
      await apprenant.getByLabel('Code à 6 chiffres').fill('123456');
      await apprenant.getByRole('button', { name: 'Valider le code' }).click();
      expect((await corps).postDataJSON()).not.toHaveProperty('position');
      await expect(apprenant.getByText('Présence enregistrée')).toBeVisible();
      await expect(apprenant.getByText('Émargement à distance')).toBeVisible();
      await expect(apprenant.getByText(/l’intervenant la vérifiera/)).toHaveCount(0);
      await apprenant.close();

      // Liste en direct : présent, sans « à vérifier » de localisation.
      await expect(page.getByText('1 / 2 présents')).toBeVisible();
      const lea = page.getByRole('listitem').filter({ hasText: 'Léa Martin' });
      await expect(lea).not.toContainText('à vérifier');
    });

    test('RG-06-08 séance hybride : l’apprenant à distance le déclare, l’intervenant le voit', async ({
      page,
      context,
    }) => {
      await appelEnMode(page, context, 'hybride');
      await page.goto('/emarger');
      const choix = page.getByRole('group', {
        name: 'Comment suivez-vous « Droit des affaires » ?',
      });
      await expect(choix.getByRole('radio', { name: 'En salle' })).toBeChecked();
      // En salle, le contrôle de localisation reste annoncé.
      await expect(
        page.getByRole('region', { name: 'Contrôle de présence sur place' }),
      ).toBeVisible();
      await choix.getByRole('radio', { name: 'À distance, en visio' }).check();
      await expect(
        page.getByRole('region', { name: 'Contrôle de présence sur place' }),
      ).toHaveCount(0);
      await expect(page.getByText(/votre position n’est pas demandée/)).toBeVisible();
      await expectNoAccessibilityViolations(page);
      const corps = page.waitForRequest('**/api/emargement/code');
      await page.getByLabel('Code à 6 chiffres').fill('123456');
      await page.getByRole('button', { name: 'Valider le code' }).click();
      const envoye = (await corps).postDataJSON() as Record<string, unknown>;
      expect(envoye).toMatchObject({ aDistance: true });
      expect(envoye).not.toHaveProperty('position');
      await expect(page.getByText('Émargement à distance')).toBeVisible();

      await page.goto('/seances');
      await expect(page.getByText(/· Hybride/)).toBeVisible();
      await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
      await expect(page.getByText(/partagez-le dans la visioconférence/)).toBeVisible();
      const lea = page.getByRole('listitem').filter({ hasText: 'Léa Martin' });
      await expect(lea).toContainText('à distance');
      await expect(page.getByText('1 / 2 présents')).toBeVisible();
      await expectNoAccessibilityViolations(page);
      // US-06-04 : l'intervenant garde la main sur un émargement à distance.
      await lea.getByRole('button', { name: 'Absent' }).click();
      await expect(page.getByText('0 / 2 présents')).toBeVisible();
    });
  });

  test.describe('RG-06-01, RG-06-13 validation et états de l’appel', () => {
    const cookie = async (page: Page, context: BrowserContext, name: string, value: string) => {
      await context.addCookies([{ name, value, url: new URL(page.url()).origin }]);
    };

    test('RG-06-13 valide l’appel avec horodatage : ouvrir, scanner, corriger, valider, puis corriger avec motif', async ({
      page,
      context,
    }) => {
      await cookie(
        page,
        context,
        'e2e-appel',
        `v${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`,
      );
      await page.goto('/seances');
      await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
      await expect(page.getByRole('heading', { name: 'Appel ouvert' })).toBeVisible();

      // L'apprenante émarge.
      const apprenant = await context.newPage();
      await apprenant.goto('/emarger');
      await apprenant.getByLabel('Code à 6 chiffres').fill('123456');
      await apprenant.getByRole('button', { name: 'Valider le code' }).click();
      await expect(apprenant.getByText('Présence enregistrée')).toBeVisible();
      await expect(page.getByText('1 / 2 présents')).toBeVisible();

      // Correction avant validation : Noé absent, Nina (autre groupe) ajoutée avec signalement.
      const noe = page.getByRole('listitem').filter({ hasText: 'Noé Petit' });
      await noe.getByRole('button', { name: 'Absent' }).click();
      await expect(noe).toContainText('absent');
      await page.getByText('Ajouter un apprenant non attendu').click();
      await page
        .getByRole('combobox', { name: 'Apprenant' })
        .selectOption({ label: 'Nina Bernard' });
      await page.getByRole('button', { name: 'Ajouter présent' }).click();
      await expect(page.getByRole('listitem').filter({ hasText: 'Nina Bernard' })).toContainText(
        'non attendu, signalé à la scolarité',
      );
      await expectNoAccessibilityViolations(page);

      // Validation : signée et horodatée par le serveur ; le QR disparaît.
      await page.getByLabel('Commentaire (facultatif)').fill('RAS');
      await page.getByRole('button', { name: 'Valider l’appel' }).click();
      await expect(page.getByRole('heading', { name: 'Appel validé' })).toBeVisible();
      await expect(page.getByText(/Validé le \d{2}\/\d{2}\/\d{4}.* · version 1/)).toBeVisible();
      await expect(page.getByRole('img', { name: /QR code d’émargement/ })).toBeHidden();
      await expectNoAccessibilityViolations(page);

      // Après validation, l'émargement est fermé.
      await apprenant.reload();
      await apprenant.getByLabel('Code à 6 chiffres').fill('123456');
      await apprenant.getByRole('button', { name: 'Valider le code' }).click();
      await expect(apprenant.getByText(/L'appel de cette séance est validé/)).toBeVisible();
      await apprenant.close();

      // RG-06-15 : une correction exige un motif et crée une version.
      await noe.getByRole('button', { name: 'Présent' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'indiquez le motif' })).toBeVisible();
      await page.getByLabel('Motif de la correction').fill('Arrivé sans téléphone');
      await noe.getByRole('button', { name: 'Présent' }).click();
      await expect(page.getByText(/· version 2/)).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Versions de la feuille' })).toBeVisible();
      await expect(page.getByText(/Version 2 · .* · Arrivé sans téléphone/)).toBeVisible();
      await expectNoAccessibilityViolations(page);
    });

    test('RG-06-01 un appel verrouillé se consulte sans se modifier', async ({ page, context }) => {
      await cookie(page, context, 'e2e-etat', 'verrouille');
      await page.goto('/seances');
      await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();
      await expect(page.getByRole('heading', { name: 'Appel verrouillé' })).toBeVisible();
      await expect(page.getByText(/il ne se modifie plus/)).toBeVisible();
      await expect(page.getByRole('img', { name: /QR code d’émargement/ })).toBeHidden();
      await expect(page.getByRole('group', { name: 'Statut de Noé Petit' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Valider l’appel' })).toHaveCount(0);
      await expectNoAccessibilityViolations(page);
    });
  });

  test('US-06-02 l’apprenant émarge avec le code à 6 chiffres', async ({ page }) => {
    await page.goto('/emarger');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Émarger');
    await expect(page.getByRole('button', { name: 'Scanner le QR code' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Droit des affaires Modifiée' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Code à 6 chiffres').fill('000000');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page.getByText(/Ce code n’est pas le bon/)).toBeVisible();

    await page.getByLabel('Code à 6 chiffres').fill('123456');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page.getByText('Présence enregistrée')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
