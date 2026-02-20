import * as vscode from "vscode";

const IMG_SRC_RE = /(<img\b[^>]*\bsrc=")([^"]+)(")/g;

// Rewrite relative image srcs to webview-safe URIs
export function resolveImageSrcs(
  html: string,
  documentUri: vscode.Uri,
  webview: vscode.Webview,
): string {
  const documentDir = vscode.Uri.joinPath(documentUri, "..");
  return html.replace(IMG_SRC_RE, (_match, before, src, after) => {
    if (/^https?:\/\/|^data:/.test(src)) return `${before}${src}${after}`;
    const absoluteUri = vscode.Uri.joinPath(documentDir, src);
    return `${before}${webview.asWebviewUri(absoluteUri)}${after}`;
  });
}

// Restore webview URIs back to relative paths for markdown conversion
export function restoreImageSrcs(
  html: string,
  documentUri: vscode.Uri,
  webview: vscode.Webview,
): string {
  const documentDir = vscode.Uri.joinPath(documentUri, "..");
  const webviewBase = webview
    .asWebviewUri(documentDir)
    .toString()
    .replace(/\/?$/, "/");
  return html.replace(IMG_SRC_RE, (_match, before, src, after) => {
    if (src.startsWith(webviewBase)) {
      const relativePath = src.slice(webviewBase.length).replace(/^\//, "");
      return `${before}${relativePath}${after}`;
    }
    return `${before}${src}${after}`;
  });
}
