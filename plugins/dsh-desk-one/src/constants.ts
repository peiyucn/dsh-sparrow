/**
 * 插件共用常量（host / client 两半都可 import，不得引入运行时依赖）。
 * 跨请求 / 跨渲染的数值收在这里，避免同一语义在 host 与 client 各写一份后漂移。
 */

export const PACKAGE_NAME = 'dsh-desk-one'

/** 路由前缀：长于官方 `/api` 栅栏，故本插件自己做信任检查（同 dsh-archive-manage 口径）。 */
export const PREFIX = '/api/desk-one'

/** REST 路由；S0 只有便签，S1 追加任务（后续日程 / 专注在此追加，不改已有路径）。 */
export const ROUTES = Object.freeze({
  notes: `${PREFIX}/notes`,
  noteUpdate: `${PREFIX}/notes/update`,
  noteDelete: `${PREFIX}/notes/delete`,
  tasks: `${PREFIX}/tasks`,
  taskUpdate: `${PREFIX}/tasks/update`,
  taskDelete: `${PREFIX}/tasks/delete`,
  groups: `${PREFIX}/groups`,
  groupUpdate: `${PREFIX}/groups/update`,
  groupMove: `${PREFIX}/groups/move`,
  groupArchive: `${PREFIX}/groups/archive`,
  groupDelete: `${PREFIX}/groups/delete`,
})

/** 入口 id：同时是左栏面板行的 id 与中央列 `main` 槽的 key（官方 `MainPanelId`）。 */
export const PANEL_ID = 'desk-one'
/** 左栏行序：官方 plugins = 0、schedules = 10、archive-manage = 20，本插件排在其后。 */
export const PANEL_ORDER = 30
export const LOCALE_NAMESPACE = 'desk-one' as const

/** 存储域：域名与表名都必须匹配官方 `UNIT_NAME_RE`（`^[a-z][a-z0-9_]*$`）。 */
export const DOMAIN_NAME = 'desk_one'
export const DOMAIN_VERSION = 1
/**
 * 统一对象表：所有 kind（S0 只有 note）共用一张表，按记录形状校验。
 * 后续加 kind 只扩 schema，不改域描述——加表会改后端布局，已发布的域不宜再改。
 */
export const NODES_TABLE = 'nodes'
/** 边表先声明后使用：S0 不写边，但域描述一旦发布就不宜再加表（加表等于改后端布局）。 */
export const EDGES_TABLE = 'edges'

/** 对象级 schema 版本（单个对象，迁移用）。 */
export const DESK_NODE_SCHEMA = 1

/** 写路由请求体上限；超过即 400，而不是把整段内容读进内存再判。 */
export const MAX_BODY_BYTES = 64 * 1024
export const MAX_TITLE_CHARS = 200
export const MAX_BODY_CHARS = 20_000
export const MAX_QUERY_CHARS = 100
/** 任务分组名长度上限（一层分组，名字即分组键）。 */
export const MAX_GROUP_CHARS = 80
/** 一张任务卡最多关联的会话数（UI 是 chips 行，限制避免卡片被挂满）。 */
export const MAX_TASK_SESSIONS = 10

/**
 * 产品容量上限（owner 2026-11-06）：便签墙是轻笔记，100 张已超出人的注意力上限；
 * 垃圾桶最多 200 张，满了必须先清空。两端（host / client）共用这份真值。
 */
export const MAX_ACTIVE_NOTES = 100
export const MAX_TRASH_NOTES = 200
/** 垃圾桶视图分页：一次渲染 10 行，其余按需加载（渲染越少越轻）。 */
export const TRASH_PAGE_SIZE = 10

/** 便签颜色：未知值一律拒绝（客户端色板与存储校验共用这一份真值）。 */
export const NOTE_COLORS = ['default', 'yellow', 'green', 'blue', 'pink'] as const

/** 任务状态：固定三泳道，与 board 的三列一一对应（自定义泳道后置，见 spec 03）。 */
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const

/** 便签几何（px）：默认尺寸与拖拽改大小的上下限，模型层与界面共用这一份真值。 */
export const NOTE_DEFAULT_WIDTH = 208
export const NOTE_DEFAULT_HEIGHT = 168
export const NOTE_MIN_WIDTH = 120
export const NOTE_MIN_HEIGHT = 100
export const NOTE_MAX_SIZE = 2000

/** 上次停留的标签页（纯界面偏好，不含用户内容）；切走再回来停在原标签。 */
export const TAB_STORAGE_KEY = 'dsh-desk-one:tab'
/** 任务板排序视图偏好（manual / created / due），纯界面状态。 */
export const TASK_SORT_STORAGE_KEY = 'dsh-desk-one:task-sort'
/** 任务板分组名（每泳道一组名字；分组只是任务的 group 字段，列表是纯界面状态）。 */
export const TASK_GROUPS_STORAGE_KEY = 'dsh-desk-one:task-groups'
/** 任务板分组折叠状态（key = `${status}:${group}`，纯界面状态）。 */
export const TASK_GROUP_COLLAPSE_STORAGE_KEY = 'dsh-desk-one:task-group-collapsed'
/** 任务板容器宽度低于该值时，三泳道收窄成「计数模式」（只显示条数，避免横向滚动条）。 */
export const TASK_BOARD_COMPACT_WIDTH = 720

/** 面板请求超时：host 挂起时不让面板永久 loading。 */
export const REQUEST_TIMEOUT_MS = 10_000

/** 样式表标记属性对应的选择器（HMR / 重复安装时据此复用同一元素）。 */
export const STYLE_SELECTOR = 'style[data-dsh-desk-one]'
