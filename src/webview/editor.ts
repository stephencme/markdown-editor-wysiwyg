import { Editor } from "@tiptap/core";
import Code from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table/cell";
import { TableHeader } from "@tiptap/extension-table/header";
import { TableRow } from "@tiptap/extension-table/row";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Plugin } from "@tiptap/pm/state";
import {
  isHostToWebviewMessage,
  isNewerSequence,
  UPDATE_SOURCE,
} from "../messageProtocol.js";
import StarterKit from "@tiptap/starter-kit";
import { ClipboardMarkdown } from "./clipboardMarkdown.js";
import { FindExtension, bindFindBar } from "./find.js";
import { bindImageInput } from "./imageInput.js";
import { createNativeLinkShortcut, handleLinkMessage } from "./links.js";
import { getRestorableSelection } from "./selectionRestore.js";

const vscode = acquireVsCodeApi();

let isSettingContent = false;
let outgoingUpdateSequence = 0;
let lastHostSequence = 0;
const SYNC_DEBUG_SCOPE = "MarkdownWebviewSync";

function logSync(action: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`[${SYNC_DEBUG_SCOPE}:${action}]`);
    return;
  }
  console.log(`[${SYNC_DEBUG_SCOPE}:${action}]`, details);
}

const editor = new Editor({
  element: document.getElementById("editor")!,
  extensions: [
    StarterKit.configure({ code: false }),
    // Allow code + link marks to coexist (default Code excludes all marks)
    Code.extend({ excludes: "" }),
    Image.configure({ inline: true }),
    Link.configure({
      openOnClick: false,
      isAllowedUri: (url) => {
        try {
          // Base URL prevents throwing on relative paths and fragments
          const protocol = new URL(url, "https://_").protocol.replace(":", "");
          // Block dangerous protocols like javascript:
          return ["https", "http", "mailto", "tel"].includes(protocol);
        } catch {
          return false;
        }
      },
    }).extend({
      // Store href in data-href to prevent the webview's built-in link
      // interception from firing alongside our click handler
      renderHTML({ HTMLAttributes }) {
        const { href, ...rest } = HTMLAttributes;
        return ["a", { ...rest, "data-href": href }, 0];
      },
      addProseMirrorPlugins() {
        return [
          new Plugin({
            props: {
              handleDOMEvents: {
                click(_view, event) {
                  const anchor = (event.target as HTMLElement).closest("a");
                  if (!anchor) return false;
                  const href = anchor.getAttribute("data-href");
                  if (!href) return false;
                  event.preventDefault();
                  vscode.postMessage({ type: "OPEN_LINK", href });
                  return true;
                },
              },
            },
          }),
        ];
      },
    }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    createNativeLinkShortcut(vscode),
    ClipboardMarkdown,
    FindExtension,
  ],
  onUpdate({ editor }) {
    if (isSettingContent) return;
    outgoingUpdateSequence += 1;
    // Restore data-href to href so the markdown converter recognizes links
    const html = editor
      .getHTML()
      .replace(/(<a\b[^>]*?) data-href=/g, "$1 href=");
    vscode.postMessage({
      type: "UPDATE",
      html,
      sequence: outgoingUpdateSequence,
      source: UPDATE_SOURCE.WEBVIEW_EDIT,
    });
    logSync("onUpdate:sentUpdate", {
      sequence: outgoingUpdateSequence,
      selection: {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      },
      docSize: editor.state.doc.content.size,
      htmlLength: html.length,
    });
  },
});

bindFindBar(editor);
bindImageInput(editor);

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!isHostToWebviewMessage(message)) return;

  if (message.type === "SET_CONTENT") {
    if (!isNewerSequence(message.sequence, lastHostSequence)) return;
    lastHostSequence = message.sequence;

    const wasEditorFocused = editor.isFocused;
    const previousSelection = editor.state.selection;
    const previousDocSize = editor.state.doc.content.size;
    isSettingContent = true;
    editor
      .chain()
      .setMeta("addToHistory", false)
      .setContent(message.html, { emitUpdate: false })
      .run();
    isSettingContent = false;

    const maxPosition = editor.state.doc.content.size;
    const selectionToRestore = getRestorableSelection(
      {
        from: previousSelection.from,
        to: previousSelection.to,
      },
      maxPosition,
    );
    if (selectionToRestore) {
      try {
        editor.commands.setTextSelection(selectionToRestore);
        logSync("setContent:restoredSelection", {
          sequence: message.sequence,
          source: message.source,
          wasEditorFocused,
          previousSelection: {
            from: previousSelection.from,
            to: previousSelection.to,
          },
          previousDocSize,
          nextDocSize: maxPosition,
          restoredSelection: selectionToRestore,
        });
      } catch {
        // Some document shapes do not allow restoring the previous text range
        logSync("setContent:restoreSelectionFailed", {
          sequence: message.sequence,
          source: message.source,
          previousSelection: {
            from: previousSelection.from,
            to: previousSelection.to,
          },
          previousDocSize,
          nextDocSize: maxPosition,
        });
      }
    } else {
      logSync("setContent:skippedSelectionRestore", {
        sequence: message.sequence,
        source: message.source,
        previousSelection: {
          from: previousSelection.from,
          to: previousSelection.to,
        },
        previousDocSize,
        nextDocSize: maxPosition,
      });
    }

    if (wasEditorFocused) {
      editor.commands.focus(null, { scrollIntoView: false });
      logSync("setContent:refocused", {
        sequence: message.sequence,
        selectionAfter: {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        },
      });
    }
    return;
  }

  handleLinkMessage(editor, message);
});

vscode.postMessage({ type: "READY" });
