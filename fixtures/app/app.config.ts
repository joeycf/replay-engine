import type { GameConfig } from '../../types';

/**
 * The fixture game config, merged OVER the engine's neutral default. Sets
 * charactersPerSide: 2 and filters.coOccurrence: true so standalone dev
 * exercises multi-character side rendering AND the gated co-occurrence filter
 * (which appears only because this fixture is a 2-per-side "tag" game). A real
 * game ships an equivalent app/app.config.ts in its own repo.
 */
export default defineAppConfig({
  game: {
    id: 'fixture-arena',
    slug: 'fixtures',
    name: 'Fixture Arena',
    shortName: 'FIXTURE',
    rightsHolder: 'the Fixture rights holder',
    baseURL: '/',
    siteUrl: 'https://replaydatabase.com',
    charactersPerSide: 2,
    accents: {
      aegis: '#e0563b',
      bolt: '#3ba7e9',
      cinder: '#c74bd8',
    },
    filters: {
      coOccurrence: true,
      rank: false,
    },
    sourceChannels: [
      { id: 'ch-neon', name: 'Neon Archives' },
      { id: 'ch-vault', name: 'The Vault' },
    ],
  } satisfies GameConfig,
});
