# dsh-theme-tone

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

给 DSH 内置的深浅两套主题加上色调皮肤 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

## 安装

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

适配 dsh 0.2.1-rc.4（本版构建与验证所对齐的确切官方版本线），并需要可用的 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> **不要**直接执行 `npm install @dsh-sparrow/dsh-theme-tone`：那只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上面的 `dsh plugin` 命令安装，并在安装后重启 DSH。

## 用法

打开**设置 → 常规**，**色调**行就在**外观**行正下方 —— 浅色、深色各有四款皮肤，外加一款**默认**：

| 外观 | 皮肤 |
| :--- | :--- |
| 深色 | 默认、深空、余烬、幽林 |
| 浅色 | 默认、霜蓝、樱花、苔青 |

每款色调带来这些变化：

* **颜色** —— 通过官方主题 token 层给整个界面重新着色（背景、抬升面、文字、描边、滚动条）。
* **地面光** —— 一层固定的装饰光，由顶部 / 底部 / 左侧三道光组成；每款色调的光位与方向固定。
* **磨砂玻璃** —— 输入框、对话区顶栏、右栏顶栏都是半透明磨砂玻璃：顶栏保持官方原有边框，并带上和页面其余部分同一片暖色页面光；输入框更亮，边缘光左右 / 上下对称（每条边中段最亮、两端淡出），下面托一层很软的悬浮阴影。
* **底部不再有实色条，也不会漏正文** —— 输入框底下原本那块实色背景已移除，改为透出页面地面光；滚动时对话正文会被输入框下沿、下方统计胶囊行以及上方停靠卡（todo / goal / 待发消息列表）挡住，不会从缝隙里漏出来 —— 右栏打开时窗口底部也不会漏。
* **次级浮层统一** —— 停靠卡改为不透明抬升面（多张叠放观感一致）；模型选择列表的分组标题滚动时保持不透明；@ / 斜杠 候选菜单还有更多结果时淡出列表自身的条目。

停靠卡、模型选择分组标题、@ / 斜杠 候选菜单的材质与提示修正在所有音色下（含默认）都生效。

选**默认**时完全不碰官方主题与玻璃效果。

## 版本兼容性

* 适配 dsh 0.2.1-rc.4（本版构建与验证所对齐的确切官方版本线，其它版本线不在承诺范围内）
* 只改外观：不会让界面卡住，也不改任何功能；菜单 / 弹窗的材质保持官方原样（停靠卡、模型选择分组标题、@ / 斜杠 候选菜单按上面的说明统一了材质与提示方式）
* 宿主或浏览器缺东西时它会自己让位：界面照常开、它什么都不画（另记一条面向用户的告警）

## 截图

![新建会话页的深色主题](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![新建会话页的浅色主题](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## 卸载与残留

* 卸载即移除插件加的一切；设置行消失，外观回到官方
* 你的选择仍留在 `$DSH_HOME/settings.yaml` 的 `dsh-theme-tone` 段，但移除后不再生效；想清掉就删该段

**更新日志**：[CHANGELOG.zh-CN.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.zh-CN.md)
