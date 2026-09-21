# dsh-theme-tone

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

明暗主题之下的色调层 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

## 安装

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

适配 dsh 0.1.5-rc.2（本版构建与验证所对齐的确切官方版本线；更新的版本线、尤其是预发布版本不在承诺范围内），并需要可用的 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> **不要**直接执行 `npm install @dsh-sparrow/dsh-theme-tone`：那只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上面的 `dsh plugin` 命令安装，并在安装后重启 DSH。

## 用法

打开**设置 → 常规**，**色调**行就在官方**外观**行正下方。每轴四款色调 + 一款**默认**：

| 轴 | 色调 |
| :--- | :--- |
| 深色 | 默认（官方原深色）、深空、余烬、幽林 |
| 浅色 | 默认（官方原浅色）、霜蓝、樱花、苔青 |

## 版本兼容性

* 适配 dsh 0.1.5-rc.2（本版构建与验证所对齐的确切官方版本线，其它版本线不在承诺范围内）
* **纯外观**：不会让界面卡住，也不改任何东西的行为
* 宿主或浏览器缺少它需要的东西时，它会**自停用**并记一条面向用户的告警

## 截图

![新建会话页上的深色轴](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![新建会话页上的浅色轴](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## 卸载与残留

* 卸载即移除插件加的一切；设置行消失，外观回到官方
* 你的选择仍留在 `$DSH_HOME/settings.yaml` 的 `ui-theme-tone` 段，但移除后不再生效；想清掉就删该段

**更新日志**：[CHANGELOG.zh-CN.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.zh-CN.md)
