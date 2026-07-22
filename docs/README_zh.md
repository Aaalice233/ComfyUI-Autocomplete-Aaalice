# ComfyUI-Autocomplete-Plus

## [English](../README.md) • 简体中文 • [日本語](README_jp.md)

![ss01](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

## 项目简介

**ComfyUI-Autocomplete-Plus** 是一个为 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 文本输入框提供多种输入辅助功能的自定义节点。目前支持 Danbooru 和 e621 标签（e621 暂不支持部分功能）。

## 为什么有这个分支？

本项目是 [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) 的持续维护分支。上游项目已经较长时间无人活跃维护，也没有及时跟进 ComfyUI 前端的变化。因此创建了本分支，用于保持新版 ComfyUI 的可用性，并继续处理兼容性问题。

### 与上游的主要区别

- 持续跟进新版 ComfyUI 前端。
- 支持 **Nodes 2.0** 渲染的文本输入框。
- 支持**子图节点**提升后的文本输入框，并能追溯到子图内部的真实节点和字段。
- 改进自动补全与相关标签的衔接和统一插入格式：点击未完成标签会恢复补全，确认完整标签后立即显示相关标签，光标位于尾逗号后仍能识别前一个标签，插入相关标签时会复用已有分隔符，不再产生空标签或重复逗号。
- 支持按类别热度规则从 Danbooru 补充最新标签，并通过可续跑的 DeepSeek 翻译任务和本地缓存补充译名。
- 别名展示会按当前 ComfyUI 界面语言初步过滤，完整别名仍可用于检索。
- 实时标签的网络、认证、CSV 和翻译错误会跟随 ComfyUI 界面语言显示，未知诊断信息仍会保留。
- 提供 LoRA Manager 兼容层，通过其本地标签、LoRA、Embedding 和 Wildcard API 补充候选，并避免在 LoRA Manager 自有输入框中重复触发补全。
- 为通用、艺术家、作品、角色、元标签、模型等类别提供不同 Emoji 标记和本地化悬浮说明。
- 将 Danbooru、e621 和 LoRA Manager 候选统一按相关度排序，不再按数据源分段显示。
- 提供简体中文 README，并继续维护本地化内容。
- 自动补全和相关标签中的标题、加载与空状态、操作按钮、Wiki 链接及详情提示均适配英文、简体中文、繁体中文和日文。

上游项目仍是本分支的基础，原有功能和致谢信息会尽可能保留。

## 功能

- **:zap:无需配置**：自动下载为 Danbooru 标签优化的 CSV 数据。
- **:mag:自动补全**：输入时根据当前内容实时显示标签建议。
- **:file_cabinet:相关标签**：显示与当前标签高度相关的标签列表。
- **:triangular_ruler:自动格式化**：文本框失去焦点时自动整理提示词中多余的空格和逗号。
- **:earth_asia:多语言支持**：支持日语、中文和韩语输入补全。
- **:computer_mouse:直观操作**：
  - 支持鼠标和键盘操作。
  - 插入标签时会考虑光标位置和已有文本。
- **:art:界面适配**：支持 ComfyUI 浅色和深色主题。
- **:pencil:用户 CSV**：可以添加自定义 CSV 作为补全数据。
- **:twisted_rightwards_arrows:新版 ComfyUI 兼容**：支持 Nodes 2.0 和子图节点提升后的文本输入框。
- **:arrows_counterclockwise:实时标签补充**：拉取基础 Danbooru CSV 中缺失的标签，并可使用 DeepSeek 翻译。
- **:link:LoRA Manager 兼容**：复用 LoRA Manager 的本地索引，补充标签、LoRA、Embedding 和 Wildcard 候选。

## 安装

### ComfyUI-Manager

1. 在 [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager) 中搜索 `Autocomplete-Plus`，安装显示的自定义节点后重启 ComfyUI。
2. 启动时会自动从 HuggingFace 下载所需的 CSV 数据。

### 手动安装

1. 将本仓库克隆或复制到 ComfyUI 的 `custom_nodes` 目录：

   `git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git`

2. 启动 ComfyUI。首次启动时会自动下载所需的 CSV 数据。

## 自动补全

在文本输入区域中输入时，界面会按投稿数从高到低显示部分匹配的标签。使用上下方向键选择，按 Enter 或 Tab 插入选中标签。

- 标签别名也会参与搜索。搜索日语时不区分平假名和片假名。
- 标签按类别显示不同颜色，规则与 Danbooru 相同。
- 每条候选会根据标签类别显示不同 Emoji，悬浮可查看类别和数据源。
- 所有来源统一按“标签完全匹配、标签前缀、别名完全匹配、标签包含、别名包含”排序；之后才比较各数据源内部归一化后的热度。
- 当前选中的候选会持续显示醒目的强调高亮，包括列表首次出现时默认选中的第一项以及鼠标悬浮时。
- 已输入的标签会显示为灰色。
- 可以同时显示 Danbooru 和 e621 标签，并在设置中调整优先级。
- 支持 Lora 和 Embedding 输入补全，可在设置中开关。
- 点击 📖 图标可打开标签的 Wiki 页面。使用键盘选中标签时，可按 `F1` 打开。

## 相关标签

![ss02](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

选中文本输入区域中的标签后，会显示高度相关的标签列表。可以直接点击标签，或用上下方向键选择后按 Enter 或 Tab 插入。界面会根据正在编辑的文本框自动调整位置和尺寸。

- 点击未输入完整的标签会重新打开自动补全。只有点击的标签存在共现数据时才显示相关标签，避免空面板遮挡有效的补全候选。
- 使用 Enter、Tab 或鼠标点击确认补全后，如果完整标签存在共现数据，会立即显示其相关标签。
- 点击标签末尾的逗号或逗号后的空格，会显示前一个标签的相关标签。
- 插入相关标签时会统一整理相邻分隔符，在提示词末尾、已有标签之间和换行前都不会产生重复逗号。
- 插入相关标签后，面板会立即切换到新标签的共现结果，支持连续选择；固定面板会继续保持在固定的标签上。
- 通过点击在自动补全与相关标签之间切换时，打开其中一个会关闭另一个（相关标签面板已固定时除外）。

- 默认显示在文本框下方，并会根据可用空间自动上下调整。
  - 可通过标题栏的“↕️|↔️”按钮切换竖向或横向布局。
- 通过“📌|🎯”按钮切换相关标签界面的固定状态。固定时可按 Esc 关闭。
- 点击标题栏中的标签可打开对应 Wiki 页面。
- 已输入的标签会显示为灰色。再次插入时，会改为选中已有标签。
- 按 `Ctrl+Shift+Space` 可显示光标所在位置的相关标签。

## 自动格式化

文本输入区域失去焦点时（例如点击外部或按 Tab），会自动格式化提示词，便于编辑大量文本。

具体行为如下：

- 在标签后自动添加逗号和空格。
- 移除标签之间多余的逗号和空格。
- 可使用 `Alt+Shift+F` 手动触发，键位可在 ComfyUI 设置中修改。
- 可在设置中启用或关闭。

> [!NOTE]
> 为避免错误，某些节点不会执行自动格式化。  
> 例如：[Power Puter (rgthree)](https://github.com/rgthree/rgthree-comfy/wiki/Node:-Power-Puter) 的 `code` 字段、[LoraLoaderBlockWeight (Inspire)](https://github.com/ltdrdata/ComfyUI-Inspire-Pack) 的 `block_vector` 字段。

## CSV 数据

运行需要两个基础 CSV 文件。这些文件由 [HuggingFace](https://huggingface.co/datasets/newtextdoc1111/danbooru-tag-csv) 管理，安装后首次启动 ComfyUI 时会自动下载。  
基础 CSV 来自 HuggingFace 公开的 Danbooru 数据集，因此投稿数和相关标签信息可能与 Danbooru 网站不同。

> [!IMPORTANT]
> 基础 CSV 同时包含 SFW 和 NSFW 标签。

### `danbooru_tags.csv`

用于自动补全的标签信息 CSV，包含标签名、类别、投稿数和别名（包含日语、中文和韩语）。列结构与 [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete) 使用的格式相同。

标签按以下条件过滤：

- 投稿数不少于 100。
- 图片评分不低于 5。
- 类别为 `general`、`character` 或 `copyright`。
- 标签名不包含 `(cosplay)`。

### `danbooru_tags_cooccurrence.csv`

用于相关标签计算，记录标签对及其共现次数。仅保留共现次数不少于 100 的标签对。

### e621 CSV

目前不支持自动下载 e621 CSV。请将与 `danbooru_tags.csv` 结构相同的 CSV 命名为 `e621_tags.csv`，手动放入 `data` 目录。e621 暂不支持相关标签显示。

### 用户 CSV

用户可以使用自定义 CSV。请按以下命名规则放入 `data` 目录：

- **自动补全 CSV**：`<danbooru | e621>_tags*.csv`
- **相关标签 CSV**：`<danbooru | e621>_tags_cooccurrence*.csv`

例如，可创建 `danbooru_tags_meta.csv` 添加常用 meta 标签。CSV 不需要表头，修改后需要刷新浏览器。

```csv
tag,category,count,alias
masterpiece,5,9999999,
best_quality,5,9999999,
high_quality,5,9999999,
normal_quality,5,9999999,
low_quality,5,9999999,
worst_quality,5,9999999,
```

刷新浏览器后，可以在 ComfyUI 控制台日志中检查已加载的 CSV。如果文件未出现在日志中，请检查文件名是否符合规则。

```text
[Autocomplete-Plus] CSV file status:
  * Danbooru -> base: True, extra: danbooru_tags_meta.csv
  * E621 -> base: False, extra:
```

> [!NOTE]
> 存在多个用户 CSV 时，会按文件名字母顺序加载。同一标签出现在多个文件时，保留最先加载的数据。基础 CSV 最后加载。

### 批量插入标签（类似“Chants”）

将多个标签用 `""` 包裹，即可一次插入常用标签组合。该功能类似 [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete?tab=readme-ov-file#chants) 的 **Chants**。

例如准备以下 CSV 后，输入 `<c:Basic-HighQuality>` 或 `<c:Basic-Negative>` 即可快速插入对应内容：

```csv
"masterpiece, best quality, high quality, highres, ultra-detailed",5,9999999,<c:Basic-HighQuality>
"(worst quality, low quality:1.4), normal quality",5,9999999,<c:Basic-Negative>
```

> [!TIP]
> - `""` 内容不会自动转义 `()`。原本带括号的标签需在 CSV 中手动转义，例如 `copyright_(series)` 写为 `copyright_\(series\)`。
> - 别名列也支持 `""`，可为标签组合设置多个别名。

## 设置

### 标签数据源

> [!NOTE]
> Danbooru、e621 等标签数据的来源在本项目中称为“标签数据源”。

- **Autocomplete Tag Source**：自动补全中显示的标签数据源。选择 `all` 可显示所有已加载来源。
- **Primary source for 'all' Source**：当数据源为 `all` 时，指定优先显示的来源。
- **标签类别图标位置**：设置类别 Emoji 的位置；悬浮可查看本地化类别和数据源，选择 `hidden` 可隐藏。

### 自动补全

- **Enable Autocomplete**：启用或关闭自动补全。
- **Max suggestions**：最多显示的建议数量。
- **Auto-Insert Comma**：插入标签时自动添加逗号。
- **Replace '_' with 'Space'**：插入标签时将下划线替换为空格，同时影响相关标签显示。
- **String to add before artist tags**：在画师标签前添加的文本。Anima 模型可设为 `@`。
- **Enable Loras and Embeddings**：在建议中显示 Lora 和 Embedding。
- **Use Fast Search**：使用快速搜索处理自动补全。

### 相关标签

- **Enable Related Tags**：启用或关闭相关标签。
- **Max related tags**：最多显示的相关标签数量。
- **Default Display Position**：ComfyUI 启动后的默认显示方向。
- **Related Tags Trigger Mode**：选择触发方式（单击或 Ctrl+单击）。

### 显示

- **Hide Alias**：隐藏或显示自动补全和相关标签中的别名列。

### 自动格式化

- **Enable Auto Format**：启用或关闭失去焦点时的自动格式化。
- **Auto Format Trigger**：选择格式化时机。
  - **Auto**：离开文本框时自动格式化。
  - **Manual**：仅通过快捷键手动格式化，默认为 `Alt+Shift+F`。
- **Use Trailing Comma**：启用时确保每行以逗号结尾，关闭时移除行尾逗号。
- **Trim Surrounding Spaces**：移除提示词开头和结尾的空行或空格。

### LoRA Manager 兼容

安装 [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 后，默认的“自动”模式会通过其本地 `/api/lm/custom-words/search`、`/api/lm/loras/relative-paths`、`/api/lm/embeddings/relative-paths` 和 `/api/lm/wildcards/search` 索引补充候选。接口不可用时会自动退回本插件原有数据，不影响输入。LoRA Manager 自带补全的文本框会自动排除；其他第三方节点可在“排除的节点类型”中添加黑名单。

### Danbooru 实时标签

在 **Autocomplete Plus → 实时标签 → 管理 Danbooru 实时标签** 中打开管理面板。该功能不会修改 Hugging Face 基础 CSV。

1. 可为每个 Danbooru 类别独立选择“不拉取”“全部拉取”或“最低热度”。
2. 可选填 Danbooru 用户名和 API Key，然后点击“扫描标签”。只有 `danbooru_tags.csv` 中不存在的标签会写入 `data/danbooru_tags_live.csv`。
3. 查看新增候选数、基础表缺失翻译数和预计请求数后，再手动启动 DeepSeek 翻译。目标语言跟随当前 ComfyUI 界面；英文界面不需要翻译。
4. CSV 更新后刷新页面，使自动补全重新建立索引。

DeepSeek 会同时处理新扫描标签，以及基础 CSV 的别名中缺少当前界面语言的条目。批量数、最大并发、重试次数、模型和 system prompt 均可配置。成功译文按“标签 + 语言”写入 SQLite 缓存，后续只发送未命中缓存或明确要求重试的标签。生成的额外 CSV 会保留基础条目的类别、热度和原别名，只追加缓存译文，不会修改原基础 CSV；任务中断或取消不会丢失已经完成的结果。

补全列表与相关标签面板只展示符合当前 ComfyUI 界面语言的别名。这只影响显示，完整别名仍会进入搜索索引。

配置和缓存位于 ComfyUI 用户目录下的 `autocomplete-plus/`。后端不会回传 API Key 明文，也不会把密钥写入日志。该功能面向本地或私人实例：任何能访问 ComfyUI 服务的人都可能启动翻译并产生 API 费用。

## 高级设置

### 关闭启动时的 CSV 更新检查

默认情况下，ComfyUI 启动时会定期检查并下载 CSV 更新。在无网络环境中，启动可能因等待超时而变慢。

1. 安装本节点后启动一次 ComfyUI，生成项目根目录下的 `csv_meta.json`。
2. 打开 `csv_meta.json`，将 `check_updates_on_startup` 从 `true` 改为 `false` 并保存。如果该字段不存在，请在 `version` 下方添加。

```json
{
  "version": 1,
  "check_updates_on_startup": false
}
```

补充说明：

- 在将 `check_updates_on_startup` 改回 `true` 或切换 `version` 之前，启动时不会执行检查。
- 即使该值为 `false`，仍可在 Autocomplete Plus 设置中点击 `Check CSV updates` 手动检查。

## 工作原理补充

### 关于自动补全的快速搜索

`v1.3.0` 新增了快速搜索。启用后，输入标签时的搜索处理会更快，尤其适合：

- 已加载 CSV 包含大量标签或别名，特别是总数超过 **100,000** 时。
- 在提示词中使用自然语言，而不是逗号分隔的标签时。

**浏览器启动时的行为**

快速搜索需要先构建标签索引，因此浏览器刚启动时不会立即可用。构建完成前会使用原有搜索方式。当前构建完成提示仅显示在浏览器开发者工具中。

```text
[Autocomplete-Plus] Building 221787 index for danbooru took 9398.70ms.
```

> [!NOTE]
> - 即使在设置中关闭快速搜索，索引仍会在后台构建。
> - 快速搜索使用 [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch) 全文搜索库。

## 已知问题

### 性能

- CSV 文件较大，可能延长浏览器启动时间。
- 为了在浏览器中快速运行，会占用一定内存。能正常运行 ComfyUI 的设备通常不会因此出现问题。

### 相关标签

- 点击 `from {above|below|side}` 这类动态提示词时，无法获取正确标签。这是因为在通配符处理器执行前，实际标签尚未确定。

## 致谢

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
  - 本项目的上游基础。
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
  - 自动补全功能的实现参考。
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
  - 自动补全功能和 CSV 格式的实现参考。
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
  - 用于实现自动补全的快速标签搜索。
