import * as vscode from "vscode";

import { DocumentSync } from "./documentSync.js";

export const EDITOR_NAMESPACE = "stephencme.markdownEditor";
export const EDITOR_VIEW_ID = `${EDITOR_NAMESPACE}.editorView`;

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      EDITOR_VIEW_ID,
      new MarkdownEditorProvider(context.extensionUri),
      {
        supportsMultipleEditorsPerDocument: false,
        // Keep webview alive when switching tabs so SET_CONTENT messages are
        // delivered while hidden and content is instant on return
        webviewOptions: { retainContextWhenHidden: true },
      },
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);
    const documentSync = new DocumentSync(document, webviewPanel);
    webviewPanel.onDidDispose(() => documentSync.dispose());
  }

  private buildHtml(webview: vscode.Webview): string {
    const distWebviewUri = vscode.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview",
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distWebviewUri, "editor.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distWebviewUri, "editor.css"),
    );
    const nonce = crypto.randomUUID();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="find-bar">
    <input id="find-input" type="text" placeholder="Find">
    <button id="find-close" title="Close (Escape)" aria-label="Close">✕</button>
  </div>
  <div id="editor" class="prose max-w-none"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
