import { expect, type Page } from '@playwright/test';

export const CAMILLE = { email: 'camille@exemple.test', motDePasse: 'mot de passe des tests e2e' };

export const EQUIPE = { email: 'equipe@plateforme.exemple.test', motDePasse: CAMILLE.motDePasse };

export async function seConnecter(page: Page, compte = CAMILLE): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse email').fill(compte.email);
  await page.getByLabel('Mot de passe').fill(compte.motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Bonjour/);
}
