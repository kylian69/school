import { describe, expect, it } from 'vitest';
import { loadTemplate, PdfRenderError, renderPdf } from './render.js';

const donnees = {
  titre: 'Attestation fictive',
  etablissement: 'Campus de démonstration',
  lignes: [
    { libelle: 'Heures suivies', valeur: '120' },
    { libelle: 'Assiduité', valeur: '97 %' },
  ],
};
const emisLe = new Date('2027-01-15T09:00:00Z');

describe('Rendu Typst des documents officiels', () => {
  it('produit un PDF à partir d’un modèle et de données', async () => {
    const rendu = renderPdf({ template: await loadTemplate('essai'), donnees, emisLe });
    expect(rendu.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(rendu.pages).toBe(1);
    expect(rendu.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RG-07-17 est déterministe : mêmes entrées, même empreinte', async () => {
    const template = await loadTemplate('essai');
    const premier = renderPdf({ template, donnees, emisLe });
    const second = renderPdf({ template, donnees, emisLe });
    expect(second.sha256).toBe(premier.sha256);
    const autre = renderPdf({ template, donnees: { ...donnees, titre: 'Autre' }, emisLe });
    expect(autre.sha256).not.toBe(premier.sha256);
  });

  it('explique une erreur de modèle et refuse un nom de modèle suspect', async () => {
    expect(() => renderPdf({ template: '#let x = (', donnees, emisLe })).toThrow(PdfRenderError);
    await expect(loadTemplate('../../etc/passwd')).rejects.toThrow(/invalide/);
  });
});
