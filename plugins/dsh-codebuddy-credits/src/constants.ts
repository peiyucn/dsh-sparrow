/** 插件的全局常量：settings 命名空间、provider 路由、CodeBuddy 端点与官方请求标识。 */

/** Settings 命名空间（小写连字符标识，installSection 契约要求）。 */
export const NS = 'llm-codebuddy-credits'
/** DSH provider 路由 key，也是模型条目与凭据配置的锚点。 */
export const PROVIDER = 'codebuddy-credits'
/** 模型选择器与设置页显示的 provider 名（内部 ID 保持小写连字符，仅展示名品牌化）。 */
export const DISPLAY_NAME = 'CodeBuddy Credits'
/**
 * 凭据环境变量名；API key 只经 ctx.credentials 解析，绝不落盘到设置文件。
 * 命名对齐官方设置页的派生规则 deriveKeyRef('codebuddy-credits') =
 * CODEBUDDY_CREDITS_API_KEY：行头凭据圆点、官方「移除」流程的凭据清理都按
 * 该引用 join，用同名引用才能让官方 UI 原生生效（绿色圆点/删除配置）。
 */
export const API_KEY_ENV = 'CODEBUDDY_CREDITS_API_KEY'
/** 旧版引用（早期版本用 CODEBUDDY_API_KEY 存 Key）：解析时兼容并迁移。 */
export const LEGACY_API_KEY_ENV = 'CODEBUDDY_API_KEY'
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
/** /v3/config 模型目录拉取的超时（保存 Key 与后台刷新共用）。 */
export const MODEL_DISCOVERY_TIMEOUT_MS = 15_000
/** /v2/accounts 账号补拉的超时（/status 触发时不能把接口挂住）。 */
export const ACCOUNT_FETCH_TIMEOUT_MS = 5_000
/** 配额查询的超时（额度卡面板展开时调用，不能把面板挂死）。 */
export const QUOTA_FETCH_TIMEOUT_MS = 10_000
/**
 * 后台模型刷新节流：宿主重建模型目录（模型选择器打开后的首次建目录、
 * 适配器/凭据/设置变化事件）会触发刷新，两次尝试之间的最小间隔。
 * 官方目录在 ready 后缓存，选择器每次打开不再产生可感知事件，本间隔
 * 保证目录重建密集时不会连环打服务端。
 */
export const MODEL_REFRESH_COOLDOWN_MS = 60_000
/** 未声明容量的模型的上下文窗口兜底值。 */
export const DEFAULT_CONTEXT_WINDOW = 262_144
/** 未声明容量的模型的最大输出兜底值。 */
export const DEFAULT_MAX_TOKENS = 32_768
/**
 * 图片请求预算：照搬官方 CLI 的默认压缩档（2000 档，源码实测）——
 * 默认最长边 2000px（CODEBUDDY_CODE_IMAGE_COMPRESSION_MAX_DIMENSION 可调，
 * 我们跟随默认档，不引入该环境变量）、JPEG 质量阶梯 [80,60,40,20]、
 * 原始字节目标 3_932_160（base64 上限 5_242_880）。DSH 附件策略只有
 * maxPixels（宽×高）没有单边上限，取 2000×2000 近似官方档。
 */
export const IMAGE_REQUEST_POLICY = {
  maxPixels: 2000 * 2000,
  maxBytes: 3_932_160,
} as const
