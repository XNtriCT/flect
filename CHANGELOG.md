# Changelog

Notable changes per release. FLECT follows [semantic versioning](https://semver.org).

## 1.1.0 — 2026-10-26

### Added
- Editable AI prompts. Every key has a task prompt and a system prompt, both
  overridable in Settings → Prompts, with `{{selection}}`, `{{context}}` and
  `{{instruction}}` placeholders and per-key reset.
- Native right-click menu: spelling suggestions, clipboard commands, and the
  five AI actions on the current selection.
- Window layout menu and `Win`+arrow snapping: halves, quarters, maximise.
- Collapsible navigator (`Ctrl+Shift+B`, edge chevron, View menu), remembered
  between sessions.

### Fixed
- `The provider returned an empty answer.` Reasoning models that stream no
  prose now trigger one retry with a larger budget, then report the wire shape,
  model and byte count received.
- Deleting a prompt override did not persist, because settings merged nested
  objects instead of replacing the prompt map.
- Half-screen snapping was impossible: the window minimum was wider than half
  of a 1360 px display.
- Trailing characters could be lost while hand-editing an AI suggestion.

## 1.0.1 — 2026-10-25

### Fixed
- Markdown files could not be opened: `marked` was a dev dependency and missing
  from the packaged asar.
- Save As only offered DOCX. It now presents an eight-format grid.
- OpenCode Go rejected requests: added the session header, a real user agent,
  and routing across the three wire protocols the service exposes.

## 1.0.0 — 2026-10-25

First release: rich-text manuscript editor, DOCX/Markdown/TXT/HTML/RTF/FLECT
open, DOCX/PDF/EPUB/Markdown/TXT/HTML/RTF/FLECT export, five AI revision actions,
find and replace, page view, outline navigator, crash recovery, NSIS installer.
