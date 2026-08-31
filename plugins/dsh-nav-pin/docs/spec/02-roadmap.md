# 02 · 路线图 — dsh-nav-pin

## M1 · 查证与定案

* [x] 查证：官方隐藏规则与断点、slot / frame 结构、选择器唯一性、`:has()` 与容器查询可用性（见 01）。
* [x] 定案：断点 700px、≤700px hover 浮层、无开关无按钮（owner 拍板）。

## M2 · 实现

* [ ] 插件脚手架（package.json / cordis.patch.yml / client bundle，样式注入在 apply 内 + `ctx.effect` 清理）。
* [ ] CSS 骨架落地；zh / en 双标签选择器；reduced-motion 分支。
* [ ] 结构测试（bundle 声明与组合行）+ `npm run verify`。

## M3 · 验证与发布

* [ ] dsh checkout 热更验证（宽窗恒显 / 700–900 恒显 / ≤700 hover 浮现 / 卸载恢复官方行为）。
* [ ] 发布流程按根 AGENTS.md（alpha → owner 验证 → 转正）。
