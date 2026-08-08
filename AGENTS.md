# 仓库指南

## 项目结构与模块划分

- `web/js/` 存放前端扩展逻辑。`main.js` 负责注册 ComfyUI 扩展，`autocomplete.js`、`related-tags.js`、`auto-formatter.js` 和 `node-info.js` 分别负责对应功能。
- `web/css/` 存放扩展样式。
- `modules/` 存放 ComfyUI 使用的 Python API 和 CSV 下载器；`__init__.py` 暴露 Web 目录并初始化数据下载。
- `tests/js/` 存放 Jest 测试，文件命名为 `*.test.js`。
- `locales/<language>/` 存放界面翻译。
- `docs/` 存放多语言用户 README 和维护者开发测试说明。
- `data/` 存放标签和共现 CSV。除非需求明确涉及数据集，否则不要提交下载或重新生成的数据。

## 构建、测试与开发命令

```bash
npm ci
npm test -- --runInBand
npx stylelint "web/css/*.css"
npx ruff check .
```

`npm ci` 按锁文件安装 Node 依赖。Jest 验证 JavaScript 行为，`--runInBand` 便于获得稳定的本地输出。Stylelint 检查 CSS 规则和属性顺序。Ruff 按仓库配置检查 Python，行宽上限为 120。

项目没有单独的构建步骤。将本目录安装到 ComfyUI 的 `custom_nodes/` 下；修改 Python 后重启 ComfyUI，修改 JavaScript 或 CSS 后强制刷新前端。

## 代码风格与命名约定

JavaScript 使用四空格缩进、分号和现有 ES Module 风格。函数与变量使用 `camelCase`，类使用 `PascalCase`，常量使用大写命名。事件处理器应保持精简，可复用的解析逻辑放入 `web/js/utils.js`。Python 使用 Ruff 兼容风格和 `snake_case`。不要格式化无关文件，也不要修改打包的第三方代码。

## 界面样式规范

- 弹窗、卡片、输入框和按钮默认采用无边框设计，不使用高对比度描边切割界面。
- 通过轻微内侧高光、柔和环境阴影和适度悬浮阴影表达边缘与层级；阴影应克制，避免厚重光晕或大面积纯黑投影。
- 分区优先使用背景明度、间距和柔和的内阴影区分，仅在可读性确有需要时使用低对比度分隔线。
- 输入框聚焦、选中和主要操作必须保留清晰的状态反馈，可使用主题色聚焦光晕，但不得引起尺寸或布局变化。
- 悬浮、聚焦和加载状态不得改变组件边框宽度、整体尺寸或列表宽度，避免界面抖动。

## 测试规范

针对解析、光标边界、标签插入和事件协作补充或更新 Jest 测试。测试名应描述可观察行为，例如 `should return the previous tag after a trailing comma`。提交前运行完整 Jest 测试。UI 改动还需在当前版本 ComfyUI 中手动验证；适用时覆盖 Nodes 2.0 输入框。

## 启动初始化约束

- `web/js/main.js` 中扩展的 `setup()` 必须同步返回；ComfyUI 会等待扩展 setup 完成后才关闭全局启动遮罩，禁止在其中 `await` CSV、模型索引、在线服务或其他可延迟任务。
- `web/js/data.js` 的 `loadDataAsync()` 只负责后台初始化，并通过 `DATA_TAGS_READY_EVENT`、`DATA_TAGS_COMPLETE_EVENT`、`DATA_READY_EVENT` 和 `DATA_STATUS_CHANGED_EVENT` 通知各功能阶段；修改数据加载流程时必须保留分阶段可用、未就绪回退、错误可重试和并发 Promise 去重。
- `tests/js/data-loading.test.js` 是该生命周期的回归边界，至少覆盖占位数据源、并发调用复用、标签先于共现数据就绪、失败重试和就绪事件；相关改动先运行该测试，再运行完整 Jest。
- 该约束修复了 fork 前上游已有的启动等待问题，详见 `docs/development/testing.md`。

## 在线服务可靠性约束

- `web/js/online-service-state.js` 的在线功能配置请求必须复用进行中的 Promise，并对短暂失败执行有界重试；在线状态未确定时不得让本地补全等待 ComfyUI 启动完成。
- `modules/danbooru_service.py` 的上游请求必须区分可重试的临时错误和永久错误，使用有界退避并在连续失败后进入冷却；设置菜单的 `refresh=1` 强制检测必须能够绕过冷却和正在进行的普通刷新。
- `web/js/integrations/danbooru-provider.js` 不得缓存 `error`/`disabled` 页面；自动重试必须保持次数上限、尊重 `AbortSignal`，并在必要时通过 `refresh=1` 避免重复命中服务端冷却。
- 设置菜单的数据源检测必须检查各探测结果，失败时显示失败状态，不能仅依据请求 Promise 已结束就报告成功。相关回归覆盖 `tests/js/danbooru-provider.test.js`、`tests/js/online-service-state.test.js`、`tests/js/online-settings.test.js` 和 `tests/python/test_danbooru_service.py`。

## 文档要求

- `README.md` 是面向普通用户的简体中文入口（GitHub 首页展示）；`docs/README_en.md` 和 `docs/README_jp.md` 分别是英文和日文用户说明。三份 README 保持相同结构与用户事实，只说明项目用途、核心能力、安装、常用操作、用户可配置项、必要限制与致谢。
- README 不是更新日志、实现笔记或代理工作记录。不要把每个小修复、视觉微调、内部函数、缓存策略、接口路径、测试过程或性能实现逐条追加进去。
- 只有新增或改变了会显著影响安装、配置、主要工作流、兼容范围或已知限制的用户能力时，才更新三份 README；小型修复和样式打磨通常无需更新 README。
- “与上游的区别”保持为简短概览，可按兼容性、数据与补全、交互与性能、在线服务与多语言等长期稳定主题分类；每类只保留核心用户价值，不使用一整块无分类列表，也不累积版本历史。具体改动、验证结果、兼容风险和实现原因写入 commit、Pull Request、Issue、测试或代码注释。
- `AGENTS.md` 面向维护者和编码代理，存放仓库结构、开发命令、代码风格、测试、文档职责、发布与协作规则，不向普通用户介绍产品功能。

## Commit 与 Pull Request 规范

历史提交主要使用 `feat:`、`fix:` 等 Conventional Commit 前缀。推荐格式为 `type(scope): 简短描述`，例如 `fix(related-tags): 补全后显示共现标签`。

Pull Request 应说明用户可见的变化、已执行的验证，并关联相关 Issue。UI 改动需附截图或短视频。需要明确指出 ComfyUI 前端兼容风险、数据格式变化，以及文档或本地化更新。

## Comfy Registry 发布

- 执行 `comfy node publish` 后，只需要确认客户端已经成功上传或提交版本。
- 不等待 Comfy Registry 的审核、同步、索引或页面更新；这些流程可能耗时很长。
- 客户端确认提交成功后立即向用户报告“已提交发布”，并明确 Registry 页面可能稍后才显示。
- 如果发布命令超时且没有成功回执，只做一次快速状态核对；无法确认时如实报告“发布状态未确认”，不要持续等待。
