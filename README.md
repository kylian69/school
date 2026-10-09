# Scolaly — plateforme de gestion d'établissement (supérieur, initial & alternance)

Scolaly est un ERP pour écoles supérieures privées, CFA et organismes de formation : référentiel
pédagogique, emplois du temps, cahier de texte, émargement QR, notes et bulletins, alternance
(contrats, OPCO), CRM, facturation, Qualiopi/BPF… Disponible en SaaS ou en self-hosted (Docker).

## Documentation
- [`docs/business/`](docs/business/) — étude business (marché, tarifs, business plan, faisabilité)
- [`docs/cahier-des-charges/`](docs/cahier-des-charges/) — cahier des charges détaillé, module par module
- [`docs/architecture/`](docs/architecture/) — architecture technique (stack, données, émargement, hébergement)
- [`docs/maquettes/`](docs/maquettes/) — maquettes du MVP (43 écrans) et identité visuelle
- [`docs/plan-developpement/`](docs/plan-developpement/) — plan de développement du MVP (phases, jalons, outillage, risques)
- [`docs/adr/`](docs/adr/) — décisions d'architecture prises après la validation de l'architecture
- [`docs/rgpd/registre.md`](docs/rgpd/registre.md) — registre des traitements, tenu à jour à chaque incrément
- [`docs/notes-de-version/`](docs/notes-de-version/) — notes de version

## Démarrer

```bash
corepack enable
pnpm install
pnpm check   # format, lint, typage, tests
pnpm dev     # applications en mode développement
```

## Installer sur un serveur

```bash
SCOLALY_DOMAIN=scolaly.mon-ecole.fr sh infra/compose/install.sh   # installation à neuf
SCOLALY_VERSION=2026.10.1 sh infra/compose/update.sh               # mise à jour
```

Réseau local sans certificat public : ajouter `SCOLALY_TLS=internal` (par exemple `SCOLALY_DOMAIN=scolaly.192.168.1.10.sslip.io`). Sauvegarder `infra/compose/.env` avec les données : il contient les secrets.

### Rotation de la clé de chiffrement

Les données sensibles sont chiffrées avec une clé maîtresse versionnée (`ENCRYPTION_MASTER_KEY_V1`, `_V2`…, ADR 0002 et 0006). Pour la changer (fuite suspectée, départ d'un administrateur, renouvellement périodique), sans arrêt de service :

```bash
sh infra/compose/rotation-cle.sh ajouter      # génère la v2, encore inutilisée ; sauvegarder .env
sh infra/compose/rotation-cle.sh basculer     # chiffre en v2 et rechiffre l'existant
sh infra/compose/rotation-cle.sh etat         # valeurs restantes par version (repris chaque heure)
sh infra/compose/rotation-cle.sh retirer 1    # refusé tant qu'une valeur utilise la v1
```

La clé retirée reste en commentaire daté dans `.env` : elle seule relit les sauvegardes faites avant la rotation. La ranger avec ces sauvegardes, puis l'effacer quand elles expirent. Si `etat` signale des valeurs illisibles, les examiner avant tout retrait. Hors Docker Compose, mêmes étapes : ajouter la variable `ENCRYPTION_MASTER_KEY_V2` à l'API et au worker, puis fixer `ENCRYPTION_KEY_VERSION=2` partout, suivre `node dist/cli/chiffrement.js etat` (worker) et retirer la v1 quand `retrait-possible 1` répond 0.

Les règles de travail des agents IA sont résumées dans [`CLAUDE.md`](CLAUDE.md).
