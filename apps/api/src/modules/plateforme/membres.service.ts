import { Inject, Injectable } from '@nestjs/common';
import type { RolePlateforme } from '@scolaly/contracts';
import { plateformeMembre, type Database } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import type { PlateformeMembres } from '../../access/plateforme-membres.js';
import { PLATFORM_DATABASE } from './tokens.js';

@Injectable()
export class MembresService implements PlateformeMembres {
  constructor(@Inject(PLATFORM_DATABASE) private readonly db: Database) {}

  async roleDe(userId: string): Promise<RolePlateforme | null> {
    const [membre] = await this.db
      .select({ role: plateformeMembre.role })
      .from(plateformeMembre)
      .where(eq(plateformeMembre.userId, userId));
    return membre?.role ?? null;
  }
}
