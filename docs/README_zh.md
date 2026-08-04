# ComfyUI-Autocomplete-Plus

## [English](../README.md) • 简体中文 • [日本語](README_jp.md)

![自动补全预览](https://github.com/user-attachments/assets/45dd0598-4c04-49ab-85f7-33fc9026921c)

为 ComfyUI 文本输入框提供标签补全、共现标签、翻译和提示词格式化。支持 Danbooru、可选 e621 数据、新版 ComfyUI、Nodes 2.0 和子图节点提升后的输入框。

## 为什么有这个分支？

本项目是 [newtextdoc1111/ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) 的持续维护分支。

主要区别：

#### 兼容性

- 持续兼容新版 ComfyUI，包括 Nodes 2.0 文本输入框和从子图提升出来的输入。

#### 数据与补全

- 采用本地优先流程：内置 CSV 结果立即显示，LoRA Manager 和 Danbooru 在后台补充缺失或较新的结果。
- 简体中文用户可直接输入 `无职转生` 等中文名称，找到对应英文 Tag 并插入 `mushoku_tensei`；中文完全匹配优先于前缀和包含匹配。
- 同名候选按固定规则合并，并显示简洁的来源徽章，方便区分 CSV、LoRA Manager 和 Danbooru 数据。
- 后台结果到达时会保留当前选中的标签，避免列表更新导致误选。
- 改进逗号、空格和换行附近的插入行为；已存在的标签会被识别，不会重复插入。
- 共现标签先显示本地结果，再追加 API 独有结果，不会重排已有列表或移动当前选择。

#### 交互与性能

- 修复上游在启动阶段等待大型 CSV 和模型索引，导致 ComfyUI 全局加载遮罩长时间不消失的问题：扩展注册同步完成，索引在后台构建，准备期间仍可使用安全回退补全，失败的本地数据也可以重试。
- 支持连续探索共现标签、固定面板、从光标位置打开、Wiki 链接和完整键盘操作。
- 大型标签列表使用虚拟滚动和有上限的结果快照，输入更流畅，列表宽度和滚动位置不会因异步更新跳动。

#### 在线服务与多语言

- Danbooru 结果可持久缓存，用于快速复用和离线回退；可在**在线服务**中查看状态并手动清理。
- 简体中文优先使用 ffdkj 汉化数据库，缺失项再交给 DeepSeek；其他支持语言可继续使用 DeepSeek。
- 提供响应式在线服务管理器，界面支持英文、简体中文、繁体中文和日文。

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
- 简体中文界面启用“中文补全”后，输入中文会检索 ffdkj 汉化数据库，最终仍插入英文 Tag。
- 支持 Danbooru 分类、LoRA、Embedding、Wildcard 和可选 e621 结果。
- 已存在的标签会置灰，不会重复插入。
- 点击 Wiki 按钮，或对键盘选中的标签按 `F1`，可打开 Wiki 页面。

### 共现标签

![共现标签预览](https://github.com/user-attachments/assets/854571cd-01eb-4e92-a118-2303bec0b175)

选中或确认完整标签后，可以继续查看相关标签。面板支持调整方向、固定和连续插入。

### 自动格式化

离开文本框时可自动整理重复空格和逗号，也可以手动触发或在设置中关闭。

| 操作 | 默认快捷键 |
| --- | --- |
| 显示光标位置的共现标签 | `Ctrl+Shift+Space` |
| 打开选中标签的 Wiki | `F1` |
| 格式化当前提示词 | `Alt+Shift+F` |
| 关闭面板 | `Esc` |

## 数据源与翻译

- 内置 Danbooru CSV 是主要本地数据源，可能同时包含 SFW 和 NSFW 标签。
- 安装 [ComfyUI LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 后，可补充本地标签、LoRA、Embedding 和 Wildcard。
- Danbooru 匿名接口可补充缺失或较新的标签与共现标签；离线时仍可使用本地结果。
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

## 供其他扩展集成

其他 ComfyUI 扩展可以为自有输入框启用补全：在 `input` 或 `textarea` 上添加 `data-autocomplete-plus` 属性即可被自动发现，获得与节点文本框相同的标签补全、中文补全和相关标签。候选面板打开期间，该元素会带有 `data-autocomplete-plus-open` 属性，宿主界面可据此把回车、Esc 和方向键让给面板。


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
