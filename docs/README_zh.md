# ComfyUI-Autocomplete-Aaalice

## [English](../README.md) • 简体中文 • [日本語](README_jp.md)

![自动补全预览](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

为 ComfyUI 文本输入框提供标签补全、共现标签、翻译和提示词格式化。支持 Danbooru、可选 e621 数据、新版 ComfyUI、Nodes 2.0 和子图节点提升后的输入框。

本项目是 [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) 的持续维护分支。

## 功能特性

- **自动补全**：输入时搜索 Danbooru 标签和别名，显示分类、引用量和来源徽章；已存在的标签会置灰，不会重复插入。
- **中文补全**：简体中文界面下可直接输入 `无职转生` 等中文名称，找到并插入英文 Tag `mushoku_tensei`。
- **共现标签**：探索经常一起出现的标签，支持连续插入、固定面板和直接打开 Wiki 页面。
- **翻译**：通过 ffdkj 汉化数据库显示标签中文翻译，缺失项和其他语言可由 DeepSeek 翻译。
- **自动格式化**：离开文本框时自动整理重复空格和逗号，也可以手动触发。
- **多数据源**：优先使用内置 CSV 数据，LoRA Manager 和 Danbooru 在后台补充缺失或较新的结果；离线时本地结果仍可使用。
- **多语言界面**：支持英文、简体中文、繁体中文和日文。

### 与上游的区别

- 持续兼容新版 ComfyUI，包括 Nodes 2.0 文本输入框和从子图提升出来的输入。
- ComfyUI 启动不再被大型 CSV 和模型索引阻塞，索引在后台构建期间补全仍可使用。
- 本地优先的补全和共现标签，在线结果合入时不会打乱当前列表和选择。
- 可选的 Danbooru 持久缓存和中文汉化数据库，在**在线服务**中管理。

## 安装

### ComfyUI-Manager

搜索 `ComfyUI-Autocomplete-Aaalice`，安装后重启 ComfyUI。首次启动会自动下载所需的 Danbooru CSV。

### 手动安装

将仓库克隆到 ComfyUI 的 `custom_nodes` 目录，然后重启：

```bash
git clone https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice.git
```

## 使用方法

### 自动补全

在文本输入框中输入即可显示标签建议。使用上下方向键选择，按 Enter 或 Tab 插入。

- 可搜索标签名和别名。
- 支持 Danbooru 分类、LoRA、Embedding、Wildcard 和可选 e621 结果。
- 点击 Wiki 按钮，或对键盘选中的标签按 `F1`，可打开 Wiki 页面。

### 共现标签

![共现标签预览](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

选中或确认完整标签后，可以继续查看相关标签。面板支持调整方向、固定和连续插入。

### 快捷键

| 操作 | 默认快捷键 |
| --- | --- |
| 显示光标位置的共现标签 | `Ctrl+Shift+Space` |
| 打开选中标签的 Wiki | `F1` |
| 格式化当前提示词 | `Alt+Shift+F` |
| 关闭面板 | `Esc` |

## 数据源与翻译

- 内置 Danbooru CSV 是主要本地数据源，可能同时包含 SFW 和 NSFW 标签。
- 安装 [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 后，可补充本地标签、LoRA、Embedding 和 Wildcard。
- Danbooru 匿名接口可补充缺失或较新的标签与共现标签。
- 简体中文可使用 [ffdkj 汉化数据库](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)。由于其上游仓库目前没有明确 LICENSE，本插件不会直接分发该数据库，而是在需要时单独下载。
- DeepSeek 可翻译汉化数据库缺失的标签和其他语言；在**在线服务**中配置。
- 只有 ComfyUI 使用中文界面时才显示“中文汉化数据库”页面。

## 自定义 CSV

将文件放入 `data/` 后刷新浏览器：

- 自动补全：`<danbooru|e621>_tags*.csv`
- 共现标签：`<danbooru|e621>_tags_cooccurrence*.csv`

自动补全 CSV 格式：

```csv
tag,category,count,alias
masterpiece,5,9999999,
```

也可以用带引号的标签组合制作一键插入预设：

```csv
"masterpiece, best quality, highres",5,9999999,<c:HighQuality>
```

e621 数据不会自动下载，需要手动添加 `e621_tags.csv`；目前不支持 e621 共现标签。

## 设置

打开 ComfyUI 设置，找到 **Autocomplete Plus**。

- 设置标签数据源、中文补全、结果数量、自动逗号、下划线替换以及 LoRA/Embedding 补全。
- 设置共现标签触发方式、面板方向、别名显示和自动格式化。
- 在**在线服务**中管理 Danbooru 缓存、中文汉化数据库和 DeepSeek。

如需关闭启动时的 CSV 自动更新检查，请编辑 `csv_meta.json`：

```json
{
  "version": 1,
  "check_updates_on_startup": false
}
```

关闭后仍可在设置中手动检测 CSV 更新。

## 已知限制

- CSV 数据较大时，完成索引仍需要一定时间和内存；索引准备期间仍可使用回退补全。
- `from {above|below|side}` 等动态提示词在通配符解析前无法提供可靠的共现标签。

## 致谢

- [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus)
- [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)
- [nextapps-de/flexsearch](https://github.com/nextapps-de/flexsearch)
- [ffdkj-Danbooru_Tag-Chinese-English-Translation-Table](https://github.com/ffdkj/ffdkj-Danbooru_Tag-Chinese-English-Translation-Table)
