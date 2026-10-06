// Génère les icônes PNG de la PWA à partir du symbole Scolaly (carré indigo évidé).
// Usage : node scripts/generate-icons.mjs (Chromium de Playwright requis).
import { chromium } from '@playwright/test';

const ACCENT = '#4F46E5';
const SURFACE = '#FFFFFF';

/** Symbole sur fond transparent ; `safeZone` réduit le symbole pour les icônes « maskable ». */
const svg = (size, { safeZone = 1, background = 'none' } = {}) => {
  const scale = (size * safeZone) / 26;
  const offset = (size - size * safeZone) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <rect width="26" height="26" rx="${background === 'none' ? 8 : 0}" fill="${ACCENT}"/>
    <rect x="6" y="6" width="8" height="8" rx="2.5" fill="${SURFACE}"/>
    <rect x="15" y="15" width="5" height="5" rx="1.5" fill="${SURFACE}"/>
  </g></svg>`;
};

const icons = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['apple-touch-icon.png', 180, { background: ACCENT, safeZone: 0.8 }],
  ['icon-maskable-512.png', 512, { background: ACCENT, safeZone: 0.6 }],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, options] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size, options)}</body></html>`,
  );
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
}
await browser.close();
console.warn('Icônes écrites dans public/icons.');
