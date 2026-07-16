import type { Character } from '@engine/types';
import { characterAliases } from './filterReplays';

/** Seconds → "7:01" or "1:02:03". */
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** 12400 → "12.4k", 1200000 → "1.2m". */
export function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

/** Relative label from an ISO date — days like the design, months/years beyond. */
export function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 31) return `${days} days ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(days / 365.25)} yr ago`;
}

/**
 * Two-letter badge initials per the design system: a two-letter alias wins
 * (from `extra.aliases`), otherwise the first two letters of the name.
 */
export function characterInitials(character: Pick<Character, 'name' | 'extra'>): string {
  const two = characterAliases(character).find((a) => a.length === 2);
  return (two ?? character.name.slice(0, 2)).toUpperCase();
}

/** First letter up — for game-term nouns rendered as labels ("champion" → "Champion"). */
export function capWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** CSS-identifier-safe accent id (mirrors the accents plugin's sanitizer). */
export function accentSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Per-character accent, resolved through the injected `--accent-<id>` variable
 * (plugins/accents.ts) — never a raw hex in a component. Fallback is a
 * semantic token reference.
 */
export function accentVar(id: string, fallback = 'var(--color-border)'): string {
  return `var(--accent-${accentSafeId(id)}, ${fallback})`;
}

/** The design's character tile gradient: accent → 20%-alpha accent at 150deg. */
export function accentGradient(id: string): string {
  const accent = accentVar(id);
  return `linear-gradient(150deg, ${accent}, color-mix(in srgb, ${accent} 20%, transparent))`;
}

/** Accent → faded-accent bar fill (usage/pairing bars). */
export function accentBarGradient(fromId: string, toId = fromId): string {
  const from = accentVar(fromId);
  const to = accentVar(toId);
  const tail = fromId === toId ? `color-mix(in srgb, ${to} 33%, transparent)` : to;
  return `linear-gradient(90deg, ${from}, ${tail})`;
}
