# 00 · 一页速览（slide 大纲）

## 项目现状一句话

**dsh-fim：一个 DSH 插件，给 Web 聊天输入框加 FIM 联想（打字时给建议，点击采用）。**

## 结论一：@文件/文件夹/会话 官方 rc.8 已内置，我们不做（详见 03）

- 四件套：文件引用 seam + 本地实现 + 统一 @file/@session 菜单 source + 会话候选。
- 文件=原子行内引用；目录=可编辑路径 + 尾部斜杠可继续进入；会话=结构化 mention；选择不读文件内容。
- 覆盖我们原方案全部目标 → 功能二终止自研。

## 结论二：FIM 联想的插件设计（详见 02）

- **API**：DeepSeek FIM Beta（base_url=/beta、prompt=已输入文本、可选 suffix、max_tokens≤4K）。
- **client 半**：注册 conversation.input.dock 条目 → 读 input 快照（draft/draftRev/phase）→ 触发条件（plain 相、非空白结尾、末尾输入、防抖）→ 调 host → 渲染单行建议 → 点击采用 → inputActions.setDraft(draft + 建议)。
- **host 半**：ctx.webServer 自有路由转发 FIM 请求（API key 走 credentials seam）。
- **不做**：inline ghost text / Tab 键——InputBar 私有面，需上游支持。

## 结论三：一个插件，双面包（详见 04）

- 包名 dsh-fim：host 半（FIM 转发路由）+ client 半（建议条 UI），两条组合行（fim + ui-fim）。

## 路线图（详见 05）

1. **M0** 环境：rc.8 基线 + --patch 开发流 + dev:web
2. **M1** host 半：FIM 转发路由 + settings/credentials，curl 级验证
3. **M2** client 半：dock 建议条 + 触发/放弃逻辑 + 点击采用
4. **M3** 打磨发布：错误码、取消、i18n、README、npm/tarball

## 架构一图

```
浏览器（client 半）                     Node（host 半）
+--------------------+   fetch    +----------------------------+   +--------------+
| conversation.input | ---------> | ctx.webServer 路由         | ->| DeepSeek FIM |
| .dock 建议条        | <--------- | /api/fim/complete          | <-| Beta /beta   |
| 点击采用 setDraft   |   {text}   | credentials seam 取 key    |   +--------------+
+--------------------+            +----------------------------+
```
