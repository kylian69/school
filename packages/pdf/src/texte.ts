import { inflateSync } from 'node:zlib';

/**
 * Texte d'un PDF produit par Typst, pour les tests et les contrôles (contenu d'une feuille). Lit
 * les polices Type0 (Identity-H) et leur table ToUnicode, puis les chaînes des opérateurs Tj et TJ
 * page par page. Ce n'est pas un lecteur PDF général : il suffit aux documents de ce paquet.
 */
export function texteDuPdf(pdf: Buffer): string {
  const source = pdf.toString('latin1');
  const objets = new Map<string, { dict: string; flux: string | null }>();
  for (const m of source.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const corps = m[2] ?? '';
    const debut = corps.search(/stream\r?\n/);
    let flux: string | null = null;
    let dict = corps;
    if (debut >= 0) {
      dict = corps.slice(0, debut);
      const ouverture = /stream\r?\n/.exec(corps.slice(debut))?.[0].length ?? 7;
      const brut = Buffer.from(
        corps.slice(debut + ouverture, corps.lastIndexOf('endstream')),
        'latin1',
      );
      flux = dict.includes('/FlateDecode')
        ? inflateSync(brut).toString('latin1')
        : brut.toString('latin1');
    }
    objets.set(m[1] ?? '', { dict, flux });
  }
  const tables = new Map<string, Map<number, string>>();
  const tableDe = (fonte: string) => {
    let table = tables.get(fonte);
    if (table) return table;
    table = new Map();
    const ref = /\/ToUnicode (\d+) 0 R/.exec(objets.get(fonte)?.dict ?? '')?.[1];
    const cmap = (ref && objets.get(ref)?.flux) || '';
    const hex = (h: string) => parseInt(h, 16);
    const texte = (h: string) =>
      String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((u) => hex(u)));
    for (const bloc of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const [, g, u] of (bloc[1] ?? '').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
        table.set(hex(g ?? ''), texte(u ?? ''));
    for (const bloc of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const [, a, b, u] of (bloc[1] ?? '').matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      ))
        for (let g = hex(a ?? ''); g <= hex(b ?? ''); g++)
          table.set(g, String.fromCodePoint(hex(u ?? '') + g - hex(a ?? '')));
    tables.set(fonte, table);
    return table;
  };
  const ECHAPPEMENTS: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
  /** Chaîne littérale à partir de la parenthèse ouvrante (parenthèses équilibrées permises). */
  const lireChaine = (s: string, debut: number): [string, number] => {
    let sortie = '';
    let profondeur = 0;
    for (let i = debut; i < s.length; i++) {
      const c = s.charAt(i);
      if (c === '\\') {
        const octal = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))?.[0];
        if (octal) {
          sortie += String.fromCharCode(parseInt(octal, 8));
          i += octal.length;
        } else {
          const e = s.charAt(i + 1);
          sortie += ECHAPPEMENTS[e] ?? e;
          i += 1;
        }
      } else if (c === '(') {
        if (profondeur++ > 0) sortie += c;
      } else if (c === ')') {
        if (--profondeur === 0) return [sortie, i + 1];
        sortie += c;
      } else sortie += c;
    }
    return [sortie, s.length];
  };
  const morceaux: string[] = [];
  for (const { dict } of objets.values()) {
    if (!/\/Type \/Page\b/.test(dict)) continue;
    const fontes = new Map(
      [...(/\/Font <<([^>]*)>>/.exec(dict)?.[1] ?? '').matchAll(/\/(\w+) (\d+) 0 R/g)].map(
        ([, nom, ref]) => [nom ?? '', ref ?? ''],
      ),
    );
    const contenu = objets.get(/\/Contents (\d+) 0 R/.exec(dict)?.[1] ?? '')?.flux ?? '';
    let table = new Map<number, string>();
    let nom = '';
    let chaines: string[] = [];
    for (let i = 0; i < contenu.length;) {
      const c = contenu.charAt(i);
      if (c === '(') {
        const [chaine, suite] = lireChaine(contenu, i);
        chaines.push(chaine);
        i = suite;
      } else if (c === '/') {
        nom = /^\/(\w+)/.exec(contenu.slice(i))?.[1] ?? '';
        i += nom.length + 1;
      } else if (/[A-Za-z'"]/.test(c)) {
        const op = /^[A-Za-z'"*]+/.exec(contenu.slice(i))?.[0] ?? c;
        i += op.length;
        if (op === 'Tf') table = tableDe(fontes.get(nom) ?? '');
        else if (op === 'ET') morceaux.push(' ');
        else if (op === 'Tj' || op === 'TJ')
          for (const octets of chaines)
            for (let j = 0; j + 1 < octets.length; j += 2)
              morceaux.push(table.get(octets.charCodeAt(j) * 256 + octets.charCodeAt(j + 1)) ?? '');
        chaines = [];
      } else i += 1;
    }
  }
  return morceaux.join('').replace(/\s+/g, ' ').trim();
}
