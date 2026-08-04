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

## Danbooru 在线兜底回归

在线补全不能因为后台初始化提前结束而使用错误的开关状态。`web/js/online-service-state.js` 会复用正在进行的配置请求，首个在线查询只等待这一次请求，不阻塞本地补全或 ComfyUI 启动。

Danbooru 上游请求采用有界重试：临时网络错误、超时和 `408`、`425`、`429`、`5xx` 会按短暂退避重试，默认最多请求 8 次（首次请求加 7 次重试）；连续失败后才进入冷却。设置菜单的强制检测会绕过冷却；如果普通请求正在进行，强制检测会在它结束后再执行自己的刷新，不会复用一个已经失败的普通请求。前端不会缓存带有 `error` 状态的空结果，后续输入不会被错误结果永久卡住；需要立即绕过服务端冷却时使用设置菜单的强制检测。设置菜单也会根据探测结果显示失败，而不是无论请求结果如何都提示“检测完成”。

相关回归边界位于：

- `tests/js/danbooru-provider.test.js`：响应重试、错误结果不缓存和功能开关加载等待；
- `tests/python/test_danbooru_service.py`：上游 HTTP 重试、永久错误和强制检测绕过冷却；
- `tests/js/online-settings.test.js`：设置菜单正确报告 Danbooru 探测失败。

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
