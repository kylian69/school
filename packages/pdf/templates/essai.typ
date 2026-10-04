// Modèle d'essai : vérifie la chaîne de rendu (données JSON, mise en page, empreinte).
#let donnees = json(bytes(sys.inputs.donnees))
#set document(title: donnees.titre, date: auto)
#set page(paper: "a4", margin: 2cm)
#set text(lang: "fr", size: 11pt)

= #donnees.titre

#donnees.etablissement

#table(
  columns: (1fr, auto),
  [*Libellé*], [*Valeur*],
  ..donnees.lignes.map(l => (l.libelle, l.valeur)).flatten(),
)
