import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

export type SupportedLang = 'json' | 'markdown' | 'html' | 'text';

const THEME_NAME = 'github-dark-default';

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark-default')],
      langs: [
        import('@shikijs/langs/json'),
        import('@shikijs/langs/markdown'),
        import('@shikijs/langs/html'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  }
  return highlighterPromise;
}

export const SHIKI_THEME = THEME_NAME;

export function detectLanguage(raw: string): SupportedLang {
  const text = raw.trim();
  if (!text) return 'text';

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      // fall through
    }
  }

  if (looksLikeHtml(text)) return 'html';
  if (looksLikeMarkdown(text)) return 'markdown';
  return 'text';
}

function looksLikeHtml(text: string): boolean {
  if (/<!doctype\s+html/i.test(text)) return true;
  if (/<\/?(?:html|head|body|div|span|p|a|img|ul|ol|li|table|tr|td|h[1-6]|script|style|section|article|header|footer|nav|main|button|input|form|iframe|svg)\b/i.test(text)) {
    const tagMatches = text.match(/<\/?[a-zA-Z][^>]*>/g);
    if (tagMatches && tagMatches.length >= 2) return true;
  }
  return false;
}

function looksLikeMarkdown(text: string): boolean {
  const signals = [
    /^#{1,6}\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^```[\w-]*\s*$/m,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|\s)\*\*[^*\n]+\*\*/,
    /(^|\s)_[^_\n]+_/,
    /^>\s+\S/m,
    /^\|.+\|.+\|/m,
  ];
  let hits = 0;
  for (const re of signals) {
    if (re.test(text)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}
