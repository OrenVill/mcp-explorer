export const MAX_CALLS = 20;
export const MAX_CALLS_WITH_SWEEP = 60;
export const MAX_CONCURRENCY = 5;
export const MAX_TOOLS = 500;
export const TOTAL_TIMEOUT_MS = 30_000;
export const PER_CALL_TIMEOUT_MS = 10_000;
export const CONSECUTIVE_ERROR_LIMIT = 3;

/** Stops the search probe loop once this many consecutive probes add 0 new tools. */
export const SEARCH_STABILITY_PROBES = 2;

/** Probe inputs tried for `search` meta-tools, in priority order. */
export const SEARCH_PROBE_SEQUENCE: readonly string[] = [
  '', '*', '%', ' ', '.', 'a', 'e', 'o', 'the', 'tool',
];

/** Appended after SEARCH_PROBE_SEQUENCE when the user opts into the alphabet sweep. */
export const ALPHABET_SWEEP: readonly string[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
];
