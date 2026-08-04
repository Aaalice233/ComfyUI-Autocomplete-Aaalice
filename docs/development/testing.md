# 开发与测试说明

## 启动初始化回归

ComfyUI 会等待每个扩展的 `setup()` 返回后才结束全局启动流程。因此，Autocomplete Plus 的 `setup()` 只能完成同步注册工作：安装事件处理器、创建空的数据源和启动后台任务。不得在 `setup()` 中等待 CSV、模型索引、在线服务或翻译目录。

大型本地数据必须由 `web/js/data.js` 的 `loadDataAsync()` 在后台处理。数据源在索引完成前也必须保持可查询的安全状态，补全使用顺序搜索或在线结果回退；索引完成后再通过事件刷新当前面板。

| 事件 | 含义 |
| --- | --- |
| `DATA_STATUS_CHANGED_EVENT` | 全局或数据源状态、进度或错误发生变化 |
| `DATA_TAGS_READY_EVENT` | 某个数据源的标签与搜索索引已可用 |
| `DATA_TAGS_COMPLETE_EVENT` | 所有标签数据源均已完成，翻译目录可以开始应用 |
| `DATA_READY_EVENT` | 标签、共现数据和模型数据全部完成 |

这项约束修复了 fork 点上游 `v1.11.0` 中 `async setup()` 等待 `loadDataAsync()` 的问题。不要为了让启动日志“更完整”而把后台 Promise 重新放回扩展 setup 的返回值。

## 回归测试

数据生命周期测试位于 `tests/js/data-loading.test.js`，覆盖：

- 索引完成前创建安全的数据源占位；
- 重复调用复用同一个加载 Promise；
- 标签索引先于大型共现索引就绪；
- 失败状态、显式重试和就绪事件；
- 标签完成、全部完成和状态变化事件的发布。

修改 `web/js/main.js`、`web/js/data.js` 或相关面板刷新逻辑后运行：

```bash
npm test -- --runInBand tests/js/data-loading.test.js
npm test -- --runInBand
npx stylelint "web/css/*.css"
ruff check .
```

## 人工验收重点

涉及启动、数据加载或 ComfyUI 前端兼容性时，除自动测试外还应确认：

1. ComfyUI 全局加载遮罩不会等待本地 CSV/模型索引完成；
2. 索引仍在构建时，文本框可以输入并显示安全回退结果；
3. 共现面板显示明确的准备状态，索引完成后自动刷新；
4. 数据请求失败时不会卡在加载状态，并且“重试”可以恢复；
5. Classic 和 Nodes 2.0 文本输入均能完成上述流程。

人工 GUI 验收应使用隔离的 ComfyUI 实例和测试数据，不占用用户日常实例或 `8188` 端口。
