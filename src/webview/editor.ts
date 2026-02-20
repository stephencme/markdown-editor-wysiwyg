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
import StarterKit from "@tiptap/starter-kit";
import { ClipboardMarkdown } from "./clipboardMarkdown.js";
import { FindExtension, bindFindBar } from "./find.js";

const vscode = acquireVsCodeApi();

let isSettingContent = false;

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
    ClipboardMarkdown,
    FindExtension,
  ],
  onUpdate({ editor }) {
    if (isSettingContent) return;
    // Restore data-href to href so the markdown converter recognizes links
    const html = editor
      .getHTML()
      .replace(/(<a\b[^>]*?) data-href=/g, "$1 href=");
    vscode.postMessage({ type: "UPDATE", html });
  },
});

bindFindBar(editor);

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "SET_CONTENT") {
    const wasEditorFocused = editor.isFocused;
    const previousSelection = editor.state.selection;
    isSettingContent = true;
    editor
      .chain()
      .setMeta("addToHistory", false)
      .setContent(message.html, { emitUpdate: false })
      .run();
    isSettingContent = false;

    const maxPosition = editor.state.doc.content.size;
    const nextFrom = Math.min(Math.max(previousSelection.from, 0), maxPosition);
    const nextTo = Math.min(Math.max(previousSelection.to, 0), maxPosition);

    try {
      editor.commands.setTextSelection({ from: nextFrom, to: nextTo });
    } catch {
      // Some document shapes do not allow restoring the previous text range
    }
    if (wasEditorFocused) {
      editor.commands.focus();
    }
  }
});

vscode.postMessage({ type: "READY" });
