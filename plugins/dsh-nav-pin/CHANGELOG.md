# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.0 (2026-09-02)

- Promoted 0.1.0 (identical to 0.1.0-alpha.3).

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- README screenshots now use absolute URLs and are no longer packed into the npm package (functionally identical to the previous release).

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Version-line alignment 0.1.0-alpha.2 (functionally identical to the previous release).

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release
- Turn navigation stays on narrow conversations: the official 900px hide breakpoint moves to 700px; below 700px the rail is hidden by default and fades in on hover over the right edge / keyboard focus (opacity only, no frame or background, same look as the official wide rail)
- Conversation content width cap: dragged-wide columns keep at least 120px clearance per side (official: 88px); narrow columns clamp content to the official 640px minimum to make room for the rail, so the right drag handle no longer crowds the turn navigation
- README "Compatibility" section added: on dsh 0.1.1-rc.2 and earlier the plugin is a harmless no-op (the turn navigation / width axis did not exist in rc.2, verified)

