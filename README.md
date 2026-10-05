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

Les règles de travail des agents IA sont résumées dans [`CLAUDE.md`](CLAUDE.md).
