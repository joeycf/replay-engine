/**
 * Verifies the THEME OVERRIDE CONTRACT: an app-level theme.css shadowing the
 * engine's semantic tokens must win (app CSS loads after layer CSS), and
 * STRUCTURAL tokens must remain the engine's. Run while the fixtures app
 * carries the temporary probe theme.css.
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });

const t = await page.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    primary: s.getPropertyValue('--color-primary').trim(),
    display: s.getPropertyValue('--font-display').trim(),
    // untouched theme + structural tokens must keep engine values
    surface: s.getPropertyValue('--color-surface').trim(),
    cutMd: s.getPropertyValue('--cut-md').trim(),
    durationFast: s.getPropertyValue('--transition-duration-fast').trim(),
  };
});
await browser.close();

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

console.log('[theme override contract]');
check('--color-primary OVERRIDDEN by app theme.css', t.primary, '#ff2d55');
check('--font-display OVERRIDDEN by app theme.css', t.display, '"Courier New", monospace');
check('--color-surface untouched (engine default)', t.surface, '#131519');
check('--cut-md structural (engine)', t.cutMd, '0.875rem');
check('--duration-fast structural (engine)', t.durationFast, '140ms');

console.log(failures ? `\n✗ ${failures} FAILURE(S)` : '\n✓ OVERRIDE CONTRACT HOLDS');
process.exit(failures ? 1 : 0);
