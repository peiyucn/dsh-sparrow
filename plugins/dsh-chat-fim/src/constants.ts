/** 插件共用常量（host / client 两半都可 import：纯常量，不得引入任何运行时依赖）。 */

export const name = 'dsh-chat-fim'
export const PACKAGE_NAME = '@dsh-sparrow/dsh-chat-fim'
export const LOCALE_NAMESPACE = 'chat-fim'

/** 自有 exact 路由：host 注册与 client 请求共用一份路径。 */
export const COMPLETE_ROUTE_PATH = '/api/chat-fim/complete'

/** 三个槽位：工具行开关 / 数据面 / 候选菜单。三处同序，别在注册处各写一遍数字。 */
export const SLOT_INPUT_LEFT = 'conversation.input.left'
export const SLOT_INPUT_DOCK = 'conversation.input.dock'
export const SLOT_INPUT_OVERLAY = 'conversation.input.overlay'
export const SLOT_ORDER = 30
export const SWITCH_SLOT_ID = 'chat-fim-switch'
export const DOCK_SLOT_ID = 'chat-fim'
export const MENU_SLOT_ID = 'chat-fim-menu'

/** 浏览器持久化键：只存开关与灵敏度，无用户内容。 */
export const ENABLED_STORAGE_KEY = 'dsh-chat-fim:enabled'
export const SENSITIVITY_STORAGE_KEY = 'dsh-chat-fim:sensitivity'

/** 上游 POST 默认超时（配置可覆盖）；GET 支持查询走本机回环，只需兜住挂死的宿主。 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const SUPPORT_CHECK_TIMEOUT_MS = 5_000

/** 请求体上限：逐块累计与 JSON 解析前各判一次。 */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024

/** 回声判定窗口：用户消息只比开头前缀，助手消息比整窗（10 字整窗会误杀正常措辞复用）。 */
export const ECHO_USER_PREFIX_CHARS = 10
export const ECHO_ASSISTANT_WINDOW_CHARS = 15

/** 转动环矩形测量周期：不订阅官方布局事件，靠周期测量自愈。 */
export const RING_MEASURE_INTERVAL_MS = 300

/** 候选菜单高度设计上限（同官方 @ 候选列表；样式表与 useAnchoredMaxHeight 共用）。 */
export const MENU_MAX_HEIGHT = 400

/** 层级：候选菜单 / 转动环 / 灵敏度弹层。环必须低于官方遮罩（1000）才随背景一起虚化，弹层留在遮罩之上。 */
export const MENU_Z_INDEX = 100
export const RING_Z_INDEX = 900
export const POPOVER_Z_INDEX = 1100

/** 按会话诊断表上限：host 进程长期存活，表必须随会话数有界。 */
export const MAX_DIAGNOSTIC_SESSIONS = 256

/** 支持性「判不了」时的补查退避：500ms 起步、每次翻倍、共 5 次（合计 15.5s）。 */
export const FIM_SUPPORT_UNKNOWN_RETRY_MS = 500
export const FIM_SUPPORT_UNKNOWN_RETRY_FACTOR = 2
export const FIM_SUPPORT_UNKNOWN_RETRIES = 5

/** 注入样式表的标记：选择器与属性同源，卸载与 HMR 命中都认它。 */
export const STYLE_ATTR = 'data-dsh-chat-fim'
export const STYLE_SELECTOR = `style[${STYLE_ATTR}]`
