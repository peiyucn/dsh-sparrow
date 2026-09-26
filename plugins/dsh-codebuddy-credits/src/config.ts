/**
 * 插件设置节。官方 0.1.7 起插件配置就是**导出的 Cordis `Config`**（schemastery
 * schema），设置命名空间 = **profile 条目 id**（本插件 = `llm-codebuddy-credits`，
 * 即本插件 `name` 与 `cordis.patch.yml` 的 insert id）；`installSection` 与节级
 * `get()` 都已移除（`packages/settings/settings/src/index.ts` 只剩
 * `configure/describe/update/replace/mutate`）。参考官方样例
 * `packages/llm/llm-deepseek/src/config.ts:92-112` 与它的 `src/index.ts:15`。
 *
 * 形状对齐官方 llm-deepseek 的整节 profile：apiKeyEnv 直接在节根部（官方设置页
 * 的凭据圆点按节根 apiKeyEnv 读取，整节型 provider 的 settingsPath 为空，
 * apiKeyEnv 必须在根部圆点才会亮）。两个字段都标 `.volatile()`——只有 volatile
 * 字段会进设置表单、也只有 volatile 路径可经 SettingsForms 写入
 * （`packages/settings/settings/src/schema.ts:74-79`、
 * `packages/settings/settings/src/index.ts:387-389`）；宿主侧因此直接读自己的
 * config 引用（`config.apiKeyEnv.get()` / `config.maxMode.get()`），值永远是最新。
 *
 * apiKeyEnv 是凭据引用（密钥只经 ctx.credentials，不进设置文件）；
 * 模型列表不落设置节——完全由 Key 授权下的 /v3/config 决定。
 */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { API_KEY_ENV, LEGACY_API_KEY_ENV } from './constants.js'

/** 插件配置（`apply` 收到的形状：每个 volatile 字段都是一个稳定引用）。 */
export interface Config {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_CREDITS_API_KEY。 */
  apiKeyEnv: Volatile<string>
  /**
   * Max 模式（推理档位锁）：开启后所有 reasoning 模型的请求强制发
   * reasoning_effort:"max"（CodeBuddy 服务端宽容接受未声明的 max，已实测
   * v4-flash / glm-5.3-flash / hy4-preview 全部 200 生效）；选择器档位面板
   * 呈现锁定态。逐模型档位偏好保留不覆盖，关闭后原样恢复。
   */
  maxMode: Volatile<boolean>
}

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV).volatile(),
  maxMode: z.boolean().default(false).volatile(),
})

/**
 * 解析 Key 时依次尝试的凭据引用（纯函数，供单测）：
 * 用户配置的 apiKeyEnv 优先（默认对齐官方派生名 CODEBUDDY_CREDITS_API_KEY），
 * 旧引用 CODEBUDDY_API_KEY 兜底（旧版存过的 Key 不用重配）；两者同名时去重。
 * @param apiKeyEnv - 当前生效的 apiKeyEnv（调用方传 `config.apiKeyEnv.get()`）。
 */
export function keyRefs(apiKeyEnv: string | undefined): readonly string[] {
  const primary = apiKeyEnv ?? API_KEY_ENV
  const refs = [primary, LEGACY_API_KEY_ENV]
  return refs.filter((ref, index) => refs.indexOf(ref) === index)
}
