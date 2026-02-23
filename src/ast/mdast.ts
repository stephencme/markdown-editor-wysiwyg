export type MdastNode = Record<string, unknown>;

const INLINE_MARK_NODE_TYPES = new Set(["emphasis", "strong", "delete"]);

export function isInlineMarkNode(node: MdastNode): boolean {
  return INLINE_MARK_NODE_TYPES.has(String(node.type));
}

export function normalizeInlineMarkNode(node: MdastNode): MdastNode {
  if (!isInlineMarkNode(node)) return node;
  const currentType = String(node.type);
  const children = Array.isArray(node.children)
    ? (node.children as MdastNode[])
    : [];
  if (children.length !== 1) return node;

  const onlyChild = children[0];
  if (String(onlyChild.type) !== currentType) return node;
  const nestedChildren = Array.isArray(onlyChild.children)
    ? (onlyChild.children as MdastNode[])
    : [];

  return {
    ...node,
    children: nestedChildren,
  };
}

export function getNodeChildren(node: MdastNode): MdastNode[] {
  return Array.isArray(node.children) ? (node.children as MdastNode[]) : [];
}

export function getTrailingText(node: MdastNode): string | null {
  if (typeof node.value === "string") return node.value;
  const children = getNodeChildren(node);
  if (children.length === 0) return null;
  return getTrailingText(children[children.length - 1]);
}

export function getLeadingText(node: MdastNode): string | null {
  if (typeof node.value === "string") return node.value;
  const children = getNodeChildren(node);
  if (children.length === 0) return null;
  return getLeadingText(children[0]);
}

export function hasTrailingWhitespace(node: MdastNode): boolean {
  const trailing = getTrailingText(node);
  return trailing !== null && /[\s\u00A0]$/.test(trailing);
}

export function hasLeadingWhitespace(node: MdastNode): boolean {
  const leading = getLeadingText(node);
  return leading !== null && /^[\s\u00A0]/.test(leading);
}

function mergeMarkChildren(
  type: string,
  left: MdastNode,
  middle: MdastNode,
  right: MdastNode,
): MdastNode {
  return {
    ...left,
    type,
    children: [
      ...getNodeChildren(left),
      middle,
      ...getNodeChildren(right),
    ] as MdastNode[],
  };
}

export function maybeMergeSplitMarkIsland(
  left: MdastNode,
  middle: MdastNode,
  right: MdastNode,
): MdastNode | null {
  const markType = String(left.type);
  if (!isInlineMarkNode(left) || String(right.type) !== markType) {
    return null;
  }

  // Common split-mark shape from Tiptap HTML:
  // inline-mark, link(same-mark-only child), inline-mark
  if (middle.type === "link") {
    const linkChildren = getNodeChildren(middle);
    if (
      linkChildren.length === 1 &&
      String(linkChildren[0].type) === markType
    ) {
      const unwrappedLink = {
        ...middle,
        children: getNodeChildren(linkChildren[0]),
      };
      return mergeMarkChildren(markType, left, unwrappedLink, right);
    }
  }

  // Another split shape appears around strong content where outer emphasis
  // is fragmented into sibling emphasis nodes with whitespace kept inside
  // those fragments; keep this special-case conservative and emphasis-only
  if (
    markType === "emphasis" &&
    middle.type === "strong" &&
    hasTrailingWhitespace(left) &&
    hasLeadingWhitespace(right)
  ) {
    return mergeMarkChildren(markType, left, middle, right);
  }

  return null;
}
