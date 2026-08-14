import React, { useEffect, useState } from 'react';
import { markdownToHtml } from '../utils/richText';
import { ensureGlossaryLoaded, lookupGlossaryEntry } from '../utils/glossary';

// Renders rules text containing the DB's inline markup (<b>, <i>, <u>, <ul>, <li>, <k>)
// as real elements. Parsed via DOMParser and rebuilt as React nodes — no
// dangerouslySetInnerHTML, no attributes copied, unknown tags unwrapped — so a
// hostile uploaded .sqlite can't inject markup.
const TAG_MAP: Record<string, string> = { b: 'b', i: 'i', u: 'u', ul: 'ul', li: 'li' };

// A <k> keyword span: dashed-underline styling, plus (when the loaded database's
// Core Rules book has a matching entry in "24. Core Abilities") a native hover
// tooltip with the actual rules text — extracted live from the loaded DB, same as
// everything else, never hardcoded here.
function KeywordSpan({ label, children }: { label: string; children: React.ReactNode }) {
  const [definition, setDefinition] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ensureGlossaryLoaded().then(() => {
      if (active) setDefinition(lookupGlossaryEntry(label));
    });
    return () => { active = false; };
  }, [label]);

  return (
    <span className="rules-keyword" title={definition ?? undefined}>{children}</span>
  );
}

function renderNode(node: ChildNode, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(renderNode);
  if (tag === 'k') {
    return <KeywordSpan key={key} label={el.textContent || ''}>{children}</KeywordSpan>;
  }
  if (TAG_MAP[tag]) return React.createElement(TAG_MAP[tag], { key }, ...children);
  return <React.Fragment key={key}>{children}</React.Fragment>;
}

export default function RulesText({ text }: { text: string }) {
  if (!text) return <>{text}</>;
  if (!text.includes('<') && !text.includes('*')) return <>{text}</>;
  const body = new DOMParser().parseFromString(markdownToHtml(text), 'text/html').body;
  return <>{Array.from(body.childNodes).map(renderNode)}</>;
}
