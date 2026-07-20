/**
 * REPLICATION CONTRACT GATE — the engine's conventions vs. every consuming repo.
 *
 * Several things the platform depends on are NOT delivered by the layer: they
 * are files each consuming repo keeps its own copy of (STACK.md §1 / §2 / §5.10
 * — `.prettierrc`, the ESLint flat-config shape, the tsconfig baseline, the
 * `overrides` block, `engines.node`, `.nvmrc`). The layer cannot enforce any of
 * them, so they drift silently: v0.5.2 added `singleAttributePerLine` to the
 * engine's `.prettierrc` and it reached the shell but neither game repo, which
 * left 2XKO formatting `.vue` files against a stale config until 2026-07-20.
 * Nothing caught it because nothing was looking. This script looks.
 *
 * Not every file is byte-identical by design — each repo legitimately ignores
 * its own build dirs and declares its own globals. So each rule below checks the
 * INVARIANT the contract actually names, not file equality:
 *
 *   .prettierrc          deep-equal (genuinely verbatim — it decides formatting)
 *   .nvmrc               equal
 *   engines.node         equal
 *   overrides            deep-equal (the vue-router ^5 peer pin; §1)
 *   tsconfig.base.json   consumer compilerOptions ⊇ the engine's ("replicate OR extend")
 *   eslint.config.mjs    structural: withNuxt(…) with eslintConfigPrettier LAST
 *   layer modules        packages the engine declares in `modules` must be in the
 *                        consumer's OWN devDependencies (§5.10 — remote-layer
 *                        installs are prod-deps-only, so they resolve consumer-side)
 *   SFC block order      every .vue file is template-first (§2, set 2026-07-18)
 *
 * Consumers are discovered by scanning the engine's parent directory for repos
 * whose nuxt.config.ts extends replay-engine — so a new game is covered the day
 * it appears, without editing this file.
 *
 * Run: node scripts/verify-replication.mjs            (auto-discover siblings)
 *      node scripts/verify-replication.mjs ../a ../b  (explicit paths)
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Strip `//` line comments so JSONC config files parse. These files carry only
 *  whole-line comments; anything mid-line (e.g. a URL) is left alone. */
const parseJsonc = (text) =>
  JSON.parse(
    text
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n'),
  );

const readJson = (dir, file) => {
  const p = join(dir, file);
  return existsSync(p) ? parseJsonc(readFileSync(p, 'utf8')) : null;
};
const readText = (dir, file) => {
  const p = join(dir, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Every .vue file under a repo's app/ and fixtures/ (skipping build output). */
function vueFiles(dir) {
  const out = [];
  const skip = new Set(['node_modules', '.nuxt', '.vercel', '.output', 'dist', '.git']);
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      if (skip.has(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.vue')) out.push(p);
    }
  };
  walk(join(dir, 'app'));
  walk(join(dir, 'fixtures'));
  return out;
}

// ── the engine's canonical values ───────────────────────────────────────────
const enginePkg = readJson(ROOT, 'package.json');
const canonical = {
  prettierrc: readJson(ROOT, '.prettierrc'),
  nvmrc: readText(ROOT, '.nvmrc')?.trim(),
  node: enginePkg.engines?.node,
  overrides: enginePkg.overrides,
  tsBase: readJson(ROOT, 'tsconfig.base.json')?.compilerOptions ?? {},
  // Modules the engine declares for consumers; each must exist in their devDeps.
  layerModules: ['@nuxt/eslint'],
};

// ── discover consuming repos ────────────────────────────────────────────────
function discover() {
  const parent = join(ROOT, '..');
  return readdirSync(parent)
    .map((name) => join(parent, name))
    .filter((p) => {
      if (p === ROOT || !existsSync(join(p, 'package.json'))) return false;
      const cfg = readText(p, 'nuxt.config.ts');
      return !!cfg && cfg.includes('replay-engine');
    });
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => (p.startsWith('/') ? p : join(process.cwd(), p)))
  : discover();

if (targets.length === 0) {
  console.error('✗ no consuming repos found next to the engine (and none given as args)');
  process.exit(1);
}

// ── run ─────────────────────────────────────────────────────────────────────
let failures = 0;
const check = (label, ok, actual) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${actual ? `: ${actual}` : ''}`);
};

console.log(`replication contract — engine: ${basename(ROOT)}\n`);

for (const dir of targets) {
  console.log(`[${basename(dir)}]`);
  const pkg = readJson(dir, 'package.json');

  // .prettierrc — verbatim
  const prettierrc = readJson(dir, '.prettierrc');
  check(
    '.prettierrc matches the engine',
    eq(prettierrc, canonical.prettierrc),
    prettierrc
      ? eq(prettierrc, canonical.prettierrc)
        ? 'identical'
        : JSON.stringify(prettierrc)
      : 'MISSING',
  );

  // .nvmrc — verbatim
  const nvmrc = readText(dir, '.nvmrc')?.trim();
  check('.nvmrc matches the engine', nvmrc === canonical.nvmrc, nvmrc ?? 'MISSING');

  // engines.node — verbatim
  const node = pkg?.engines?.node;
  check('engines.node matches the engine', node === canonical.node, node ?? 'MISSING');

  // overrides — the vue-router ^5 peer pin, which does NOT propagate
  check(
    'overrides block replicated',
    eq(pkg?.overrides, canonical.overrides),
    eq(pkg?.overrides, canonical.overrides) ? 'identical' : JSON.stringify(pkg?.overrides ?? null),
  );

  // tsconfig.base.json — replicate OR extend: consumer must carry at least the
  // engine's compilerOptions, with the same values.
  const tsBase = readJson(dir, 'tsconfig.base.json')?.compilerOptions;
  const missingTs = tsBase
    ? Object.entries(canonical.tsBase)
        .filter(([k, v]) => !eq(tsBase[k], v))
        .map(([k]) => k)
    : ['(file missing)'];
  check(
    'tsconfig.base.json carries the strictness baseline',
    missingTs.length === 0,
    missingTs.length ? `missing/differing: ${missingTs.join(', ')}` : 'baseline present',
  );

  // eslint.config.mjs — structure, not bytes: the contract is that
  // eslint-config-prettier is appended LAST to withNuxt(...).
  const eslint = readText(dir, 'eslint.config.mjs');
  if (!eslint) {
    check('eslint.config.mjs shape', false, 'MISSING');
  } else {
    const importsPrettier = /from\s+'eslint-config-prettier(\/flat)?'/.test(eslint);
    const usesWithNuxt = /export\s+default\s+withNuxt\s*\(/.test(eslint);
    // last non-empty token before the closing paren of withNuxt(...)
    const lastArg = /,?\s*eslintConfigPrettier\s*,?\s*\)\s*;?\s*$/m.test(eslint.trimEnd());
    check(
      'eslint.config.mjs: withNuxt(…, eslintConfigPrettier) last',
      importsPrettier && usesWithNuxt && lastArg,
      importsPrettier && usesWithNuxt && lastArg
        ? 'shape ok'
        : `import:${importsPrettier} withNuxt:${usesWithNuxt} prettier-last:${lastArg}`,
    );
  }

  // Layer-declared modules must live in the CONSUMER's devDependencies (§5.10).
  const devDeps = pkg?.devDependencies ?? {};
  const missingMods = canonical.layerModules.filter((m) => !devDeps[m]);
  check(
    'layer modules present in devDependencies',
    missingMods.length === 0,
    missingMods.length ? `missing: ${missingMods.join(', ')}` : canonical.layerModules.join(', '),
  );

  // SFC authoring order — template-first (§2).
  const files = vueFiles(dir);
  const badOrder = files.filter((f) => {
    const first = /^<(template|script|style)/m.exec(readFileSync(f, 'utf8'));
    return first && first[1] !== 'template';
  });
  check(
    'SFC block order is template-first',
    badOrder.length === 0,
    badOrder.length
      ? `${badOrder.length} file(s): ${badOrder.map((f) => f.replace(`${dir}/`, '')).join(', ')}`
      : `${files.length} file(s) checked`,
  );

  console.log('');
}

console.log(
  failures
    ? `✗ ${failures} REPLICATION FAILURE(S) — fix the consuming repo, not the engine`
    : '✓ REPLICATION CONTRACT HOLDS across all consuming repos',
);
process.exit(failures ? 1 : 0);
