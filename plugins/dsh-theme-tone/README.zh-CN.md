# dsh-theme-tone

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

给 DSH 加上深浅两套主题各自的色调皮肤，并在选定色调后一并优化对话区布局 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

## 安装

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

适配 dsh 0.2.0-rc.2（本版构建与验证所对齐的确切官方版本线；更新的版本线、尤其是预发布版本不在承诺范围内），并需要可用的 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> **不要**直接执行 `npm install @dsh-sparrow/dsh-theme-tone`：那只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上面的 `dsh plugin` 命令安装，并在安装后重启 DSH。

## 用法

打开**设置 → 常规**，**色调**行就在**外观**行正下方 —— 浅色、深色各有四款皮肤，外加一款**默认**：

| 外观 | 皮肤 |
| :--- | :--- |
| 深色 | 默认、深空、余烬、幽林 |
| 浅色 | 默认、霜蓝、樱花、苔青 |

选中任一非「默认」的色调后，**对话区布局也一并优化**（**默认**档下一切保持原样）：

* 轮次导航：选色调后，对话列更窄时导航依然可用（「默认」档下更早就隐藏）；最窄时默认隐身，鼠标移到右侧轨道（或键盘 Tab 进入）淡入浮现——无框无底色
* 会话内容留白：宽列下对话内容两侧留白更宽；窄列下内容不再压到右侧拖拽条底下

另外顺手修掉拖拽条的一个小毛病（**不需要选色调，两个档位都生效**）：鼠标移到左右任一条「调整对话宽度」的拖拽条上时，高光原本偏在下方，要按住拖动才回到鼠标处；现在悬停时也跟随鼠标。

## 版本兼容性

* 适配 dsh 0.2.0-rc.2（本版构建与验证所对齐的确切官方版本线，其它版本线不在承诺范围内）
* 只改外观：不会让界面卡住，也不改任何功能
* 宿主或浏览器缺东西时它会自己让位：界面照常开、它什么都不画（另记一条面向用户的告警）

## 已知限制

* 右栏打开时，顶栏的「后台任务」弹框不会浮到右栏之上。DSH 把这个弹框渲染在对话列**内部**——它旁边的「智能体团队」弹框渲染在列外，所以那个能浮起来——因此它受对话列边界约束。我们把它改成右对齐以免被切掉，但它盖不到右栏上面。

## 截图

![新建会话页的深色主题](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![新建会话页的浅色主题](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## 卸载与残留

* 卸载即移除插件加的一切；设置行消失，外观回到官方
* 你的选择仍留在 `$DSH_HOME/settings.yaml` 的 `dsh-theme-tone` 段，但移除后不再生效；想清掉就删该段

**更新日志**：[CHANGELOG.zh-CN.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.zh-CN.md)
