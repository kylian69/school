import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  AppelEnDirect,
  CodeEmargement,
  MarquagePresence,
  OuvertureAppel,
  PhotosAppel,
  ResultatScan,
  ScanEmargement,
  SeanceProche,
} from '@scolaly/contracts';
import { withOrganisation, type Database } from '@scolaly/db';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ACCESS_RESOLVER, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, Public, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { AppelService } from './appel.service.js';
import { ScanService } from './scan.service.js';
import { SeancesService } from './seances.service.js';

/**
 * Scan de l'apprenant (US-06-02). Route publique pour la garde générale : elle vérifie elle-même la
 * session dans Valkey, car le contrôle habituel des droits lit la base (architecture, section 5).
 */
@Controller('api/emargement')
export class ScanController {
  constructor(private readonly scans: ScanService) {}

  @Post('scan')
  @HttpCode(200)
  @Public()
  @ApiContract({
    summary: 'Émarger en scannant le QR de la séance (session requise, sans requête SQL)',
    body: ScanEmargement,
    response: ResultatScan,
  })
  scanner(@Body() corps: ScanEmargement, @Req() request: ScolalyRequest) {
    return this.scans.scanner(request.headers, corps, request.ip);
  }

  @Post('code')
  @HttpCode(200)
  @Public()
  @ApiContract({
    summary: 'Émarger avec le code à 6 chiffres affiché avec le QR (session requise)',
    body: CodeEmargement,
    response: ResultatScan,
  })
  saisirCode(@Body() corps: CodeEmargement, @Req() request: ScolalyRequest) {
    return this.scans.saisirCode(request.headers, corps, request.ip);
  }
}

/** Appel d'une séance, côté intervenant (US-06-01, US-06-03). */
@Controller('api/seances/:id/appel')
export class AppelController {
  constructor(private readonly appels: AppelService) {}

  @Post('ouverture')
  @HttpCode(200)
  @RequirePermission('emargement:animer')
  @ApiContract({
    summary: 'Ouvrir l’appel : précharge la séance et donne de quoi calculer le QR',
    response: OuvertureAppel,
  })
  ouvrir(@Param('id', ParseUUIDPipe) id: string) {
    return this.appels.ouvrir(RequestContext.tx(), RequestContext.access(), id);
  }

  @Get()
  @RequirePermission('emargement:animer')
  @ApiContract({ summary: 'Présents et attendus en direct', response: AppelEnDirect })
  enDirect(@Param('id', ParseUUIDPipe) id: string) {
    return this.appels.enDirect(RequestContext.tx(), RequestContext.access(), id);
  }

  @Put('presences/:personneId')
  @RequirePermission('emargement:animer')
  @ApiContract({
    summary:
      'Marquer un attendu présent, en retard ou absent (appel manuel, correction ou décision sur un scan à vérifier)',
    body: MarquagePresence,
    response: AppelEnDirect,
  })
  marquer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('personneId', ParseUUIDPipe) personneId: string,
    @Body() corps: MarquagePresence,
    @Req() request: ScolalyRequest,
  ) {
    return this.appels.marquer(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      personneId,
      corps,
      request.ip,
    );
  }

  @Get('photos')
  @RequirePermission('emargement:animer')
  @ApiContract({
    summary: 'Photos des attendus : adresses signées, valables quelques minutes',
    response: PhotosAppel,
  })
  photos(@Param('id', ParseUUIDPipe) id: string) {
    return this.appels.photos(RequestContext.tx(), RequestContext.access(), id);
  }

  @Get('direct')
  @RequirePermission('emargement:animer')
  @ApiContract({
    summary:
      'Présents et attendus en direct, en flux SSE (text/event-stream) : un événement AppelEnDirect à chaque changement',
    response: z.string(),
  })
  async flux(@Param('id', ParseUUIDPipe) id: string, @Res() reply: FastifyReply) {
    const etat = await this.appels.preparerDirect(RequestContext.tx(), RequestContext.access(), id);
    // Le flux part une fois la transaction validée : il ne garde aucune connexion à la base.
    RequestContext.apresValidation(() => {
      reply.hijack();
      this.appels.diffuser(reply.raw, etat);
      return Promise.resolve();
    });
  }
}

/**
 * Photo de la liste d'appel par adresse signée (RG-01-27) : la signature a été donnée après
 * contrôle des droits, pour ce seul compte ; la session est exigée en plus.
 */
@Controller('api/photos/appel')
export class PhotosAppelController {
  constructor(private readonly appels: AppelService) {}

  @Get()
  @Authenticated()
  @ApiContract({
    summary: 'Photo d’un attendu (JPEG), par adresse signée',
    query: z.object({ jeton: z.string() }),
    response: z.string(),
  })
  async image(
    @Query('jeton') jeton: string | undefined,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const image = await this.appels.photoSignee(jeton ?? '', request.userId);
    await reply
      .header('content-type', 'image/jpeg')
      .header('cache-control', 'private, max-age=300')
      .header('x-content-type-options', 'nosniff')
      .send(image);
  }
}

/** Séances proches : à animer (intervenant) ou à émarger (apprenant). */
@Controller('api')
export class SeancesController {
  constructor(
    private readonly seances: SeancesService,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get('seances')
  @RequirePermission('emargement:animer')
  @ApiContract({ summary: 'Mes séances proches, à animer', response: z.array(SeanceProche) })
  aAnimer() {
    return this.seances.aAnimer(RequestContext.tx(), RequestContext.access());
  }

  /** Aucune permission pour ses propres séances : l'école est celle de la session. */
  @Get('moi/seances')
  @Authenticated()
  @ApiContract({ summary: 'Mes séances proches, à émarger', response: z.array(SeanceProche) })
  async aEmarger(@Req() request: ScolalyRequest) {
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access) {
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    }
    return withOrganisation(this.db, access.organisationId, (tx) =>
      this.seances.aEmarger(tx, access),
    );
  }
}
