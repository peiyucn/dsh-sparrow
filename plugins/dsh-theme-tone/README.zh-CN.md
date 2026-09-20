# dsh-theme-tone

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

明暗主题之下的色调层 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

DSH 官方的主题只有一个颜色轴：浅色或深色。本插件在它之下再挂一层**正交**的轴 —— **色调**，浅色轴与深色轴各选各的，于是两侧各自能带自己的氛围。选中一款色调会重画应用底色、左栏填充与铺在它们之上的光晕，并把色调带到菜单、对话框与卡片上。选「默认」则一切回到官方原样。

## 安装

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

适配 dsh 0.1.5-rc.2（本版构建与验证所对齐的确切官方版本线；更新的版本线、尤其是预发布版本不在承诺范围内），并需要可用的 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> **不要**直接执行 `npm install @dsh-sparrow/dsh-theme-tone`：那只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上面的 `dsh plugin` 命令安装，并在安装后重启 DSH。

## 用法

打开**设置 → 常规**，**色调**行就在官方**外观**行正下方。

* 该行**只显示当前明暗轴**的色调；切浅 / 切深时行内容就地刷新
* 两个轴**各存一份**选择 —— 切到浅色再切回来，深色的选择还在
* 每轴四款色调 + 一款**默认**：

| 轴 | 色调 |
| :--- | :--- |
| 深色 | 默认、深空（蓝紫）、余烬（红）、幽林（绿） |
| 浅色 | 默认、霜蓝、樱花（粉）、苔青（绿） |

* **默认**什么都不改 —— 不覆盖任何 token、不画背景层，所以你手上永远有一个未被动过的官方外观可以对照
* 每张卡**预览**它所应用的色调，选了就是看到的
* 点选立即生效，无需刷新页面

因为两个轴都能选，本插件从不强迫你停留在某个色调上 —— 卸载它（或两轴都选「默认」）即精确恢复官方外观。

## 色调驱动的范围

* 应用底色与左栏填充
* 铺在整屏上的柔光（上方光源、下方纵深，以及左边栏上的光晕）
* 细腻的颗粒质感
* **抬升面** —— 菜单、对话框、抬升卡片 —— 继承该色调的色相；交互态（hover / 按下 / 选中）、分隔线与滚动条也跟着染色
* **浅灰内嵌面** —— 代码块与输入框上方的三张卡（待办、目标、对话排队）—— 比页面背景重一档，边界一眼可辨

深色轴沿用 [pyai.site](https://pyai.site) 的深空调色板 —— 近黑地面 + 一束暖金光。浅色轴与它**严格镜像**：官方白地面 + 由该色调自己打出的光。

## 版本兼容性

* 适配 dsh 0.1.5-rc.2（本版构建与验证所对齐的确切官方版本线，其它版本线不在承诺范围内）
* 宿主缺少本插件依赖的任一能力（`ctx.theme.overrideTokens`、`ctx.settingsScope`、`ctx.slots`、`ctx.locale`）时，插件会**自停用**并记一条面向用户的告警，不会在不认识的契约上运行 —— dsh 与你的其它插件不受影响
* 浏览器缺少玻璃效果所需的 CSS 特性时同样自停用，而不是注入不可能生效的规则
* 插件不碰官方 DOM 结构、不碰官方 React 组件、也不依赖官方 hashed CSS-module 类名

## 截图

![新建会话页上的深色轴](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone.png)

## 卸载与残留

* 卸载即移除 token 覆盖、背景层与注入的样式表；设置行消失，外观回到官方
* 你的选择仍留在 `$DSH_HOME/settings.yaml` 的 `ui-theme-tone` 段，但移除后不再生效；想清掉就删该段

**更新日志**：[CHANGELOG.zh-CN.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.zh-CN.md)
