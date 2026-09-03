/** 插件的全局常量：settings 命名空间、provider 路由、CodeBuddy 端点与官方请求标识。 */

/** Settings 命名空间（小写连字符标识，installSection 契约要求）。 */
export const NS = 'llm-codebuddy-credits'
/** DSH provider 路由 key，也是模型条目与凭据配置的锚点。 */
export const PROVIDER = 'codebuddy-credits'
/** 模型选择器与设置页显示的 provider 名（内部 ID 保持小写连字符，仅展示名品牌化）。 */
export const DISPLAY_NAME = 'CodeBuddy Credits'
/** 凭据环境变量名；API key 只经 ctx.credentials 解析，绝不落盘到设置文件。 */
export const API_KEY_ENV = 'CODEBUDDY_API_KEY'
/** CodeBuddy 推理端点（OpenAI Chat Completions 方言，仅支持流式）。 */
export const BASE_URL = 'https://copilot.tencent.com/v2'
/** 模型目录端点：按当前 API key 的账号权限返回可用模型。 */
export const CONFIG_URL = 'https://copilot.tencent.com/v3/config'
/**
 * CodeBuddy 官方 CLI 请求标识。服务端校验该标识（非官方 UA 的请求会被拒绝，
 * 表现为 500 no body——社区插件的公开踩坑记录），而 user-agent 是 DSH
 * attribution 保留名、profile.headers 无法覆盖，因此由 provider 包装层注入。
 */
export const OFFICIAL_USER_AGENT = 'CLI/unknown CodeBuddy/2.137.1'
/** 产品部署类型标识，随请求发送。 */
export const PRODUCT_HEADER = 'SaaS'

/** Provider 流式读取的空闲超时（默认 5 分钟，与官方 llm-pi-ai 一致）。 */
export const STREAM_IDLE_TIMEOUT_MS = 300_000
/** 未声明容量的模型的上下文窗口兜底值。 */
export const DEFAULT_CONTEXT_WINDOW = 262_144
/** 未声明容量的模型的最大输出兜底值。 */
export const DEFAULT_MAX_TOKENS = 32_768
/** 请求级 base64 图片载荷上限（与官方默认一致）。 */
export const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
/** 请求版本的总像素预算（与官方默认一致）。 */
export const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
/** 内联图片原始字节目标（与官方默认一致）。 */
export const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/** CodeBuddy 官方思考档位集合，按官方升级顺序排列。 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
