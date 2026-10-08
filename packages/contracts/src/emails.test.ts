import { describe, expect, it } from 'vitest';
import {
  cheminLogo,
  emailChangementsEdt,
  emailInvitation,
  emailLienMagique,
  miseEnPageEmail,
} from './emails.js';

const LIEN = 'https://ecole.exemple.test/activation/abc';
const EXPIRE = new Date('2026-10-20T10:00:00Z');

describe('US-01-14 emails aux couleurs de l’école', () => {
  it('met l’invitation aux couleurs et au logo de l’école, texte brut conservé', () => {
    const email = emailInvitation({
      to: 'lea@exemple.test',
      prenom: 'Léa',
      ecole: 'École de gestion de Lumerac',
      lien: LIEN,
      expireLe: EXPIRE,
      marque: {
        nom: 'EGL',
        couleur: '#8C1D40',
        logoUrl: 'https://ecole.exemple.test/api/ecoles/x/logo?v=1',
      },
    });
    expect(email.text).toContain(LIEN);
    expect(email.text).toContain('avant le 20/10/2026');
    expect(email.html).toContain('background:#8C1D40');
    expect(email.html).toContain('<img src="https://ecole.exemple.test/api/ecoles/x/logo?v=1"');
    expect(email.html).toContain(`<a href="${LIEN}"`);
    expect(email.html).toContain('Activer mon compte');
  });

  it('reprend l’apparence de Scolaly sans marque, ou avec une couleur douteuse', () => {
    const sans = emailInvitation({
      to: 'a@exemple.test',
      prenom: 'A',
      ecole: 'École',
      lien: LIEN,
      expireLe: EXPIRE,
      relance: 1,
    });
    expect(sans.subject).toMatch(/^Rappel : /);
    expect(sans.html).toContain('background:#4F46E5');
    expect(sans.html).not.toContain('<img');
    const douteuse = miseEnPageEmail({
      marque: { nom: 'X', couleur: 'red;background:url(x)', logoUrl: null },
      paragraphes: [],
      bouton: { libelle: 'Ouvrir', lien: LIEN },
      mention: '',
    });
    expect(douteuse).toContain('background:#4F46E5');
    expect(douteuse).not.toContain('url(x)');
  });

  it('échappe toutes les valeurs reprises dans le HTML', () => {
    const email = emailInvitation({
      to: 'a@exemple.test',
      prenom: '<script>alert("x")</script>',
      ecole: 'L’école & co',
      lien: 'https://e.test/?a=1&b="2"',
      expireLe: EXPIRE,
      marque: { nom: "O'Neil <b>", couleur: null, logoUrl: null },
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(email.html).toContain('O&#39;Neil &lt;b&gt;');
    expect(email.html).toContain('href="https://e.test/?a=1&amp;b=&quot;2&quot;"');
  });

  it('envoie le lien magique aux couleurs de Scolaly', () => {
    const email = emailLienMagique({ to: 'a@exemple.test', lien: LIEN });
    expect(email.html).toContain('Me connecter');
    expect(email.html).toContain('Scolaly');
  });

  it('construit l’adresse versionnée du logo', () => {
    expect(cheminLogo('org', 'a'.repeat(64))).toBe(`/api/ecoles/org/logo?v=${'a'.repeat(16)}`);
  });
});

describe('RG-04-14 email des changements de l’emploi du temps', () => {
  const base = {
    to: 'lea@exemple.test',
    prenom: 'Léa',
    ecole: 'École de gestion de Lumerac',
    lien: 'https://ecole.exemple.test/',
  };
  const seance = {
    libelle: 'Comptabilité générale',
    debut: new Date('2026-11-03T08:00:00Z'),
    fin: new Date('2026-11-03T10:00:00Z'),
    fuseau: 'Europe/Paris',
    salle: 'B12',
    reporteeVers: null,
  };

  it('RG-04-14 regroupe les changements urgents dans un seul email, à l’heure de l’établissement', () => {
    const email = emailChangementsEdt({
      ...base,
      recapitulatif: false,
      changements: [
        { ...seance, nature: 'modification' },
        { ...seance, nature: 'annulation', libelle: 'Droit social' },
      ],
    });
    expect(email.subject).toBe('Changement de votre emploi du temps · École de gestion de Lumerac');
    expect(email.text).toContain(
      '- Séance modifiée · Comptabilité générale · mardi 03/11/2026, 09:00 – 11:00 · salle B12',
    );
    expect(email.text).toContain(
      '- Séance annulée · Droit social · mardi 03/11/2026, 09:00 – 11:00',
    );
    expect(email.text).not.toContain('Droit social · mardi 03/11/2026, 09:00 – 11:00 · salle');
    expect(email.html).toContain('Ouvrir Scolaly');
  });

  it('RG-04-14 annonce le nouveau créneau d’un report dans le récapitulatif', () => {
    const email = emailChangementsEdt({
      ...base,
      recapitulatif: true,
      changements: [
        {
          ...seance,
          nature: 'report',
          reporteeVers: {
            debut: new Date('2026-11-10T13:00:00Z'),
            fin: new Date('2026-11-10T15:00:00Z'),
          },
        },
      ],
    });
    expect(email.subject).toContain('Récapitulatif');
    expect(email.text).toContain('reportée au mardi 10/11/2026, 14:00 – 16:00');
  });
});
