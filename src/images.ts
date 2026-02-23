import * as vscode from "vscode";
import {
  getHastChildren,
  getHastProperties,
  isImageNode,
  type HastNode,
} from "./ast/hast.js";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

function splitPathSuffix(src: string): {
  path: string;
  query: string;
  fragment: string;
} {
  const hashIndex = src.indexOf("#");
  const queryIndex = src.indexOf("?");
  const splitIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);
  if (splitIndex === -1) return { path: src, query: "", fragment: "" };
  const path = src.slice(0, splitIndex);
  const suffix = src.slice(splitIndex);
  const suffixQueryIndex = suffix.indexOf("?");
  const suffixHashIndex = suffix.indexOf("#");
  const query =
    suffixQueryIndex === -1
      ? ""
      : suffix.slice(
          suffixQueryIndex,
          suffixHashIndex === -1 ? undefined : suffixHashIndex,
        );
  const fragment = suffixHashIndex === -1 ? "" : suffix.slice(suffixHashIndex);
  return { path, query, fragment };
}

function mapImageSrcs(html: string, map: (src: string) => string): string {
  const processor = unified().use(rehypeParse, { fragment: true });
  const tree = processor.parse(html);
  const stack: HastNode[] = [tree as unknown as HastNode];

  while (stack.length) {
    const node = stack.pop()!;
    if (isImageNode(node)) {
      const props = getHastProperties(node);
      if (typeof props.src === "string") {
        props.src = map(props.src);
      }
    }

    for (const child of getHastChildren(node)) stack.push(child);
  }

  return String(unified().use(rehypeStringify).stringify(tree));
}

// Rewrite relative image srcs to webview-safe URIs
export function resolveImageSrcs(
  html: string,
  documentUri: vscode.Uri,
  webview: vscode.Webview,
): string {
  const documentDir = vscode.Uri.joinPath(documentUri, "..");
  return mapImageSrcs(html, (src) => {
    if (/^https?:\/\/|^data:/i.test(src)) return src;
    const parts = splitPathSuffix(src);
    const absoluteUri = vscode.Uri.joinPath(documentDir, parts.path);
    return `${webview.asWebviewUri(absoluteUri)}${parts.query}${parts.fragment}`;
  });
}

// Restore webview URIs back to relative paths for markdown conversion
export function restoreImageSrcs(
  html: string,
  documentUri: vscode.Uri,
  webview: vscode.Webview,
): string {
  const documentDir = vscode.Uri.joinPath(documentUri, "..");
  const webviewBase = vscode.Uri.parse(
    webview.asWebviewUri(documentDir).toString(),
    true,
  );
  const webviewBasePath = webviewBase.path.replace(/\/?$/, "/");

  return mapImageSrcs(html, (src) => {
    if (/^https?:\/\/|^data:/i.test(src)) return src;

    let parsed: vscode.Uri;
    try {
      parsed = vscode.Uri.parse(src, true);
    } catch {
      return src;
    }

    if (
      parsed.scheme !== webviewBase.scheme ||
      parsed.authority !== webviewBase.authority ||
      !parsed.path.startsWith(webviewBasePath)
    ) {
      return src;
    }

    let relativePath = parsed.path
      .slice(webviewBasePath.length)
      .replace(/^\/+/, "");
    if (parsed.query) relativePath += `?${parsed.query}`;
    if (parsed.fragment) relativePath += `#${parsed.fragment}`;
    return relativePath;
  });
}
