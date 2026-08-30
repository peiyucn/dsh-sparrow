# dsh-chat-fim

聊天输入框续写联想 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。
Chat input suggestions — a DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

打字停顿片刻，输入框上方会以官方 @ 候选菜单同款悬浮卡给出「接下来可能写的文字」建议：**Tab** 采用进草稿，**Esc** 丢弃。补全由 DeepSeek 官方 FIM 补全（Beta）驱动，续写直接站在你的角度接话。
After a short typing pause, a suggestion card styled like the official @ menu appears above the input — **Tab** adopts the text, **Esc** dismisses it. Powered by DeepSeek FIM completion (Beta); the continuation picks up in your own voice.

## 安装 / Install

```bash
dsh plugin --profile web add dsh-chat-fim
```

适配 dsh ≥ 0.1.1-rc.2。 · Requires dsh ≥ 0.1.1-rc.2.

## 使用 / Usage

* **开关 / Switch**：输入框工具行「✦ 续写」胶囊，点击开 / 关；**默认关闭**，开启状态本地记忆
  * A "✦ Suggest" pill in the input tool row toggles it; **off by default**, your choice is remembered locally
* **触发 / Trigger**：开启后打字停顿约 0.4 秒自动联想。以下情况**不会**触发，避免打断：草稿不足 8 字；以句末标点（`。！？.!?;；`）结尾；以空格/换行结尾；停在英文单词中间；拼音等输入法组合输入中
  * Suggestions fire after ~0.4s of typing pause, except when: the draft is shorter than 8 characters, ends with sentence punctuation (`。！？.!?;；`), ends with a space/newline, stops mid-word in English, or an IME composition is in progress
* **建议 / Suggestion**：Tab 采用、Esc 丢弃（也可直接点选）；官方 @/斜杠候选菜单打开时本建议自动让位
  * Tab adopts, Esc dismisses (clicking works too); the card yields while the official @/slash menu is open
* **续写模型 / Model**：胶囊右侧 ▾ 可选 `auto` / `deepseek-v4-pro` / `deepseek-v4-flash`，默认 `auto` 跟随主模型；建议卡右下角显示本次续写的 tok 数与实际模型、温度
  * The ▾ next to the pill picks `auto` / `deepseek-v4-pro` / `deepseek-v4-flash` (default `auto` follows the main model); the card footer shows the token count, the model used, and the temperature
* 当前会话主模型不是 DeepSeek 系列时，开关整体隐藏
  * The whole switch is hidden when the current session's main model is not a DeepSeek model
* **凭据 / Credentials**：续写请求复用你在 dsh 中配置的 DeepSeek API key（FIM 补全 Beta），不新增凭据、key 不进浏览器；产生的 token 计入你的 DeepSeek 账户
  * Requests reuse the DeepSeek API key configured in dsh (FIM completion Beta) — no extra credentials, the key never reaches the browser; token usage bills to your DeepSeek account

## 截图 / Screenshots

![续写建议候选菜单 / Suggestion card](docs/images/suggestion-menu.png)

![续写模型三档选择 / Model picker](docs/images/model-picker.png)

## 卸载与残留 / Uninstall & Residue

* 插件不写任何文件、不改 `.dsh` 内部结构，只做网络转发；
  * The plugin writes no files and never touches the `.dsh` internals — it only forwards network requests.
* 唯一的持久状态是浏览器 localStorage 键 `dsh-chat-fim:enabled`（开关）与 `dsh-chat-fim:modelMode`（续写模型档位）。卸载后这两个键留在浏览器里、无害，介意可在 DevTools 中删除。
  * The only persistent state is the browser localStorage keys `dsh-chat-fim:enabled` (switch) and `dsh-chat-fim:modelMode` (model choice). They remain in the browser after uninstall and are harmless; delete them in DevTools if you mind.
