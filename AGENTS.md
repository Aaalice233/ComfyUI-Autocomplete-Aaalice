# 仓库指南

## 项目结构与模块划分

- `web/js/` 存放前端扩展逻辑。`main.js` 负责注册 ComfyUI 扩展，`autocomplete.js`、`related-tags.js`、`auto-formatter.js` 和 `node-info.js` 分别负责对应功能。
- `web/css/` 存放扩展样式。
- `modules/` 存放 ComfyUI 使用的 Python API 和 CSV 下载器；`__init__.py` 暴露 Web 目录并初始化数据下载。
- `tests/js/` 存放 Jest 测试，文件命名为 `*.test.js`。
- `locales/<language>/` 存放界面翻译。
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

## 测试规范

针对解析、光标边界、标签插入和事件协作补充或更新 Jest 测试。测试名应描述可观察行为，例如 `should return the previous tag after a trailing comma`。提交前运行完整 Jest 测试。UI 改动还需在当前版本 ComfyUI 中手动验证；适用时覆盖 Nodes 2.0 输入框。

## 文档要求

每次新增功能都必须在同一改动中同步更新 `README.md`、`docs/README_zh.md` 和 `docs/README_jp.md`，三份说明必须保持结构与信息一致。每次都要检查并更新各 README 的“与上游的区别”部分；这里既要记录大型功能，也要记录本分支独有的小功能、交互巧思、视觉打磨、性能优化、兼容修复和非阻塞降级等用户可感知亮点，不能因改动规模小而省略。描述应优先说明用户能获得什么体验，避免只罗列内部实现名词。

## Commit 与 Pull Request 规范

历史提交主要使用 `feat:`、`fix:` 等 Conventional Commit 前缀。推荐格式为 `type(scope): 简短描述`，例如 `fix(related-tags): 补全后显示共现标签`。

Pull Request 应说明用户可见的变化、已执行的验证，并关联相关 Issue。UI 改动需附截图或短视频。需要明确指出 ComfyUI 前端兼容风险、数据格式变化，以及文档或本地化更新。
