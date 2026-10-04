import { SetMetadata } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Contrat d'une route : schémas Zod de `packages/contracts` pour l'entrée et la réponse. L'entrée
 * est validée à chaque appel ; le tout alimente le document OpenAPI.
 */
export const API_CONTRACT = 'scolaly:api-contract';

export interface ApiContractOptions {
  summary: string;
  body?: z.ZodType;
  query?: z.ZodType;
  response: z.ZodType;
}

export const ApiContract = (options: ApiContractOptions) => SetMetadata(API_CONTRACT, options);
