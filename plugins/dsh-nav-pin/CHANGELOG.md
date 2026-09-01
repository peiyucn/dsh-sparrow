# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release
- Turn navigation stays on narrow conversations: the official 900px hide breakpoint moves to 700px; below 700px the rail is hidden by default and fades in on hover over the right edge / keyboard focus (opacity only, no frame or background, same look as the official wide rail)
- Conversation content width cap: dragged-wide columns keep at least 120px clearance per side (official: 88px); narrow columns clamp content to the official 640px minimum to make room for the rail, so the right drag handle no longer crowds the turn navigation
- README "Compatibility" section added: on dsh 0.1.1-rc.2 and earlier the plugin is a harmless no-op (the turn navigation / width axis did not exist in rc.2, verified)

### 中文

- 首个预发布版本，先发 `next` 渠道验证；功能对齐计划中的 `0.1.0` 首版
- 轮次导航窄对话列不再消失：官方 900px 隐藏断点提到 700px；≤700px 时轨道默认隐身，hover 右缘 / 键盘 focus 淡入浮现（仅 opacity，无框无底色，与官方宽屏轨道形态一致）
- 会话内容宽度钳制：拖宽列每侧至少保留 120px 余量（官方 88px）；窄列把内容钳到官方 640px 最小值以给轨道让位，右侧拖拽条不再挤占导航命中区
- README 新增「兼容性」章节：dsh 0.1.1-rc.2 及更早版本上插件是无害空操作（rc.2 尚无轮次导航 / 宽度轴，已查证）
