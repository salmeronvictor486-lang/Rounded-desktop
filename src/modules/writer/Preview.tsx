import { useMemo } from 'react';
import { docBodyHtml } from './formats/html';
import { normalizeWriterContent, type WriterContent } from './model';
import { documentStyleCss } from './styleCss';
import './writer.css';

/** Miniatura de solo lectura del documento (HTML generado desde el esquema, sin scripts). */
export default function WriterPreview({ content }: { content: WriterContent }) {
  const html = useMemo(() => {
    try {
      return docBodyHtml(normalizeWriterContent(content).doc);
    } catch {
      return '';
    }
  }, [content]);
  const css = documentStyleCss(content.styles, '.doc-preview-inner');
  return (
    <div className="doc-preview">
      {css && <style>{css}</style>}
      <div className="doc-preview-inner" style={{ transform: 'scale(0.42)', width: '238%' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
