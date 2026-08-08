# Design QA: compact autocomplete and related tags

- Source visual truth: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-493ba00f-300b-4628-b314-35d19d422d39.png`
- Same-viewport implementation: `C:/Users/Admin/AppData/Local/Temp/autocomplete-plus-design-qa-autocomplete-778.png`, `C:/Users/Admin/AppData/Local/Temp/autocomplete-plus-design-qa-related-tags-778.png`
- Narrow responsive implementation: `C:/Users/Admin/AppData/Local/Temp/autocomplete-plus-design-qa-autocomplete.png`, `C:/Users/Admin/AppData/Local/Temp/autocomplete-plus-design-qa-related-tags.png`
- Viewports: `778 × 768` and `480 × 640` CSS px
- Pixel density: source and implementation screenshots captured at 1 CSS px per output px
- State: dark theme, Nodes 2.0 `CLIP文本编码`, populated autocomplete and related-tags panels

## Full-view comparison

The source shows a horizontally placed related-tags panel whose metric and source columns are clipped by the textarea. At the same `778 × 768` viewport, both revised panels remain within the viewport, keep every column visible, and preserve the existing ComfyUI visual language. At `480 × 640`, autocomplete contracts to a compact four-content-column layout and related tags move above the input because neither horizontal side is usable.

## Focused dense-list comparison

Focused list captures were required because the relevant change is column-level density. Tag, translation, metric, and source values remain readable; `scrollWidth` equals `clientWidth` in every captured panel, confirming there is no hidden horizontal overflow. Long values use the existing ellipsis and hover-title behavior.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Typography: existing ComfyUI fonts, weights, line height, truncation, and category colors are preserved.
- Spacing and layout: narrow container queries reduce fixed columns and padding; the smallest mode removes only the low-priority Wiki column. Rounded borderless surfaces and restrained edge shadows improve separation without adding visual weight.
- Colors and tokens: all row, selection, category, and muted-text colors continue to use existing theme tokens.
- Image quality: no new raster or decorative assets are required; existing category and Wiki icons remain sharp.
- Copy and content: labels, translations, counts, and similarities are unchanged. The source column intentionally shows only the final highest-priority `CSV`, `LM`, or `API` badge.

## Comparison history

1. Initial P1: the related-tags metric and source columns were outside the visible panel, and horizontal placement could overlap the input edge.
2. Fix: introduced viewport-bounded placement with an anchor gap, side selection, above/below fallback, and responsive grid tracks for compact and ultra-compact widths.
3. Post-fix evidence: same-viewport and narrow captures show complete columns with no horizontal overflow. Autocomplete insertion and related-tag switching were exercised successfully, and no `Autocomplete-Plus` console errors were recorded.
4. Source-column refinement: autocomplete and related-tags rows were rechecked with mixed CSV, LoRA Manager, and API candidates. Every rendered row contained at most one source badge, and both lists retained `scrollWidth === clientWidth`.

## Follow-up polish

No blocking polish remains.

final result: passed
