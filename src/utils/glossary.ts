// Lazy, app-wide singleton cache for the core-ability hover glossary (see
// getCoreAbilityGlossary in db.ts). Loaded once on first use so every <k> keyword
// span across the app can do a cheap synchronous lookup after that.
import { getCoreAbilityGlossary } from './db';

let glossaryPromise: Promise<void> | null = null;
let glossaryCache: Record<string, string> = {};

export function normalizeKeywordName(raw: string): string {
  return raw.replace(/^\[|\]$/g, '').trim().toUpperCase();
}

export function ensureGlossaryLoaded(): Promise<void> {
  if (!glossaryPromise) {
    glossaryPromise = getCoreAbilityGlossary()
      .then(g => { glossaryCache = g; })
      .catch(() => { glossaryCache = {}; });
  }
  return glossaryPromise;
}

/**
 * Plain-text definition for a keyword label (e.g. "[DEVASTATING WOUNDS]" or
 * "DEVASTATING WOUNDS"), suitable for a native `title` tooltip. Returns null if
 * the glossary hasn't loaded yet or has no entry for this keyword.
 */
export function lookupGlossaryEntry(rawLabel: string): string | null {
  const html = glossaryCache[normalizeKeywordName(rawLabel)];
  if (!html) return null;
  const plain = html.replace(/\*\*\*/g, '').replace(/\*\*/g, '');
  const body = new DOMParser().parseFromString(plain, 'text/html').body;
  return (body.textContent || '').replace(/\s+/g, ' ').trim();
}
