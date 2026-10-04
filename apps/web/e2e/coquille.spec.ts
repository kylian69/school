import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

const ouvrirMenuSiMobile = async (page: Page, mobile: boolean) => {
  if (mobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
};

test.describe("Coquille de l'application", () => {
  test('sans session, renvoie vers la page de connexion', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test("après connexion, présente l'accueil et la navigation", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile-360';
    await seConnecter(page);
    await expect(page).toHaveTitle('Tableau de bord · Scolaly');
    await ouvrirMenuSiMobile(page, mobile);
    const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(navigation.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('camille@exemple.test').filter({ visible: true })).toBeVisible();
  });

  test("ACC-01 n'a aucune violation d'accessibilité, en clair comme en sombre", async ({
    page,
  }) => {
    await seConnecter(page);
    await expectNoAccessibilityViolations(page);
  });

  test('ouvre la recherche globale avec ⌘K / Ctrl+K', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Raccourci clavier propre à l’ordinateur');
    await seConnecter(page);
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Recherche globale' });
    await expect(palette).toBeVisible();
    await page.keyboard.type('Dupont');
    await expect(palette.getByText(/Aucun résultat/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('change de thème et se souvient du choix', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile-360';
    await seConnecter(page);
    await ouvrirMenuSiMobile(page, mobile);
    await page.getByRole('radio', { name: 'Sombre' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('se déconnecte et revient à la page de connexion', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile-360';
    await seConnecter(page);
    await ouvrirMenuSiMobile(page, mobile);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/connexion$/);
  });
});

test.describe('Sécurité et PWA', () => {
  test('envoie une politique de sécurité du contenu stricte, avec un nonce par requête', async ({
    request,
  }) => {
    const premiere = (await request.get('/connexion')).headers()['content-security-policy'];
    const seconde = (await request.get('/connexion')).headers()['content-security-policy'];
    expect(premiere).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(premiere).toContain("frame-ancestors 'none'");
    expect(premiere).not.toContain('unsafe-eval');
    expect(premiere).not.toBe(seconde);
  });

  test('publie un manifeste installable', async ({ request }) => {
    const manifeste = (await (await request.get('/manifest.webmanifest')).json()) as {
      display: string;
      lang: string;
      icons: { sizes: string; purpose: string }[];
    };
    expect(manifeste).toMatchObject({ display: 'standalone', lang: 'fr' });
    expect(manifeste.icons.map((i) => `${i.sizes}/${i.purpose}`)).toEqual(
      expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
    );
  });

  test('affiche la page hors ligne quand le réseau est coupé', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Même comportement sur les deux formats');
    await page.goto('/connexion');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await context.setOffline(true);
    await page.goto('/connexion');
    await expect(page.getByRole('heading', { name: 'Hors ligne' })).toBeVisible();
    await context.setOffline(false);
  });
});
