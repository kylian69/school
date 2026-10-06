import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from '@scolaly/db';
import type { Access } from './access-resolver.js';

interface RequestState {
  access: Access;
  tx: Transaction;
  /** Actions à lancer une fois la transaction validée (emails, notifications). */
  apresValidation: (() => Promise<void>)[];
}

const storage = new AsyncLocalStorage<RequestState>();

/**
 * Contexte de la requête en cours : droits et transaction limitée à l'organisation active.
 * Les services passent par `RequestContext.tx()` : toute requête SQL d'un traitement protégé
 * est donc soumise à la RLS de la bonne organisation.
 */
export const RequestContext = {
  run<T>(state: RequestState, work: () => Promise<T>): Promise<T> {
    return storage.run(state, work);
  },
  access(): Access {
    return current().access;
  },
  tx(): Transaction {
    return current().tx;
  },
  /** Programme une action après la validation de la transaction (jamais si elle échoue). */
  apresValidation(action: () => Promise<void>): void {
    current().apresValidation.push(action);
  },
};

function current(): RequestState {
  const state = storage.getStore();
  if (!state) {
    throw new Error(
      "Aucun contexte d'organisation : ce traitement doit être appelé depuis une route @RequirePermission.",
    );
  }
  return state;
}
