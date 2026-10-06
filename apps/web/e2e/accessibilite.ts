import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** RGAA 4 / WCAG 2.2 AA (ACC-01) : aucune violation détectée automatiquement, thèmes clair et sombre. */
export async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction(
      (scheme) => document.documentElement.classList.contains(scheme),
      colorScheme,
    );
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, `Thème ${colorScheme}`).toEqual([]);
  }
}
