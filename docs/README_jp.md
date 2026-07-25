# ComfyUI-Autocomplete-Plus

## [English](../README.md) • [简体中文](README_zh.md) • 日本語

![オートコンプリートのプレビュー](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

ComfyUI のテキスト入力にタグ補完、関連タグ、翻訳、プロンプト整形を追加します。Danbooru、任意の e621 データ、現行 ComfyUI、Nodes 2.0、サブグラフから昇格した入力に対応します。

## このフォークについて

このプロジェクトは [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) の継続メンテナンス版です。

主な違い：

#### 互換性

- 現行 ComfyUI を継続的にサポートし、Nodes 2.0 のテキスト入力とサブグラフから昇格した入力に対応。

#### データと補完

- ローカル優先で動作し、同梱 CSV を即座に表示した後、LoRA Manager と Danbooru が不足または新しい結果をバックグラウンドで補足。
- 簡体字中国語では `无职转生` のような中国語名から英語タグを検索して `mushoku_tensei` を挿入でき、完全一致は前方一致・部分一致より優先。
- 同じ候補を一定のルールで統合し、CSV、LoRA Manager、Danbooru のどこから表示データを採用したかを簡潔なバッジで表示。
- バックグラウンド結果の到着後も現在選択中のタグを維持し、意図しない選択変更を防止。
- カンマ、空白、改行付近への挿入を改善し、入力済みタグの重複挿入を防止。
- 関連タグはローカル結果を先に表示し、API 固有結果だけを後から追加。既存の並び順や現在の選択を移動しません。

#### 操作性とパフォーマンス

- 関連タグの連続探索、パネル固定、カーソル位置からの表示、Wiki リンク、キーボード中心の操作に対応。
- 仮想スクロールと上限付き結果スナップショットにより、大規模なタグ一覧でも入力応答を保ち、非同期更新による幅やスクロール位置の変化を防止。

#### オンラインサービスと多言語

- Danbooru 結果を永続キャッシュし、高速な再利用とオフライン時のフォールバックに対応。**オンラインサービス**で状態確認と手動消去が可能。
- 簡体字中国語では ffdkj 辞書を優先し、不足分を DeepSeek で翻訳。他の対応言語では引き続き DeepSeek を利用可能。
- レスポンシブなオンラインサービス管理画面を備え、UI は英語、簡体字中国語、繁体字中国語、日本語に対応。

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
- 簡体字中国語 UI で「中国語オートコンプリート」を有効にすると、中国語入力で ffdkj 辞書を検索し、挿入時は英語タグを使用します。
- Danbooru カテゴリ、LoRA、Embedding、Wildcard、任意の e621 結果に対応します。
- すでに入力済みのタグはグレー表示され、重複挿入されません。
- Wiki ボタン、またはキーボード選択中の `F1` で Wiki ページを開けます。

### 関連タグ

![関連タグのプレビュー](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

完全なタグを選択または確定すると、関連タグを続けて探索できます。パネルは方向変更、固定、連続挿入に対応します。

### 自動整形

入力欄を離れたときに重複した空白やカンマを整理できます。手動実行や設定での無効化も可能です。

| 操作 | デフォルトショートカット |
| --- | --- |
| カーソル位置の関連タグを表示 | `Ctrl+Shift+Space` |
| 選択中タグの Wiki を開く | `F1` |
| 現在のプロンプトを整形 | `Alt+Shift+F` |
| パネルを閉じる | `Esc` |

## データソースと翻訳

- 同梱の Danbooru CSV が主要なローカルソースで、SFW と NSFW の両方を含む場合があります。
- [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) からローカルのタグ、LoRA、Embedding、Wildcard を補足できます。
- Danbooru の匿名 API で不足・更新されたタグと関連タグを補足できます。オフラインでもローカル結果は利用できます。
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

- CSV が大きい場合、ブラウザー起動時間とメモリ使用量が増えます。
- `from {above|below|side}` などの動的プロンプトは、ワイルドカード解決前に正確な関連タグを取得できません。

## クレジット

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
- [ffdkj-Danbooru_Tag-Chinese-English-Translation-Table](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)
