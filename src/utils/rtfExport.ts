// Client-side RTF export of the Core Rules doc, for local reformatting in Word /
// Pages / etc. Walks the same CoreRuleSection[] data the on-screen view renders,
// converting each field's markup (DB HTML tags + markdown emphasis, via the same
// markdownToHtml() the screen view uses) into RTF control words.
//
// Images (the remote CDN `imageUrl` on 'image' components, which is how the
// source data represents rules tables/diagrams too) are embedded best-effort:
// fetched and hex-encoded into a \pict block. That fetch can fail — the CDN
// may not send CORS headers for a cross-origin read — in which case we fall
// back to a plain hyperlink to the image rather than silently dropping it.
// The HTML export (htmlExport.ts) has no such dependency, since it just
// references the URL directly via <img src>.
import type { CoreRuleSection, CoreRuleComponent } from '../types/data';
import { markdownToHtml } from './richText';

interface EmbeddedImage {
  keyword: 'pngblip' | 'jpegblip';
  hex: string;
  picw: number;
  pich: number;
  picwgoal: number;
  pichgoal: number;
}

function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const MAX_WIDTH_TWIPS = 8640; // 6in, a safe fit inside a letter/A4 page margin
const TWIPS_PER_PX = 15; // at the assumed 96dpi source resolution

async function fetchImageForRtf(url: string): Promise<EmbeddedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpeg) return null;

    const dims = await getImageDimensions(new Blob([buf]));
    if (!dims || dims.width <= 0 || dims.height <= 0) return null;

    const nativeWidthTwips = dims.width * TWIPS_PER_PX;
    const scale = Math.min(1, MAX_WIDTH_TWIPS / nativeWidthTwips);

    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');

    return {
      keyword: isPng ? 'pngblip' : 'jpegblip',
      hex,
      picw: dims.width,
      pich: dims.height,
      picwgoal: Math.round(nativeWidthTwips * scale),
      pichgoal: Math.round(dims.height * TWIPS_PER_PX * scale),
    };
  } catch {
    return null;
  }
}

async function fetchAllImages(sections: CoreRuleSection[]): Promise<Map<string, EmbeddedImage | null>> {
  const urls = new Set<string>();
  sections.forEach(section =>
    section.containers.forEach(container =>
      container.components.forEach(c => {
        if (c.type === 'image' && c.imageUrl) urls.add(c.imageUrl);
      })
    )
  );
  const entries = await Promise.all(
    Array.from(urls).map(async url => [url, await fetchImageForRtf(url)] as const)
  );
  return new Map(entries);
}

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

function imageToRtf(c: CoreRuleComponent, images: Map<string, EmbeddedImage | null>): string {
  if (!c.imageUrl) return '';
  const embedded = images.get(c.imageUrl);
  if (embedded) {
    return `{\\pard\\qc\\sa160 {\\pict\\${embedded.keyword}\\picw${embedded.picw}\\pich${embedded.pich}\\picwgoal${embedded.picwgoal}\\pichgoal${embedded.pichgoal} ${embedded.hex}}\\par}\n`;
  }
  // Embedding failed (likely a CORS-blocked fetch) — link out to the image rather
  // than silently dropping content that may be a rules table/diagram.
  const label = escapeRtf(c.title || 'View image');
  return block(`{\\field{\\*\\fldinst HYPERLINK "${escapeRtf(c.imageUrl)}"}{\\fldrslt\\ul ${label}}}`, { italic: true });
}

function componentToRtf(c: CoreRuleComponent, images: Map<string, EmbeddedImage | null>): string {
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
      return imageToRtf(c, images);
    case 'bullets':
      return c.bulletPoints.length > 0
        ? c.bulletPoints.map(b => `\\par\\li360\\fi-360 ${escapeRtf('•')}\\tab ${inline(b)}`).join('') + '\\par\\li0\\fi0{\\i0\\b0 }'
        : block(inline(c.textContent));
    case 'text':
    default:
      return block(inline(c.textContent));
  }
}

export async function buildCoreRulesRtf(sections: CoreRuleSection[]): Promise<string> {
  const images = await fetchAllImages(sections);

  const body = sections
    .map(section => {
      const heading = block(escapeRtf(section.name), { bold: true, size: 32, spaceAfter: 200 });
      const containers = section.containers
        .map(container => {
          const title = container.title
            ? block(`${container.subtitle ? `${escapeRtf(container.subtitle)} ` : ''}${escapeRtf(container.title)}`, { bold: true, size: 24, spaceAfter: 120 })
            : '';
          return title + container.components.map(c => componentToRtf(c, images)).join('');
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

export async function downloadCoreRulesRtf(sections: CoreRuleSection[]): Promise<void> {
  const rtf = await buildCoreRulesRtf(sections);
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
