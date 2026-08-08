# 供其他扩展集成

其他 ComfyUI 扩展可以为自有输入框启用补全：在 `input` 或 `textarea` 上添加 `data-autocomplete-plus` 属性即可被自动发现，获得与节点文本框相同的标签补全、中文补全和相关标签。

候选面板打开期间，该元素会带有 `data-autocomplete-plus-open` 属性，宿主界面可据此把回车、Esc 和方向键让给面板。
