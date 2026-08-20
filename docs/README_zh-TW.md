# ComfyUI-Autocomplete-Aaalice

## [English](README_en.md) • [简体中文](../README.md) • 繁體中文 • [日本語](README_jp.md)

![自動補全預覽](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

為 ComfyUI 文字輸入框提供標籤補全、共現標籤、翻譯和提示詞格式化。支援 Danbooru、可選的 e621 資料、新版 ComfyUI、Nodes 2.0，以及從子圖提升的輸入框。

本專案是 [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) 的持續維護分支。

## ✨ 功能特色

- **自動補全**：輸入時搜尋 Danbooru 標籤和別名，顯示分類、引用量與來源徽章；已存在的標籤會變暗，不會重複插入。
- **中文補全**：簡體中文介面下可直接輸入 `无职转生` 等中文名稱，找到並插入英文 Tag `mushoku_tensei`。
- **共現標籤**：探索經常一起出現的標籤，支援連續插入、固定面板和直接開啟 Wiki 頁面。
- **翻譯**：透過 ffdkj 漢化資料庫顯示標籤的中文翻譯，缺少的項目和其他語言可由 DeepSeek 翻譯。
- **自動格式化**：離開文字輸入框時自動整理重複空格和逗號，也可以手動觸發。
- **多資料來源**：優先使用內建 CSV 資料，LoRA Manager 和 Danbooru 在背景補充缺少或較新的結果；離線時仍可使用本機結果。
- **多語言介面**：支援英文、簡體中文、繁體中文和日文。

### 🔀 與上游的差異

- 持續相容新版 ComfyUI，包括 Nodes 2.0 文字輸入框和從子圖提升的輸入。
- ComfyUI 啟動不再被大型 CSV 和模型索引阻塞，索引在背景建立期間仍可使用補全。
- 本機優先的補全與共現標籤，線上結果合併時不會打亂目前的清單和選取項目。
- 可選的 Danbooru 持久快取和中文漢化資料庫，可在**線上服務**中管理。

## 📦 安裝

### ComfyUI-Manager

搜尋 `ComfyUI-Autocomplete-Aaalice`，安裝後重新啟動 ComfyUI。首次啟動會自動下載所需的 Danbooru CSV。

### 手動安裝

將儲存庫複製到 ComfyUI 的 `custom_nodes` 目錄，然後重新啟動：

```bash
git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git
```

## 🚀 使用方法

### 🔍 自動補全

在文字輸入框中輸入即可顯示標籤建議。使用上下方向鍵選取，按 Enter 或 Tab 插入。

- 可搜尋標籤名稱和別名。
- 支援 Danbooru 分類、LoRA、Embedding、Wildcard 和可選的 e621 結果。
- 點選 Wiki 按鈕，或對鍵盤選取的標籤按 `F1`，可開啟 Wiki 頁面。

### 🏷️ 共現標籤

![共現標籤預覽](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

選取或確認完整標籤後，可以繼續查看相關標籤。面板支援調整方向、固定和連續插入。

### ⌨️ 快速鍵

| 操作 | 預設快速鍵 |
| --- | --- |
| 顯示游標位置的共現標籤 | `Ctrl+Shift+Space` |
| 開啟選取標籤的 Wiki | `F1` |
| 格式化目前的提示詞 | `Alt+Shift+F` |
| 關閉面板 | `Esc` |

## 🌐 資料來源與翻譯

- 內建 Danbooru CSV 是主要本機資料來源，可能同時包含 SFW 和 NSFW 標籤。
- 安裝 [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 後，可補充本機標籤、LoRA、Embedding 和 Wildcard。
- Danbooru 匿名介面可補充缺少或較新的標籤與共現標籤。
- 簡體中文可使用 [ffdkj 漢化資料庫](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)。由於其上游儲存庫目前沒有明確的 LICENSE，本外掛不會直接散布該資料庫，而是在需要時另外下載。
- DeepSeek 可翻譯漢化資料庫缺少的標籤和其他語言；請在**線上服務**中設定。
- 只有 ComfyUI 使用中文介面時才會顯示「中文漢化資料庫」頁面。

## 📄 自訂 CSV

將檔案放入 `data/` 後重新整理瀏覽器：

- 自動補全：`<danbooru|e621>_tags*.csv`
- 共現標籤：`<danbooru|e621>_tags_cooccurrence*.csv`

自動補全 CSV 格式：

```csv
tag,category,count,alias
masterpiece,5,9999999,
```

也可以使用帶引號的標籤組合製作一鍵插入預設：

```csv
"masterpiece, best quality, highres",5,9999999,<c:HighQuality>
```

e621 資料不會自動下載，需要手動加入 `e621_tags.csv`；目前不支援 e621 共現標籤。

## ⚙️ 設定

開啟 ComfyUI 設定，找到 **Autocomplete Plus**。

- 設定標籤資料來源、中文補全、結果數量、自動逗號、底線替換和 LoRA/Embedding 補全。
- 設定共現標籤觸發方式、面板方向、別名顯示和自動格式化。
- 在**線上服務**中管理 Danbooru 快取、中文漢化資料庫和 DeepSeek。

如需關閉啟動時的 CSV 自動更新檢查，請編輯 `csv_meta.json`：

```json
{
  "version": 1,
  "check_updates_on_startup": false
}
```

關閉後仍可在設定中手動檢查 CSV 更新。

## ⚠️ 已知限制

- CSV 資料較大時，完成索引仍需要一些時間和記憶體；索引準備期間仍可使用備援補全。
- `from {above|below|side}` 等動態提示詞在萬用字元解析前無法提供可靠的共現標籤。

## 🙏 致謝

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
- [ffdkj-Danbooru_Tag-Chinese-English-Translation-Table](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)
