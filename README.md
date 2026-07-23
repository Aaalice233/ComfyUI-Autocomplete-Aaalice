# ComfyUI-Autocomplete-Plus

## English • [简体中文](docs/README_zh.md) • [日本語](docs/README_jp.md)

![ss01](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

## Overview

**ComfyUI-Autocomplete-Plus** is a custom node that provides multiple input assistance features for any text area in [ComfyUI](https://github.com/comfyanonymous/ComfyUI). Currently, it supports Danbooru and e621 tags (e621 does not support some functions).

## Why This Fork?

This repository is a maintained fork of [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus). The upstream project has been inactive for an extended period and has not kept pace with recent ComfyUI frontend changes. This fork was created to keep the extension usable on current ComfyUI versions and to continue compatibility fixes.

### Differences from Upstream

#### Compatibility and maintenance

- Actively maintained for current ComfyUI frontend versions.
- Supports **Nodes 2.0** text inputs and promoted **subgraph-node** inputs, including resolution back to the real inner node and widget.

#### Local-first data sources

- Shows the bundled Hugging Face CSV immediately, then merges LoRA Manager and Danbooru results concurrently in the background.
- Longer Danbooru queries use contains-style matching, so a series fragment can discover character tags that include it.
- Reuses LoRA Manager's tag, LoRA, Embedding, and Wildcard APIs, while avoiding duplicate autocomplete inside LoRA Manager's own inputs.
- Displays `CSV`, `LM`, and `API` badges in a dedicated trailing source column, so badges never squeeze long English tags. Duplicate candidates retain every contributing source, with full descriptions on hover.
- Ranks Danbooru, e621, CSV, and LoRA Manager candidates together by popularity instead of splitting the list by source.

#### A smoother autocomplete workflow

- Partial tags reopen autocomplete; accepting a complete tag switches directly to related tags; a trailing comma still resolves the preceding tag.
- Related tags open from the complete local snapshot without waiting for Danbooru. API-only rows append later without reordering results or shifting the selection and scroll position.
- Tag insertion reuses and normalizes nearby commas and line breaks, avoiding empty slots and duplicate separators.
- Related-tag exploration continues after insertion. The panel can be pinned or opened at the cursor with `Ctrl+Shift+Space`.
- Existing tags are grayed out and selected in place instead of being inserted twice.
- Wiki pages are available from row and panel controls, or with `F1` for the keyboard-selected tag.

#### Fast, stable large lists

- Builds one bounded result snapshot up front, so the scrollbar has its final length immediately.
- Fixed-row virtualization mounts only visible rows plus overscan; scrolling performs no search, pagination, or translation work.
- Keeps typing responsive with frame-coalesced searches, bounded candidate pools, chunked CSV parsing, an append-only translation index, deferred SQLite work, and cached related-tag scoring.
- Uses alternating rows, a persistent selection accent, stable keyboard navigation, reserved scrollbar space, and viewport-aware popup positioning.
- Locks the popup width for its visible lifetime so virtual scrolling and late translations cannot make the list wobble.
- Gives more room to English tags and a shorter fixed translation column; hover reveals any truncated text.

#### Persistent online services and translation

- Persists Danbooru completion and related-tag snapshots with background refresh, offline fallback, concurrent-request coalescing, bounded LRU cleanup, statistics, and manual clearing.
- Prefetches a fixed leading translation window in bounded concurrent batches, independently of scrolling. DeepSeek results form a persistent searchable dictionary.
- Supports model discovery, health checks, and optional thinking effort.
- Places **Online services** first in settings, with independent Danbooru and translation switches. Disabling either feature preserves its cache.
- Online enrichment never blocks local typing; failures remain non-disruptive while useful diagnostics stay available in settings.

#### Small details that add up

- Filters displayed aliases to the current ComfyUI language while keeping the complete alias set searchable.
- Uses category-specific emoji markers with localized hover labels for general, artist, copyright, character, meta, model, and other tag types.
- Localizes titles, loading and empty states, controls, Wiki links, source badges, and tooltips in English, Simplified Chinese, Traditional Chinese, and Japanese.
- Maintains matching English, Simplified Chinese, and Japanese documentation for both headline features and smaller interaction refinements.

The original project remains the foundation of this fork. Existing features and credits are preserved wherever possible.

## Features

- **:zap:No setup required**: Automatically downloads CSV data optimized for Danbooru tags.
- **:mag:Autocomplete**: Displays tag suggestions in real-time based on your input as you type.
- **:file_cabinet:Related Tags Display**: Shows a list of tags highly related to the selected tag.
- **:triangular_ruler:Auto Formatter**: Automatically formats prompt text when the textarea loses focus, cleaning up extra spaces and commas.
- **:earth_asia:Multilingual Support**: Supports input completion in Japanese, Chinese, and Korean.
- **:computer_mouse:Intuitive Operation**:
    - Supports both mouse and keyboard operations.
    - Natural tag insertion that considers cursor position and existing text.
- **:art:Design**: Supports both light and dark themes of ComfyUI.
- **:pencil:User CSV**: Allows users to add their own CSV files for autocomplete suggestions.
- **:twisted_rightwards_arrows:Modern ComfyUI Compatibility**: Supports Nodes 2.0 and promoted text inputs on subgraph nodes.
- **:arrows_counterclockwise:Online Tag Completion**: Checks and merges Danbooru results in the background without downloading a second tag database.
- **:speech_balloon:On-demand Translation**: Translates visible ordinary Danbooru and e621 tags through DeepSeek once, caches the result, and makes translated aliases searchable.
- **:link:LoRA Manager Integration**: Reuses LoRA Manager's local indexes for supplemental tag, LoRA, Embedding, and Wildcard suggestions.

## Installation

### ComfyUI-Manager

1. Search for `Autocomplete-Plus` in [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager), install the custom node that appears, and restart.
2. The necessary CSV data will be automatically downloaded from HuggingFace upon startup.

### Manual

1. Clone or copy this repository into the `custom_nodes` folder of ComfyUI.
   `git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git`
2. Launch ComfyUI. The necessary CSV data will be automatically downloaded from HuggingFace upon startup.

## Autocomplete

When you type in a text input area, tags that partially match the text are displayed in descending order of post count. You can select a tag with the up and down keys, and insert the selected tag by pressing Enter or Tab.

- Tag aliases are also included in the search. Japanese hiragana and katakana are searched without distinction.
- Tags are color-coded by category. The color-coding rules are the same as Danbooru.
- Each suggestion uses a distinct category emoji; hover it to see the category and source.
- Matching suggestions are ranked globally by their displayed post count (popularity) by default. Match quality and source priority are only used to break equal-popularity results.
- The active suggestion uses a persistent accent highlight, including the initially selected first row and while the pointer is hovering it.
- Tags that have already been entered are displayed grayed out.
- You can display Danbooru and e621 tags at the same time. You can also change the priority from the settings.
- Supports autocomplete for Lora and Embedding inputs. You can enable/disable this feature in the settings.
- Clicking the 📖 icon opens the tag's Wiki page. If a tag is selected via keyboard, you can open it with the `F1` key.

## Related Tags

![ss02](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

When you select any tag in a text input area, a list of highly related tags is displayed. You can insert a tag by clicking it or by selecting it with the up/down arrow keys and then pressing Enter or Tab. The UI's position and size are automatically adjusted based on the text area being edited.

- The complete local co-occurrence snapshot is rendered first. Danbooru's official related-tag API is requested afterward, and API-only tags are appended without reordering local rows, moving the current selection, or waiting before opening the panel.
- Clicking a partial tag reopens autocomplete. Related tags are shown only when the clicked tag has co-occurrence data, so an empty related-tags panel does not replace useful completion suggestions.
- Accepting an autocomplete suggestion with Enter, Tab, or a mouse click immediately displays related tags for the completed tag when co-occurrence data is available.
- Clicking immediately after a tag's trailing comma or the spaces following that comma displays the related tags for the preceding tag.
- Inserting a related tag reuses and normalizes nearby separators, so it works consistently at the end of a prompt, between existing tags, and next to line breaks without producing duplicate commas.
- After a related tag is inserted, the panel immediately switches to that tag's co-occurrences, allowing related tags to be selected continuously. A pinned panel intentionally stays on its pinned tag.
- When clicking switches between autocomplete and related tags, opening one closes the other (except when the related-tags panel is pinned).

- The display position is primarily at the bottom of the text area and automatically adjusts vertically based on available space.
  - You can switch between vertical and horizontal display positions using the "↕️|↔️" button in the header.
- You can toggle the pinned state of the displayed related tags using the "📌|🎯" button in the header. To close the UI when pinned, press the Esc key.
- Clicking the tag in the header opens the tag's Wiki page.
- Tags that have already been entered are displayed grayed out. If you try to insert a grayed-out tag, the already entered tag will instead be selected.
- You can display related tags for the cursor position by pressing `Ctrl+Shift+Space`.

## Auto Formatter

When a text input area loses focus (e.g., by clicking outside or pressing Tab), the prompt text is automatically formatted. This feature improves readability when editing large amounts of text.

Detailed behavior is as follows:
- Automatically adds a comma and space after each tag for proper separation
- Removes extra commas and spaces between tags
- You can manually trigger formatting using the keyboard shortcut `Alt+Shift+F` (keybinding can be customized in ComfyUI settings)
- You can enable/disable this feature in the settings

> [!NOTE]
> Auto-formatting is disabled for certain nodes to prevent errors.  
> Example: [Power Puter (rgthree)](https://github.com/rgthree/rgthree-comfy/wiki/Node:-Power-Puter) `code` field, [LoraLoaderBlockWeight (Inspire)](https://github.com/ltdrdata/ComfyUI-Inspire-Pack) `block_vector` field

## CSV Data

Two basic CSV data files are required for operation. These are managed on [HuggingFace](https://huggingface.co/datasets/newtextdoc1111/danbooru-tag-csv) and are automatically downloaded when ComfyUI is first launched after installation, so no setup is required.  
Since the basic CSV files are based on the Danbooru dataset publicly available on HuggingFace, the post counts and related tag information may differ from the Danbooru website.

> [!IMPORTANT]
> The basic CSV contains both SFW and NSFW tags.

**danbooru_tags.csv**

This is a tag information CSV file for autocomplete, containing tag names, categories, post counts, and aliases (including Japanese, Chinese, and Korean). The column structure is the same as that used in [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete).

Tag information is filtered under the following conditions:
- Post count of 100 or more
- Image score of 5 or more
- Category is `general, character, or copyright`
- Tag name does not contain `(cosplay)`

**danbooru_tags_cooccurrence.csv**

This is a CSV file for related tag calculation, recording tag pairs and their co-occurrence counts.

Tag pairs are further filtered from the tag information CSV under the following conditions:
- Co-occurrence count of 100 or more

### e621 CSV

Currently, automatic download of CSV for e621 is not supported, so please manually place a CSV with the same structure as `danbooru_tags.csv` in the data folder with the name `e621_tags.csv`.
Also, displaying related tags is not supported.

### User CSV

Users can also use their own CSV files. CSV files should be placed in the `data` folder according to the following naming convention:

- **CSV for Autocomplete**: `<danbooru | e621>_tags*.csv`
- **CSV for Related Tags**: `<danbooru | e621>_tags_cooccurrence*.csv`

For example, you can add frequently used meta tags to the autocomplete suggestions by placing a file named `danbooru_tags_meta.csv` in the `data` folder.
A header row is not required. A browser reload is necessary to apply the changes.

**Example of meta tags:**
```csv
tag,category,count,alias
masterpiece,5,9999999,
best_quality,5,9999999,
high_quality,5,9999999,
normal_quality,5,9999999,
low_quality,5,9999999,
worst_quality,5,9999999,
```

When the browser is reloaded, you can check the list of loaded CSV files in the ComfyUI console log. If a file is not included in the log output, please verify that the file name follows the naming convention.

**Example of ComfyUI console log output:**
```
[Autocomplete-Plus] CSV file status:
  * Danbooru -> base: True, extra: danbooru_tags_meta.csv // If displayed here, meta tags can be autocompleted
  * E621 -> base: False, extra:
```

>[!NOTE]
> If there are multiple user CSV files, they are loaded in alphabetical order. If the same tag exists in multiple files, the one loaded first is retained. The basic CSV is loaded last.

### Bulk Tag Insertion (Pseudo "Chants")

By enclosing multiple tags with `""` (double quotation marks), you can insert frequently used tags in bulk.
This is similar to the **Chants** feature in [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete?tab=readme-ov-file#chants).

For example, by preparing the following CSV, you can quickly insert corresponding tags by typing `<c:Basic-HighQuality>` or `<c:Basic-Negative>`.

**`danbooru_tags_chants.csv`:**
```
"masterpiece, best quality, high quality, highres, ultra-detailed",5,9999999,<c:Basic-HighQuality>
"(worst quality, low quality:1.4), normal quality",5,9999999,<c:Basic-Negative>
```

>[!TIP]
> * Text enclosed in `""` does not escape `()` (parentheses). Tags that originally contain parentheses should be written in the CSV with escaped parentheses. Example: `copyright_(series)` -> `copyright_\(series\)`
> * The alias column also supports `""`, allowing you to assign multiple aliases

## Settings

### Tag Source

> [!NOTE]
> The source of tag data such as Danbooru or e621 is called the "tag source".

- **Autocomplete Tag Source**: The tag source to display in the autocomplete suggestions. Select "all" to display all loaded tag sources.
- **Primary source for 'all' Source**: When `Autocomplete Tag Source` is set to "all", the tag source specified here will be displayed with priority.
- **Tag category icon position**: Where to display the category emoji. Hover it for the localized category and source; select "hidden" to hide it.

### Autocomplete

- **Enable Autocomplete**: Enable/disable the autocomplete feature.
- **Maximum autocomplete results**: Safety limit for the complete in-memory result snapshot (default: 1,000; configurable up to 2,000). Only visible rows are mounted in the DOM.
- **Auto-Insert Comma**: Automatically insert a comma after tags when inserting from autocomplete.
- **Replace '_' with 'Space'**: Replaces underscores with spaces when inserting tags. This setting also affects related tag display.
- **String to add before artist tags**: Text to prepend when inserting an artist tag. For Anima models, specify `@`.
- **Enable Loras and Embeddings**: Display Lora and Embedding in the suggestions.
- **Use Fast Search**: Use indexed autocomplete search (enabled by default). Sources with at least 50,000 loaded tags always avoid the blocking sequential scan, even if this setting was previously saved as disabled.

### Related Tags

- **Enable Related Tags**: Enable/disable the related tags feature.
- **Maximum co-occurrence results**: Safety limit for the complete in-memory co-occurrence snapshot (default: 25,000). Only visible rows are mounted in the DOM.
- **Default Display Position**: Default display position when ComfyUI starts.
- **Related Tags Trigger Mode**: Which action will trigger displaying related tags for the entered tag (click only, Ctrl+click)

### Display

- **Hide Alias**: Hide/show the Alias ​​column in autocomplete and related tags (default is show)

### Auto Formatter

- **Enable Auto Format**: Enable/disable the automatically format prompt text when the textarea loses focus.
- **Auto Format Trigger**: Choose when formatting is applied.
  - **Auto**: Format automatically when leaving text field
  - **Manual**: Format only via keyboard shortcut (default: `Alt+Shift+F`)
- **Use Trailing Comma**: When enabled, ensures all lines end with a trailing comma when formatting. If disabled, removes trailing commas.
- **Trim Surrounding Spaces**: When enabled, trim any blank lines or spaces from the beginning and end of the prompt.

### LoRA Manager Integration

When [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) is installed, **Auto** mode supplements autocomplete from its local `/api/lm/custom-words/search`, `/api/lm/loras/relative-paths`, `/api/lm/embeddings/relative-paths`, and `/api/lm/wildcards/search` indexes. API failures fall back to the built-in data without interrupting input. LoRA Manager's own autocomplete text boxes are excluded automatically; additional third-party node types can be listed under **Excluded node types**.

### Online Completion and Translation

Autocomplete computes the complete bounded local snapshot immediately, then queries LoRA Manager and one Danbooru snapshot of up to 200 tags concurrently and merges them. Danbooru uses prefix matching for two- or three-character input, then switches to contains matching so a franchise query such as `wuthering_wave` also finds character tags ending in `_(wuthering_waves)`. The query-strategy cache version is isolated from old prefix-only pages. The snapshot remains fixed while scrolling; no provider is queried from the scroll handler. Empty tags with a zero post count, deprecated tags, and unsupported categories are filtered out on both the backend and frontend, including zero-count online entries retained by an older translation catalog. Tag and alias columns have independent maximum widths; truncated text remains available on hover.

Related tags follow the same local-first rule. The full local CSV snapshot is displayed immediately, then one official Danbooru `/related_tag.json` snapshot of up to 500 Jaccard-ranked tags is requested in the background. Only API-only rows are appended, so delayed results cannot reorder existing rows or change the scroll offset; scrolling itself never starts a request.

Successful Danbooru completion pages and related-tag snapshots are stored together in `completion_cache.sqlite3`, so they survive browser refreshes and ComfyUI restarts without becoming a second permanent tag database. Non-empty results remain fresh for 7 days and can be used as an offline fallback for up to 90 days while stale data refreshes in the background; empty results use shorter retention. Identical concurrent misses share one upstream request, pagination uses the raw Danbooru page size instead of the filtered row count, and opportunistic LRU cleanup keeps at most 5,000 entries. The online-services panel shows cache size and entry count and can clear this cache without touching `translations.sqlite3`.

Autocomplete and related-tag rows carry compact provenance chips: `CSV` for the bundled dataset, `LM` for LoRA Manager, and `API` for Danbooru. Duplicate candidates retain every contributing chip instead of hiding later sources; hovering a chip shows its full source name.

Open **Autocomplete Plus → Online Services → Online completion and translation** to configure DeepSeek. Once a query stabilizes, autocomplete prefetches translations for its first 200 candidates and related tags for their first 300 candidates exactly once. Large candidate sets are split into bounded batches with up to three frontend requests in flight, while the backend continues to deduplicate overlapping tags. Translation is fully detached from scrolling. Cached aliases render immediately and newly resolved aliases update the current virtual window. LoRA, Embedding, and Wildcard candidates are excluded. When an online or cached translation is available, it replaces the same-language alias bundled in the Hugging Face CSV; the CSV alias remains the fallback when online translation is unavailable. Successful results are stored once in `translations.sqlite3`, added to every matching booru search index, and reused on later inputs.

The panel provides independent **Enable Danbooru API supplementation** and **Enable automatic translation** switches. Disabling Danbooru stops both completion and related-tag API requests and prevents persisted API-only candidates from entering lists; disabling translation stops catalog loading and automatic resolve requests while preserving the translation database for later re-enabling. The panel can explicitly check online sources, fetch the model list, test the selected model, inspect or clear Danbooru-result-cache statistics, and configure advanced translation controls.

Autocomplete and related-tag panels only preview aliases matching the current ComfyUI language. This is display filtering only: all aliases remain searchable. Configuration and the new translation dictionary are stored under the ComfyUI user directory in `autocomplete-plus/`; old live-tag databases and CSV files are not read or deleted automatically.

## Advanced Settings

### Disabling CSV Update Check on Startup

By default, ComfyUI performs CSV file update checks and downloads at regular intervals during startup.
When starting in an environment without internet access, startup may be delayed until a timeout occurs.

You can skip the check process during ComfyUI startup by following these steps:

1. Start ComfyUI once with this custom node installed to generate the `csv_meta.json` file.  
  The `csv_meta.json` file is created directly under this custom node's folder.
2. Open `csv_meta.json` in a text editor and change the value of `check_updates_on_startup` from `true` to `false` and save.  
  If `check_updates_on_startup` does not exist, add it under `version`.

**`csv_meta.json` after modification:**
```json
{
  "version": 1,
  "check_updates_on_startup": false,
  ...
}
```

**Additional notes:**
- The check process will not be performed until the value of `check_updates_on_startup` is changed back to `true` or the `version` is switched.
- Even when `check_updates_on_startup` is `false`, manual checking is still possible by pressing the `Check CSV updates` button in the Autocomplete Plus settings.

## More details on how it works

### About Fast Search for Autocomplete

Fast indexed search is enabled by default so the local candidate list can render immediately while LoRA Manager, Danbooru, and translation enrichment arrive later. Sources with at least 50,000 loaded tags automatically avoid sequential scans even when an older saved setting says otherwise.

Keystrokes are coalesced to the next frame instead of running index work inside the keyboard event. Search only collects a bounded pool before ranking, while CSV parsing yields between small chunks. Runtime translations use a separate append-only alias index, so typing never rebuilds the large base FlexSearch index. Co-occurrence loading retains the highest-frequency pairs needed by the UI instead of expanding the entire CSV in memory; related-tag results also use bounded scoring and an in-memory cache.

- When the loaded CSV files contain a large number of tags or aliases. This is especially useful when the total number of tags exceeds **100,000**.
- When using natural language instead of comma-separated tags in prompt input.

**Browser startup behavior**

Fast search requires tag index building. While a large source is still building, it is temporarily skipped instead of synchronously scanning the entire dataset and blocking list appearance or disappearance.
As of `v1.3.0`, The notification when building is completed is displayed only in the browser's developer tools. This is planned to be improved in future versions.

For example, when index building for approximately 220,000 tags is completed, the following log is recorded:

```
[Autocomplete-Plus] Building 221787 index for danbooru took 9398.70ms.
```

> [!NOTE]
> - Index building occurs in the background even when fast search is disabled in settings
> - Fast search uses the full-text search library [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)

## Known Issues

### Performance

- Due to the large size of the CSV files, browser startup time may be longer.
- It consumes memory to operate quickly in the browser. This should not be an issue on machines with specs capable of running ComfyUI.

### Autocomplete

### Related Tags
- Cannot retrieve the correct tag when clicking on a dynamic prompt like `from {above|below|side}`. This is because the exact tag is not determined until the wildcard processor is executed.

## Credits

- [pythongosssss/ComfyUI-Custom-Node](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
  - Referenced for implementing the autocomplete function.
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
  - Referenced for autocomplete function and CSV specifications.
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
  - Used to implement fast tag search processing for autocomplete.
