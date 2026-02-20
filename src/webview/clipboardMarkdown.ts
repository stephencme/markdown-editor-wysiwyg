import { Extension } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { htmlToMarkdownSync, markdownToHtmlSync } from "../markdown.js";

export const ClipboardMarkdown = Extension.create({
  name: "clipboardMarkdown",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("clipboardMarkdown"),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;
            // Inside a code block: let ProseMirror insert as plain text
            if (view.state.selection.$from.parent.type.spec.code) return false;
            let html = markdownToHtmlSync(text);
            // Unwrap single-paragraph output so content is inserted inline
            // instead of splitting the current block
            const match = html.match(/^<p>([\s\S]*)<\/p>\s*$/);
            if (match) html = match[1];
            this.editor.commands.insertContent(html, {
              parseOptions: { preserveWhitespace: true },
            });
            return true;
          },
          clipboardTextSerializer: (slice) => {
            const div = document.createElement("div");
            const fragment = DOMSerializer.fromSchema(
              this.editor.schema,
            ).serializeFragment(slice.content);
            div.appendChild(fragment);
            return htmlToMarkdownSync(div.innerHTML);
          },
        },
      }),
    ];
  },
});
