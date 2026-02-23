const PROTOCOL_RE = /^([a-z][a-z0-9+.-]*):/i;

const ALLOWED_LINK_PROTOCOLS = new Set(["http", "https", "mailto", "tel"]);

function parseScheme(input: string): string | null {
  const match = input.match(PROTOCOL_RE);
  if (!match) return null;
  return match[1].toLowerCase();
}

export function isAllowedLinkHref(input: string): boolean {
  const href = input.trim();
  if (!href) return false;
  const scheme = parseScheme(href);
  if (scheme === null) return true;
  return ALLOWED_LINK_PROTOCOLS.has(scheme);
}

export function hasExplicitScheme(input: string): boolean {
  return parseScheme(input.trim()) !== null;
}
