# 00 · 架构总览 — dsh-file-manage

> 2026-10-28 重写。旧 spec 01 / 02 / 03 已删除，本文是唯一事实来源。
> 只记录**当前实现**与已知限制，不保留提案、路线图和实施过程。

## 定位

DeepSeek Files API 云端文件的可视化管理：列出当前 API key 下的文件、游标翻页、单条删除、复制 `file_id`。
复用官方 `DeepSeekFilesClient` 与官方凭据，不引入新密钥、不写官方上传索引、无本地持久化。
不做批量删除（官方无批量端点）、上传、下载 / 预览、会话归属。

## 入口与页面形态

* host half 注册 `prefix` 路由 `/api/file-manage`；client half 注册官方「主面板」两处槽位：
  `sidebar.panellist`（左栏图标行，`order: 21`）与 `main` keyed 槽，共用同一个 id `file-manage`。
* `layout` 不进 `inject`，走 `ctx.inject(['layout'], …)` 可选依赖 fork：官方布局服务不在位时整条不注册。
* 页面是中央列的普通页面，不是弹窗：无遮罩 / `aria-modal` / 焦点陷阱；删除确认用官方 `Modal` 原语。
* 标题行自带 `data-window-drag` 与 28px 顶内边距（macOS 再叠加 `--dsh-frame-top-clearance`）。

## host 契约

| 路由 | 方法 | 请求 | 响应 |
| :--- | :--- | :--- | :--- |
| `/api/file-manage/list` | GET | `after?` 游标；`limit` 1–1000，缺省 / 非法回退 200 | `{ items: FileRow[], hasMore, lastId? }` |
| `/api/file-manage/count` | GET | — | `{ count, totalBytes, totalBytesLabel, quotaBytes, quotaBytesLabel, quotaCount }` |
| `/api/file-manage/files` | DELETE | `id`（百分号编码；畸形编码 → 400） | `{ deleted: true, id }` |

* **信任栅栏**：handler 第一件事就是 `isTrustedPluginRequest(headers, officialTrustedHosts(ctx))`，
  不通过 → 403。官方栅栏只挂在 `/api` 前缀上，本插件路由更长（前缀最长者胜），必须自己判。
* **连接事实**：官方 `llm-deepseek` 设置节的 `baseURL` / `apiKeyEnv` → `ctx.credentials.resolve` →
  `$DEEPSEEK_BASE_URL` → 官方导出的 `PUBLIC_BASE_URL`。凭据只存在于 host 进程内，不落日志、不进浏览器。
* **官方面自检**：`apply` 里惰性 `import('@deepseek-ai/dsh-llm-deepseek')`，缺 5 个导出之一或
  `DeepSeekFilesClient` 不接受 `{ baseURL, headers, fetch }` 构造（rc.2 签名）→ 抛错自停用。
* **错误**：`{ error: { code, message } }`；`BAD_REQUEST` 400、`MISSING_CREDENTIAL` 401、`FORBIDDEN` 403、
  `NOT_FOUND` 404、`UNSUPPORTED_HOST` 501、上游错误按 `LlmError.code` 分类（AUTH 401 / RATE_LIMIT 429 /
  SERVER 与未知 502 / FILES_API 400）。
* **count 预算**：每页 1000 条，页数 = `ceil(官方 MAX_STORED_FILE_COUNT / 1000) + 2`（硬上限 100），
  整次扫描共享 45s deadline；客户端断开时停止翻页。

## client 契约

* `client/api.ts`：`listApi(after?)` 每次拉 200 条；`countApi()` 30s TTL 缓存 + 删除成功后失效；
  `deleteApi(id)`。普通请求 15s 超时，count 超时 = 45s + 15s 余量（让 host 的 deadline 先触发）。
* `client/paging.ts`：数据页 200 / 渲染窗口 20；「加载更多」先延伸窗口，窗口盖满已加载行才拉下一页。
* `client/locales.ts`：locale 命名空间 `file-manage`（中英两份，key 类型见 `locale.d.ts`）。
* 删除确认走官方 `Modal`；「已复制」反馈 2s 复位；首屏 `loading` / `summaryPending` 初值即 true，
  两个请求都落定才揭开内容。
* 响应体非 JSON（代理页 / 截断）→ 报「服务端返回了无法解析的响应」，不当作空列表。
* 重试按钮用同步锁挡住双击（两次全量 count 扫描没有收益）。

## 能力门

* **host**（抛错版 `assertCapabilities`）：`webServer.register`、`credentials.resolve`、`settings.describe`，
  外加官方 `dsh-llm-deepseek` 导出面与构造形状探针。缺任一 → 告警 + 抛错，cordis 把本插件标 inactive。
* **client**（不抛错版 `warnMissingCapabilities`）：`slots.inject`、`slots.register`、`locale.register`、
  `locale.bind`。缺任一 → 告警 + 直接 return，不注册任何槽位 / 样式 / 字典；`layout` 仍走可选 fork。
  client half 不能抛错：boot 审计把任一非 active entry 当致命失败，整页会只显示 "Failed to load plugins"。
* 样式表随 client 安装注入，登记在 `ctx.effect` 的清理里，插件卸载即移除。

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/constants.ts` | 路由前缀 / 路由表 / 页大小 / 超时 / 缓存 TTL / 面板 id 与 order / locale 命名空间 |
| `src/files.ts` | 纯逻辑：baseURL 回退、官方 client 形状探针、分页归一化、count 页数预算、格式化、错误分类 |
| `src/host.ts` | 组合根：能力门 → 官方面自检 → 注册路由 |
| `src/routes.ts` | 信任栅栏 + list / count / delete 分发 + JSON 收口 |
| `src/connection.ts` | 设置节 → 凭据 → 环境回退的连接事实解析 |
| `src/surface.ts` | 官方 `dsh-llm-deepseek` 的惰性加载、导出面检查、构造形状门 |
| `src/http.ts` | 插件错误类型、JSON 收发、上游错误分类收口 |
| `src/trust.ts` | Host / Origin / sec-fetch-site 信任栅栏（复用官方 trustedHosts） |
| `src/compat.ts` | 两档能力门（host 抛错 / client 只告警）与惰性探针 |
| `src/client/index.ts` | client 安装：能力门 → 样式（effect 清理）→ locale → 主面板两处注册 |
| `src/client/{api,paging,quota,panel,styles,locales}.ts` | 请求 / 窗口 / 配额 / 槽位装配 / 样式 / 文案 |
| `src/client/CloudFilesPage.tsx` | 页面组件：状态、请求编排、列表与删除确认 |
| `src/client/CloudFilesPanelIcon.tsx` | 左栏图标 |

## 参数表

| 参数 | 值 | 位置 |
| :--- | :--- | :--- |
| 路由前缀 | `/api/file-manage` | `constants.ts` |
| 列表默认 / 客户端数据页 | 200 | `constants.ts` |
| 渲染窗口 | 20 | `constants.ts` |
| count 每页 / 硬上限 | 1000 / 100 页 | `constants.ts` |
| 单请求超时 | 15s | `constants.ts` |
| count 总预算 | 45s（client 60s） | `constants.ts` |
| count 缓存 TTL | 30s | `constants.ts` |
| 复制反馈复位 | 2s | `constants.ts` |
| 左栏 order / id | 21 / `file-manage` | `constants.ts` |

## 已知限制 / 已知偏离

* **无批量删除**：官方 Files API 只有单条 `DELETE /files/{id}`；「全部清理」不做。
* **无下载 / 预览**：官方无下载端点。
* **count 是「翻到底」全量扫描**：配额 10000 时最多 12 次请求；结果缓存 30s，删除成功会失效缓存。
* **`hasMore` 但缺 `lastId`**：不显示「加载更多」（没有可用游标，点了也无法翻页）；属官方契约边角。
* **请求不可主动取消**：client 只用 `AbortSignal.timeout`，组件卸载不 abort；CHANGELOG 0.2.1-rc.3 里
  「面板关闭后请求即停止」是旧行为描述，当前实现仅依赖浏览器在页面切换时的连接处理。已发布条目不改写。
* **信任栅栏是复刻**：复用官方信任面（`webStartup` / `webRuntime`），但「最长前缀由本插件接管」这一
  分发假设来自官方路由实现；官方改路由优先级时需复核。
* **file-manage 无私有 seam**：只用官方公开服务、公开导出与公开槽位；官方改这些公开面时由能力门 / 构建
  期类型检查暴露，不静默。
* 删除 `dsh-` 前缀文件后，旧会话再次引用时官方 adapter 会自动重新上传（可能稍慢）；面板文案已说明。

## 验证

* 插件目录 `npm run verify`：typecheck → build（含 client bundle 注册 id）→ node:test → `npm pack --dry-run`。
* 单测：`files`（格式化 / 分页 / 错误分类 / 页数预算）、`api`（超时 / 错误体 / TTL / 非 JSON）、
  `paging`、`quota`、`panel`、`compat`（两档门 + 探针）、`trust`、`trust-route`（栅栏接线）、`structure`。
* 真机验收：左栏入口与页面、翻页、删除确认、配额条、卸载后无残留样式。
