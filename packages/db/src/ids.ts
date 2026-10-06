import { v7 as uuidv7 } from 'uuid';

/** Identifiant UUID v7, ordonné dans le temps (conventions de données de l'architecture). */
export function newId(): string {
  return uuidv7();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
