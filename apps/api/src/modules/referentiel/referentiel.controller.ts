import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  DuplicationFormation,
  EchelleMaitrise,
  ElementCree,
  Formation,
  ListeFormations,
  ListeReglesBibliotheque,
  Maquette,
  ModificationBloc,
  ModificationCompetence,
  ModificationFormation,
  ModificationModule,
  ModificationUe,
  NouvelleFormation,
  ParametresImportMaquette,
  RechercheFormations,
  RegleBibliotheque,
  ResultatImportMaquette,
  ResultatSimulation,
  SaisieBloc,
  SaisieCompetence,
  SaisieEchelle,
  SaisieModule,
  SaisieRegleBibliotheque,
  SaisieReglesVersion,
  SaisieSimulation,
  SaisieUe,
} from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { BibliothequeService } from './bibliotheque.service.js';
import { FormationsService } from './formations.service.js';
import { ImportMaquetteService } from './import-maquette.service.js';
import { lireFichierTableur } from '../../shared/tableur.js';
import { MaquettesService } from './maquettes.service.js';

const LECTURE = ['referentiel:lire', 'referentiel:gerer', 'referentiel:publier'] as const;
const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/** Catalogue des formations (E-02-01 ; US-02-01, US-02-04, RG-02-01). */
@Controller('api/formations')
export class FormationsController {
  constructor(private readonly formations: FormationsService) {}

  @Get()
  @RequirePermission(LECTURE, 'formation')
  @ApiContract({
    summary: 'Formations de l’école, dans le périmètre de la personne',
    query: RechercheFormations,
    response: ListeFormations,
  })
  lister(@Query() recherche: RechercheFormations) {
    return this.formations.lister(...ctx(), recherche);
  }

  @Post()
  @RequirePermission('referentiel:gerer', 'etablissement')
  @ApiContract({
    summary: 'Créer une formation et sa première version de maquette',
    body: NouvelleFormation,
    response: Formation,
  })
  creer(@Body() entree: NouvelleFormation, @Req() request: ScolalyRequest) {
    return this.formations.creer(...ctx(), entree, request.ip);
  }

  @Get(':id')
  @RequirePermission(LECTURE, 'formation')
  @ApiContract({ summary: 'Une formation et ses versions de maquette', response: Formation })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.formations.lire(...ctx(), id);
  }

  @Patch(':id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Modifier une formation (archivage compris)',
    body: ModificationFormation,
    response: Formation,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationFormation,
    @Req() request: ScolalyRequest,
  ) {
    return this.formations.modifier(...ctx(), id, changement, request.ip);
  }

  @Post(':id/duplication')
  @RequirePermission('referentiel:gerer', 'etablissement')
  @ApiContract({
    summary: 'Dupliquer une formation et sa dernière version de maquette (RG-02-20)',
    body: DuplicationFormation,
    response: Formation,
  })
  dupliquer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: DuplicationFormation,
    @Req() request: ScolalyRequest,
  ) {
    return this.formations.dupliquer(...ctx(), id, entree, request.ip);
  }
}

/** Éditeur de maquette, versions, règles et simulateur (E-02-02, E-02-03, E-02-09). */
@Controller('api/maquettes/:version')
export class MaquettesController {
  constructor(
    private readonly maquettes: MaquettesService,
    private readonly imports: ImportMaquetteService,
  ) {}

  @Post('import')
  @HttpCode(200)
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary:
      'Importer une maquette ou un référentiel de compétences (corps text/csv ou .xlsx), tout ou rien',
    query: ParametresImportMaquette,
    response: ResultatImportMaquette,
  })
  async importer(
    @Param('version', ParseUUIDPipe) version: string,
    @Query() parametres: ParametresImportMaquette,
    @Req() request: ScolalyRequest,
  ) {
    const tableau = await lireFichierTableur(request.body, request.headers['content-type']);
    return this.imports.importer(...ctx(), version, parametres, tableau, request.ip);
  }

  @Get()
  @RequirePermission(LECTURE, 'formation')
  @ApiContract({
    summary: 'Arbre, règles, totaux et avertissements d’une version',
    response: Maquette,
  })
  lire(@Param('version', ParseUUIDPipe) version: string) {
    return this.maquettes.lire(...ctx(), version);
  }

  @Post('publication')
  @HttpCode(200)
  @RequirePermission('referentiel:publier', 'formation')
  @ApiContract({ summary: 'Publier une version de maquette (RG-02-04)', response: Maquette })
  publier(@Param('version', ParseUUIDPipe) version: string, @Req() request: ScolalyRequest) {
    return this.maquettes.publier(...ctx(), version, request.ip);
  }

  @Post('nouvelle-version')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Créer une nouvelle version en brouillon à partir de celle-ci (RG-02-04)',
    response: Maquette,
  })
  nouvelleVersion(
    @Param('version', ParseUUIDPipe) version: string,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.nouvelleVersion(...ctx(), version, request.ip);
  }

  @Post('archivage')
  @HttpCode(200)
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Archiver une version de maquette', response: Maquette })
  archiver(@Param('version', ParseUUIDPipe) version: string, @Req() request: ScolalyRequest) {
    return this.maquettes.archiver(...ctx(), version, request.ip);
  }

  @Put('regles')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Règles de validation, mode d’évaluation et règles particulières de la version',
    body: SaisieReglesVersion,
    response: Maquette,
  })
  definirRegles(
    @Param('version', ParseUUIDPipe) version: string,
    @Body() saisie: SaisieReglesVersion,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.definirRegles(...ctx(), version, saisie, request.ip);
  }

  @Post('simulation')
  @HttpCode(200)
  @RequirePermission(LECTURE, 'formation')
  @ApiContract({
    summary: 'Simuler les résultats avec des notes fictives (RG-02-10), sans rien enregistrer',
    body: SaisieSimulation,
    response: ResultatSimulation,
  })
  simuler(@Param('version', ParseUUIDPipe) version: string, @Body() saisie: SaisieSimulation) {
    return this.maquettes.simuler(...ctx(), version, saisie);
  }

  @Post('blocs')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Ajouter un bloc de compétences',
    body: SaisieBloc,
    response: ElementCree,
  })
  creerBloc(
    @Param('version', ParseUUIDPipe) version: string,
    @Body() saisie: SaisieBloc,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.creerBloc(...ctx(), version, saisie, request.ip);
  }

  @Patch('blocs/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Modifier ou déplacer un bloc',
    body: ModificationBloc,
    response: Maquette,
  })
  modifierBloc(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: ModificationBloc,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.modifierBloc(...ctx(), version, id, saisie, request.ip);
  }

  @Delete('blocs/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Supprimer un bloc (ses UE sont détachées)', response: Maquette })
  supprimerBloc(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.supprimerBloc(...ctx(), version, id, request.ip);
  }

  @Post('ues')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Ajouter une UE', body: SaisieUe, response: ElementCree })
  creerUe(
    @Param('version', ParseUUIDPipe) version: string,
    @Body() saisie: SaisieUe,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.creerUe(...ctx(), version, saisie, request.ip);
  }

  @Patch('ues/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Modifier ou déplacer une UE', body: ModificationUe, response: Maquette })
  modifierUe(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: ModificationUe,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.modifierUe(...ctx(), version, id, saisie, request.ip);
  }

  @Delete('ues/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Supprimer une UE et ses modules', response: Maquette })
  supprimerUe(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.supprimerUe(...ctx(), version, id, request.ip);
  }

  @Post('modules')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Ajouter un module', body: SaisieModule, response: ElementCree })
  creerModule(
    @Param('version', ParseUUIDPipe) version: string,
    @Body() saisie: SaisieModule,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.creerModule(...ctx(), version, saisie, request.ip);
  }

  @Patch('modules/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Modifier ou déplacer un module',
    body: ModificationModule,
    response: Maquette,
  })
  modifierModule(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: ModificationModule,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.modifierModule(...ctx(), version, id, saisie, request.ip);
  }

  @Delete('modules/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Supprimer un module', response: Maquette })
  supprimerModule(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.supprimerModule(...ctx(), version, id, request.ip);
  }

  @Post('competences')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Ajouter une compétence à un bloc (RG-02-21)',
    body: SaisieCompetence,
    response: ElementCree,
  })
  creerCompetence(
    @Param('version', ParseUUIDPipe) version: string,
    @Body() saisie: SaisieCompetence,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.creerCompetence(...ctx(), version, saisie, request.ip);
  }

  @Patch('competences/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({
    summary: 'Modifier une compétence, ses critères ou ses modules (RG-02-23)',
    body: ModificationCompetence,
    response: Maquette,
  })
  modifierCompetence(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: ModificationCompetence,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.modifierCompetence(...ctx(), version, id, saisie, request.ip);
  }

  @Delete('competences/:id')
  @RequirePermission('referentiel:gerer', 'formation')
  @ApiContract({ summary: 'Supprimer une compétence', response: Maquette })
  supprimerCompetence(
    @Param('version', ParseUUIDPipe) version: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: ScolalyRequest,
  ) {
    return this.maquettes.supprimerCompetence(...ctx(), version, id, request.ip);
  }
}

/** Règles de l'école (E-02-10) : échelle de maîtrise et bibliothèque de règles particulières. */
@Controller('api/referentiel')
export class BibliothequeController {
  constructor(private readonly bibliotheque: BibliothequeService) {}

  @Get('echelle')
  @RequirePermission([...LECTURE, 'referentiel:parametrer'])
  @ApiContract({ summary: 'Échelle de maîtrise de l’école (RG-02-22)', response: EchelleMaitrise })
  echelle() {
    return this.bibliotheque.echelle(RequestContext.tx());
  }

  @Put('echelle')
  @RequirePermission('referentiel:parametrer')
  @ApiContract({
    summary: 'Remplacer l’échelle de maîtrise de l’école',
    body: SaisieEchelle,
    response: EchelleMaitrise,
  })
  definirEchelle(@Body() saisie: SaisieEchelle, @Req() request: ScolalyRequest) {
    return this.bibliotheque.definirEchelle(...ctx(), saisie, request.ip);
  }

  @Get('regles')
  @RequirePermission([...LECTURE, 'referentiel:parametrer'])
  @ApiContract({
    summary: 'Bibliothèque des règles particulières de l’école (RG-02-26)',
    response: ListeReglesBibliotheque,
  })
  regles() {
    return this.bibliotheque.listerRegles(RequestContext.tx());
  }

  @Post('regles')
  @RequirePermission('referentiel:parametrer')
  @ApiContract({
    summary: 'Ajouter une règle particulière à la bibliothèque',
    body: SaisieRegleBibliotheque,
    response: RegleBibliotheque,
  })
  creerRegle(@Body() saisie: SaisieRegleBibliotheque, @Req() request: ScolalyRequest) {
    return this.bibliotheque.creerRegle(...ctx(), saisie, request.ip);
  }

  @Put('regles/:id')
  @RequirePermission('referentiel:parametrer')
  @ApiContract({
    summary: 'Modifier une règle de la bibliothèque (sans effet sur les versions déjà paramétrées)',
    body: SaisieRegleBibliotheque,
    response: RegleBibliotheque,
  })
  modifierRegle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: SaisieRegleBibliotheque,
    @Req() request: ScolalyRequest,
  ) {
    return this.bibliotheque.modifierRegle(...ctx(), id, saisie, request.ip);
  }

  @Delete('regles/:id')
  @HttpCode(204)
  @RequirePermission('referentiel:parametrer')
  @ApiContract({ summary: 'Retirer une règle de la bibliothèque', response: z.null() })
  async supprimerRegle(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.bibliotheque.supprimerRegle(...ctx(), id, request.ip);
    return null;
  }
}
