import { expect, type Page } from '@playwright/test';

export const CAMILLE = { email: 'camille@exemple.test', motDePasse: 'mot de passe des tests e2e' };

export async function seConnecter(page: Page): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse email').fill(CAMILLE.email);
  await page.getByLabel('Mot de passe').fill(CAMILLE.motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bonjour Camille.' })).toBeVisible();
}
