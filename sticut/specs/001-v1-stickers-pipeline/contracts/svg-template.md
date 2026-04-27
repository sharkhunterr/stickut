# Frame Template SVG Contract

**Date**: 2026-04-27
**Branch**: `001-v1-stickers-pipeline`

This is the contract a `.svg` file must satisfy to be accepted as a
frame template by Stickut. The contract is enforced at load time
(FR-035) by `backend/app/frames/loader.py`.

## File location

- Path: `STICKUT_TEMPLATES_DIR/<id>.svg` (default `/app/templates/<id>.svg`).
- `<id>` is derived from the file basename: lowercased, `[^a-z0-9_-]`
  collapsed to `-`. The id MUST match `^[a-z0-9_-]+$`.

## Required structure

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:stickut="https://stickut.local/ns"
     viewBox="0 0 210 297"
     width="210mm" height="297mm">

  <metadata>
    <stickut:meta>
      <stickut:name>Botanique</stickut:name>
      <stickut:sticker-area x="15" y="35" width="180" height="247"/>
    </stickut:meta>
  </metadata>

  <!-- Optional: any number of elements with data-stickut="frame-color" -->
  <g data-stickut="frame-color" fill="#000000">
    <path d="..." />
  </g>

  <!-- Optional: at most one element with data-stickut="header-text" -->
  <text data-stickut="header-text"
        x="105" y="25" text-anchor="middle"
        font-family="Georgia" font-size="14"
        fill="#000000">PLACEHOLDER</text>

  <!-- Anything else renders as-is -->
</svg>
```

## Validation rules (loader)

| # | Rule | On failure |
|---|---|---|
| 1 | Parses as XML via lxml without error | template skipped, warning logged |
| 2 | Root element is `<svg>` in `http://www.w3.org/2000/svg` namespace | skipped, warning |
| 3 | `viewBox` attribute equals `0 0 210 297` (whitespace-tolerant) | skipped, warning |
| 4 | Exactly one `<stickut:meta>` element exists in `<metadata>` | skipped, warning |
| 5 | Exactly one `<stickut:sticker-area>` child of `<stickut:meta>` | skipped, warning |
| 6 | `sticker-area` has 4 numeric attributes `x`, `y`, `width`, `height` | skipped, warning |
| 7 | `width > 0` and `height > 0` | skipped, warning |
| 8 | `sticker-area` is fully contained within the viewBox `(0,0,210,297)` | skipped, warning |
| 9 | At most one element with `data-stickut="header-text"` | skipped, warning |
| 10 | If present, the `header-text` element is `<text>` | skipped, warning |

`<stickut:name>` is optional; when missing, the loader falls back to a
humanized version of the filename (e.g. `stars-confetti.svg` →
`Stars Confetti`).

## Behavior at runtime

### Color injection

For every element with `data-stickut="frame-color"`:
- The `fill` attribute is replaced with the user-chosen color.
- The `stroke` attribute, if present, is replaced too.
- For `<g>` elements: the replacement applies on the `<g>` itself; SVG
  fill inheritance carries it down to children that don't override
  `fill`. Children that explicitly set their own `fill` keep theirs —
  this is intentional (lets the template author keep accent colors
  fixed).

### Header text injection

For the (optional, single) element with `data-stickut="header-text"`:
- The text content is replaced with the user-typed header.
- The `fill` attribute is replaced with the user-chosen color.
- If the header text is empty (after trim), the element receives
  `display="none"` instead.

### Sticker area

The frontend reads `sticker_area` from the API summary and constrains
the maxrects packer to that rectangle (in mm). Coordinates are in the
SVG user-unit system, which equals mm given the fixed viewBox.

## Provided V1 templates

These ship in `templates/` at install time and serve as canonical
examples:

| File | Catégorie | `sticker-area` |
|---|---|---|
| `stars-confetti.svg` | bordure partielle | `15 35 180 247` |
| `rainbow-sky.svg` | bordure partielle | `15 50 180 230` |
| `ocean-waves.svg` | bordure partielle | `15 35 180 247` |
| `dino-tracks.svg` | bordure partielle | `15 35 180 247` |
| `stall-festive.svg` | bordure complète | `25 50 160 220` |
| `bunting-garland.svg` | bordure complète | `20 40 170 235` |
| `scallop-frame.svg` | bordure complète | `20 35 170 240` |

Exact `sticker-area` values may be tuned during implementation but MUST
remain inside `0 0 210 297` and produce a layout that visually accommodates
its decorative perimeter.

## Hot-reload semantics (FR-034)

- The loader does NOT cache templates in memory between calls.
- Each `GET /api/templates` re-walks the directory and re-parses all
  `.svg` files.
- A user who has selected a template that is then deleted from disk
  receives a fresh list on the next refresh; if the selected id is no
  longer in the list, the frontend reverts to "Sans cadre" silently.

## Example: minimal valid template

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:stickut="https://stickut.local/ns"
     viewBox="0 0 210 297" width="210mm" height="297mm">
  <metadata>
    <stickut:meta>
      <stickut:name>Minimal</stickut:name>
      <stickut:sticker-area x="10" y="10" width="190" height="277"/>
    </stickut:meta>
  </metadata>
</svg>
```

This template has no decorative elements, no color, no header — it is
equivalent to "Sans cadre" with custom margins. Useful for testing.
