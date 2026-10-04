import { hash, verify } from '@node-rs/argon2';

/** Paramètres Argon2id recommandés par l'OWASP (19 Mio, 2 itérations, 1 fil). */
// algorithm 2 = Argon2id (énumération constante de @node-rs/argon2, non importable ici).
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, OPTIONS);

export const verifyPassword = ({ hash: digest, password }: { hash: string; password: string }) =>
  verify(digest, password);
