import { describe, expect, it } from 'vitest';
import { isPermission, PERMISSIONS } from './permissions.js';

describe('RG-01-14 catalogue des permissions', () => {
  it('chaque permission est un couple ressource:action décrit en français', () => {
    for (const [permission, description] of Object.entries(PERMISSIONS)) {
      expect(permission).toMatch(/^[a-z-]+:[a-z-]+$/);
      expect(description.length).toBeGreaterThan(10);
    }
  });

  it('reconnaît les permissions du catalogue et elles seules', () => {
    expect(isPermission('organisation:lire')).toBe(true);
    expect(isPermission('organisation:supprimer')).toBe(false);
    expect(isPermission('toString')).toBe(false);
  });
});
