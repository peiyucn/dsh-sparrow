/**
 * 插件共用常量（host / client 两半都可 import，不得引入运行时依赖）。
 * 所有跨请求 / 跨渲染的数值都收在这里，避免同一语义在 host 与 client 各写一份后漂移。
 */

export const PACKAGE_NAME = 'dsh-archive-manage'

/** 路由前缀：长于官方 `/api` 栅栏，故本插件自己做信任检查。 */
export const PREFIX = '/api/archive-manage'

/** 注：`/trash` 同时承载 GET（列表）与 POST（移入回收站），故 11 个路径对应 12 条方法路由。 */
export const ROUTES = Object.freeze({
  list: `${PREFIX}/list`,
  strays: `${PREFIX}/strays`,
  trash: `${PREFIX}/trash`,
  trashDir: `${PREFIX}/trash-dir`,
  unarchive: `${PREFIX}/unarchive`,
  archive: `${PREFIX}/archive`,
  delete: `${PREFIX}/delete`,
  trashDelete: `${PREFIX}/trash-delete`,
  restore: `${PREFIX}/restore`,
  trashRestoreAll: `${PREFIX}/trash-restore-all`,
  trashDeleteAll: `${PREFIX}/trash-delete-all`,
})

/** 回收站记账文件：文件名属于磁盘格式，改名会让存量回收站条目退化成「旧格式」。 */
export const TRASH_SIDECAR = 'dsh-archive-manage.json'
/** 当前 sidecar 版本；v1 只被读取（无 subagents 字段），v2 增加子会话记账。 */
export const SIDECAR_VERSION = 2

/** 写路由请求体上限；超过即 400，而不是把整段内容读进内存再判。 */
export const MAX_BODY_BYTES = 64 * 1024

/** header 事实缓存 TTL：写穿失效之外的兜底，防没有事件的边界路径留陈旧成员表。 */
export const HEADER_CACHE_TTL_MS = 30_000

/** 冷会话日志折叠的有界并发：同一时间至多 N 个冷会话在做折叠。 */
export const TITLE_FOLD_CONCURRENCY = 4
/** 标题折叠兜底的整体预算：超时后未完成的折叠按失败处理、回退会话 id。 */
export const TITLE_FOLD_BUDGET_MS = 8_000
/** 第三方档（冷、未种子）从日志重新折叠投影的单次观察超时。 */
export const LABEL_FOLD_TIMEOUT_MS = 15_000

/** 折叠标签记忆上限：记忆随观察过的会话数增长，设 LRU 上限防无界累积。 */
export const FOLDED_LABEL_CACHE_MAX_ENTRIES = 256

/**
 * 启动三项扫描的兜底延迟：不在 apply 里立刻发起，避免与官方会话列表抢同一次全量扫盘；
 * 用户打开面板时另有「立即补跑」，这里只保证「一直不开面板」时清扫最终会发生。
 */
export const STARTUP_SCAN_DELAY_MS = 30_000

/** 官方投影缓存域：先读官方 `projectionCacheDomainSpec`，取不到才用下面的回退值。 */
export const PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE = '@deepseek-ai/dsh-session-projection-cache'
export const PROJECTION_CACHE_DOMAIN_FALLBACK = Object.freeze({
  name: 'session_projcache',
  table: 'sessions',
})

export interface ProjectionCacheDomain {
  readonly name: string
  readonly table: string
}

/**
 * 从官方域描述里取域名与表名。官方包不在本插件的依赖面内（只在宿主安装树里），故调用方
 * 用动态 import 尽力读取；形状不符或读不到时回退字面量，避免插件因官方改名而停用。
 */
export function projectionCacheDomainOf(spec: unknown): ProjectionCacheDomain {
  const record = typeof spec === 'object' && spec !== null ? spec as Record<string, unknown> : {}
  const name = typeof record.name === 'string' && record.name !== ''
    ? record.name
    : PROJECTION_CACHE_DOMAIN_FALLBACK.name
  const tables = record.tables
  const declaredTables = typeof tables === 'object' && tables !== null ? Object.keys(tables) : []
  // 官方域当前只声明一张表；优先认 `sessions`，官方改名时取第一张声明表，仍读不到才回退。
  const table = declaredTables.includes(PROJECTION_CACHE_DOMAIN_FALLBACK.table)
    ? PROJECTION_CACHE_DOMAIN_FALLBACK.table
    : declaredTables[0] ?? PROJECTION_CACHE_DOMAIN_FALLBACK.table
  return { name, table }
}

/** 移入回收站 / 删除后失效投影缓存的重试次数（含首次；第二次后仍残留只告警，由启动清扫兜底）。 */
export const PROJECTION_CACHE_INVALIDATE_ATTEMPTS = 2

/** 原生 fs 的「不存在」错误码：多处按它做幂等宽恕，避免散落字符串。 */
export const ENOENT = 'ENOENT'

/* ------------------------------------------------------------------ *
 * client 侧常量（同一模块导出，避免 client 再抄一份路由 / 页大小）
 * ------------------------------------------------------------------ */

/** 入口 id：同时是左栏面板行的 id 与中央列 `main` 槽的 key（官方 `MainPanelId`）。 */
export const PANEL_ID = 'archive-manage'
/** 左栏行序：官方 plugins = 0、schedules = 10，本插件沿用原 footer 的 20 号段。 */
export const PANEL_ORDER = 20
export const LOCALE_NAMESPACE = 'archive-manage' as const

/** 面板请求超时：host 挂起时不让面板永久 loading（/list 首开要做对齐 + 全量扫描 + 冷观察）。 */
export const REQUEST_TIMEOUT_MS = 30_000
/** 每区每次渲染的行数上限，「加载更多」按此递增。 */
export const ARCHIVE_PAGE_SIZE = 100
/** 会话进出事件的刷新防抖：多个会话释放事件合并成一次全量刷新。 */
export const SESSIONS_CHANGED_DEBOUNCE_MS = 300
/** 复制成功反馈的展示时长。 */
export const COPIED_FEEDBACK_MS = 2_000
/** 创建龄文案的「一天」毫秒数。 */
export const DAY_MS = 86_400_000
/** 页面内广播的「会话集合已变化」事件名（remote 桥接用）。 */
export const SESSIONS_CHANGED_EVENT = 'dsh-archive-sessions-changed'
/** 样式表标记属性对应的选择器（HMR / 重复安装时据此复用同一元素）。 */
export const STYLE_SELECTOR = 'style[data-dsh-archive-trigger]'
