# ComfyUI-Autocomplete-Aaalice

## English • [简体中文](../README.md) • [繁體中文](README_zh-TW.md) • [日本語](README_jp.md)

![Autocomplete preview](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

Autocomplete, related tags, translation, and prompt formatting for ComfyUI text inputs. Supports Danbooru tags, optional e621 data, current ComfyUI frontends, Nodes 2.0, and inputs promoted from subgraphs.

This is a maintained fork of [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus).

## ✨ Features

- **Autocomplete**: search Danbooru tags and aliases while typing, with category, count, and source badges. Existing tags are dimmed instead of inserted twice.
- **Chinese autocomplete**: in a Simplified Chinese UI, type a Chinese name such as `无职转生` to find and insert the English tag `mushoku_tensei`.
- **Related tags**: explore tags that commonly appear together, insert them repeatedly, pin the panel, and open Wiki pages directly.
- **Translation**: show Chinese translations next to tags via the ffdkj dictionary, with DeepSeek covering dictionary misses and other languages.
- **Auto formatter**: clean repeated spaces and commas when leaving a text input, or run it manually.
- **Multiple data sources**: bundled CSV data first, with LoRA Manager and Danbooru supplementing missing or newer results in the background. Local results keep working offline.
- **Localized UI**: English, Simplified Chinese, Traditional Chinese, and Japanese.

### 🔀 Compared to upstream

- Maintained for current ComfyUI, including Nodes 2.0 text inputs and subgraph-promoted inputs.
- ComfyUI startup is no longer blocked by large CSV and model indexes; completion stays available while indexing finishes in the background.
- Local-first completion and related tags, with online results merged in without disturbing the current list or selection.
- Optional persistent Danbooru caching and a Chinese translation dictionary, managed under **Online Services**.

## 📦 Installation

### ComfyUI-Manager

Search for `ComfyUI-Autocomplete-Aaalice`, install it, and restart ComfyUI. Required Danbooru CSV data downloads automatically on first startup.

### Manual

Clone the repository into ComfyUI's `custom_nodes` directory, then restart ComfyUI:

```bash
git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git
```

## 🚀 Usage

### 🔍 Autocomplete

Type in a text input to open tag suggestions. Use the arrow keys to select a result and press Enter or Tab to insert it.

- Searches tag names and aliases.
- Supports Danbooru categories, LoRA, Embedding, Wildcard, and optional e621 results.
- Click the Wiki control, or press `F1` on the keyboard-selected tag, to open its Wiki page.

### 🏷️ Related tags

![Related tags preview](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

Select or confirm a complete tag to explore related tags. The panel can be repositioned, pinned, and used repeatedly without closing after every insertion.

### ⌨️ Shortcuts

| Action | Default shortcut |
| --- | --- |
| Open related tags at the cursor | `Ctrl+Shift+Space` |
| Open Wiki for the selected tag | `F1` |
| Format the current prompt | `Alt+Shift+F` |
| Close an open panel | `Esc` |

## 🌐 Data sources and translation

- The bundled Danbooru CSV is the primary local source and may include SFW and NSFW tags.
- [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) can provide local tag, LoRA, Embedding, and Wildcard results.
- Anonymous Danbooru requests can supplement missing or newer tags and related tags.
- Simplified Chinese can use the [ffdkj translation dictionary](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table). It is downloaded separately because its upstream repository does not currently declare a license.
- DeepSeek can translate dictionary misses and languages not covered by the Chinese dictionary. Configure it under **Online Services**.
- The Chinese-dictionary page is shown only when ComfyUI uses a Chinese interface.

## 📄 Custom CSV files

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

## ⚙️ Settings

Open ComfyUI settings and find **Autocomplete Plus**.

- Choose enabled tag sources, Chinese autocomplete, result limits, comma insertion, underscore replacement, and LoRA/Embedding completion.
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

## ⚠️ Known limitations

- Large CSV collections can take time and memory to finish indexing; autocomplete remains available with a fallback while local indexes are prepared.
- Dynamic prompts such as `from {above|below|side}` cannot provide reliable related tags before their wildcard value is resolved.

## 🙏 Credits

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
- [ffdkj-Danbooru_Tag-Chinese-English-Translation-Table](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)
