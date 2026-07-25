# ComfyUI-Autocomplete-Plus

## English • [简体中文](docs/README_zh.md) • [日本語](docs/README_jp.md)

![Autocomplete preview](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

Autocomplete, related tags, translation, and prompt formatting for ComfyUI text inputs. Supports Danbooru tags, optional e621 data, current ComfyUI frontends, Nodes 2.0, and promoted subgraph inputs.

## Why this fork?

This is a maintained fork of [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus).

Main differences:

#### Compatibility

- Actively maintained for current ComfyUI, including Nodes 2.0 text inputs and inputs promoted from subgraphs.

#### Data and completion

- Uses a local-first workflow: bundled CSV results appear immediately, while LoRA Manager and Danbooru can supplement missing or newer results in the background.
- Merges duplicate candidates predictably and shows a compact source badge, so users can tell whether the displayed data came from CSV, LoRA Manager, or Danbooru.
- Keeps the selected tag stable while background results arrive, avoiding accidental selection changes.
- Improves insertion around commas, spaces, and line breaks; existing tags are recognized instead of being inserted twice.
- Opens related tags immediately from local data, then appends API-only results without reordering the visible list or moving the current selection.

#### Interaction and performance

- Supports continued related-tag exploration, panel pinning, cursor-based opening, Wiki links, and keyboard-first operation.
- Uses virtualized lists and bounded result snapshots to keep large tag collections responsive and prevent list width or scroll position from jumping.

#### Online services and languages

- Persists Danbooru results for faster reuse and offline fallback, with cache status and manual clearing available in **Online Services**.
- For Simplified Chinese, the ffdkj dictionary is preferred and DeepSeek handles missing translations; other supported languages can continue to use DeepSeek.
- Provides a responsive online-services manager and localized UI in English, Simplified Chinese, Traditional Chinese, and Japanese.

## Installation

### ComfyUI-Manager

Search for `ComfyUI-Autocomplete-Aaalice`, install it, and restart ComfyUI. Required Danbooru CSV data downloads automatically on first startup.

### Manual

Clone the repository into ComfyUI's `custom_nodes` directory, then restart ComfyUI:

```bash
git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git
```

## Using the extension

### Autocomplete

Type in a text input to open tag suggestions. Use the arrow keys to select a result and press Enter or Tab to insert it.

- Searches tag names and aliases.
- Supports Danbooru categories, LoRA, Embedding, Wildcard, and optional e621 results.
- Existing tags are dimmed instead of inserted twice.
- Click the Wiki control, or press `F1` on the keyboard-selected tag, to open its Wiki page.

### Related tags

![Related tags preview](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

Select or confirm a complete tag to explore related tags. The panel can be repositioned, pinned, and used repeatedly without closing after every insertion.

### Auto formatter

The formatter can clean repeated spaces and commas when leaving a text input. It can also be run manually and disabled in settings.

| Action | Default shortcut |
| --- | --- |
| Open related tags at the cursor | `Ctrl+Shift+Space` |
| Open Wiki for the selected tag | `F1` |
| Format the current prompt | `Alt+Shift+F` |
| Close an open panel | `Esc` |

## Data sources and translation

- The bundled Danbooru CSV is the primary local source and may include SFW and NSFW tags.
- [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) can provide local tag, LoRA, Embedding, and Wildcard results.
- Anonymous Danbooru requests can supplement missing or newer tags and related tags. Local results remain available if the service is offline.
- Simplified Chinese can use the [ffdkj translation dictionary](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table). It is downloaded separately because its upstream repository does not currently declare a license.
- DeepSeek can translate dictionary misses and languages not covered by the Chinese dictionary. Configure it under **Online Services**.
- The Chinese-dictionary page is shown only when ComfyUI uses a Chinese interface.

## Custom CSV files

Place custom files in `data/`, then refresh the browser:

- Autocomplete: `<danbooru|e621>_tags*.csv`
- Related tags: `<danbooru|e621>_tags_cooccurrence*.csv`

Autocomplete CSV rows use:

```csv
tag,category,count,alias
masterpiece,5,9999999,
```

Quoted tag combinations can be inserted as one preset:

```csv
"masterpiece, best quality, highres",5,9999999,<c:HighQuality>
```

e621 data is not downloaded automatically. Add an `e621_tags.csv` file manually; e621 related tags are not currently supported.

## Settings

Open ComfyUI settings and find **Autocomplete Plus**.

- Choose enabled tag sources, result limits, comma insertion, underscore replacement, and LoRA/Embedding completion.
- Configure related-tag triggers, panel direction, alias display, and auto formatting.
- Use **Online Services** to manage Danbooru caching, the Chinese dictionary, and DeepSeek.

To disable automatic CSV update checks at startup, edit `csv_meta.json`:

```json
{
  "version": 1,
  "check_updates_on_startup": false
}
```

Manual CSV update checks remain available in settings.

## Known limitations

- Large CSV collections increase browser startup time and memory use.
- Dynamic prompts such as `from {above|below|side}` cannot provide reliable related tags before their wildcard value is resolved.

## Credits

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
- [ffdkj-Danbooru_Tag-Chinese-English-Translation-Table](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)
