import * as vscode from "vscode";

import { resolveImageSrcs, restoreImageSrcs } from "./images.js";
import {
  extractHtmlComments,
  htmlToMarkdown,
  markdownToHtml,
  restoreHtmlComments,
} from "./markdown.js";

export const EDITOR_NAMESPACE = "stephencme.markdownEditor";
export const EDITOR_VIEW_ID = `${EDITOR_NAMESPACE}.editorView`;
const DEBOUNCE_MS = 300;
const ALLOWED_LINK_PROTOCOLS = new Set(["https", "http", "mailto", "tel"]);

type WebviewMessage = {
  type: string;
  html?: string;
  href?: string;
  selectedText?: string;
  currentHref?: string;
  hasSelection?: boolean;
};

function validateLinkHref(input: string): string | null {
  const href = input.trim();
  if (!href) return "Link URL is required";

  try {
    // Base URL keeps relative paths/fragments parseable like in webview link rules
    const protocol = new URL(href, "https://_").protocol.replace(":", "");
    if (ALLOWED_LINK_PROTOCOLS.has(protocol)) return null;
    return "Only http, https, mailto, and tel links are allowed";
  } catch {
    return "Enter a valid link URL";
  }
}

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

    // HTML comments (e.g. <!-- Last updated by AI: ... -->) are invisible to
    // Tiptap and would be stripped during the roundtrip. Extract them before
    // the editor sees the content and re-attach on save
    let savedComments = "";

    // Guards against echo: flushToDocument's applyEdit fires
    // onDidChangeTextDocument synchronously during the call
    let isApplyingWebviewEdit = false;
    // Save-time waitUntil edits do not run through applyEdit, so track the
    // expected markdown to suppress the immediate echo on change
    let expectedSaveMarkdownFromWebview: string | null = null;

    // Latest UPDATE HTML not yet written to the TextDocument;
    // null means the TextDocument is up-to-date
    let pendingHtml: string | null = null;

    // HTML the webview currently shows; used to skip redundant SET_CONTENT
    // that would destroy Tiptap's undo history (e.g. save added a trailing
    // newline but the markdown→HTML roundtrip produces identical output)
    let webviewHtml = "";

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    async function flushToDocument(): Promise<void> {
      if (pendingHtml === null) return;
      const html = pendingHtml;
      pendingHtml = null;

      const restoredHtml = restoreImageSrcs(
        html,
        document.uri,
        webviewPanel.webview,
      );
      const markdown = restoreHtmlComments(
        savedComments,
        await htmlToMarkdown(restoredHtml),
      );

      // A newer UPDATE arrived during the await; let the next debounce
      // cycle handle it instead of writing stale content
      if (pendingHtml !== null) return;

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, fullRange, markdown);
      isApplyingWebviewEdit = true;
      try {
        await vscode.workspace.applyEdit(edit);
      } finally {
        isApplyingWebviewEdit = false;
      }
    }

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.type) {
          case "READY": {
            const { comments, body } = extractHtmlComments(document.getText());
            savedComments = comments;
            const html = resolveImageSrcs(
              await markdownToHtml(body),
              document.uri,
              webviewPanel.webview,
            );
            webviewHtml = html;
            webviewPanel.webview.postMessage({ type: "SET_CONTENT", html });
            break;
          }

          case "UPDATE": {
            if (!message.html) return;
            pendingHtml = message.html;
            webviewHtml = message.html;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => flushToDocument(), DEBOUNCE_MS);
            break;
          }

          case "OPEN_LINK": {
            if (!message.href) return;
            const href = message.href;
            if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
              vscode.env.openExternal(vscode.Uri.parse(href));
            } else {
              const docDir = vscode.Uri.joinPath(document.uri, "..");
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.joinPath(docDir, href),
              );
            }
            break;
          }

          case "REQUEST_LINK": {
            const initialHref = String(message.currentHref ?? "");
            if (message.hasSelection) {
              const href = await vscode.window.showInputBox({
                title: "Insert Link",
                prompt: "Enter link URL",
                placeHolder: "https://example.com",
                value: initialHref,
                ignoreFocusOut: true,
                validateInput: validateLinkHref,
              });
              if (!href) return;
              webviewPanel.webview.postMessage({
                type: "APPLY_LINK",
                href,
              });
              break;
            }

            const href = await vscode.window.showInputBox({
              title: "Insert Link",
              prompt: "Enter link URL",
              placeHolder: "https://example.com",
              value: initialHref,
              ignoreFocusOut: true,
              validateInput: validateLinkHref,
            });
            if (!href) return;
            webviewPanel.webview.postMessage({
              type: "APPLY_LINK",
              href,
              text: href,
            });
            break;
          }
        }
      },
    );

    // Flush pending content before save so the file is written with the
    // latest webview state, even if the debounce hasn't fired yet
    const willSaveDisposable = vscode.workspace.onWillSaveTextDocument(
      (event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return;
        if (pendingHtml === null) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        const html = pendingHtml;
        pendingHtml = null;

        const restoredHtml = restoreImageSrcs(
          html,
          document.uri,
          webviewPanel.webview,
        );
        event.waitUntil(
          htmlToMarkdown(restoredHtml).then((md) => {
            const markdown = restoreHtmlComments(savedComments, md);
            expectedSaveMarkdownFromWebview = markdown;
            const fullRange = new vscode.Range(
              event.document.positionAt(0),
              event.document.positionAt(event.document.getText().length),
            );
            return [vscode.TextEdit.replace(fullRange, markdown)];
          }),
        );
      },
    );

    const changeDisposable = vscode.workspace.onDidChangeTextDocument(
      async (event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return;
        if (event.contentChanges.length === 0) return;
        if (isApplyingWebviewEdit) return;

        // Save-time webview flush path: skip the immediate no-op echo when the
        // document now matches what we just produced from the webview
        if (expectedSaveMarkdownFromWebview !== null) {
          const documentText = event.document.getText();
          if (documentText === expectedSaveMarkdownFromWebview) {
            expectedSaveMarkdownFromWebview = null;
            return;
          }
          expectedSaveMarkdownFromWebview = null;
        }

        const { comments, body } = extractHtmlComments(document.getText());
        savedComments = comments;
        const updatedHtml = resolveImageSrcs(
          await markdownToHtml(body),
          document.uri,
          webviewPanel.webview,
        );

        // Skip if webview already shows this content (save-time edits,
        // no-op formatter changes); sending a redundant SET_CONTENT would
        // destroy Tiptap's undo history
        if (updatedHtml === webviewHtml) return;

        // Genuinely external change — discard pending writes, update webview
        pendingHtml = null;
        if (debounceTimer) clearTimeout(debounceTimer);
        webviewHtml = updatedHtml;
        webviewPanel.webview.postMessage({
          type: "SET_CONTENT",
          html: updatedHtml,
        });
      },
    );

    webviewPanel.onDidDispose(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      messageDisposable.dispose();
      willSaveDisposable.dispose();
      changeDisposable.dispose();
    });
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
