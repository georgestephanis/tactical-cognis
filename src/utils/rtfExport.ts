// Client-side RTF export of the Core Rules doc, for local reformatting in Word /
// Pages / etc. Walks the same CoreRuleSection[] data the on-screen view renders,
// converting each field's markup (DB HTML tags + markdown emphasis, via the same
// markdownToHtml() the screen view uses) into RTF control words. No network
// dependency, no images (they're remote CDN URLs — not embedded here).
import type { CoreRuleSection, CoreRuleComponent } from '../types/data';
import { markdownToHtml } from './richText';

function toSigned16(code: number): number {
  return code > 32767 ? code - 65536 : code;
}

function escapeRtf(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (ch === '\n') out += '\\line ';
    else if (code < 0x80) out += ch;
    else if (code > 0xffff) {
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const low = ((code - 0x10000) % 0x400) + 0xdc00;
      out += `\\u${toSigned16(high)}?\\u${toSigned16(low)}?`;
    } else {
      out += `\\u${toSigned16(code)}?`;
    }
  }
  return out;
}

function nodeToRtf(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeRtf(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = () => Array.from(el.childNodes).map(nodeToRtf).join('');
  switch (tag) {
    case 'b':
    case 'k':
      return `{\\b ${children()}}`;
    case 'i':
      return `{\\i ${children()}}`;
    case 'u':
      return `{\\ul ${children()}}`;
    case 'ul':
      return (
        Array.from(el.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map(li => `\\par\\li360\\fi-360 ${escapeRtf('\u2022')}\\tab ${Array.from(li.childNodes).map(nodeToRtf).join('')}`)
          .join('') + '\\par\\li0\\fi0{\\i0\\b0 }'
      );
    default:
      return children();
  }
}

// Rules prose (may contain DB HTML tags and/or markdown emphasis) -> inline RTF.
function inline(raw: string | null | undefined): string {
  if (!raw) return '';
  const body = new DOMParser().parseFromString(markdownToHtml(raw), 'text/html').body;
  return Array.from(body.childNodes).map(nodeToRtf).join('');
}

function block(content: string, opts: { bold?: boolean; italic?: boolean; size?: number; spaceAfter?: number } = {}): string {
  if (!content) return '';
  const bold = opts.bold ? '\\b ' : '';
  const italic = opts.italic ? '\\i ' : '';
  const size = opts.size ? `\\fs${opts.size} ` : '';
  const sa = `\\sa${opts.spaceAfter ?? 160} `;
  return `{\\pard${sa}${size}${bold}${italic}${content}\\par}\n`;
}

function componentToRtf(c: CoreRuleComponent): string {
  switch (c.type) {
    case 'header':
      return c.title ? block(inline(c.title), { bold: true, size: 22 }) : '';
    case 'textBold':
      return block(`${c.title ? `${inline(c.title)} ` : ''}${inline(c.textContent)}`, { bold: true });
    case 'loreAccordion':
      return (
        (c.title ? block(inline(c.title), { bold: true, italic: true, spaceAfter: 40 }) : '') +
        block(inline(c.textContent), { italic: true })
      );
    case 'accordion': {
      const subtitle = c.subtitle ? ` (${inline(c.subtitle)})` : '';
      const title = (c.title || c.subtitle) ? block(`${inline(c.title)}${subtitle}`, { bold: true, spaceAfter: 40 }) : '';
      return title + block(inline(c.textContent));
    }
    case 'triggerEffectAccordion':
      return (
        (c.title ? block(inline(c.title), { bold: true, spaceAfter: 40 }) : '') +
        (c.trigger ? block(`{\\b When: }${inline(c.trigger)}`) : '') +
        (c.effect ? block(`{\\b Then: }${inline(c.effect)}`) : '')
      );
    case 'quote':
      return block(inline(c.textContent), { italic: true });
    case 'boxedText':
      return block(inline(c.textContent));
    case 'image':
      return '';
    case 'bullets':
      return c.bulletPoints.length > 0
        ? c.bulletPoints.map(b => `\\par\\li360\\fi-360 ${escapeRtf('•')}\\tab ${inline(b)}`).join('') + '\\par\\li0\\fi0{\\i0\\b0 }'
        : block(inline(c.textContent));
    case 'text':
    default:
      return block(inline(c.textContent));
  }
}

export function buildCoreRulesRtf(sections: CoreRuleSection[]): string {
  const body = sections
    .map(section => {
      const heading = block(escapeRtf(section.name), { bold: true, size: 32, spaceAfter: 200 });
      const containers = section.containers
        .map(container => {
          const title = container.title
            ? block(`${container.subtitle ? `${escapeRtf(container.subtitle)} ` : ''}${escapeRtf(container.title)}`, { bold: true, size: 24, spaceAfter: 120 })
            : '';
          return title + container.components.map(componentToRtf).join('');
        })
        .join('');
      return heading + containers;
    })
    .join('\\page\n');

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}
\\viewkind4\\uc1\\pard\\f0\\fs24
${block(escapeRtf('Warhammer 40,000 Core Rules'), { bold: true, size: 40, spaceAfter: 240 })}
${body}
}`;
}

export function downloadCoreRulesRtf(sections: CoreRuleSection[]): void {
  const rtf = buildCoreRulesRtf(sections);
  const blob = new Blob([rtf], { type: 'application/rtf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wh40k-core-rules.rtf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
