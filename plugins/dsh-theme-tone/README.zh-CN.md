# dsh-theme-tone

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

明暗主题之下的色调层 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

DSH 官方的主题只有一个颜色轴：浅色或深色。本插件在它之下再挂一层 —— **色调**，浅色轴与深色轴各选各的，于是两侧各自带自己的氛围。选中一款色调会重画应用底色、左栏，以及铺在它们之上的光晕，并一路带到浮在上面的东西：菜单、对话框、卡片。选「默认」则完全保留官方原样。

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
| 深色 | 默认、深空（蓝紫）、余烬（红）、幽林（绿） |
| 浅色 | 默认、霜蓝、樱花（粉）、苔青（绿） |

* 该行**只显示当前明暗轴**的色调；切浅 / 切深时行内容就地刷新
* 两个轴**各记一份**选择 —— 切到浅色再切回来，深色的选择还在
* 每张卡**预览**它所应用的色调，选了就是看到的
* 点选立即生效，无需刷新页面
* **默认**什么都不改，所以「未被改动过的官方样子」永远只差一次点击

色调不只作用于背景：菜单、对话框与卡片会继承它的色相，hover / 按下 / 选中、分隔线与滚动条也跟着染色，代码块与输入框上方那三张卡（待办、目标、对话排队）同样如此。深色轴的**深空**是 [pyai.site](https://pyai.site) 的深空调色板。

## 版本兼容性

* 适配 dsh 0.1.5-rc.2（本版构建与验证所对齐的确切官方版本线，其它版本线不在承诺范围内）
* **纯外观**：不会让界面卡住，也不改任何东西的行为
* 宿主或浏览器缺少它需要的东西时，它会**自停用**并记一条面向用户的告警，而不是半好不坏地跑着

## 截图

新建会话页上的两个轴 —— 先深色，后浅色：

![新建会话页上的深色轴](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![新建会话页上的浅色轴](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## 卸载与残留

* 卸载即移除插件加的一切；设置行消失，外观回到官方
* 你的选择仍留在 `$DSH_HOME/settings.yaml` 的 `ui-theme-tone` 段，但移除后不再生效；想清掉就删该段

**更新日志**：[CHANGELOG.zh-CN.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.zh-CN.md)
