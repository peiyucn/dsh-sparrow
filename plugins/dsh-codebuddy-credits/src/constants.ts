/** 插件的全局常量：settings 命名空间、provider 路由、CodeBuddy 端点与官方请求标识。 */

/**
 * 设置命名空间 = **profile 条目 id** —— 本插件的条目 id 由自带 `cordis.patch.yml` 的 insert 决定，
 * 与插件 `name`、客户端 provider 卡片槽位 key 必须**三者一致**（卡片按 provider 行的 settingsNs 匹配、
 * 模型发现按同一 key 注册），`test/config.test.mjs` 有对应守卫。
 */
export const NS = 'llm-codebuddy-credits'
/** DSH provider 路由 key，也是模型条目与凭据配置的锚点（client 端 model-facts.ts 的 PROVIDER_ID 必须与此一致）。 */
export const PROVIDER = 'codebuddy-credits'
/** 模型选择器与设置页显示的 provider 名（内部 ID 保持小写连字符，仅展示名品牌化）。 */
export const DISPLAY_NAME = 'CodeBuddy Credits'
/**
 * 凭据环境变量名；API key 只经 ctx.credentials 解析，绝不落盘到设置文件。
 * 必须等于官方派生名 deriveKeyRef('codebuddy-credits')，否则行头凭据圆点与官方「移除」流程失效。
 */
export const API_KEY_ENV = 'CODEBUDDY_CREDITS_API_KEY'
/** 旧版凭据引用：解析时兼容并迁移。 */
export const LEGACY_API_KEY_ENV = 'CODEBUDDY_API_KEY'
/**
 * CodeBuddy 服务根域名（**唯一来源**，勿在别处硬写字面量）。
 *
 * `www.codebuddy.cn` 与 `copilot.tencent.com` 是同一套服务的两个入口、服务等价；取后者（官方 CLI 与
 * 开放平台文档用的就是它，国际通用入口），不钉国内区域名。国际版 `www.codebuddy.ai` 是**独立后端**，
 * 不可混用。⚠️ 个别办公网可能把它解析到已退役的边缘 IP 而连不上——那是本机 DNS 问题，不要改这个常量。
 */
export const CODEBUDDY_ORIGIN = 'https://copilot.tencent.com'
/** 个人主页地址（积分弹层右上角用户徽章点击后打开）；取自 `CODEBUDDY_ORIGIN`，不写第二份字面量。 */
export const PROFILE_URL = `${CODEBUDDY_ORIGIN}/profile/`
/** CodeBuddy 推理端点（OpenAI Chat Completions 方言，仅支持流式）。 */
export const BASE_URL = `${CODEBUDDY_ORIGIN}/v2`
/** 模型目录端点：按当前 API key 的账号权限返回可用模型。 */
export const CONFIG_URL = `${CODEBUDDY_ORIGIN}/v3/config`
/** 账号信息端点（企业上下文头的来源）。 */
export const ACCOUNTS_URL = `${CODEBUDDY_ORIGIN}/v2/accounts`
/** 企业周期配额端点（额度卡数据源）。 */
export const QUOTA_URL = `${CODEBUDDY_ORIGIN}/v2/billing/meter/get-enterprise-user-usage`
/** 客户端身份：请求 UA 前段与 `X-IDE-Name` 同名（用量明细的 client 字段即取该头，X-IDE-Type/Version 不参与）。 */
export const CLIENT_NAME = 'deepseek harness'
/**
 * `/v3/config`（模型目录）要求的**客户端类别记号**：UA 里必须出现 `CLI/` 记号，否则服务端返回
 * HTTP 200 + `code:0/msg:OK` 但**静默省略 `data.models`**（表现为「模型目录为空」，极难排查）。
 * 另一条校验：UA 解析不出 `CodeBuddy/<版本>` 时返回 400。故 UA = 本插件名 + 官方记号 + 官方版本段。
 */
export const CLI_UA_MARKER = 'CLI/unknown'
/** 官方 CLI 版本段（`CodeBuddy/<版本>`），服务端校验所需；需随官方 CLI 更新同步。 */
export const CODEBUDDY_CLI_VERSION = '2.137.1'
/** 请求 UA：`<本插件名> CLI/unknown CodeBuddy/<官方版本>`；不带本插件版本号，避免每次发版都要改这里。 */
export const REQUEST_USER_AGENT = `${CLIENT_NAME.replace(/ /g, '')} ${CLI_UA_MARKER} CodeBuddy/${CODEBUDDY_CLI_VERSION}`
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
/** 后台模型刷新节流：宿主重建模型目录会触发刷新，这是两次尝试之间的最小间隔（密集重建时不连环打服务端）。 */
export const MODEL_REFRESH_COOLDOWN_MS = 60_000
/** 未声明容量的模型的上下文窗口兜底值。 */
export const DEFAULT_CONTEXT_WINDOW = 262_144
/** 未声明容量的模型的最大输出兜底值。 */
export const DEFAULT_MAX_TOKENS = 32_768
/**
 * 图片请求预算：照搬官方 CLI 的默认压缩档——最长边 2000px（不引入其环境变量）、JPEG 质量阶梯
 * [80,60,40,20]、原始字节目标 3_932_160（base64 上限 5_242_880）。像素预算沿用历来的**总像素**
 * 2000×2000（官方档是单边 2000px，换算结果与此前一致，勿改成单边）。
 */
export const IMAGE_REQUEST_POLICY = {
  maxPixels: 2000 * 2000,
  maxBytes: 3_932_160,
} as const
