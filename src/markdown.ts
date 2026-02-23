import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import type { Plugin } from "unified";
import { unified } from "unified";

type HastNode = Record<string, unknown>;

// Normalize Tiptap's task list HTML into the standard GFM structure that
// rehype-remark + remark-gfm recognize:
//   Tiptap:   <ul data-type="taskList"> / <li data-type="taskItem" data-checked>
//   Standard: <ul class="contains-task-list"> / <li class="task-list-item">
//             with <input type="checkbox" [checked] disabled> as first child text
const rehypeNormalizeTiptap: Plugin = () => (tree) => {
  const stack: HastNode[] = [tree as unknown as HastNode];
  while (stack.length) {
    const node = stack.pop()!;
    const props = (node.properties ?? {}) as Record<string, unknown>;

    if (node.tagName === "ul" && props.dataType === "taskList") {
      props.className = ["contains-task-list"];
      delete props.dataType;
    }

    if (node.tagName === "li" && props.dataType === "taskItem") {
      const checked = props.dataChecked === "true" || props.dataChecked === "";
      props.className = ["task-list-item"];
      delete props.dataType;
      delete props.dataChecked;
      // Replace Tiptap's <label>...<div><p>text</p></div> with
      // <input type="checkbox" disabled [checked]> text
      const children = node.children as HastNode[];
      const inlineChildren: HastNode[] = [];
      for (const child of children) {
        if (child.tagName === "div" || child.tagName === "p") {
          const nested = (child.children ?? []) as HastNode[];
          for (const n of nested) {
            if (n.tagName === "p") {
              inlineChildren.push(...((n.children ?? []) as HastNode[]));
            } else {
              inlineChildren.push(n);
            }
          }
        } else if (child.tagName !== "label") {
          inlineChildren.push(child);
        }
      }
      const checkbox: HastNode = {
        type: "element",
        tagName: "input",
        properties: {
          type: "checkbox",
          disabled: true,
          ...(checked && { checked: true }),
        },
        children: [],
      };
      const space: HastNode = { type: "text", value: " " };
      node.children = [checkbox, space, ...inlineChildren];
    }

    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) stack.push(child as HastNode);
    }
  }
};

// Convert editor-specific link attributes back to standard HTML before
// any HTML-to-markdown conversion path
const rehypeRestoreEditorLinks: Plugin = () => (tree) => {
  const stack: HastNode[] = [tree as unknown as HastNode];
  while (stack.length) {
    const node = stack.pop()!;
    const props = (node.properties ?? {}) as Record<string, unknown>;

    if (node.tagName === "a" && typeof props.dataHref === "string") {
      props.href = props.dataHref;
      delete props.dataHref;
    }

    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) stack.push(child as HastNode);
    }
  }
};

// Force tight lists so remark-stringify omits blank lines between items
const remarkTightLists: Plugin = () => (tree) => {
  const stack: unknown[] = [tree];
  while (stack.length) {
    const node = stack.pop() as Record<string, unknown>;
    if (node.type === "list") {
      node.spread = false;
    }
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) stack.push(child);
    }
  }
};

const markdownToHtmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

const htmlToMarkdownProcessor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeRestoreEditorLinks)
  .use(rehypeNormalizeTiptap)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkTightLists)
  .use(remarkStringify, {
    bullet: "-",
    // Prefer asterisk emphasis to avoid underscore edge-cases that can
    // introduce HTML entities and over-escaping around links/strong text.
    emphasis: "*",
  });

// Matches a leading block of HTML comments (with optional blank lines between)
// <!-- --> is the only comment syntax in CommonMark/GFM
const LEADING_COMMENTS_RE = /^(\s*<!--[\s\S]*?-->\s*)+/;

/** Extract leading HTML comments that the editor would otherwise strip */
export function extractHtmlComments(markdown: string): {
  comments: string;
  body: string;
} {
  const match = markdown.match(LEADING_COMMENTS_RE);
  if (!match) return { comments: "", body: markdown };
  const comments = match[0].trimEnd();
  const body = markdown.slice(match[0].length).replace(/^\n+/, "");
  return { comments, body };
}

/** Re-attach previously extracted HTML comments */
export function restoreHtmlComments(
  comments: string,
  markdown: string,
): string {
  if (!comments) return markdown;
  return comments + "\n\n" + markdown;
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await markdownToHtmlProcessor.process(markdown);
  return String(result);
}

export function markdownToHtmlSync(markdown: string): string {
  return String(markdownToHtmlProcessor.processSync(markdown));
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const result = await htmlToMarkdownProcessor.process(html);
  return String(result);
}

export function htmlToMarkdownSync(html: string): string {
  return String(htmlToMarkdownProcessor.processSync(html));
}
