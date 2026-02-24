# Changelog

This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html) conventions.

## \[Unreleased]

## \[0.7.0] - 2026-02-23

### Fixed

- Resolved undo/redo conflicts by overriding keybindings when the markdown editor is active and routing all undo/redo through the webview as the single source of truth
- Fixed expected-apply queue consumption during applying-edit path to prevent stale entries from suppressing legitimate undo SET_CONTENT
- Improved out-of-bounds selection clamping to preserve cursor position instead of discarding it

## \[0.6.0] - 2026-02-23

### Changed

- Hardened markdown round-trip behavior by replacing fragile regex transforms with AST-based normalization and stronger type-safe helpers
- Improved host/webview sync resilience with stricter sequence handling, better echo suppression, and added race-path regression coverage
- Fixed image handling for data URLs and webview URI restoration so pasted and embedded images preserve expected behavior

## \[0.5.0] - 2026-02-23

### Changed

- Stabilized GFM task-list round-trip behavior, including empty and nested task-item bracket preservation
- Improved list spacing/alignment consistency in the editor and preserved linked inline images in round-trips
- Updated webview reading width for improved markdown editing ergonomics
- Release includes: https://github.com/stephencme/apps/pull/11

## \[0.4.0] - 2026-02-23

### Changed

- Refactored markdown document sync into a dedicated coordinator with typed host/webview message protocol, sequence guards, and additional sync diagnostics

### Known issues

- Rapid undo/redo sequences can still trigger intermittent focus/scroll jumps while sync equivalence is being hardened

## \[0.3.1] - 2026-02-20

### Changed

- Updated command naming to match VS Code title-case conventions (`Open with Built-in Text Editor`)
- Updated README command labels to match in-product command titles

## \[0.3.0] - 2026-02-20

### Added

- Link insertion/edit via `Cmd+Alt+K`
- Image paste support via in-document `data:` URLs

### Changed

- Renamed editor switching commands to `Open with Markdown Editor (WYSIWYG)` and `Open with built-in text editor`
- Updated docs for current GFM accessibility

## \[0.2.0] - 2026-02-20

### Added

- Clipboard integration: paste converts Markdown to rich text, copy converts rich text back to Markdown

## \[0.1.3] - 2026-02-18

### Changed

- Updated README screenshot to use a GitHub-hosted absolute URL so it will render correctly on VS Code Marketplace/Open VSX listings
- Compressed bundled extension media assets (`media/icon.png`, `media/screenshot.png`) to reduce package size

## \[0.1.2] - 2026-02-18

### Added

- Added `ovsx:package` and `ovsx:publish` scripts for Open VSX release support

### Changed

- Documented the dual-publish release flow (`vsce` + Open VSX) and Cursor availability notes in `CONTRIBUTING.md`

## \[0.1.1] - 2026-02-18

### Changed

- Added a Marketplace description in `package.json`

## \[0.1.0] - 2026-02-18

### Added

- Initial release of the Markdown Editor (WYSIWYG) extension
- Rich text editing for GitHub Flavored Markdown (GFM)
- In-editor Find support (`Command+F`) inside the rich text view
- `Open with Markdown Editor (WYSIWYG)` command and editor tab bar action
- `Open with Built-in Text Editor` command and editor tab bar action to reopen the active file in the built-in text editor
