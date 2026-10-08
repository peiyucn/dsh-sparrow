/**
 * 插件设置节：官方设置面按**条目 id** 寻址（本插件 = `llm-codebuddy-credits`，即 `name` 与
 * `cordis.patch.yml` 的 insert id），节级 `get()` / `installSection` 已移除。
 *
 * 形状对齐官方 llm-deepseek 的整节 profile：`apiKeyEnv` 必须在节根部（整节型 provider 的
 * settingsPath 为空，只有根部圆点才会亮）。两个字段都标 `.volatile()`——只有 volatile 字段会进设置
 * 表单、也只有 volatile 路径可经 SettingsForms 写入；宿主侧直接读 config 引用，值永远最新。
 * apiKeyEnv 是凭据引用（密钥只经 ctx.credentials，不进设置文件）；模型列表不落设置节。
 */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { API_KEY_ENV, LEGACY_API_KEY_ENV } from './constants.js'

/** 插件配置（`apply` 收到的形状：每个 volatile 字段都是一个稳定引用）。 */
export interface Config {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_CREDITS_API_KEY。 */
  apiKeyEnv: Volatile<string>
  /**
   * Max 模式（推理档位锁）：开启后所有 reasoning 模型强制发 `reasoning_effort:"max"`（服务端宽容
   * 接受未声明的 max）；选择器档位面板呈现锁定态，逐模型偏好保留不覆盖，关闭后原样恢复。
   */
  maxMode: Volatile<boolean>
}

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV).volatile(),
  maxMode: z.boolean().default(false).volatile(),
})

/**
 * 解析 Key 时依次尝试的凭据引用（纯函数，供单测）：配置的 apiKeyEnv 优先（默认对齐官方派生名），
 * 旧引用 `CODEBUDDY_API_KEY` 兜底（旧版存过的 Key 不用重配）；两者同名时去重。
 */
export function keyRefs(apiKeyEnv: string | undefined): readonly string[] {
  const primary = apiKeyEnv ?? API_KEY_ENV
  const refs = [primary, LEGACY_API_KEY_ENV]
  return refs.filter((ref, index) => refs.indexOf(ref) === index)
}
