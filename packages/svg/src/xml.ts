/**
 * A tiny XML reader for the SVG subset — elements, attributes (either quote
 * style), nesting, self-closing tags. Comments / declarations / doctype are
 * stripped; text content is ignored (glissade SVG import is shape-only). Not a
 * general XML parser; just enough to walk an SVG's element tree.
 */

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Parse SVG source into its root element tree, or null if there's no element. */
export function parseXml(src: string): XmlNode | null {
  const clean = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const root: XmlNode = { tag: '#root', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(clean)) !== null) {
    const [, close, tag, attrStr, selfClose] = m;
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    let a: RegExpExecArray | null;
    ATTR.lastIndex = 0;
    while ((a = ATTR.exec(attrStr!)) !== null) attrs[a[1]!] = a[2] ?? a[3] ?? '';
    const node: XmlNode = { tag: tag!, attrs, children: [] };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children[0] ?? null;
}
