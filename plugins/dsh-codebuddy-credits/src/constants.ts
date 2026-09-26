/** 插件的全局常量：settings 命名空间、provider 路由、CodeBuddy 端点与官方请求标识。 */

/**
 * 设置命名空间 = **profile 条目 id**（0.1.7 起官方设置面按条目 id 寻址：配置表单由
 * 插件导出的 `Config` 投影，`SettingsForms` 的 describe/update/mutate 全部以条目 id
 * 为 key——`packages/settings/settings/src/index.ts:304-315,382`）。
 *
 * 本插件的条目 id 由自带的 `cordis.patch.yml`（`dsh.bundle.patch`）insert 决定，值
 * 就是这里；它与插件 `name`、客户端 provider 卡片槽位的 key 必须**三者一致**
 * （卡片按 provider 行的 settingsNs 匹配、模型发现按同一 key 注册），
 * `test/config.test.mjs` 有对应守卫。
 */
export const NS = 'llm-codebuddy-credits'
/** DSH provider 路由 key，也是模型条目与凭据配置的锚点（client 端 model-facts.ts 的 PROVIDER_ID 必须与此一致）。 */
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
/**
 * CodeBuddy 服务根域名（**唯一来源**，勿在别处硬写字面量）。
 *
 * `www.codebuddy.cn` 与 `copilot.tencent.com` 是**同一套服务的两个入口**
 * （2026-09-18 实测：13 个用例归一化后深度相等；流式帧结构与 `usage` 字段集合一致；
 * 以付费模型双向验证共享同一份配额账本；两域名公共 DoH 解析到同一组 EdgeOne IP）。
 *
 * **取 `copilot.tencent.com`**：官方 CLI 与开放平台文档用的就是它，且为**国际通用入口**；
 * `www.codebuddy.cn` 是国内区域名 —— 本插件面向所有用户，不钉区域名。
 * 两者服务等价，故这是取舍而非功能差异。
 *
 * ⚠️ 该域名在个别办公网内可能解析到已退役的边缘 IP 而**连不上**（`copilot.tencent.com`
 * 的 CNAME 曾指向遗留池 `…share.dnse5.com`）；同批边缘 IP 用它的 SNI 可正常握手，
 * 说明**服务本身是好的，坏的是本机解析**。遇到时改本机 DNS 即可，不要改这个常量。
 *
 * 国际版 `www.codebuddy.ai` **不是别名**，是独立后端（IP `43.160.158.125`、
 * 31 vs 21 个模型、`/v2/accounts` 返回 401），不可与之混用。
 */
export const CODEBUDDY_ORIGIN = 'https://copilot.tencent.com'
/**
 * 个人主页地址：积分弹层右上角用户徽章点击后打开（与 README 的登录地址同源）。
 * 取自 `CODEBUDDY_ORIGIN`，不写第二份字面量。
 */
export const PROFILE_URL = `${CODEBUDDY_ORIGIN}/profile/`
/** CodeBuddy 推理端点（OpenAI Chat Completions 方言，仅支持流式）。 */
export const BASE_URL = `${CODEBUDDY_ORIGIN}/v2`
/** 模型目录端点：按当前 API key 的账号权限返回可用模型。 */
export const CONFIG_URL = `${CODEBUDDY_ORIGIN}/v3/config`
/** 账号信息端点（企业上下文头的来源）。 */
export const ACCOUNTS_URL = `${CODEBUDDY_ORIGIN}/v2/accounts`
/** 企业周期配额端点（额度卡数据源）。 */
export const QUOTA_URL = `${CODEBUDDY_ORIGIN}/v2/billing/meter/get-enterprise-user-usage`
/**
 * 本插件的客户端身份：请求 UA 前段与 `X-IDE-Name` 同名，便于服务端与
 * 企业管理后台把我们认成独立客户端（用量明细的 client 字段即取该头，
 * 2026-09-18 实测：X-IDE-Name 是唯一起作用的头，X-IDE-Type/Version 不参与）。
 */
export const CLIENT_NAME = 'deepseek harness'
/**
 * `/v3/config`（模型目录）要求的**客户端类别记号**。
 *
 * 实测（2026-09-18，同一 Key 逐项对照）：UA 里**必须出现 `CLI/` 记号**，
 * 服务端才在 `data.models` 返回模型数组；不含该记号时它**返回 HTTP 200 +
 * `code:0/msg:OK` 但静默省略 models 字段**——没有报错、没有非 2xx，插件侧
 * 只能表现为「模型目录为空」，极难排查。已验形态：
 *
 * | UA | models |
 * | --- | --- |
 * | `CLI/unknown CodeBuddy/2.137.1` | 31 |
 * | `deepseekharness CLI/unknown CodeBuddy/2.137.1` | 31 |
 * | `CLI/deepseekharness CodeBuddy/2.137.1` | 31 |
 * | `deepseekharness CodeBuddy/2.137.1` | **无（静默空目录）** |
 * | `deepseekharness/0.1.5 CodeBuddy/2.137.1` | **无** |
 *
 * 另一条独立校验：UA 解析不出 `CodeBuddy/<版本>` 时返回 400
 * `check ua, get coding copilot version error`（如 `CodeBuddy-CLI/2.137.1`）。
 *
 * 故 UA 取「本插件名 + 官方记号 + 官方版本段」：**如实自报身份**（名字在最前），
 * 同时满足服务端两条校验。`x-ide-name` 不受此约束，仍是后台 `client` 字段的来源。
 */
export const CLI_UA_MARKER = 'CLI/unknown'
/**
 * 官方 CLI 版本段（`CodeBuddy/<版本>`），服务端校验所需。需随官方 CLI 更新同步。
 */
export const CODEBUDDY_CLI_VERSION = '2.137.1'
/**
 * 请求 UA：`<本插件名> CLI/unknown CodeBuddy/<官方版本>`。
 * 不带本插件版本号，避免每次发版都要改这里；官方版本段才是服务端要的。
 */
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
 * 原始字节目标 3_932_160（base64 上限 5_242_880）。
 *
 * 0.1.7-rc.1 的 `ImageRequestTarget` 是 `{ width, height, maxBytes }`：像素预算这
 * 一项由调用方经官方的 `requestImageDimensions(width, height, maxPixels)` 换算成
 * 保持宽高比的目标尺寸（与官方 llm-pi-ai 的 `requestImageTarget` 逐字同构，
 * `packages/llm/llm-pi-ai/src/context.ts:249-251`）。官方档是**单边** 2000px，
 * 而这里沿用历来的总像素预算 2000×2000（旧版附件策略的语义，换算结果与之前一致）。
 */
export const IMAGE_REQUEST_POLICY = {
  maxPixels: 2000 * 2000,
  maxBytes: 3_932_160,
} as const
