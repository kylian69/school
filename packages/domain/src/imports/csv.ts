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
