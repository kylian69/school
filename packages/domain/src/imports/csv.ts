/**
 * Lecture d'un fichier CSV (RG-01-17) : séparateur « ; » ou « , » détecté sur la ligne d'en-tête,
 * champs entre guillemets (guillemets doublés, retours à la ligne), fins de ligne Windows ou Unix.
 * Le texte est déjà décodé (UTF-8 ou Windows-1252, détection faite par l'appelant).
 */
export interface TableauLu {
  colonnes: string[];
  lignes: string[][];
}

/** Séparateur le plus fréquent hors guillemets dans la première ligne. */
function separateur(premiereLigne: string): ';' | ',' {
  let pointsVirgules = 0;
  let virgules = 0;
  let entreGuillemets = false;
  for (const c of premiereLigne) {
    if (c === '"') entreGuillemets = !entreGuillemets;
    else if (!entreGuillemets && c === ';') pointsVirgules++;
    else if (!entreGuillemets && c === ',') virgules++;
  }
  return virgules > pointsVirgules ? ',' : ';';
}

export function lireCsv(texte: string): TableauLu {
  const contenu = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
  const sep = separateur(contenu.slice(0, contenu.search(/\r?\n|$/)));
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu.charAt(i);
    if (entreGuillemets) {
      if (c === '"' && contenu.charAt(i + 1) === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenu.charAt(i + 1) === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else {
      champ += c;
    }
  }
  ligne.push(champ);
  lignes.push(ligne);
  const pleines = lignes.filter((l) => l.some((v) => v.trim() !== ''));
  const [colonnes = [], ...donnees] = pleines;
  return { colonnes: colonnes.map((c) => c.trim()), lignes: donnees };
}

/**
 * Écriture d'un CSV ouvert par Excel (RG-01-21) : point-virgule, guillemets, fins de ligne Windows
 * et indicateur d'ordre des octets pour l'UTF-8. Une cellule qui commence par =, +, - ou @ est
 * précédée d'une apostrophe : le tableur ne l'exécutera pas comme une formule.
 */
export function ecrireCsv(
  colonnes: readonly string[],
  lignes: readonly (readonly string[])[],
): string {
  const cellule = (valeur: string) => {
    const sure = /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
    return `"${sure.replaceAll('"', '""')}"`;
  };
  const texte = [colonnes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n');
  return `${String.fromCharCode(0xfeff)}${texte}\r\n`;
}
