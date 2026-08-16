/**
 * Entity substitution — the load-bearing privacy control.
 *
 * Before ANY egress, sensitive entities (emails, phones, street addresses,
 * SSN/card patterns, names from the local identity list, user-defined
 * never-send terms) are replaced with random opaque tokens (X7Q2Z, M3RKL...).
 * The response is re-substituted back on-device after delivery.
 *
 * Default ON for the paid tier; toggle available. This module is pure —
 * no I/O, no native deps — so it is fully unit-testable and can run in any
 * runtime the app uses (embedded, remote, dev).
 */

export interface EntitySubstitutionOptions {
  /** User-defined terms that must never leave the device. */
  blocklist?: string[];
  /** Contact/identity names to scramble (from the local list). */
  identityNames?: string[];
  /** Enable the pattern pass (emails, phones, addresses, SSN/cards). */
  patterns?: boolean;
  /** Token alphabet/length for generated placeholders. */
  tokenLength?: number;
  /** PRNG seed — tests only; omit in production. */
  seed?: number;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE =
  /(?:\+?1[-. ]?)?(?:\(?\d{3}\)?[-. ]?)\d{3}[-. ]?\d{4}(?!\d)/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_RE = /\b(?:\d[ -]*?){13,16}\b/g;
const ADDRESS_RE =
  /\b\d{1,6}\s+(?:[A-Z][a-z]+(?:\s|\.)){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Ter|Highway|Hwy)\b/g;

const TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_TOKEN_LENGTH = 5;

function makeToken(rng: () => number, length: number): string {
  let token = "";
  for (let i = 0; i < length; i += 1) {
    token += TOKEN_CHARS[Math.floor(rng() * TOKEN_CHARS.length)];
  }
  return token;
}

/** Deterministic-ish RNG so tests can assert stable token output. */
function createRng(seed?: number): () => number {
  let state = seed ?? Date.now();
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export interface SubstitutionResult {
  /** The scrambled text, ready for egress. */
  scrubbed: string;
  /** Mapping token → original entity (device-local, never leaves). */
  map: Map<string, string>;
}

export function substituteEntities(
  text: string,
  options: EntitySubstitutionOptions = {},
): SubstitutionResult {
  const map = new Map<string, string>();
  const rng = createRng(options.seed);
  const tokenLength = options.tokenLength ?? DEFAULT_TOKEN_LENGTH;
  const patterns = options.patterns ?? true;

  const seen = new Set<string>();
  const takeToken = (original: string): string => {
    if (seen.has(original)) {
      for (const [token, value] of map) {
        if (value === original) return token;
      }
    }
    let token = makeToken(rng, tokenLength);
    while (map.has(token)) token = makeToken(rng, tokenLength);
    map.set(token, original);
    seen.add(original);
    return token;
  };

  const replacer = (match: string): string => takeToken(match);

  let out = text;

  // Pass 1: user-defined terms (longest first so overlapping terms win).
  const terms = [...(options.blocklist ?? []), ...(options.identityNames ?? [])]
    .filter((t) => t.length > 1)
    .sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), (m) =>
      takeToken(m),
    );
  }

  // Pass 2: structural patterns.
  if (patterns) {
    out = out
      .replace(EMAIL_RE, replacer)
      .replace(PHONE_RE, replacer)
      .replace(SSN_RE, replacer)
      .replace(CARD_RE, replacer)
      .replace(ADDRESS_RE, replacer);
  }

  return { scrubbed: out, map };
}

export function restoreEntities(
  text: string,
  map: Map<string, string>,
): string {
  let out = text;
  for (const [token, original] of map) {
    out = out.split(token).join(original);
  }
  return out;
}
