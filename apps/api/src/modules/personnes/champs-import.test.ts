import { CHAMPS_IMPORT as CHAMPS_CONTRAT } from '@scolaly/contracts';
import { CHAMPS_IMPORT as CHAMPS_DOMAINE } from '@scolaly/domain';
import { describe, expect, it } from 'vitest';

describe('champs importables', () => {
  it('le contrat et le domaine listent les mêmes champs', () => {
    expect([...CHAMPS_CONTRAT]).toEqual([...CHAMPS_DOMAINE]);
  });
});
