// Feuille d'émargement d'une séance (RG-06-25), une page ou plus par séance. Données préparées par
// packages/domain (donneesFeuilleSeance) : tout le texte arrive déjà mis en forme.
#let donnees = json(bytes(sys.inputs.donnees))
#set document(title: donnees.titre, author: donnees.organisme, date: auto)
#set page(
  paper: "a4",
  flipped: true,
  margin: (x: 1.5cm, top: 1.5cm, bottom: 2cm),
  footer: context [
    #set text(size: 7.5pt, fill: luma(90))
    #donnees.organisme · Feuille d'émargement · éditée le #donnees.editeLe
    #h(1fr)
    Page #counter(page).display("1 / 1", both: true)
  ],
)
#set text(lang: "fr", size: 8.5pt)
#set table(stroke: 0.4pt + luma(170), inset: 4pt)

#let champ(libelle, valeur) = [#text(fill: luma(90))[#libelle] : *#valeur*]

#for (i, f) in donnees.feuilles.enumerate() [
  #if i > 0 { pagebreak() }
  #grid(
    columns: (1fr, auto),
    [
      #text(size: 14pt, weight: "bold")[Feuille d'émargement]\
      #text(size: 10pt)[#f.organisme.nom#if f.organisme.nda != none [ · NDA #f.organisme.nda]]
    ],
    align(right)[
      #text(size: 10pt, weight: "bold")[Version #f.version.numero]\
      #if not f.version.derniere [#text(fill: rgb("#b42318"))[Version remplacée par une correction]]
    ],
  )
  #v(4pt)
  #table(
    columns: (1fr, 1fr, 1fr),
    stroke: none,
    inset: 2pt,
    champ("Établissement", f.seance.etablissement),
    champ("Formation", f.seance.formations),
    champ("Public", f.seance.publics),
    champ("Séance", f.seance.libelle),
    champ("Module", f.seance.module),
    champ("Date", f.seance.date),
    champ("Horaires", [#f.seance.horaires (#f.seance.fuseau)]),
    champ("Lieu", f.seance.lieu),
    champ("Mode", f.seance.mode),
    champ("Intervenant(s)", f.seance.intervenants),
    champ(
      "Effectif",
      [#f.effectifs.presents présent(s) sur #f.effectifs.attendus attendu(s), #f.effectifs.retards retard(s), #f.effectifs.absents absent(s)],
    ),
    champ("Non attendus ajoutés", f.effectifs.nonAttendus),
  )
  #v(4pt)
  #table(
    columns: (auto, 1.4fr, 1fr, 1.6fr, 1.4fr, 1fr),
    table.header(
      [*\#*], [*Apprenant*], [*Statut*], [*Émargement*], [*Contrôles*], [*Justification*],
    ),
    ..f.lignes.enumerate().map(((n, l)) => (
      str(n + 1),
      l.nom,
      l.statut,
      [#l.pointage#if l.signature != "" [\ #text(size: 7pt, style: "italic")[#l.signature]]],
      l.controle,
      l.justification,
    )).flatten(),
  )
  #if f.signalements.len() > 0 [
    #v(4pt)
    *Signalements*
    #for s in f.signalements [- #s]
  ]
  #v(4pt)
  #block(breakable: false, width: 100%, stroke: 0.6pt, inset: 6pt)[
    *Validation de l'appel* (signature électronique simple de l'intervenant, heure du serveur) :
    version #f.version.numero, validée par #f.version.validePar le #f.version.valideLe.\
    Empreinte numérique (SHA-256) de la liste validée : #raw(f.version.empreinte)
    #v(2pt)
    #table(
      columns: (auto, auto, 1fr, 1.4fr, 2fr),
      table.header([*Version*], [*Le*], [*Par*], [*Nature*], [*Motif*]),
      ..f.historique.map(h => (str(h.numero), h.le, h.par, h.nature, h.motif)).flatten(),
    )
    #text(size: 7pt, fill: luma(90))[
      La justification des absences est une couche ajoutée après la signature (RG-06-21) : elle ne
      modifie pas la liste validée. L'empreinte du présent document est inscrite au journal d'audit
      de l'école lors de chaque téléchargement.
    ]
  ]
]
