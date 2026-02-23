# Markdown Editor (WYSIWYG)

[![Open VSX](https://img.shields.io/open-vsx/v/stephencme/markdown-editor-wysiwyg?label=Open%20VSX)](https://open-vsx.org/extension/stephencme/markdown-editor-wysiwyg) [![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/stephencme.markdown-editor-wysiwyg?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=stephencme.markdown-editor-wysiwyg)

A clean, distraction-free editor for Markdown.

Edit [GFM (GitHub Flavored Markdown)](https://github.github.com/gfm/) as rich text with all of the benefits of `.md` files – clean, readable, and source control-friendly.

The editor updates in real time as your Markdown changes, so it works perfectly side-by-side with your AI agent of choice like Cursor, Claude Code, and Codex.

![Screenshot](https://raw.githubusercontent.com/stephencme/markdown-editor-wysiwyg/main/media/screenshot.png)

## Quick start

Right-click any `.md` file in the Files Explorer and choose **Open with...** > **Markdown Editor (WYSIWYG)**.

### Switch between editors

The **Open with Built-in Text Editor** and **Open with Markdown Editor (WYSIWYG)** commands are available from the tab bar and Command Palette.

_Note that in Cursor 2.1+, editor action icons are [hidden by default](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207). To show them, click on the three dots in the editor tab bar menu and select **Configure Icon Visibility** for each command._

#### Open with Built-in Text Editor

Opens the current `.md` file in your IDE's built-in text editor (available when the rich text editor is open).

#### Open with Markdown Editor (WYSIWYG)

Opens the current `.md` file in the rich text editor (available when your IDE's built-in text editor is open).

## GFM accessibility

The editor supports GFM round-tripping for all major types:

| GFM type                                                 | Accessibility                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading 1-6                                              | Keyboard (`Cmd+Alt+1..6`) and markdown (`#`..`######`)                                                                                             |
| Bold / italic / strikethrough / inline code / code block | Keyboard (`Cmd+B`, `Cmd+I`, `Cmd+Shift+S`, `Cmd+E`, `Cmd+Alt+C`) and markdown (`**text**`, `*text*`, `~~text~~`, `` `text` ``, fenced code blocks) |
| Blockquote / bullet list / ordered list / task list      | Keyboard (`Cmd+Shift+B`, `Cmd+Shift+8`, `Cmd+Shift+7`, `Cmd+Shift+9`) and markdown (`>`, `-`/`+`/`*`, `1.`, `[ ]` / `[x]`)                         |
| Horizontal rule                                          | Markdown (`---`, `___`, `***`)                                                                                                                     |
| Hard break                                               | Keyboard (`Cmd+Enter` / `Shift+Enter`)                                                                                                             |
| Link                                                     | Keyboard (`Cmd+Alt+K`) and insert on paste                                                                                                         |
| Image                                                    | Insert on paste (`data:` URLs)                                                                                                                     |
| Table                                                    | Partially editable (inserting new tables/rows/columns not yet supported)                                                                           |
