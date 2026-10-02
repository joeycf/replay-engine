/**
 * Inject prerenderable JSON-LD structured data (each node gets @context).
 *
 * Deliberately NO VideoObject anywhere on the site. The full replay list is
 * client-fetched from /data/replays.json; since v0.18.0 the Browse and
 * character pages prerender their newest few records as text, but a replay
 * still has no page of its own — it opens in the ?v= modal — and a VideoObject
 * needs a URL that is a page.
 */
export function useJsonLd(nodes: Record<string, unknown>[]) {
  useHead({
    script: nodes.map((n) => ({
      type: 'application/ld+json',
      // escape '<' so a literal '</script>' in data can't break out of the tag
      innerHTML: JSON.stringify({ '@context': 'https://schema.org', ...n }).replace(
        /</g,
        '\\u003c',
      ),
    })),
  });
}
