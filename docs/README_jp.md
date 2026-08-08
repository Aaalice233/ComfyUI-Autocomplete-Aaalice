# ComfyUI-Autocomplete-Aaalice

## [English](README_en.md) • [简体中文](../README.md) • 日本語

![オートコンプリートのプレビュー](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

ComfyUI のテキスト入力にタグ補完、関連タグ、翻訳、プロンプト整形を追加します。Danbooru、任意の e621 データ、現行 ComfyUI、Nodes 2.0、サブグラフから昇格した入力に対応します。

このプロジェクトは [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) の継続メンテナンス版です。

## 機能

- **オートコンプリート**：入力中に Danbooru のタグと別名を検索し、カテゴリ・件数・ソースバッジを表示。入力済みのタグはグレー表示され、重複挿入されません。
- **中国語オートコンプリート**：簡体字中国語 UI では `无职转生` のような中国語名から英語タグ `mushoku_tensei` を検索して挿入できます。
- **関連タグ**：一緒に使われやすいタグを探索し、連続挿入、パネル固定、Wiki ページの直接表示に対応。
- **翻訳**：ffdkj 辞書でタグの中国語訳を表示し、辞書にない項目や他言語は DeepSeek で翻訳できます。
- **自動整形**：入力欄を離れたときに重複した空白やカンマを整理。手動実行も可能です。
- **複数のデータソース**：同梱 CSV を優先し、LoRA Manager と Danbooru が不足または新しい結果をバックグラウンドで補足。オフラインでもローカル結果を利用できます。
- **多言語 UI**：英語、簡体字中国語、繁体字中国語、日本語に対応。

### 上流版との違い

- 現行 ComfyUI を継続的にサポートし、Nodes 2.0 のテキスト入力とサブグラフから昇格した入力に対応。
- 大規模な CSV やモデルのインデックスで ComfyUI の起動がブロックされず、インデックス構築中も補完を利用できます。
- ローカル優先の補完と関連タグ。オンライン結果のマージ時に現在のリストや選択を乱しません。
- 任意の Danbooru 永続キャッシュと中国語辞書を**オンラインサービス**で管理できます。

## インストール

### ComfyUI-Manager

`ComfyUI-Autocomplete-Aaalice` を検索してインストールし、ComfyUI を再起動してください。初回起動時に必要な Danbooru CSV が自動的にダウンロードされます。

### 手動インストール

リポジトリを ComfyUI の `custom_nodes` ディレクトリへクローンし、ComfyUI を再起動します。

```bash
git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git
```

## 使い方

### オートコンプリート

テキスト入力中にタグ候補が表示されます。上下キーで選び、Enter または Tab で挿入します。

- タグ名と別名を検索できます。
- Danbooru カテゴリ、LoRA、Embedding、Wildcard、任意の e621 結果に対応します。
- Wiki ボタン、またはキーボード選択中の `F1` で Wiki ページを開けます。

### 関連タグ

![関連タグのプレビュー](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

完全なタグを選択または確定すると、関連タグを続けて探索できます。パネルは方向変更、固定、連続挿入に対応します。

### ショートカット

| 操作 | デフォルトショートカット |
| --- | --- |
| カーソル位置の関連タグを表示 | `Ctrl+Shift+Space` |
| 選択中タグの Wiki を開く | `F1` |
| 現在のプロンプトを整形 | `Alt+Shift+F` |
| パネルを閉じる | `Esc` |

## データソースと翻訳

- 同梱の Danbooru CSV が主要なローカルソースで、SFW と NSFW の両方を含む場合があります。
- [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) からローカルのタグ、LoRA、Embedding、Wildcard を補足できます。
- Danbooru の匿名 API で不足・更新されたタグと関連タグを補足できます。
- 簡体字中国語では [ffdkj 翻訳辞書](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table) を利用できます。上流リポジトリに明確な LICENSE がないため、辞書は同梱せず必要時に別途ダウンロードします。
- DeepSeek は辞書にないタグや他言語を翻訳できます。**オンラインサービス**で設定してください。
- 「中国語辞書」ページは ComfyUI が中国語表示の場合だけ表示されます。

## カスタム CSV

ファイルを `data/` に配置し、ブラウザーを更新します。

- オートコンプリート：`<danbooru|e621>_tags*.csv`
- 関連タグ：`<danbooru|e621>_tags_cooccurrence*.csv`

オートコンプリート CSV の形式：

```csv
tag,category,count,alias
masterpiece,5,9999999,
```

引用符で囲んだタグの組み合わせを一括挿入プリセットとして利用できます。

```csv
"masterpiece, best quality, highres",5,9999999,<c:HighQuality>
```

e621 データは自動ダウンロードされません。`e621_tags.csv` を手動で追加してください。e621 の関連タグには現在対応していません。

## 設定

ComfyUI の設定を開き、**Autocomplete Plus** を選択します。

- タグソース、中国語オートコンプリート、結果数、自動カンマ、アンダースコア置換、LoRA/Embedding 補完を設定できます。
- 関連タグのトリガー、パネル方向、別名表示、自動整形を設定できます。
- **オンラインサービス**で Danbooru キャッシュ、中国語辞書、DeepSeek を管理できます。

起動時の CSV 自動更新確認を無効にするには、`csv_meta.json` を編集します。

```json
{
  "version": 1,
  "check_updates_on_startup": false
}
```

無効にしても、設定から手動で CSV 更新を確認できます。

## 既知の制限

- CSV が大きい場合、インデックスの完成に時間とメモリが必要です。準備中もフォールバック補完を利用できます。
- `from {above|below|side}` などの動的プロンプトは、ワイルドカード解決前に正確な関連タグを取得できません。

## クレジット

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
- [ffdkj-Danbooru_Tag-Chinese-English-Translation-Table](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)
