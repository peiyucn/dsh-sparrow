/** 插件共用常量（host / client 两半都可 import，不得引入任何运行时依赖）。 */

export const PACKAGE_NAME = 'dsh-file-manage'

/** bundle 路由前缀：长于官方 `/api` 栅栏，故本插件自己做信任检查。 */
export const PREFIX = '/api/file-manage'

export const ROUTES = Object.freeze({
  list: `${PREFIX}/list`,
  count: `${PREFIX}/count`,
  files: `${PREFIX}/files`,
})

/** 官方 llm-deepseek 设置节：connection facts 的唯一来源。 */
export const LLM_DEEPSEEK_NS = 'llm-deepseek'
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/** 单次上游请求预算：官方 client 自身无超时，必须由调用方兜底。 */
export const REQUEST_TIMEOUT_MS = 15_000

/** count 是「翻到底」的全量扫描，给整次扫描一个总预算（单页共享同一 deadline）。 */
export const COUNT_TOTAL_TIMEOUT_MS = 45_000

/** count 每页条数（官方 list 上限 1000）；页数预算由官方配额派生，另设硬上限防 lastId 不前进的死循环。 */
export const COUNT_PAGE_LIMIT = 1_000
export const COUNT_PAGE_HARD_CAP = 100

/** 列表数据页：一次游标请求覆盖多次「加载更多」。 */
export const LIST_PAGE_SIZE = 200

/** 渲染窗口：每次「加载更多」多进 DOM 的行数。 */
export const RENDER_PAGE_SIZE = 20

/** 总数统计 TTL：面板重开 / 重试不重复全量扫描。 */
export const COUNT_CACHE_TTL_MS = 30_000

/** 「已复制」反馈复位时长。 */
export const COPIED_RESET_MS = 2_000

export const LOCALE_NAMESPACE = 'file-manage'
export const PANEL_ID = 'file-manage'
export const PANEL_ORDER = 21

export const STYLE_SELECTOR = 'style[data-dsh-file-manage]'
