// Converts the DB's markdown-style emphasis (**bold**, ***bold italic***) into the
// same inline HTML markup the DB already uses natively (<b>, <i>, <k>), so every
// renderer that walks this markup (RulesText, the RTF exporter) only has to
// understand one representation. A bracketed phrase like **[SUSTAINED HITS D3]**
// is a core-ability keyword reference — the same convention as <k>[X]</k> used
// elsewhere in the DB — not flavor emphasis, so it becomes a <k> tag instead of
// plain bold (making it eligible for the hover glossary in RulesText).
export function markdownToHtml(text: string): string {
  const wrap = (inner: string, italic: boolean) => {
    if (/^\[[^\]]+\]$/.test(inner.trim())) return `<k>${inner}</k>`;
    return italic ? `<b><i>${inner}</i></b>` : `<b>${inner}</b>`;
  };
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, (_, inner) => wrap(inner, true))
    .replace(/\*\*(.+?)\*\*/g, (_, inner) => wrap(inner, false));
}
