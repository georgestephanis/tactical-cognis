// Client-side standalone HTML export of the Core Rules doc. Unlike the RTF
// export, images are simply referenced by their original CDN URL (an <img
// src>), so there's no network fetch, no CORS dependency, and nothing that can
// silently fail — anything the on-screen view can show, this can show.
//
// Walks the same CoreRuleSection[] data as rtfExport.ts and follows the same
// defensive parsing model as RulesText.tsx: DB text is parsed via DOMParser
// and rebuilt one allowlisted tag at a time (escaping everything else), never
// concatenated in as raw HTML — a hostile uploaded .sqlite can't inject markup
// into the exported file.
import type { CoreRuleSection, CoreRuleComponent } from '../types/data';
import { markdownToHtml } from './richText';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nodeToHtml(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = () => Array.from(el.childNodes).map(nodeToHtml).join('');
  switch (tag) {
    case 'b':
      return `<strong>${children()}</strong>`;
    case 'k':
      return `<span class="keyword">${children()}</span>`;
    case 'i':
      return `<em>${children()}</em>`;
    case 'u':
      return `<u>${children()}</u>`;
    case 'ul':
      return `<ul>${Array.from(el.children)
        .filter(c => c.tagName.toLowerCase() === 'li')
        .map(li => `<li>${Array.from(li.childNodes).map(nodeToHtml).join('')}</li>`)
        .join('')}</ul>`;
    default:
      return children();
  }
}

// Rules prose (may contain DB HTML tags and/or markdown emphasis) -> sanitized inline HTML.
function inline(raw: string | null | undefined): string {
  if (!raw) return '';
  const body = new DOMParser().parseFromString(markdownToHtml(raw), 'text/html').body;
  return Array.from(body.childNodes).map(nodeToHtml).join('');
}

function componentToHtml(c: CoreRuleComponent): string {
  switch (c.type) {
    case 'header':
      return c.title ? `<h4>${inline(c.title)}</h4>` : '';
    case 'textBold':
      return `<p class="bold">${c.title ? `<strong>${inline(c.title)}</strong> ` : ''}${inline(c.textContent)}</p>`;
    case 'loreAccordion':
      return `<div class="box lore">${c.title ? `<div class="box-title">${inline(c.title)}</div>` : ''}<p>${inline(c.textContent)}</p></div>`;
    case 'accordion': {
      const subtitle = c.subtitle ? ` <span class="subtitle">(${inline(c.subtitle)})</span>` : '';
      const title = (c.title || c.subtitle) ? `<div class="box-title">${inline(c.title)}${subtitle}</div>` : '';
      return `<div class="box">${title}<p>${inline(c.textContent)}</p></div>`;
    }
    case 'triggerEffectAccordion':
      return `<div class="box">${c.title ? `<div class="box-title">${inline(c.title)}</div>` : ''}${
        c.trigger ? `<p><strong>When:</strong> ${inline(c.trigger)}</p>` : ''
      }${c.effect ? `<p><strong>Then:</strong> ${inline(c.effect)}</p>` : ''}</div>`;
    case 'quote':
      return `<blockquote>${inline(c.textContent)}</blockquote>`;
    case 'boxedText':
      return `<div class="box"><p>${inline(c.textContent)}</p></div>`;
    case 'image':
      return c.imageUrl
        ? `<img class="rules-image" src="${escapeHtml(c.imageUrl)}" alt="${escapeHtml(c.title || '')}" loading="lazy" />`
        : '';
    case 'bullets':
      return c.bulletPoints.length > 0
        ? `<ul>${c.bulletPoints.map(b => `<li>${inline(b)}</li>`).join('')}</ul>`
        : `<p>${inline(c.textContent)}</p>`;
    case 'text':
    default:
      return c.textContent ? `<p>${inline(c.textContent)}</p>` : '';
  }
}

const STYLE = `
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; background: #fff; max-width: 52rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; line-height: 1.45; }
  h1 { font-size: 1.8rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.4rem; border-bottom: 2px solid #111; padding-bottom: 0.25rem; margin-top: 2.5rem; }
  h3 { font-size: 1.15rem; margin-top: 1.75rem; }
  h4 { font-size: 1rem; margin: 1rem 0 0.25rem; }
  .container-number { font-weight: bold; margin-right: 0.4em; }
  p { margin: 0.5rem 0; }
  p.bold { font-weight: bold; }
  .box { border: 1px solid #999; border-radius: 6px; padding: 0.75rem 1rem; margin: 0.75rem 0; background: #f7f7f5; }
  .box-title { font-weight: bold; }
  .box.lore { font-style: italic; background: #f2f0ea; }
  .subtitle { font-weight: normal; }
  blockquote { font-style: italic; border-left: 3px solid #999; margin: 0.75rem 0; padding-left: 1rem; }
  .keyword { border-bottom: 1px dashed #666; }
  .rules-image { max-width: 100%; display: block; margin: 0.75rem 0; }
  ul { margin: 0.5rem 0; padding-left: 1.5rem; }
  @media print {
    body { max-width: none; padding: 0; }
    .box, blockquote { break-inside: avoid; }
  }
`;

export function buildCoreRulesHtml(sections: CoreRuleSection[]): string {
  const body = sections
    .map(section => {
      const containers = section.containers
        .map(container => {
          const title = container.title
            ? `<h3>${container.subtitle ? `<span class="container-number">${escapeHtml(container.subtitle)}</span>` : ''}${escapeHtml(container.title)}</h3>`
            : '';
          return `<div>${title}${container.components.map(componentToHtml).join('')}</div>`;
        })
        .join('');
      return `<h2>${escapeHtml(section.name)}</h2>${containers}`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Warhammer 40,000 Core Rules</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Warhammer 40,000 Core Rules</h1>
${body}
</body>
</html>
`;
}

export function downloadCoreRulesHtml(sections: CoreRuleSection[]): void {
  const html = buildCoreRulesHtml(sections);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wh40k-core-rules.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
