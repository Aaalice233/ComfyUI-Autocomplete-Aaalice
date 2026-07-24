# ComfyUI-Autocomplete-Plus

## [English](../README.md) • 简体中文 • [日本語](README_jp.md)

![ss01](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

## 项目简介

**ComfyUI-Autocomplete-Plus** 是一个为 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 文本输入框提供多种输入辅助功能的自定义节点。目前支持 Danbooru 和 e621 标签（e621 暂不支持部分功能）。

## 为什么有这个分支？

本项目是 [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) 的持续维护分支。上游项目已经较长时间无人活跃维护，也没有及时跟进 ComfyUI 前端的变化。因此创建了本分支，用于保持新版 ComfyUI 的可用性，并继续处理兼容性问题。

### 与上游的主要区别

#### 兼容与维护

- 持续跟进新版 ComfyUI 前端。
- 同时支持 **Nodes 2.0** 文本输入框和**子图节点**提升后的输入，并能追溯到内部真实节点与字段。
- 以 `ComfyUI-Autocomplete-Aaalice` 的独立名称发布到 Comfy Registry，避免与已停止维护的上游包混淆。

#### 本地优先的多数据源

- 内置 Hugging Face CSV 立即显示，LoRA Manager 与 Danbooru 在后台并发补充。同名标签严格采用 `CSV > LoRA Manager > Danbooru`，不同标签按匹配精度、热度、来源优先级排序。
- 较长的 Danbooru 查询使用包含匹配，输入作品名片段也能找到名称中带有该作品名的角色标签。
- 复用 LoRA Manager 的标签、LoRA、Embedding 和 Wildcard API，同时自动避开其自有输入框，防止重复补全。
- 补全与共现列表在末尾独立来源列最多显示一个 `CSV`、`LM` 或 `API` 徽章，表示最终实际采用的最高优先级数据源，避免重复来源挤占空间；悬浮可查看完整说明。
- 异步结果加入并重排时按标签名保留当前选中项，避免误选。

#### 更顺手的补全流程

- 未完成标签会恢复补全；确认完整标签后直接切换到共现列表；光标位于尾逗号后仍能识别前一个标签。
- 共现面板无需等待 Danbooru，先显示本地完整快照；API 独有标签稍后追加，不会重排结果或改变选中项和滚动位置。
- 插入标签时复用并整理附近的逗号与换行，不制造空标签和重复分隔符。
- 插入共现标签后可以继续探索；面板支持固定，也可按 `Ctrl+Shift+Space` 打开光标位置的共现标签。
- 已存在的标签会置灰；再次选择时定位到原有标签，不会重复插入。
- 列表项和面板控件可直接打开 Wiki，键盘选中标签后也可按 `F1` 打开。

#### 快而稳定的大列表

- 一次生成带安全上限的完整结果快照，让滚动条从出现时就确定最终长度。
- 固定行高虚拟列表只挂载可见区域和少量缓冲行；滚动不再触发搜索、分页或翻译。
- 通过逐帧合并搜索、限制候选池、分块解析 CSV、追加式翻译索引、延后 SQLite 工作和缓存共现计算保持输入流畅。
- 使用交替行底色、持续可见的选中强调、稳定键盘导航、预留滚动条空间和视口自适应定位。
- 面板显示期间锁定宽度，虚拟滚动和后到的译文都不会再让列表左右抖动。
- 为英文标签留出更多空间，并缩短固定译文列；被截断的内容可悬浮查看全文。
- 小窗下会自动收紧列宽、间距与次要控件；补全贴近光标，共现优先使用输入框空间更充足的一侧，两侧都放不下时自动改到上方或下方。

#### 持久在线服务与翻译

- 持久缓存 Danbooru 补全和共现快照，支持后台刷新、离线回退、并发请求合并、有限容量 LRU 淘汰、统计与手动清理。
- 简体中文采用 ffdkj 汉化数据库，再使用已有或新请求的 DeepSeek 译文；DeepSeek 只处理词典缺失项。繁体中文和日文继续使用 DeepSeek。
- 支持通过真实下拉列表发现模型、模型测活、按需查看已保存 API Key 和可选思考强度。
- 将**在线服务**重构为 Danbooru API、中文汉化数据库和 DeepSeek LLM 三页管理器；桌面端使用固定侧边栏，窄窗口改为顶部标签栏。
- 汉化数据库的检测、更新和修复独立即时执行，不与 DeepSeek 配置保存混用；各服务分别显示状态、进度、错误和缓存信息。
- 所有在线补充都不会阻塞本地输入；失败时不打扰输入，设置中仍保留有用的诊断信息。

#### 积少成多的细节

- 别名预览按当前 ComfyUI 界面语言过滤，但完整别名仍然可以搜索。
- 为通用、艺术家、作品、角色、元标签、模型等类别提供不同 Emoji 标记和本地化悬浮说明。
- 所有设置名称与提示，以及标题、加载与空状态、操作按钮、Wiki 链接和来源徽章，均适配英文、简体中文、繁体中文和日文。
- 同步维护英文、简体中文和日文说明，大型功能与交互巧思、细节优化都会记录。

上游项目仍是本分支的基础，原有功能和致谢信息会尽可能保留。

## 功能

- **:zap:无需配置**：自动下载为 Danbooru 标签优化的 CSV 数据。
- **:mag:自动补全**：输入时根据当前内容实时显示标签建议。
- **:file_cabinet:共现标签**：显示与当前标签经常共同出现的标签列表。
- **:triangular_ruler:自动格式化**：文本框失去焦点时自动整理提示词中多余的空格和逗号。
- **:earth_asia:多语言支持**：支持日语、中文和韩语输入补全。
- **:computer_mouse:直观操作**：
  - 支持鼠标和键盘操作。
  - 插入标签时会考虑光标位置和已有文本。
- **:art:界面适配**：支持 ComfyUI 浅色和深色主题。
- **:pencil:用户 CSV**：可以添加自定义 CSV 作为补全数据。
- **:twisted_rightwards_arrows:新版 ComfyUI 兼容**：支持 Nodes 2.0 和子图节点提升后的文本输入框。
- **:arrows_counterclockwise:在线标签补全**：后台检查并合并 Danbooru 结果，不再下载第二份大型标签库。
- **:speech_balloon:按需翻译**：DeepSeek 按需翻译当前可见的普通 Danbooru 和 e621 标签，成功结果永久缓存并加入搜索索引。
- **:link:LoRA Manager 兼容**：复用 LoRA Manager 的本地索引，补充标签、LoRA、Embedding 和 Wildcard 候选。

## 安装

### ComfyUI-Manager

1. 在 [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager) 中搜索 `ComfyUI-Autocomplete-Aaalice`，安装本维护分支后重启 ComfyUI。
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
- 所有匹配候选默认按界面显示的投稿数（热度）从高到低统一排序；只有热度相同时，才继续比较匹配精度和数据源优先级。
- 当前选中的候选会持续显示醒目的强调高亮，包括列表首次出现时默认选中的第一项以及鼠标悬浮时。
- 已输入的标签会显示为灰色。
- 可以同时显示 Danbooru 和 e621 标签，并在设置中调整优先级。
- 支持 Lora 和 Embedding 输入补全，可在设置中开关。
- 点击 📖 图标可打开标签的 Wiki 页面。使用键盘选中标签时，可按 `F1` 打开。

## 共现标签

![ss02](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

选中文本输入区域中的标签后，会显示高度相关的标签列表。可以直接点击标签，或用上下方向键选择后按 Enter 或 Tab 插入。界面会根据正在编辑的文本框自动调整位置和尺寸。

- 本地 CSV 的完整共现快照会先立即显示，随后才后台请求 Danbooru 官方共现接口；接口只追加本地没有的标签，不重排本地结果、不移动当前选择，也不会阻塞面板打开。
- 点击未输入完整的标签会重新打开自动补全。只有点击的标签存在共现数据时才显示共现标签，避免空面板遮挡有效的补全候选。
- 使用 Enter、Tab 或鼠标点击确认补全后，如果完整标签存在共现数据，会立即显示其共现标签。
- 点击标签末尾的逗号或逗号后的空格，会显示前一个标签的共现标签。
- 插入共现标签时会统一整理相邻分隔符，在提示词末尾、已有标签之间和换行前都不会产生重复逗号。
- 插入共现标签后，面板会立即切换到新标签的共现结果，支持连续选择；固定面板会继续保持在固定的标签上。
- 通过点击在自动补全与共现标签之间切换时，打开其中一个会关闭另一个（共现标签面板已固定时除外）。

- 默认显示在文本框下方，并会根据可用空间自动上下调整。
  - 可通过标题栏的“↕️|↔️”按钮切换竖向或横向布局。
- 通过“📌|🎯”按钮切换共现标签界面的固定状态。固定时可按 Esc 关闭。
- 点击标题栏中的标签可打开对应 Wiki 页面。
- 已输入的标签会显示为灰色。再次插入时，会改为选中已有标签。
- 按 `Ctrl+Shift+Space` 可显示光标所在位置的共现标签。

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
基础 CSV 来自 HuggingFace 公开的 Danbooru 数据集，因此投稿数和共现标签信息可能与 Danbooru 网站不同。

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

用于共现标签计算，记录标签对及其共现次数。仅保留共现次数不少于 100 的标签对。

### e621 CSV

目前不支持自动下载 e621 CSV。请将与 `danbooru_tags.csv` 结构相同的 CSV 命名为 `e621_tags.csv`，手动放入 `data` 目录。e621 暂不支持共现标签显示。

### 用户 CSV

用户可以使用自定义 CSV。请按以下命名规则放入 `data` 目录：

- **自动补全 CSV**：`<danbooru | e621>_tags*.csv`
- **共现标签 CSV**：`<danbooru | e621>_tags_cooccurrence*.csv`

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
- **最大补全结果数**：完整内存快照的安全上限，默认 1000，最多可配置为 2000；DOM 中只挂载当前可见行。
- **Auto-Insert Comma**：插入标签时自动添加逗号。
- **Replace '_' with 'Space'**：插入标签时将下划线替换为空格，同时影响共现标签显示。
- **String to add before artist tags**：在画师标签前添加的文本。Anima 模型可设为 `@`。
- **Enable Loras and Embeddings**：在建议中显示 Lora 和 Embedding。
- **Use Fast Search**：使用索引搜索处理自动补全，默认启用。已加载标签达到 50,000 条的数据源会强制避免阻塞式顺序扫描，即使旧设置中曾关闭该选项。

### 共现标签

- **Enable Related Tags**：启用或关闭共现标签。
- **最大共现标签数**：完整共现结果快照的安全上限，默认 25000；DOM 中只挂载当前可见行。
- **Default Display Position**：ComfyUI 启动后的默认显示方向。
- **Related Tags Trigger Mode**：选择触发方式（单击或 Ctrl+单击）。

### 显示

- **Hide Alias**：隐藏或显示自动补全和共现标签中的别名列。

### 自动格式化

- **Enable Auto Format**：启用或关闭失去焦点时的自动格式化。
- **Auto Format Trigger**：选择格式化时机。
  - **Auto**：离开文本框时自动格式化。
  - **Manual**：仅通过快捷键手动格式化，默认为 `Alt+Shift+F`。
- **Use Trailing Comma**：启用时确保每行以逗号结尾，关闭时移除行尾逗号。
- **Trim Surrounding Spaces**：移除提示词开头和结尾的空行或空格。

### LoRA Manager 兼容

安装 [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 后，默认的“自动”模式会通过其本地 `/api/lm/custom-words/search`、`/api/lm/loras/relative-paths`、`/api/lm/embeddings/relative-paths` 和 `/api/lm/wildcards/search` 索引补充候选。接口不可用时会自动退回本插件原有数据，不影响输入。LoRA Manager 自带补全的文本框会自动排除；其他第三方节点可在“排除的节点类型”中添加黑名单。

### 在线补全与翻译

自动补全会立即计算带上限的完整本地结果快照，同时并发查询 LoRA Manager 和一次最多返回 200 条的 Danbooru 快照，再统一合并。同名标签严格采用 `CSV > LoRA Manager > Danbooru`，不同标签按匹配精度、热度、来源优先级排序；异步重排后按标签名恢复当前选择。输入只有 2～3 个有效字符时，Danbooru 使用前缀匹配，达到 4 个字符后切换为包含匹配。滚动期间快照保持不变，滚动处理器不会访问任何数据源。

共现标签采用同样的本地优先策略：先显示本地 CSV 的完整快照，再后台一次请求 Danbooru 官方 `/related_tag.json`，最多取得 500 条按 Jaccard 相似度排序的结果。只追加 API 独有条目，因此延迟返回不会重排已有结果或改变滚动偏移；滚动本身永远不会发起请求。

成功的 Danbooru 补全页和共现快照会统一写入 `completion_cache.sqlite3`。补全、共现和健康检测共用请求合并、缓存与匿名读取限速器，客户端最多每秒 8 次请求；无需设置 Danbooru 账号、密码或 API Key。管理器可查看缓存数量和大小，也可单独清空，不影响 `translations.sqlite3`。

补全与共现列表会在末尾显示一个低对比度来源徽章：基础数据集为 `CSV`，LoRA Manager 为 `LM`，Danbooru 为 `API`。同一候选由多个数据源命中时，只显示合并结果最终实际采用的最高优先级数据源；悬停徽章可查看完整来源名称。

简体中文的显示与中文检索优先使用 [`ffdkj-Danbooru_Tag-Chinese-English-Translation-Table`](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table) 汉化数据库，其次才是已缓存和新请求的 DeepSeek 译文；此模式会忽略 Hugging Face CSV 中混杂的中日韩别名。画师译名仅在词典中存在非空且不等于原文的值时显示，画师标签不会发送给 DeepSeek。繁体中文和日文沿用 DeepSeek，英文不触发翻译。

由于 ffdkj 上游仓库目前没有明确 LICENSE，本插件不再分发其数据库。首次使用简体中文时会在后台下载约 29.3 MB 到 ComfyUI 用户目录 `autocomplete-plus/chinese-dictionary/`；下载期间英文补全正常工作，只有下载失败后才允许 DeepSeek 兜底。后续检测和更新由用户手动触发。临时文件会验证 Git blob SHA、SQLite 文件头与表结构、`PRAGMA quick_check` 和有效记录数，通过后才原子替换，因此更新失败不会破坏旧库。感谢 ffdkj 及项目贡献者维护这份汉化数据；数据库内容与维护权归上游项目。

管理器分为 **Danbooru API**、**中文汉化数据库** 和 **DeepSeek LLM** 三页。数据库检测、安装/更新和修复会立即执行，不依赖配置保存按钮。DeepSeek 页面保留通过 `/models` 获取模型、API Key 显隐、模型测活、思考强度、并发、批量、重试、超时和系统提示词。汉化数据库仅用于简体中文；`translations.sqlite3` 继续作为独立的 LLM 缓存。

补全列表与共现标签面板只展示符合当前 ComfyUI 界面语言的别名，但完整别名仍可搜索。配置和新翻译词典位于 ComfyUI 用户目录的 `autocomplete-plus/`；旧实时标签数据库和 CSV 不再读取，也不会自动删除。

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

快速索引搜索现在默认启用，本地候选会立即显示，LoRA Manager、Danbooru 和翻译结果随后增量补入。已加载标签达到 50,000 条的数据源即使保留了旧的关闭设置，也会自动避免顺序扫描。

键盘事件只安排下一帧搜索，不再在输入回调内同步查询索引；每个数据源只收集有限数量的候选再排序。CSV 解析会按小批次主动让出主线程，运行时译文写入独立的追加式别名索引，输入期间不会再重建大型 FlexSearch 基础索引。共现数据只在内存中保留界面所需的高频标签对，并限制每次参与评分的候选、缓存结果。

- 已加载 CSV 包含大量标签或别名，特别是总数超过 **100,000** 时。
- 在提示词中使用自然语言，而不是逗号分隔的标签时。

**浏览器启动时的行为**

快速搜索需要先构建标签索引。大型数据源仍在构建时会暂时跳过，不再同步扫描整份数据并阻塞列表的出现或消失。当前构建完成提示仅显示在浏览器开发者工具中。

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

### 共现标签

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
