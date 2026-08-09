# 供其他扩展集成

其他 ComfyUI 扩展可以为自有输入框启用补全：在 `input` 或 `textarea` 上添加 `data-autocomplete-plus` 属性即可被自动发现，获得与节点文本框相同的标签补全、中文补全和相关标签。

Booru 查询、标签黑名单等要求站点原始标签身份的输入框还应设置 `data-autocomplete-plus-mode="raw-tag"`。该模式接受候选时原样保留下划线和未转义括号，不应用画师前缀，也不自动追加逗号；普通提示词输入不设置此属性，继续遵循用户的提示词格式设置。

候选面板打开期间，该元素会带有 `data-autocomplete-plus-open` 属性，宿主界面可据此把回车、Esc 和方向键让给面板。
