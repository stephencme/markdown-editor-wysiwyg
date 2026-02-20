<!-- Last updated by AI: 2026-02-20 -->

# markdown-editor-wysiwyg

VS Code extension. Bundled with esbuild, tested with `@vscode/test-cli`. To use VS Code debugger tools, this extension must support being opened as its own workspace i.e. `cd pangolin/vscode` then `code .`

## Architecture

- `src/extension.ts` – entry point (`activate`/`deactivate`); sets `workbench.editorAssociations` on startup so `.md` defaults to the custom editor while respecting user overrides, and keeps diff/source-control markdown views on the built-in text editor
- `package.json` – uses `priority: "option"` with `onStartupFinished` so user overrides to `editorAssociations` do not activate the extension on every `.md` open
- `src/markdownEditorProvider.ts` – `CustomTextEditorProvider` for `.md`; Tiptap owns editing/undo, and document writes are debounced (with a save-time flush via `onWillSaveTextDocument`)
- `src/markdown.ts` – unified-based markdown <-> HTML conversion; `remarkTightLists` enforces tight lists, and `extractHtmlComments`/`restoreHtmlComments` preserve leading `<!-- -->` comments that Tiptap drops
- `src/images.ts` – rewrites relative image paths to webview-safe URIs and restores them on write-back
- `src/webview/editor.ts` – Tiptap editor running in the webview; link `href` is stored in `data-href` to avoid built-in interception, and `Code.extend({ excludes: "" })` allows code + link marks together
- `src/webview/find.ts` – find-in-editor behavior (plugin, keybinding, DOM bindings)
- `node_modules/@types/vscode/index.d.ts` – Full VS Code API typings

### Markdown

The editor targets [GFM (GitHub Flavored Markdown)](https://github.github.com/gfm/). Both sides of the pipeline – Tiptap (webview) and unified (Node) – must support a feature for it to round-trip.

| GFM feature      | Tiptap extension                        | unified plugin         |
| ---------------- | --------------------------------------- | ---------------------- |
| Headings         | StarterKit                              | remark-parse/stringify |
| Bold             | StarterKit                              | remark-parse/stringify |
| Italic           | StarterKit                              | remark-parse/stringify |
| Strikethrough    | StarterKit (Strike)                     | remark-gfm             |
| Inline code      | @tiptap/extension-code                  | remark-parse/stringify |
| Code blocks      | StarterKit                              | remark-parse/stringify |
| Blockquotes      | StarterKit                              | remark-parse/stringify |
| Bullet lists     | StarterKit                              | remark-parse/stringify |
| Ordered lists    | StarterKit                              | remark-parse/stringify |
| Task lists       | @tiptap/extension-task-list + task-item | remark-gfm             |
| Links            | @tiptap/extension-link                  | remark-parse/stringify |
| Autolinks        | @tiptap/extension-link (autolink)       | remark-gfm             |
| Images           | @tiptap/extension-image                 | remark-parse/stringify |
| Tables           | @tiptap/extension-table                 | remark-gfm             |
| Horizontal rules | StarterKit                              | remark-parse/stringify |
| Hard breaks      | StarterKit                              | remark-parse/stringify |

## Build

Three outputs must all be compiled for the extension to work:

| Output                    | Source                   | Tool                   |
| ------------------------- | ------------------------ | ---------------------- |
| `dist/extension.cjs`      | `src/extension.ts`       | esbuild (Node CJS)     |
| `dist/webview/editor.js`  | `src/webview/editor.ts`  | esbuild (browser IIFE) |
| `dist/webview/editor.css` | `src/webview/editor.css` | Tailwind CSS CLI       |

`pnpm compile` produces all three. `pnpm package` does the same with minification.

`tsconfig.json` includes `DOM` in `lib` because Tiptap's types require it. Gotcha: DOM globals (e.g. `document`, `window`) will type-check everywhere but only exist at runtime in `src/webview/`.

## Debugging

Press `F5` to launch an Extension Development Host. The default build task starts three watchers in parallel: `watch:esbuild` (both TS outputs), `watch:css` (Tailwind), and `watch:tsc` (type-check only, no output).

## Testing

- `pnpm test` runs `vscode-test`, which launches an Extension Development Host (real VS Code/Electron) to execute extension tests
- In non-interactive or agent-driven environments, this can appear to never exit if the host stays open or cannot fully initialize
- For quick CI-style checks, prefer `pnpm lint` and `pnpm check:types`; run `pnpm test` when a GUI-backed extension test run is available

## Packaging and publishing

All packaging and publishing scripts use `--no-dependencies` because `npm list` can't resolve pnpm's symlinked `node_modules`; all production dependencies are already bundled by esbuild.

- **VS Code Marketplace:** `pnpm vsce:package` to produce a `.vsix`, `pnpm vsce:publish` to publish (requires `VSCE_PAT`). See [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
- **Open VSX:** `pnpm ovsx:package` to produce a `.vsix`, `pnpm ovsx:publish` to publish (requires `OPENVSX_TOKEN`). See [Publishing Extensions (Open VSX)](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).

The `publish-pangolin-vscode.yml` GitHub Action publishes to both marketplaces automatically on `pangolin/vscode@*` tag push.

Cursor sources extensions from Open VSX and applies its own verification/indexing, so availability in Cursor can lag briefly after Open VSX publish. See [Cursor extension docs](https://cursor.com/docs/configuration/extensions).

## Key dependencies

### Tiptap

To learn more, [read the Tiptap docs](https://tiptap.dev/docs).
