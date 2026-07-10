/**
 * Refreshes the engine's self-hosted NEUTRAL default fonts (no gstatic) from
 * the installed @fontsource-variable/* packages into tailwind/fonts/, alongside
 * each face's OFL license.
 *
 * The woff2 files are COMMITTED (all three faces are OFL-licensed): consuming
 * games install the engine as a git layer, where devDependencies (fontsource)
 * are pruned — a lifecycle copy step would break their builds. Run manually via
 * `npm run fonts:update` only when bumping font versions.
 *
 * The @font-face rules in tailwind/theme-default.css reference these files with
 * RELATIVE url()s, so Vite emits them as hashed assets under the app's base —
 * base-path-safe with no runtime code (the CSS analogue of withBase()).
 *
 * A consuming *game* self-hosts its own faces the same way: woff2 under
 * app/assets/fonts/, relative url() in app/assets/theme.css.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'tailwind/fonts');

// Latin, variable-weight subsets — enough for the neutral umbrella look.
const fonts = [
  {
    pkg: '@fontsource-variable/space-grotesk',
    file: 'space-grotesk-latin-wght-normal.woff2',
    out: 'space-grotesk.woff2',
    license: 'LICENSE-space-grotesk',
  },
  {
    pkg: '@fontsource-variable/inter',
    file: 'inter-latin-wght-normal.woff2',
    out: 'inter.woff2',
    license: 'LICENSE-inter',
  },
  {
    pkg: '@fontsource-variable/jetbrains-mono',
    file: 'jetbrains-mono-latin-wght-normal.woff2',
    out: 'jetbrains-mono.woff2',
    license: 'LICENSE-jetbrains-mono',
  },
];

await mkdir(outDir, { recursive: true });

let copied = 0;
for (const font of fonts) {
  const pkgDir = resolve(root, 'node_modules', font.pkg);
  const src = resolve(pkgDir, 'files', font.file);
  if (!existsSync(src)) {
    console.warn(`[fonts:update] source missing: ${font.pkg}/files/${font.file} — skipping`);
    continue;
  }
  await copyFile(src, resolve(outDir, font.out));
  const licenseSrc = resolve(pkgDir, 'LICENSE');
  if (existsSync(licenseSrc)) {
    await copyFile(licenseSrc, resolve(outDir, font.license));
  }
  copied += 1;
}

console.log(`[fonts:update] copied ${copied}/${fonts.length} default fonts → tailwind/fonts`);
