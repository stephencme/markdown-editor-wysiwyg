import { Extension } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { htmlToMarkdownSync, markdownToHtmlSync } from "../markdown.js";

function unwrapSingleParagraphHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const { body } = document;
  if (body.childNodes.length !== 1) return html;

  const onlyChild = body.firstElementChild;
  if (!(onlyChild instanceof HTMLParagraphElement)) return html;
  return onlyChild.innerHTML;
}

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
            const html = unwrapSingleParagraphHtml(markdownToHtmlSync(text));
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
