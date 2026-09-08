// A minimal, best-effort polyfill of the Workers-runtime HTMLRewriter,
// installed as a global ONLY for the Node/vitest test environment (see
// vitest.config.ts's `setupFiles`). Production code always runs on the
// real Cloudflare Workers runtime, which provides the genuine
// HTMLRewriter — this polyfill exists purely so tests exercising
// src/worker/lib/sanitizeHtml.ts (and anything that calls it) can run
// under plain Node, where that global doesn't exist.
//
// Implements only the subset of the API sanitizeHtml.ts actually uses:
// `.on(selector, { element })`, `.transform(response)`, and on Element:
// tagName, attributes, getAttribute/setAttribute/removeAttribute, remove(),
// removeAndKeepContent(). This is NOT a spec-compliant HTML parser — it's a
// simple regex-based tokenizer good enough for the well-formed HTML this
// project's editor and tests produce. It is never used in production.

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"
]);

class FakeElement {
  tagName: string;
  private attrs: Map<string, string>;
  action: "remove" | "unwrap" | null = null;

  constructor(tagName: string, attrs: Map<string, string>) {
    this.tagName = tagName;
    this.attrs = attrs;
  }

  get attributes(): IterableIterator<[string, string]> {
    return this.attrs.entries();
  }

  getAttribute(name: string): string | null {
    const v = this.attrs.get(name.toLowerCase());
    return v === undefined ? null : v;
  }

  setAttribute(name: string, value: string): this {
    this.attrs.set(name.toLowerCase(), value);
    return this;
  }

  removeAttribute(name: string): this {
    this.attrs.delete(name.toLowerCase());
    return this;
  }

  remove(): this {
    this.action = "remove";
    return this;
  }

  removeAndKeepContent(): this {
    this.action = "unwrap";
    return this;
  }

  serializeOpenTag(): string {
    const attrStr = Array.from(this.attrs.entries())
      .map(([k, v]) => ` ${k}="${v.replace(/"/g, "&quot;")}"`)
      .join("");
    return `<${this.tagName}${attrStr}${VOID_ELEMENTS.has(this.tagName) ? " /" : ""}>`;
  }
}

type ElementHandler = { element?: (el: FakeElement) => void | Promise<void> };

class FakeHTMLRewriter {
  private handlers: Array<{ tags: Set<string> | "*"; handler: ElementHandler }> = [];

  on(selector: string, handler: ElementHandler): this {
    const tags = selector.trim() === "*" ? ("*" as const) : new Set(selector.split(",").map((s) => s.trim().toLowerCase()));
    this.handlers.push({ tags, handler });
    return this;
  }

  onDocument(): this {
    return this;
  }

  transform(response: Response): Response {
    const self = this;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const html = await response.text();
        const out = await self.process(html);
        controller.enqueue(new TextEncoder().encode(out));
        controller.close();
      }
    });
    return new Response(stream, response);
  }

  private async process(html: string): Promise<string> {
    const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^<>]*)?)\s*(\/?)>/g;
    let out = "";
    let lastIndex = 0;
    // Stack of { tagName, action } for open (non-void) elements.
    const stack: Array<{ tagName: string; action: "remove" | "unwrap" | null }> = [];
    const isSkipping = () => stack.some((s) => s.action === "remove");

    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(html))) {
      const text = html.slice(lastIndex, match.index);
      if (text && !isSkipping()) out += text;
      lastIndex = tagRe.lastIndex;

      const [, closeName, openName, attrString, selfClose] = match;

      if (closeName) {
        const tagName = closeName.toLowerCase();
        // Pop the nearest matching open tag (best-effort; assumes
        // reasonably well-formed input, which is fine for a test-only
        // polyfill of well-formed editor output).
        const idx = [...stack].reverse().findIndex((s) => s.tagName === tagName);
        if (idx !== -1) {
          const realIdx = stack.length - 1 - idx;
          const [popped] = stack.splice(realIdx, 1);
          if (popped.action === null && !isSkipping()) out += `</${tagName}>`;
        }
        continue;
      }

      if (openName) {
        const tagName = openName.toLowerCase();
        const attrs = new Map<string, string>();
        const attrRe = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        let am: RegExpExecArray | null;
        while ((am = attrRe.exec(attrString ?? ""))) {
          const name = am[1].toLowerCase();
          const value = am[2] ?? am[3] ?? am[4] ?? "";
          if (name) attrs.set(name, value);
        }

        const el = new FakeElement(tagName, attrs);
        if (!isSkipping()) {
          for (const { tags, handler } of this.handlers) {
            if (tags === "*" || tags.has(tagName)) {
              await handler.element?.(el);
            }
          }
        }

        const isVoid = VOID_ELEMENTS.has(tagName) || Boolean(selfClose);

        if (!isSkipping()) {
          if (el.action === "remove") {
            // Emit nothing; if non-void, push so children/close are skipped too.
          } else if (el.action === "unwrap") {
            // Emit nothing for the tag itself, but content still flows.
          } else {
            out += el.serializeOpenTag();
          }
        }

        if (!isVoid) {
          stack.push({ tagName, action: isSkipping() ? "remove" : el.action });
        }
      }
    }
    if (!isSkipping()) out += html.slice(lastIndex);
    return out;
  }
}

if (typeof (globalThis as Record<string, unknown>).HTMLRewriter === "undefined") {
  (globalThis as Record<string, unknown>).HTMLRewriter = FakeHTMLRewriter;
}
