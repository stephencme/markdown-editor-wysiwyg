export type HastNode = Record<string, unknown>;

export function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toHastNode(value: unknown): HastNode | null {
  return isObjectRecord(value) ? value : null;
}

export function getHastProperties(node: HastNode): Record<string, unknown> {
  return isObjectRecord(node.properties) ? node.properties : {};
}

export function getHastChildren(node: HastNode): HastNode[] {
  if (!Array.isArray(node.children)) return [];
  return node.children.filter((child): child is HastNode => isObjectRecord(child));
}

export function isImageNode(node: HastNode): boolean {
  return node.type === "element" && node.tagName === "img";
}
