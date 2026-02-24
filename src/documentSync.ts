import * as vscode from "vscode";

import { resolveImageSrcs, restoreImageSrcs } from "./images.js";
import {
  extractHtmlComments,
  htmlToMarkdown,
  htmlToMarkdownSync,
  markdownToHtml,
  restoreHtmlComments,
} from "./markdown.js";
import {
  HostToWebviewMessage,
  isNewerSequence,
  isWebviewToHostMessage,
  UPDATE_SOURCE,
  WebviewToHostMessage,
} from "./messageProtocol.js";
import { hasExplicitScheme, isAllowedLinkHref } from "./linkValidation.js";

const DEBOUNCE_MS = 300;
const SYNC_DEBUG_SCOPE = "MarkdownHostSync";

type DocumentSyncState = {
  savedComments: string;
  isApplyingWebviewEdit: boolean;
  expectedApplyMarkdownCanonicals: string[];
  expectedSaveMarkdownFromWebview: string | null;
  lastWebviewMarkdownCanonical: string | null;
  pendingHtml: string | null;
  webviewHtml: string;
  debounceTimer: ReturnType<typeof setTimeout> | undefined;
  lastWebviewSequence: number;
  lastHostSequence: number;
};

type SetContentMessage = Extract<HostToWebviewMessage, { type: "SET_CONTENT" }>;

function validateLinkHref(input: string): string | null {
  if (!input.trim()) return "Link URL is required";
  if (isAllowedLinkHref(input)) return null;
  return "Only http, https, mailto, and tel links are allowed";
}

export function shouldAcceptSequence(
  sequence: number,
  lastSequence: number,
): boolean {
  return isNewerSequence(sequence, lastSequence);
}

export function canonicalizeMarkdownForSync(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trimEnd();
}

export function shouldPostExternalSetContent(
  documentMarkdownCanonical: string,
  lastWebviewMarkdownCanonical: string | null,
): boolean {
  if (lastWebviewMarkdownCanonical === null) return true;
  return documentMarkdownCanonical !== lastWebviewMarkdownCanonical;
}

export function enqueueExpectedApplyCanonical(
  canonicals: string[],
  canonical: string,
  maxSize = 20,
): string[] {
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new Error("maxSize must be a positive integer");
  }
  const next = [...canonicals, canonical];
  if (next.length <= maxSize) return next;
  return next.slice(next.length - maxSize);
}

export function consumeExpectedApplyCanonical(
  canonicals: string[],
  canonical: string,
): { matched: boolean; canonicals: string[] } {
  const index = canonicals.indexOf(canonical);
  if (index === -1) return { matched: false, canonicals };
  const next = [...canonicals];
  next.splice(index, 1);
  return { matched: true, canonicals: next };
}

function logSync(action: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`[${SYNC_DEBUG_SCOPE}:${action}]`);
    return;
  }
  console.log(`[${SYNC_DEBUG_SCOPE}:${action}]`, details);
}

export class DocumentSync implements vscode.Disposable {
  private readonly state: DocumentSyncState = {
    savedComments: "",
    isApplyingWebviewEdit: false,
    expectedApplyMarkdownCanonicals: [],
    expectedSaveMarkdownFromWebview: null,
    lastWebviewMarkdownCanonical: null,
    pendingHtml: null,
    webviewHtml: "",
    debounceTimer: undefined,
    lastWebviewSequence: 0,
    lastHostSequence: 0,
  };

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly webviewPanel: vscode.WebviewPanel,
  ) {
    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage((message: unknown) =>
        this.handleWebviewMessage(message),
      ),
    );
    this.disposables.push(
      vscode.workspace.onWillSaveTextDocument((event) =>
        this.handleWillSave(event),
      ),
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.handleDidChange(event),
      ),
    );
  }

  dispose(): void {
    if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
    for (const disposable of this.disposables) disposable.dispose();
  }

  private nextHostSequence(): number {
    this.state.lastHostSequence += 1;
    return this.state.lastHostSequence;
  }

  private postMessage(message: HostToWebviewMessage): void {
    this.webviewPanel.webview.postMessage(message);
  }

  private postSetContent(html: string, source: SetContentMessage["source"]) {
    const sequence = this.nextHostSequence();
    this.state.webviewHtml = html;
    this.postMessage({
      type: "SET_CONTENT",
      html,
      sequence,
      source,
    });
    logSync("postSetContent:sent", {
      sequence,
      source,
      htmlLength: html.length,
      lastWebviewSequence: this.state.lastWebviewSequence,
      pendingHtml: this.state.pendingHtml !== null,
    });
  }

  private async flushToDocument(): Promise<void> {
    if (this.state.pendingHtml === null) return;
    const html = this.state.pendingHtml;
    this.state.pendingHtml = null;

    const restoredHtml = restoreImageSrcs(
      html,
      this.document.uri,
      this.webviewPanel.webview,
    );
    const markdown = restoreHtmlComments(
      this.state.savedComments,
      await htmlToMarkdown(restoredHtml),
    );
    this.state.lastWebviewMarkdownCanonical =
      canonicalizeMarkdownForSync(markdown);
    logSync("flushToDocument:converted", {
      htmlLength: html.length,
      markdownLength: markdown.length,
      lastWebviewSequence: this.state.lastWebviewSequence,
      markdownCanonicalLength: this.state.lastWebviewMarkdownCanonical.length,
    });

    // A newer UPDATE arrived during the await; let the next debounce
    // cycle handle it instead of writing stale content
    if (this.state.pendingHtml !== null) return;

    const fullRange = new vscode.Range(
      this.document.positionAt(0),
      this.document.positionAt(this.document.getText().length),
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.document.uri, fullRange, markdown);
    this.state.expectedApplyMarkdownCanonicals = enqueueExpectedApplyCanonical(
      this.state.expectedApplyMarkdownCanonicals,
      canonicalizeMarkdownForSync(markdown),
    );
    this.state.isApplyingWebviewEdit = true;
    try {
      await vscode.workspace.applyEdit(edit);
      logSync("flushToDocument:appliedEdit", {
        markdownLength: markdown.length,
      });
    } finally {
      this.state.isApplyingWebviewEdit = false;
    }
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!isWebviewToHostMessage(message)) return;

    switch (message.type) {
      case "READY": {
        const { comments, body } = extractHtmlComments(this.document.getText());
        this.state.savedComments = comments;
        this.state.lastWebviewMarkdownCanonical = canonicalizeMarkdownForSync(
          this.document.getText(),
        );
        const html = resolveImageSrcs(
          await markdownToHtml(body),
          this.document.uri,
          this.webviewPanel.webview,
        );
        this.postSetContent(html, UPDATE_SOURCE.INITIAL_LOAD);
        return;
      }

      case "UPDATE": {
        if (
          !shouldAcceptSequence(
            message.sequence,
            this.state.lastWebviewSequence,
          )
        ) {
          logSync("handleWebviewMessage:ignoredStaleUpdate", {
            incomingSequence: message.sequence,
            lastWebviewSequence: this.state.lastWebviewSequence,
          });
          return;
        }
        this.state.lastWebviewSequence = message.sequence;
        this.state.pendingHtml = message.html;
        this.state.webviewHtml = message.html;
        try {
          const restoredHtml = restoreImageSrcs(
            message.html,
            this.document.uri,
            this.webviewPanel.webview,
          );
          const markdown = restoreHtmlComments(
            this.state.savedComments,
            htmlToMarkdownSync(restoredHtml),
          );
          this.state.lastWebviewMarkdownCanonical =
            canonicalizeMarkdownForSync(markdown);
        } catch {
          // Keep prior canonical baseline when sync conversion fails; async flush
          // still recomputes canonical markdown before applyEdit
        }
        logSync("handleWebviewMessage:acceptedUpdate", {
          sequence: message.sequence,
          source: message.source,
          htmlLength: message.html.length,
          markdownCanonicalLength:
            this.state.lastWebviewMarkdownCanonical?.length ?? null,
        });
        if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
        this.state.debounceTimer = setTimeout(
          () => this.flushToDocument(),
          DEBOUNCE_MS,
        );
        return;
      }

      case "OPEN_LINK":
        this.openLink(message);
        return;

      case "REQUEST_LINK":
        await this.requestLink(message);
        return;
    }
  }

  private openLink(
    message: Extract<WebviewToHostMessage, { type: "OPEN_LINK" }>,
  ) {
    const href = message.href;
    if (hasExplicitScheme(href)) {
      vscode.env.openExternal(vscode.Uri.parse(href));
    } else {
      const docDir = vscode.Uri.joinPath(this.document.uri, "..");
      vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.joinPath(docDir, href),
      );
    }
  }

  private async requestLink(
    message: Extract<WebviewToHostMessage, { type: "REQUEST_LINK" }>,
  ): Promise<void> {
    if (message.hasSelection) {
      const href = await vscode.window.showInputBox({
        title: "Insert Link",
        prompt: "Enter link URL",
        placeHolder: "https://example.com",
        value: message.currentHref,
        ignoreFocusOut: true,
        validateInput: validateLinkHref,
      });
      if (!href) return;
      this.postMessage({
        type: "APPLY_LINK",
        href,
      });
      return;
    }

    const href = await vscode.window.showInputBox({
      title: "Insert Link",
      prompt: "Enter link URL",
      placeHolder: "https://example.com",
      value: message.currentHref,
      ignoreFocusOut: true,
      validateInput: validateLinkHref,
    });
    if (!href) return;
    this.postMessage({
      type: "APPLY_LINK",
      href,
      text: href,
    });
  }

  private handleWillSave(event: vscode.TextDocumentWillSaveEvent): void {
    if (event.document.uri.toString() !== this.document.uri.toString()) return;
    if (this.state.pendingHtml === null) return;

    if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
    const html = this.state.pendingHtml;
    this.state.pendingHtml = null;

    const restoredHtml = restoreImageSrcs(
      html,
      this.document.uri,
      this.webviewPanel.webview,
    );
    event.waitUntil(
      htmlToMarkdown(restoredHtml).then((md) => {
        const markdown = restoreHtmlComments(this.state.savedComments, md);
        this.state.lastWebviewMarkdownCanonical =
          canonicalizeMarkdownForSync(markdown);
        this.state.expectedSaveMarkdownFromWebview = markdown;
        const fullRange = new vscode.Range(
          event.document.positionAt(0),
          event.document.positionAt(event.document.getText().length),
        );
        return [vscode.TextEdit.replace(fullRange, markdown)];
      }),
    );
  }

  private async handleDidChange(
    event: vscode.TextDocumentChangeEvent,
  ): Promise<void> {
    if (event.document.uri.toString() !== this.document.uri.toString()) return;
    if (event.contentChanges.length === 0) return;
    const documentText = event.document.getText();
    const documentMarkdownCanonical = canonicalizeMarkdownForSync(documentText);

    // Consume matching canonical even when we originated the edit;
    // failing to consume here causes stale queue entries that suppress
    // legitimate SET_CONTENT during undo
    if (this.state.isApplyingWebviewEdit) {
      const consumed = consumeExpectedApplyCanonical(
        this.state.expectedApplyMarkdownCanonicals,
        documentMarkdownCanonical,
      );
      this.state.expectedApplyMarkdownCanonicals = consumed.canonicals;
      return;
    }

    // applyEdit path can surface out-of-order after newer webview UPDATEs;
    // consume any matching canonical to avoid misclassifying as external
    const consumedExpected = consumeExpectedApplyCanonical(
      this.state.expectedApplyMarkdownCanonicals,
      documentMarkdownCanonical,
    );
    this.state.expectedApplyMarkdownCanonicals = consumedExpected.canonicals;
    if (consumedExpected.matched) {
      logSync("handleDidChange:equivalenceDecision", {
        decision: "SKIP_SET_CONTENT",
        reason: "expected-apply-canonical-match",
        documentCanonicalLength: documentMarkdownCanonical.length,
      });
      return;
    }

    // Save-time webview flush path: skip the immediate no-op echo when the
    // document now matches what we just produced from the webview
    if (this.state.expectedSaveMarkdownFromWebview !== null) {
      if (documentText === this.state.expectedSaveMarkdownFromWebview) {
        this.state.expectedSaveMarkdownFromWebview = null;
        return;
      }
      this.state.expectedSaveMarkdownFromWebview = null;
    }

    const { comments, body } = extractHtmlComments(documentText);
    this.state.savedComments = comments;
    const shouldPostExternal = shouldPostExternalSetContent(
      documentMarkdownCanonical,
      this.state.lastWebviewMarkdownCanonical,
    );
    if (!shouldPostExternal) {
      logSync("handleDidChange:equivalenceDecision", {
        decision: "SKIP_SET_CONTENT",
        reason: "canonical-markdown-match",
        documentCanonicalLength: documentMarkdownCanonical.length,
      });
      return;
    }

    const updatedHtml = resolveImageSrcs(
      await markdownToHtml(body),
      this.document.uri,
      this.webviewPanel.webview,
    );
    logSync("handleDidChange:converted", {
      documentLength: this.document.getText().length,
      updatedHtmlLength: updatedHtml.length,
      webviewHtmlLength: this.state.webviewHtml.length,
      isApplyingWebviewEdit: this.state.isApplyingWebviewEdit,
      canonicalDecision: "POST_SET_CONTENT",
      documentCanonicalLength: documentMarkdownCanonical.length,
      lastWebviewCanonicalLength:
        this.state.lastWebviewMarkdownCanonical?.length ?? null,
    });

    // Skip if webview already shows this content (save-time edits,
    // no-op formatter changes); sending a redundant SET_CONTENT would
    // destroy Tiptap's undo history
    if (updatedHtml === this.state.webviewHtml) return;

    // Genuinely external change — discard pending writes, update webview
    this.state.lastWebviewMarkdownCanonical = documentMarkdownCanonical;
    this.state.pendingHtml = null;
    if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
    logSync("handleDidChange:postingSetContent", {
      source: UPDATE_SOURCE.EXTERNAL_DOC_CHANGE,
      updatedHtmlLength: updatedHtml.length,
    });
    this.postSetContent(updatedHtml, UPDATE_SOURCE.EXTERNAL_DOC_CHANGE);
  }
}
