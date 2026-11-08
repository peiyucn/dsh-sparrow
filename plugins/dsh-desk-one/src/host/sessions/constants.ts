/**
 * 插件共用常量（host / client 两半都可 import，不得引入运行时依赖）。
 * 所有跨请求 / 跨渲染的数值都收在这里，避免同一语义在 host 与 client 各写一份后漂移。
 */

export const PACKAGE_NAME = 'dsh-desk-one'

/** 路由前缀：长于官方 `/api` 栅栏，故本插件自己做信任检查。 */
export const PREFIX = '/api/desk-one/sessions'

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
 * 还原 / 启动修复时回填投影缓存行的整批预算：回填要读完整冷日志（与标题折叠同量级），
 * 超时未完成的行按失败处理，余量留给下次启动修复。
 */
export const PROJECTION_SEED_BUDGET_MS = 8_000
/**
 * 「全部还原」在响应发出后**后台**回填投影行的预算：条数可能很多（实测回收站 43 条 / 139 MB），
 * 不能阻塞请求；跑不完的部分由下次启动修复补齐。
 */
export const PROJECTION_SEED_BACKGROUND_BUDGET_MS = 60_000

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
