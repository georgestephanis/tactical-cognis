import React from 'react';

// Renders rules text containing the DB's inline markup (<b>, <i>, <u>, <ul>, <li>, <k>)
// as real elements. Parsed via DOMParser and rebuilt as React nodes — no
// dangerouslySetInnerHTML, no attributes copied, unknown tags unwrapped — so a
// hostile uploaded .sqlite can't inject markup.
const TAG_MAP: Record<string, string> = { b: 'b', i: 'i', u: 'u', ul: 'ul', li: 'li' };

function renderNode(node: ChildNode, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(renderNode);
  if (tag === 'k') {
    // ponytail: dashed-underline styling only — the DB has no keyword
    // definitions, and hardcoding them here would embed GW rules text.
    return <span key={key} className="rules-keyword">{children}</span>;
  }
  if (TAG_MAP[tag]) return React.createElement(TAG_MAP[tag], { key }, ...children);
  return <React.Fragment key={key}>{children}</React.Fragment>;
}

export default function RulesText({ text }: { text: string }) {
  if (!text || !text.includes('<')) return <>{text}</>;
  const body = new DOMParser().parseFromString(text, 'text/html').body;
  return <>{Array.from(body.childNodes).map(renderNode)}</>;
}
