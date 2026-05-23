import { marked } from 'marked';

export function MarkdownPreview({ source }: { source: string }) {
  const html = marked.parse(source) as string;
  return <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
