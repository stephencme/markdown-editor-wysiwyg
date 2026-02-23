import { Editor, Extension } from "@tiptap/core";
import {
  isHostToWebviewMessage,
  type HostToWebviewMessage,
} from "../messageProtocol.js";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

type ApplyLinkPayload = Extract<HostToWebviewMessage, { type: "APPLY_LINK" }>;

function getSelectionText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, " ", " ");
}

function requestLinkFromHost(editor: Editor, vscode: VsCodeApi): void {
  const currentHref = String(editor.getAttributes("link").href ?? "");
  const { from, to } = editor.state.selection;
  vscode.postMessage({
    type: "REQUEST_LINK",
    selectedText: getSelectionText(editor),
    currentHref,
    hasSelection: from !== to,
  });
}

function applyLink(editor: Editor, payload: ApplyLinkPayload): void {
  const href = payload.href.trim();
  if (!href) return;

  const { from, to } = editor.state.selection;
  const hasSelection = from !== to;
  const text = payload.text?.trim();

  if (!hasSelection) {
    const linkText = text || href;
    editor
      .chain()
      .focus()
      .insertContent(linkText)
      .setTextSelection({ from, to: from + linkText.length })
      .setLink({ href })
      .setTextSelection(from + linkText.length)
      .run();
    return;
  }

  if (text) {
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, text)
      .setTextSelection({ from, to: from + text.length })
      .setLink({ href })
      .setTextSelection(from + text.length)
      .run();
    return;
  }

  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

function createNativeLinkShortcut(vscode: VsCodeApi): Extension {
  return Extension.create({
    name: "nativeLinkShortcut",
    addKeyboardShortcuts() {
      return {
        "Mod-Alt-k": () => {
          requestLinkFromHost(this.editor, vscode);
          return true;
        },
      };
    },
  });
}

function handleLinkMessage(editor: Editor, message: unknown): void {
  if (!isHostToWebviewMessage(message) || message.type !== "APPLY_LINK") return;
  applyLink(editor, message);
}

export { createNativeLinkShortcut, handleLinkMessage };
