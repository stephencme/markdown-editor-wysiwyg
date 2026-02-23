import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify, {
  type Options as RemarkStringifyOptions,
} from "remark-stringify";
import {
  getHastChildren,
  getHastProperties,
  isObjectRecord,
  toHastNode,
  type HastNode,
} from "./ast/hast.js";
import {
  isInlineMarkNode,
  maybeMergeSplitMarkIsland,
  normalizeInlineMarkNode,
  type MdastNode,
} from "./ast/mdast.js";
import type { Plugin } from "unified";
import { unified } from "unified";

function getNodeClasses(props: Record<string, unknown>): string[] {
  return Array.isArray(props.className) ? (props.className as string[]) : [];
}

function isCheckboxInputNode(node: HastNode): boolean {
  if (node.tagName !== "input") return false;
  const props = getHastProperties(node);
  return props.type === "checkbox";
}

function parseTaskMarkerText(value: string): boolean | null {
  const match = value.match(/^\s*\[([ xX])\]\s*$/);
  if (!match) return null;
  return match[1].toLowerCase() === "x";
}

function parseEmptyTaskMarkerFromChildren(
  children: HastNode[],
): boolean | null {
  const meaningfulChildren = children.filter((child) => {
    if (child.type !== "text") return true;
    return typeof child.value !== "string" || child.value.trim() !== "";
  });
  if (meaningfulChildren.length !== 1) return null;

  const onlyChild = meaningfulChildren[0];
  if (onlyChild.type === "text" && typeof onlyChild.value === "string") {
    return parseTaskMarkerText(onlyChild.value);
  }

  if (onlyChild.tagName !== "p") return null;
  const nested = Array.isArray(onlyChild.children)
    ? (onlyChild.children as HastNode[])
    : [];
  if (
    nested.some(
      (node) => node.type !== "text" || typeof node.value !== "string",
    )
  ) {
    return null;
  }
  const paragraphText = nested.map((node) => String(node.value)).join("");
  return parseTaskMarkerText(paragraphText);
}

function isTaskListItemNode(node: HastNode): boolean {
  if (node.tagName !== "li") return false;
  const props = getHastProperties(node);
  const classes = getNodeClasses(props);
  if (classes.includes("task-list-item")) return true;
  const children = Array.isArray(node.children)
    ? (node.children as HastNode[])
    : [];
  if (children.some((child) => isCheckboxInputNode(child))) return true;
  return parseEmptyTaskMarkerFromChildren(children) !== null;
}

// Convert standard GFM task list HTML into Tiptap's expected structure so the
// editor parses them as taskList/taskItem nodes instead of plain bulletList:
//   Standard: <ul class="contains-task-list"> / <li class="task-list-item">
//             with <input type="checkbox" [checked] disabled> as first child
//   Tiptap:   <ul data-type="taskList"> / <li data-type="taskItem" data-checked>
const rehypeGfmToTiptap: Plugin = () => (tree) => {
  const root = toHastNode(tree);
  if (!root) return;
  const stack: HastNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const props = getHastProperties(node);
    const classes = getNodeClasses(props);

    if (node.tagName === "ul") {
      const children = getHastChildren(node);
      const hasTaskItemChild = children.some((child) =>
        isTaskListItemNode(child),
      );
      if (!classes.includes("contains-task-list") && !hasTaskItemChild) {
        // Not a task list; leave as standard unordered list
      } else {
        props.dataType = "taskList";
        delete props.className;
      }
    }

    if (isTaskListItemNode(node)) {
      const children = getHastChildren(node);
      let checked = false;
      let sawCheckbox = false;
      const remaining: HastNode[] = [];
      const emptyTaskMarkerChecked = parseEmptyTaskMarkerFromChildren(children);
      for (const child of children) {
        const childProps = getHastProperties(child);
        if (isCheckboxInputNode(child)) {
          sawCheckbox = true;
          checked =
            childProps.checked === true ||
            childProps.checked === "" ||
            childProps.checked === "checked";
        } else {
          remaining.push(child);
        }
      }
      if (!sawCheckbox && emptyTaskMarkerChecked !== null) {
        checked = emptyTaskMarkerChecked;
        remaining.length = 0;
      }
      props.dataType = "taskItem";
      props.dataChecked = String(checked);
      delete props.className;
      node.children = remaining;
    }

    for (const child of getHastChildren(node)) stack.push(child);
  }
};

// Normalize Tiptap's task list HTML into the standard GFM structure that
// rehype-remark + remark-gfm recognize (reverse of rehypeGfmToTiptap):
//   Tiptap:   <ul data-type="taskList"> / <li data-type="taskItem" data-checked>
//   Standard: <ul class="contains-task-list"> / <li class="task-list-item">
//             with <input type="checkbox" [checked] disabled> as first child text
const rehypeNormalizeTiptap: Plugin = () => (tree) => {
  const root = toHastNode(tree);
  if (!root) return;
  const stack: HastNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const props = getHastProperties(node);

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
      const children = getHastChildren(node);
      const inlineChildren: HastNode[] = [];
      for (const child of children) {
        if (child.tagName === "div" || child.tagName === "p") {
          const nested = getHastChildren(child);
          for (const n of nested) {
            if (n.tagName === "p") {
              inlineChildren.push(...getHastChildren(n));
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

    for (const child of getHastChildren(node)) stack.push(child);
  }
};

// Convert editor-specific link attributes back to standard HTML before
// any HTML-to-markdown conversion path
const rehypeRestoreEditorLinks: Plugin = () => (tree) => {
  const root = toHastNode(tree);
  if (!root) return;
  const stack: HastNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const props = getHastProperties(node);

    if (node.tagName === "a" && typeof props.dataHref === "string") {
      props.href = props.dataHref;
      delete props.dataHref;
    }

    for (const child of getHastChildren(node)) stack.push(child);
  }
};

type MdastParentNode = MdastNode & { children?: MdastNode[] };
type RemarkListItemHandler = NonNullable<
  NonNullable<RemarkStringifyOptions["handlers"]>["listItem"]
>;
type MarkdownInfo = Record<string, unknown>;
type MarkdownState = {
  bulletCurrent?: string;
  options: Record<string, unknown>;
  createTracker: (info: MarkdownInfo) => {
    move: (value: string) => string;
    shift: (value: number) => void;
    current: () => MarkdownInfo;
  };
  enter: (name: string) => () => void;
  indentLines: (
    value: string,
    map: (line: string, index: number, blank: boolean) => string,
  ) => string;
  containerFlow: (node: MdastNode, info: MarkdownInfo) => string;
};

function asMarkdownState(state: unknown): MarkdownState {
  return state as MarkdownState;
}

function asMarkdownInfo(info: unknown): MarkdownInfo {
  return info as MarkdownInfo;
}

function checkBullet(state: MarkdownState): "*" | "+" | "-" {
  const marker = (state.options.bullet as string | undefined) ?? "*";
  if (marker !== "*" && marker !== "+" && marker !== "-") {
    throw new Error(
      `Cannot serialize items with \`${marker}\` for \`options.bullet\`; expected one of *, +, -`,
    );
  }
  return marker;
}

function checkListItemIndent(state: MarkdownState): "tab" | "one" | "mixed" {
  const style = (state.options.listItemIndent as string | undefined) ?? "one";
  if (style !== "tab" && style !== "one" && style !== "mixed") {
    throw new Error(
      `Cannot serialize items with \`${style}\` for \`options.listItemIndent\`; expected one of tab, one, mixed`,
    );
  }
  return style;
}

function defaultListItemToMarkdown(
  node: MdastNode,
  parent: MdastNode | undefined,
  state: MarkdownState,
  info: MarkdownInfo,
): string {
  const listItemIndent = checkListItemIndent(state);
  let bullet = state.bulletCurrent ?? checkBullet(state);

  if (parent?.type === "list" && parent.ordered === true) {
    const markerStart =
      typeof parent.start === "number" && parent.start > -1 ? parent.start : 1;
    const markerOffset =
      state.options.incrementListMarker === false
        ? 0
        : ((parent.children as unknown[])?.indexOf(node) ?? 0);
    bullet = `${markerStart + markerOffset}${bullet}`;
  }

  let size = bullet.length + 1;
  if (
    listItemIndent === "tab" ||
    (listItemIndent === "mixed" &&
      ((parent?.type === "list" && parent.spread === true) ||
        node.spread === true))
  ) {
    size = Math.ceil(size / 4) * 4;
  }

  const tracker = state.createTracker(info);
  tracker.move(bullet + " ".repeat(size - bullet.length));
  tracker.shift(size);
  const exit = state.enter("listItem");
  const value = state.indentLines(
    state.containerFlow(node, tracker.current()),
    (line, index, blank) => {
      if (index) return (blank ? "" : " ".repeat(size)) + line;
      return (
        (blank ? bullet : bullet + " ".repeat(size - bullet.length)) + line
      );
    },
  );
  exit();
  return value;
}

const LIST_MARKER_RE = /^(?:[*+-]|\d+[.)])(?:\r?\n| {1,3}|$)/;
const LIST_MARKER_ONLY_RE = /^(?:[*+-]|\d+[.)])$/;

const listItemToMarkdown: RemarkListItemHandler = (
  node,
  parent,
  state,
  info,
) => {
  const listItemNode = node as MdastNode;
  const listParent = parent as MdastNode | undefined;
  const isTaskItem = typeof node.checked === "boolean";
  if (!isTaskItem) {
    return defaultListItemToMarkdown(
      listItemNode,
      listParent,
      asMarkdownState(state),
      asMarkdownInfo(info),
    );
  }

  const originalChildren = Array.isArray(listItemNode.children)
    ? (listItemNode.children as MdastNode[])
    : [];
  const firstChild = originalChildren[0];
  const hasParagraphFirstChild = firstChild?.type === "paragraph";
  const normalizedChildren = hasParagraphFirstChild
    ? originalChildren
    : [{ type: "paragraph", children: [] as MdastNode[] }, ...originalChildren];
  const normalizedNode = { ...listItemNode, children: normalizedChildren };
  const checkbox = `[${listItemNode.checked === true ? "x" : " "}] `;
  const value = defaultListItemToMarkdown(
    normalizedNode,
    listParent,
    asMarkdownState(state),
    asMarkdownInfo(info),
  );
  const marker = value.match(LIST_MARKER_RE)?.[0];
  if (!marker) return value;

  if (marker.endsWith("\n")) {
    const newline = marker.endsWith("\r\n") ? "\r\n" : "\n";
    const markerOnly = marker.slice(0, -newline.length);
    return (
      markerOnly +
      " " +
      checkbox.trimEnd() +
      newline +
      value.slice(marker.length)
    );
  }

  if (LIST_MARKER_ONLY_RE.test(marker)) {
    return `${marker} ${checkbox}${value.slice(marker.length)}`;
  }

  return marker + checkbox + value.slice(marker.length);
};

// Force tight lists so remark-stringify omits blank lines between items;
// applies to both list and listItem nodes to prevent spread rendering
const remarkTightLists: Plugin = () => (tree) => {
  const stack: unknown[] = [tree];
  while (stack.length) {
    const next = stack.pop();
    if (!isObjectRecord(next)) continue;
    const node = next;
    if (node.type === "list" || node.type === "listItem") {
      node.spread = false;
    }
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) stack.push(child);
    }
  }
};

// Tiptap frequently emits adjacent inline marks for one visual span
// (for example many neighboring <em> nodes around links/strong text)
// which can stringify into entity-escaped spaces and escaped marker storms;
// merge adjacent identical marks so markdown stays stable on save
const remarkNormalizeInlineMarks: Plugin = () => (tree) => {
  const stack: unknown[] = [tree];
  while (stack.length) {
    const next = stack.pop();
    if (!isObjectRecord(next)) continue;
    const node = next as MdastParentNode;
    const children = node.children;
    if (!Array.isArray(children)) continue;

    for (const child of children) stack.push(child);

    let nextChildren = children.map((child) => normalizeInlineMarkNode(child));

    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < nextChildren.length - 2; index += 1) {
        const merged = maybeMergeSplitMarkIsland(
          nextChildren[index],
          nextChildren[index + 1],
          nextChildren[index + 2],
        );
        if (!merged) continue;
        nextChildren = [
          ...nextChildren.slice(0, index),
          merged,
          ...nextChildren.slice(index + 3),
        ];
        changed = true;
        break;
      }
    }

    const normalizedChildren: MdastNode[] = [];
    for (const child of nextChildren) {
      const normalizedChild = normalizeInlineMarkNode(child);
      if (!isInlineMarkNode(normalizedChild)) {
        normalizedChildren.push(normalizedChild);
        continue;
      }

      const previous = normalizedChildren[normalizedChildren.length - 1];
      if (previous && String(previous.type) === String(normalizedChild.type)) {
        const previousChildren = Array.isArray(previous.children)
          ? (previous.children as MdastNode[])
          : [];
        const nextChildren = Array.isArray(normalizedChild.children)
          ? (normalizedChild.children as MdastNode[])
          : [];
        previous.children = [...previousChildren, ...nextChildren];
        continue;
      }

      normalizedChildren.push(normalizedChild);
    }

    node.children = normalizedChildren;
  }
};

const markdownToHtmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeGfmToTiptap)
  .use(rehypeStringify);

const htmlToMarkdownProcessor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeRestoreEditorLinks)
  .use(rehypeNormalizeTiptap)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkTightLists)
  .use(remarkNormalizeInlineMarks)
  .use(remarkStringify, {
    bullet: "-",
    // Prefer asterisk emphasis to avoid underscore edge-cases that can
    // introduce HTML entities and over-escaping around links/strong text.
    emphasis: "*",
    handlers: {
      listItem: listItemToMarkdown,
    },
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
