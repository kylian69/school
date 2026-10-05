import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';

/**
 * Invitations à activer un compte (RG-01-08). Seule l'empreinte SHA-256 du secret est stockée ;
 * le lien porte l'identifiant de l'école et le secret, à usage unique.
 */
export const invitation = pgTable(
  'invitation',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    jetonEmpreinte: text().notNull(),
    email: text().notNull(),
    envoyeeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expireLe: timestamp({ withTimezone: true }).notNull(),
    relances: integer().notNull().default(0),
    derniereRelanceLe: timestamp({ withTimezone: true }),
    accepteeLe: timestamp({ withTimezone: true }),
    revoqueeLe: timestamp({ withTimezone: true }),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('invitation', t),
    uniqueIndex('invitation_organisation_id_jeton_empreinte_key').on(
      t.organisationId,
      t.jetonEmpreinte,
    ),
    index('invitation_organisation_id_personne_id_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'invitation_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();
