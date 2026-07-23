# Online services panel design QA

- Source visual truth: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-87aa50ae-6c36-4981-8320-b82a8758b006.png`
- Implementation screenshot: `C:/Users/Admin/AppData/Local/Temp/autocomplete-plus-online-redesign-final-full.png`
- Combined comparison: `C:/Users/Admin/AppData/Local/Temp/autocomplete-plus-online-redesign-comparison.png`
- Browser viewport: 1280 × 720 CSS px at device scale factor 1
- Source pixels: 728 × 728
- Implementation pixels: 1280 × 720
- State: Simplified Chinese, dark theme, both online features enabled, advanced settings collapsed

## Full-view comparison

The implementation replaces the flat sequence of similarly weighted controls with three distinct working zones: online capabilities, service health, and DeepSeek configuration. The header and footer remain fixed while the form body scrolls. Status, cache, secondary actions, and the single primary save action now have visibly different priorities. Borderless layered surfaces and soft edge shadows replace hard outlines without weakening grouping.

## Focused-region comparison

The combined image is large enough to inspect the two important detail regions directly:

- Service controls and health: switches have supporting copy, state dots use semantic colors, diagnostics form one compact group, and cache clearing is visually restrained.
- Translation form and actions: API key and model share a consistent grid, the API key has an accessible reveal control, metadata is condensed into chips, model actions are secondary, and advanced values remain visible in the collapsed summary.

No raster images, logos, or bespoke illustration assets are part of this interface. PrimeIcons supplies the close and API-key visibility icons.

## Required fidelity surfaces

- Fonts and typography: uses the host-compatible Inter/system stack, a restrained 12–18 px hierarchy, readable line heights, and no clipped primary labels.
- Spacing and layout rhythm: consistent 8 px-derived spacing, 10 px control radii, aligned two-column grids, stable 780 px desktop width, fixed header/footer regions, and borderless depth created by restrained edge shadows.
- Colors and visual tokens: neutral near-black surfaces, low-contrast separators, one blue primary action, semantic green/yellow/red states, and restrained destructive styling.
- Image quality and assets: no image assets are required; standard icon-font glyphs render sharply at the host scale.
- Copy and content: all existing capabilities remain present, supporting text explains background behavior, and visible UI is localized in Simplified Chinese.

## Comparison history

### Pass 1

- P2: the dialog received a visible browser focus outline on open.
  - Fix: focus remains on the dialog for keyboard safety, while the dialog-level outline is suppressed; controls retain their own `:focus-visible` treatment.
- P2: the online-services category was not reliably first and could briefly expose an English ordering key.
  - Fix: the category now uses the current interface locale directly and a non-visible leading sort space, keeping the localized group first.

### Pass 2

- The dialog opens at 780 × 688 px in a 1280 × 720 viewport without horizontal overflow.
- Online services is the first localized settings group.
- API-key reveal and advanced disclosure interactions work.
- No `autocomplete-plus` browser console errors were recorded.
- No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- P3: very small helper text may be slightly dense on unusually low-DPI displays, but remains readable in the tested ComfyUI scale and does not block use.

final result: passed
