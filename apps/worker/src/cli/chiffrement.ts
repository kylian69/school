import { createDatabase, FieldEncryption } from '@scolaly/db';
import { loadWorkerEnv } from '../config/env.js';
import { commandeRotation } from '../rotation-cle.js';

// Rotation de la clé maîtresse (ADR 0006 ; procédure : infra/compose/rotation-cle.sh) :
//   node dist/cli/chiffrement.js etat | rechiffrer | retrait-possible <version>
const env = loadWorkerEnv();
const database = createDatabase(env.DATABASE_URL, { max: 2 });
try {
  process.exitCode = await commandeRotation(process.argv.slice(2), {
    db: database.db,
    keys: env.chiffrement,
    chiffrement: new FieldEncryption(env.chiffrement),
    ecrire: (ligne) => {
      process.stdout.write(`${ligne}\n`);
    },
  });
} finally {
  await database.close();
}
