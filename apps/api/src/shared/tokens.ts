/** Jetons d'injection des ressources partagées. */
export const DATABASE = Symbol('DATABASE');
export const VALKEY = Symbol('VALKEY');
export const AUTH = Symbol('AUTH');
export const ENV = Symbol('ENV');
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export const UPLOADS = Symbol('UPLOADS');
export const EMAILS = Symbol('EMAILS');
/** Chiffrement par champ (ADR 0002), clés lues dans l'environnement. */
export const FIELD_ENCRYPTION = Symbol('FIELD_ENCRYPTION');
