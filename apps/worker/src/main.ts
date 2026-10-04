// Point d'entrée du worker : les consommateurs BullMQ et le planificateur arrivent en I0.3.
const keepAlive = setInterval(() => undefined, 60_000);

function shutdown(signal: NodeJS.Signals): void {
  console.warn(`Worker arrêté (${signal}).`);
  clearInterval(keepAlive);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
console.warn('Worker démarré.');
