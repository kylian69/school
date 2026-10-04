export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`La variable d'environnement ${name} est obligatoire.`);
  }
  return value;
}
