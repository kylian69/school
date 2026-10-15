// Récapitulatif mensuel d'assiduité par apprenant (RG-06-26), une section par apprenant. Données
// préparées par packages/domain (recapitulatifMensuel) : tout le texte arrive déjà mis en forme.
#let donnees = json(bytes(sys.inputs.donnees))
#set document(title: donnees.titre, author: donnees.organisme.nom, date: auto)
#set page(
  paper: "a4",
  margin: (x: 1.5cm, top: 1.5cm, bottom: 2cm),
  footer: context [
    #set text(size: 7.5pt, fill: luma(90))
    #donnees.organisme.nom · Récapitulatif d'assiduité · édité le #donnees.editeLe
    #h(1fr)
    Page #counter(page).display("1 / 1", both: true)
  ],
)
#set text(lang: "fr", size: 8.5pt)
#set table(stroke: 0.4pt + luma(170), inset: 4pt)

#for (i, a) in donnees.apprenants.enumerate() [
  #if i > 0 { pagebreak() }
  #text(size: 14pt, weight: "bold")[Récapitulatif d'assiduité · #donnees.mois]\
  #text(size: 10pt)[#donnees.organisme.nom#if donnees.organisme.nda != none [ · NDA #donnees.organisme.nda]]
  #v(4pt)
  Apprenant : *#a.nom* #if donnees.promotion != none [· Promotion : *#donnees.promotion*]
  #v(4pt)
  #table(
    columns: (auto, auto, 2.4fr, 1.2fr, auto, auto),
    align: (left, left, left, left, right, right),
    table.header(
      [*Date*], [*Demi-journée*], [*Séances*], [*Statut*], [*Heures prévues*], [*Heures réalisées*],
    ),
    ..a.lignes.map(l => (l.date, l.demiJournee, l.seances, l.statut, l.prevues, l.realisees)).flatten(),
  )
  #if a.lignes.len() == 0 [_Aucune séance attendue ce mois-ci._]
  #v(4pt)
  #table(
    columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr),
    table.header(
      [*Heures prévues*], [*Heures réalisées*], [*Demi-journées d'absence justifiées*],
      [*Demi-journées d'absence non justifiées*], [*Demi-journées avec retard*], [*Demi-journées sans appel validé*],
    ),
    a.totaux.prevues, a.totaux.realisees, str(a.totaux.absencesJustifiees),
    str(a.totaux.absencesNonJustifiees), str(a.totaux.retards), str(a.totaux.nonValidees),
  )
  #text(size: 7pt, fill: luma(90))[
    Établi à partir des feuilles d'émargement signées (dernière version de chaque appel) et des
    justificatifs acceptés. Les heures réalisées excluent les absences et les minutes de retard ; une
    séance dont l'appel n'est pas validé ne compte aucune heure réalisée.
  ]
]
