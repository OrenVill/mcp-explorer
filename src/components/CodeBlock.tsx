import { useEffect, useState } from 'react';
import { detectLanguage, getHighlighter, SHIKI_THEME, type SupportedLang } from '../lib/highlighter';

interface Props {
  code: string;
  lang?: SupportedLang;
  className?: string;
}

export function CodeBlock({ code, lang, className }: Props) {
  const resolvedLang: SupportedLang = lang ?? detectLanguage(code);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (resolvedLang === 'text') {
      setHtml(null);
      return;
    }
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        setHtml(
          hl.codeToHtml(code, {
            lang: resolvedLang,
            theme: SHIKI_THEME,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, resolvedLang]);

  const wrapper = `shiki-block text-xs leading-relaxed ${className ?? ''}`;

  if (resolvedLang === 'text' || html === null) {
    return (
      <pre className={`${wrapper} whitespace-pre-wrap break-words p-4 font-mono text-zinc-100`}>
        {code}
      </pre>
    );
  }

  return <div className={wrapper} dangerouslySetInnerHTML={{ __html: html }} />;
}
