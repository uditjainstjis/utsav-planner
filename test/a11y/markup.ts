import html from '../../public/index.html?raw';

/**
 * The shipped markup, parsed for the structural accessibility checks in test/a11y/.
 *
 * These run in workerd using HTMLRewriter, the same parser the runtime uses, so
 * they need no DOM emulation and cannot drift from what is actually served.
 * They cover the failures that are mechanically detectable — unlabelled
 * controls, missing landmarks, focus traps, inline handlers. The judgement
 * calls that no parser can make (is the focus order sensible, does the live
 * region say something useful) are checked by hand against a screen reader, as
 * docs/ACCESSIBILITY.md records.
 */

export interface Element {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  /** Enclosed by a <label>, which names it implicitly with no `for` needed. */
  inLabel: boolean;
  /** Inside a <template>. Inert until cloned, so it is not part of the
   *  document's heading outline or landmark structure. */
  inTemplate: boolean;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** The shipped page, parsed: its elements in document order, and lookups over them. */
export interface Page {
  elements: Element[];
  ids: ReadonlySet<string>;
  byTag(tag: string): Element[];
}

/** Parse public/index.html with HTMLRewriter, the parser the runtime uses. */
export async function readPage(): Promise<Page> {
  const elements: Element[] = [];
  const ids = new Set<string>();
  const TAGS =
    'html,main,header,footer,nav,section,aside,a,button,input,select,textarea,label,img,h1,h2,h3,h4,fieldset,legend,form,template,script,style,p,div,span,ol,ul,li,blockquote,dl';
  // An open-element stack, so text accrues to every ancestor rather than only
  // the innermost element. A button whose label sits in a nested <span> has an
  // accessible name, and a checker that misses that reports a false failure.
  const open: Element[] = [];
  await new HTMLRewriter()
    .on(TAGS, {
      element(el) {
        const attrs: Record<string, string> = {};
        for (const [k, v] of el.attributes) if (k) attrs[k] = v ?? '';
        if (attrs.id) ids.add(attrs.id);
        const node: Element = {
          tag: el.tagName,
          attrs,
          text: '',
          // Captured from the stack, so each element knows what encloses it.
          inLabel: open.some((a) => a.tag === 'label'),
          inTemplate: open.some((a) => a.tag === 'template'),
        };
        elements.push(node);
        // Void elements have no end tag; asking for one is a parser error.
        if (VOID_TAGS.has(el.tagName)) return;
        open.push(node);
        el.onEndTag(() => {
          const at = open.lastIndexOf(node);
          if (at !== -1) open.splice(at, 1);
        });
      },
      text(chunk) {
        for (const node of open) node.text += chunk.text;
      },
    })
    .transform(new Response(html))
    .text();
  return { elements, ids, byTag: (tag) => elements.filter((e) => e.tag === tag) };
}
