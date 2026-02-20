import { Editor, Extension } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface FindMatch {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  matches: FindMatch[];
  currentIndex: number;
}

function findMatches(doc: ProseMirrorNode, query: string): FindMatch[] {
  if (!query) return [];
  const results: FindMatch[] = [];
  const lowerQuery = query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let i = 0;
    while ((i = text.indexOf(lowerQuery, i)) !== -1) {
      results.push({ from: pos + i, to: pos + i + query.length });
      i += query.length;
    }
  });
  return results;
}

const findPluginKey = new PluginKey<FindState>("find");

const findPlugin = new Plugin<FindState>({
  key: findPluginKey,
  state: {
    init: () => ({ query: "", matches: [], currentIndex: 0 }),
    apply(tr, state) {
      const meta = tr.getMeta(findPluginKey) as
        | { type: "SET_QUERY"; query: string }
        | { type: "NAVIGATE"; delta: number }
        | undefined;
      if (meta?.type === "SET_QUERY") {
        return {
          query: meta.query,
          matches: findMatches(tr.doc, meta.query),
          currentIndex: 0,
        };
      }
      if (meta?.type === "NAVIGATE") {
        const { matches, currentIndex } = state;
        if (!matches.length) return state;
        return {
          ...state,
          currentIndex:
            (currentIndex + meta.delta + matches.length) % matches.length,
        };
      }
      if (tr.docChanged && state.query) {
        return { ...state, matches: findMatches(tr.doc, state.query) };
      }
      return state;
    },
  },
  props: {
    decorations(editorState) {
      const { query, matches, currentIndex } =
        findPluginKey.getState(editorState)!;
      if (!query || !matches.length) return DecorationSet.empty;
      return DecorationSet.create(
        editorState.doc,
        matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class:
              i === currentIndex
                ? "find-match find-match-current"
                : "find-match",
          }),
        ),
      );
    },
  },
});

// Intercept Mod-f before ProseMirror swallows it
const FindExtension = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Mod-f": () => {
        findBar.classList.add("visible");
        findInput.focus();
        findInput.select();
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [findPlugin];
  },
});

const findBar = document.getElementById("find-bar")!;
const findInput = document.getElementById("find-input") as HTMLInputElement;
const findClose = document.getElementById("find-close") as HTMLButtonElement;

function closeFindBar(editor: Editor) {
  editor.view.dispatch(
    editor.state.tr.setMeta(findPluginKey, { type: "SET_QUERY", query: "" }),
  );
  findBar.classList.remove("visible");
  editor.commands.focus();
}

function bindFindBar(editor: Editor) {
  findInput.addEventListener("input", () => {
    const query = findInput.value;
    editor.view.dispatch(
      editor.state.tr.setMeta(findPluginKey, { type: "SET_QUERY", query }),
    );
    const { matches } = findPluginKey.getState(editor.state)!;
    if (matches.length > 0) {
      editor.view.dispatch(
        editor.state.tr
          .setSelection(
            TextSelection.create(
              editor.state.doc,
              matches[0].from,
              matches[0].to,
            ),
          )
          .scrollIntoView(),
      );
    }
  });

  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const state = findPluginKey.getState(editor.state)!;
      if (!state.matches.length) return;
      const delta = e.shiftKey ? -1 : 1;
      editor.view.dispatch(
        editor.state.tr.setMeta(findPluginKey, { type: "NAVIGATE", delta }),
      );
      // Read the updated index from plugin state after dispatch
      const { currentIndex, matches } = findPluginKey.getState(editor.state)!;
      const match = matches[currentIndex];
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, match.from, match.to),
        ),
      );
      findInput.focus();
      requestAnimationFrame(() => {
        document
          .querySelector(".find-match-current")
          ?.scrollIntoView({ block: "nearest" });
      });
    } else if (e.key === "Escape") {
      closeFindBar(editor);
    }
  });

  findClose.addEventListener("click", () => closeFindBar(editor));
}

export { bindFindBar, FindExtension };
