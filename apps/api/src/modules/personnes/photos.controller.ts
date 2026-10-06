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
  BilanImportPhotos,
  DecisionPhoto,
  PersonneDetail,
  PhotoPersonne,
} from '@scolaly/contracts';
import { personne, withOrganisation, type Database, type Transaction } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ACCESS_RESOLVER, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { PersonnesService } from './personnes.service.js';
import { PhotosService } from './photos.service.js';

/** Photo envoyée au navigateur : privée, jamais mise en cache partagé (RG-01-27). */
async function envoyerImage(reply: FastifyReply, image: Buffer) {
  await reply
    .header('content-type', 'image/jpeg')
    .header('cache-control', 'private, max-age=300')
    .header('x-content-type-options', 'nosniff')
    .send(image);
}

/** Photo d'une personne, déposée ou validée par la scolarité (US-01-20, RG-01-26). */
@Controller('api/personnes/:id/photo')
export class PhotosController {
  constructor(
    private readonly personnes: PersonnesService,
    private readonly photos: PhotosService,
  ) {}

  @Put()
  @RequirePermission(['apprenants:inviter', 'personnel:inviter'])
  @ApiContract({
    summary: 'Déposer la photo d’une personne (corps image/jpeg ou image/png, 5 Mo au plus)',
    response: PersonneDetail,
  })
  async deposer(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    const tx = RequestContext.tx();
    const access = RequestContext.access();
    const fiche = await this.personnes.charger(tx, access, id);
    await this.photos.deposer(
      tx,
      access,
      fiche,
      request.body as Buffer | undefined,
      'scolarite',
      request.ip,
    );
    return this.personnes.lire(tx, access, id);
  }

  @Post('decision')
  @HttpCode(200)
  @RequirePermission(['apprenants:inviter', 'personnel:inviter'])
  @ApiContract({
    summary: 'Valider ou refuser (avec un motif) la photo déposée par la personne',
    body: DecisionPhoto,
    response: PersonneDetail,
  })
  async decider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() decision: DecisionPhoto,
    @Req() request: ScolalyRequest,
  ) {
    const tx = RequestContext.tx();
    const access = RequestContext.access();
    const fiche = await this.personnes.charger(tx, access, id);
    await this.photos.decider(tx, access, fiche, decision, request.ip);
    return this.personnes.lire(tx, access, id);
  }

  /** RG-01-27 : visible par la scolarité, l'administration, la direction (et bientôt les intervenants). */
  @Get()
  @RequirePermission('personnes:lire')
  @ApiContract({
    summary: 'Photo de la personne (JPEG 512 × 512) ; ?attente=1 pour celle à valider',
    query: z.object({ attente: z.string().optional(), v: z.string().optional() }),
    response: z.string(),
  })
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('attente') attente: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const access = RequestContext.access();
    const enAttente = attente === '1';
    if (
      enAttente &&
      !access.permissions.has('apprenants:inviter') &&
      !access.permissions.has('personnel:inviter')
    ) {
      throw new ForbiddenException('Seule la scolarité voit une photo en attente de validation.');
    }
    const fiche = await this.personnes.charger(RequestContext.tx(), access, id);
    await envoyerImage(reply, await this.photos.image(fiche, enAttente));
  }
}

/**
 * Ma photo (US-01-20) : chacun peut déposer la sienne, validée ensuite par la scolarité. Aucune
 * permission n'est demandée pour agir sur soi-même ; l'école est celle de la session.
 */
@Controller('api/moi/photo')
export class MaPhotoController {
  constructor(
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
    private readonly photos: PhotosService,
  ) {}

  private async dansMonEcole<T>(
    request: ScolalyRequest,
    ecriture: boolean,
    travail: (tx: Transaction, fiche: typeof personne.$inferSelect) => Promise<T>,
  ): Promise<T> {
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access) {
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    }
    if (ecriture && access.acces !== 'complet') {
      throw new ForbiddenException(
        'Votre établissement est en lecture seule : votre photo ne peut pas être changée pour le moment.',
      );
    }
    const apresValidation: (() => Promise<void>)[] = [];
    const resultat = await withOrganisation(this.db, access.organisationId, (tx) =>
      RequestContext.run({ access, tx, apresValidation }, async () => {
        const [fiche] = await tx.select().from(personne).where(eq(personne.id, access.personneId));
        if (!fiche) throw new ForbiddenException('Votre fiche est introuvable dans cette école.');
        return travail(tx, fiche);
      }),
    );
    // Transaction validée : les effets externes (photo remplacée à supprimer) peuvent partir.
    for (const action of apresValidation) await action();
    return resultat;
  }

  private maPhoto(fiche: typeof personne.$inferSelect): PhotoPersonne {
    const photo = this.photos.photoDe(fiche, true);
    const versLaMienne = (url: string | null) =>
      url?.replace(`/api/personnes/${fiche.id}/photo`, '/api/moi/photo/image') ?? null;
    return { ...photo, url: versLaMienne(photo.url), attenteUrl: versLaMienne(photo.attenteUrl) };
  }

  @Get()
  @Authenticated()
  @ApiContract({ summary: 'Ma photo et l’état de sa validation', response: PhotoPersonne })
  lire(@Req() request: ScolalyRequest) {
    return this.dansMonEcole(request, false, (_tx, fiche) => Promise.resolve(this.maPhoto(fiche)));
  }

  @Put()
  @Authenticated()
  @ApiContract({
    summary: 'Déposer ma photo (JPEG ou PNG, 5 Mo au plus), à valider par la scolarité',
    response: PhotoPersonne,
  })
  deposer(@Req() request: ScolalyRequest) {
    return this.dansMonEcole(request, true, async (tx, fiche) =>
      this.maPhoto(
        await this.photos.deposer(
          tx,
          RequestContext.access(),
          fiche,
          request.body as Buffer | undefined,
          'personne',
          request.ip,
        ),
      ),
    );
  }

  @Get('image')
  @Authenticated()
  @ApiContract({
    summary: 'Ma photo (JPEG) ; ?attente=1 pour celle que j’ai déposée',
    query: z.object({ attente: z.string().optional(), v: z.string().optional() }),
    response: z.string(),
  })
  async image(
    @Query('attente') attente: string | undefined,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const image = await this.dansMonEcole(request, false, (_tx, fiche) =>
      this.photos.image(fiche, attente === '1'),
    );
    await envoyerImage(reply, image);
  }
}

/** Import des photos par archive ZIP, chaque fichier nommé par matricule (US-01-20). */
@Controller('api/photos/import')
export class ImportPhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post()
  @HttpCode(200)
  @RequirePermission(['apprenants:inviter', 'personnel:inviter'])
  @ApiContract({
    summary: 'Importer une archive ZIP de photos nommées par matricule (200 Mo au plus)',
    response: BilanImportPhotos,
  })
  importer(@Req() request: ScolalyRequest) {
    return this.photos.importerArchive(
      RequestContext.tx(),
      RequestContext.access(),
      request.body as Buffer | undefined,
      request.ip,
    );
  }
}
