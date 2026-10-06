import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import {
  AppelEnDirect,
  CodeEmargement,
  OuvertureAppel,
  ResultatScan,
  ScanEmargement,
} from '@scolaly/contracts';
import { Public, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { AppelService } from './appel.service.js';
import { ScanService } from './scan.service.js';

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
    return this.scans.scanner(request.headers, corps);
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
    return this.scans.saisirCode(request.headers, corps);
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
}
