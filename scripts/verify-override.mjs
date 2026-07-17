/**
 * THEME OVERRIDE CONTRACT GATE — built bundle, both directions.
 *
 * Direction A (override wins): `nuxt generate fixtures` with the committed
 * probe theme (fixtures/app/assets/theme.css, plain :root) and assert the
 * GENERATED bundle's computed styles: overridden tokens carry the probe
 * values, untouched theme tokens keep the engine defaults, structural tokens
 * stay engine-fixed — plus a raw-`@theme` tripwire over every emitted
 * stylesheet (an uncompiled @theme reaches the browser as an unknown at-rule
 * and is silently dropped: the 2XKO Phase-4 regression).
 *
 * Direction B (removal → umbrella): rebuild with the probe theme emptied and
 * assert the umbrella defaults (teal / Space Grotesk) come back.
 *
 * Always probes generated output, NEVER the dev server — dev compiles each
 * CSS file on its own, which masks exactly the failure this gate catches.
 *
 * Run: node scripts/verify-override.mjs   (two fixture builds, ~min)
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = join(ROOT, 'fixtures/app/assets/theme.css');
const OUT = join(ROOT, 'fixtures/.vercel/output/static');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
};

function generate(label) {
  console.log(`  … nuxt generate fixtures (${label})`);
  execSync('npx nuxt generate fixtures', { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
}

/** Serve OUT on an ephemeral port, probe computed styles on <body>, scan CSS. */
async function probe() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const candidates = [join(OUT, path), join(OUT, path, 'index.html'), join(OUT, '404.html')];
    for (const file of candidates) {
      if (existsSync(file) && extname(file)) {
        res.writeHead(file.endsWith('404.html') ? 404 : 200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404).end();
  });
  const base = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  const t = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      primary: s.getPropertyValue('--color-primary').trim().toLowerCase(),
      display: s.getPropertyValue('--font-display').trim(),
      surface: s.getPropertyValue('--color-surface').trim().toLowerCase(),
      cutMd: s.getPropertyValue('--cut-md').trim(),
      durationFast: s.getPropertyValue('--transition-duration-fast').trim(),
    };
  });
  await browser.close();
  server.close();

  const cssDir = join(OUT, '_nuxt');
  t.rawTheme = readdirSync(cssDir)
    .filter((f) => f.endsWith('.css'))
    .filter((f) => /@theme[\s{]/.test(readFileSync(join(cssDir, f), 'utf8')));
  return t;
}

let failures = 0;
const check = (label, ok, actual) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual}`);
};

const original = readFileSync(THEME, 'utf8');
if (!original.includes(':root')) {
  console.error('✗ fixtures/app/assets/theme.css is not the committed :root probe theme');
  process.exit(1);
}

try {
  console.log('[direction A] committed :root probe theme must WIN on the built bundle');
  generate('probe theme present');
  const a = await probe();
  check('--color-primary overridden', a.primary === '#ff2d55', a.primary);
  check('--font-display overridden (Courier New)', a.display.includes('Courier New'), a.display);
  check('--color-surface untouched (engine default)', a.surface === '#12141b', a.surface);
  check('--cut-md structural (engine)', a.cutMd === '14px', a.cutMd);
  // the bundle minifier serializes 140ms as .14s — same value, built-output form
  check(
    '--transition-duration-fast structural (engine)',
    ['140ms', '.14s', '0.14s'].includes(a.durationFast),
    a.durationFast,
  );
  check('no raw @theme in emitted CSS', a.rawTheme.length === 0, a.rawTheme.join(', ') || 'clean');

  console.log('[direction B] probe theme emptied — umbrella defaults must RETURN');
  writeFileSync(THEME, '/* verify-override.mjs: probe theme temporarily emptied */\n');
  generate('probe theme emptied');
  const b = await probe();
  check('--color-primary falls back to umbrella teal', b.primary === '#17cfc8', b.primary);
  check(
    '--font-display falls back to Space Grotesk',
    b.display.includes('Space Grotesk'),
    b.display,
  );
  check('no raw @theme in emitted CSS', b.rawTheme.length === 0, b.rawTheme.join(', ') || 'clean');
} finally {
  writeFileSync(THEME, original);
}

console.log(
  failures
    ? `\n✗ ${failures} FAILURE(S)`
    : '\n✓ OVERRIDE CONTRACT HOLDS (built bundle, both directions)',
);
process.exit(failures ? 1 : 0);
