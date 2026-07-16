import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Nuxt } from 'nuxt/schema';
import { createJiti } from 'jiti';
import { defu } from 'defu';
import type { GameConfig } from '../types';

/**
 * Build-time GameConfig resolution, shared by the static-artifacts module and
 * the engine's route-segment remapper (nuxt.config `engineCharacterRoutes`).
 * Lives in lib/ (NOT modules/ — Nuxt auto-registers every modules/*.ts file
 * as a Nuxt module, and this is a plain util).
 *
 * app/app.config.ts content is runtime app config and never lands in
 * nuxt.options.appConfig (verified empirically — STACK §5.12), so build-time
 * consumers re-do Nuxt's merge themselves: jiti-import each layer's
 * app/app.config.* (with a defineAppConfig shim) and defu-merge in layer
 * priority (app over engine).
 */
export async function loadMergedGameConfig(nuxt: Nuxt): Promise<GameConfig | undefined> {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const g = globalThis as Record<string, unknown>;
  const prev = g.defineAppConfig;
  // app.config files use the defineAppConfig macro (auto-injected in the app
  // build); shim it for a plain node import
  g.defineAppConfig = (c: unknown) => c;
  const configs: Record<string, unknown>[] = [];
  try {
    // _layers[0] is the app, later entries the extended layers — defu keeps
    // earlier arguments' values, matching Nuxt's app-over-layer merge
    for (const layer of nuxt.options._layers) {
      const srcDir = layer.config?.srcDir ?? join(layer.cwd ?? '', 'app');
      for (const ext of ['ts', 'mts', 'js', 'mjs']) {
        const file = join(srcDir, `app.config.${ext}`);
        if (existsSync(file)) {
          configs.push((await jiti.import(file, { default: true })) as Record<string, unknown>);
          break;
        }
      }
    }
  } finally {
    if (prev === undefined) delete g.defineAppConfig;
    else g.defineAppConfig = prev;
  }
  const merged = defu({}, ...(configs as [Record<string, unknown>])) as { game?: GameConfig };
  return merged.game;
}

/** The characters-section URL segment, normalized ('characters' default). */
export function characterSegment(game: GameConfig | undefined): string {
  return (game?.characterRouteSegment || 'characters').replace(/^\/+|\/+$/g, '');
}
