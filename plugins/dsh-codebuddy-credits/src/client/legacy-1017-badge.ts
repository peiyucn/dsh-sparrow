/**
 * 旧版「1017」目录角标的兼容镜像（display-only）。
 *
 * dsh 0.2.1 由官方客户端包 `@deepseek-ai/dsh-client-ui-deepseek-model-label-1017` 硬编码渲染：
 * `provider.id ∈ { deepseek-official, deepseek-account } && model.id === 'deepseek-flash' &&
 * model.name === 'DeepSeek-V4.1-Flash'` 时在模型名旁显示蓝色 `1017` 角标。
 *
 * dsh 0.2.2 删除了该包，改为只认服务端模型列表在 `client_metadata["deepseek-harness"].badge`
 * 下发的目录角标（见 `@deepseek-ai/dsh-llm-deepseek-api-key` README）。实测当前 DeepSeek
 * 官方列表对 `deepseek-flash` / `deepseek-v4-pro` 都不带 `client_metadata` ⇒ 0.2.2 原版不再显示
 * 「1017」。本插件在 0.2.1 时代为了接管 single label 槽曾镜像过该标；0.2.2 适配时一并删掉后，
 * 用户会感知到「1017 没了」。
 *
 * 这里保留一个**仅在目录角标缺失时**生效的兼容回退：显示与旧版一致的 `1017`（info 蓝色）。
 * 一旦服务端下发 `model.badge`（例如未来官方把 1017 放进 listing），组件优先用目录角标，
 * 本文件不参与，避免双标。模型改名/换 id 时自然回退为不显示（良性失效）。
 */

/** 旧版固定 1017 标文案（官方两份 locale 都是字面量 '1017'，无需本地化）。 */
export const LEGACY_1017_TEXT = '1017'

/** 旧版只对这两条官方 provider 路由显示。 */
const BADGE_PROVIDER_IDS: readonly string[] = ['deepseek-official', 'deepseek-account']

/** 旧版条件：模型 id 必须是 deepseek-flash。 */
const BADGE_MODEL_ID = 'deepseek-flash'

/** 旧版条件：目录名必须恰好是这个固定版本名。 */
const BADGE_MODEL_NAME = 'DeepSeek-V4.1-Flash'

/**
 * 目录角标缺失时是否回退显示旧版 1017 标（纯函数，供组件与单测）。
 * @param providerId - 模型目录中的 provider id。
 * @param modelId - 模型目录中的模型 id。
 * @param modelName - 模型目录中的展示名（服务端原始名）。
 * @returns 三个条件同时命中时为 true。
 */
export function showsLegacy1017Badge(providerId: string, modelId: string, modelName: string): boolean {
  return BADGE_PROVIDER_IDS.includes(providerId)
    && modelId === BADGE_MODEL_ID
    && modelName === BADGE_MODEL_NAME
}
