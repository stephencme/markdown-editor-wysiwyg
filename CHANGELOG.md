# Changelog

This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) formatting and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## \[Unreleased]

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
- `Open in Markdown Editor (WYSIWYG)` command and editor tab bar action
- `View Source` command and editor tab bar action to reopen the active file in the built-in text editor
