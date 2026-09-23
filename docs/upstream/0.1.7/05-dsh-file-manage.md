# 05 · dsh-file-manage — **适配**（小）

## 1) 定位与结论

DeepSeek Files API 云端文件管理（列表 / 上传 / 删除 / 配额），无本地持久化。
**结论：官方没有用户可见的 Files 管理面（Files API 只是 `llm-deepseek` 内部的上传/复用管道），插件不退役、需适配，改动量六份里第二小。**

## 2) 现状（真机 + 源码双证）

| 半边 | 状态 | 证据 |
|---|---|---|
| host | ✅ 激活（`/v1` 路径待实测） | 真机：无失败告警；`webServer` / `credentials` / `settings` 服务均在 |
| client | ❌ `sidebar.footer.action` entry 抛 #130（图标改名） | 真机 console：`slot entry crashed in 'sidebar.footer.action'`；`src/client/FileManageDock.tsx:7` 引用的 `IconCloseOutline16` / `IconFolderOpenOutline16` 已不存在 |

**官方新事实**：

* Files API 是 `llm-deepseek` 的内部能力（`packages/llm/llm-deepseek/README.zh.md:95,135` 的 `src/files-api.ts` / `src/file-store.ts`），**无任何用户可见的列表/删除/配额 UI**。
* ⚠️ `DeepSeekFilesClient` 的 `baseURL` 归一化**追加 `/v1`**（alpha.2 `files-api.ts:71-77,132,141`、`messages-api.ts:11-14`；rc.2 `:136-140` 只去尾斜杠）—— 我方 `DEFAULT_BASE_URL='https://api.deepseek.com'`（`src/host.ts:18`）→ 请求路径由 `/files/…` 变 `/v1/files/…`，**需实机确认是否 404**。
* 我方读 `llm-deepseek` 设置节取 baseURL/apiKeyEnv；`ctx.settings.describe()` 仍在（`packages/settings/settings/src/index.ts:302`），但 `ns` 语义已从「注册命名空间」变为 **profile entry id**（`docs/subsystems/settings.zh.md:9`）—— 我方按字面量 `'llm-deepseek'` 匹配（`src/host.ts:40`），官方 `name = 'llm-deepseek'`（`llm-deepseek/src/index.ts:53`），**大概率仍命中，需实测**。
* 官方新增 `deliverables` / `document` 包，把「产物」语义收编 —— 与我方是否同一存储**未核实**。

## 3) 改动清单

1. `src/client/FileManageDock.tsx:7` 图标改名（`IconCloseOutline16` → `IconCloseOutlineRegular`、`IconFolderOpenOutline16` → `IconFolderOpenOutlineRegular`），保持 `size`；补结构测试。
2. 实机跑一次 `/api/file-manage/list`：确认 `/v1` 归一化后是否 404；命中则对齐（优先直接用官方归一化结果，别自己拼）。
3. 实测 `settings.describe()` 里 `llm-deepseek` 的 ns 是否仍等于字面量；不等则改按 entry id 取。
4. 依赖升线（共同面）。

## 4) 结论（owner 拍板）

> 待讨论，逐条记结论。

1. **范围**：官方 `deliverables` / `document` 上位后，本插件是否收窄为「**DeepSeek 云端 Files API 本身的运维**」（只看云端文件、不管会话产物），避免与官方产物语义打架。同意 / 或先核实两者是否同一存储再定。
2. **`/v1` 对齐方式**：直接用官方 client 的归一化结果（跟随官方，推荐）vs 我方自己判断并兼容两种路径（多一层兼容代码）。

## 5) 验收口径 / 未核实项

* 真机验收：列表 / 分页 / 删除 / 配额显示、错误路径用户可见（key 缺失 / 网络失败）、无 #130。
* 未核实：`/v1` 是否真致 404；`settings.describe()` 的 ns；官方 `deliverables` 是否复用同一 Files API 存储。
