/**
 * 官方 1017 版本标的镜像（临时展示）。
 *
 * 上游 0.2.1-rc.2 的 `@deepseek-ai/dsh-client-ui-deepseek-model-label-1017` 通过
 * `conversation.input.model.label` 子槽向官方模型选择器注入该标。本插件以 priority -1 遮蔽了
 * 整个官方 ModelSelect，又因 ui-slots 的「一个子槽只有一个声明者」规则无法在同一父槽上声明
 * 该子槽（见 `client/index.ts` 与 `slot-contract.d.ts` 的注释），只能按官方同条件自绘等价标签。
 *
 * ⚠️ mirror of upstream 0.2.1 temporary 1017 badge; re-check on every dsh bump
 * （上游该包 README 明确：`1017` 是固定的客户端展示，结构化版本标签替代它时官方会删掉该包。）
 *
 * 判定条件逐字对齐上游 `DeepSeekModelLabel.tsx:17-18`，不要泛化：
 *   provider.id ∈ { deepseek-official, deepseek-account }
 *   && model.id === 'deepseek-flash'
 *   && model.name === 'DeepSeek-V4.1-Flash'
 */

/** 上游固定的 1017 标文案（官方两份 locale 都是字面量 '1017'，无需本地化）。 */
export const BADGE_1017_TEXT = '1017'

/** 上游 `DeepSeekModelLabel.tsx:17`：只有这两条官方 provider 路由带标。 */
const BADGE_PROVIDER_IDS: readonly string[] = ['deepseek-official', 'deepseek-account']

/** 上游 `DeepSeekModelLabel.tsx:18`：模型 id 必须是 deepseek-flash。 */
const BADGE_MODEL_ID = 'deepseek-flash'

/** 上游 `DeepSeekModelLabel.tsx:7,18`：目录名必须恰好是这个固定版本名。 */
const BADGE_MODEL_NAME = 'DeepSeek-V4.1-Flash'

/**
 * 是否显示官方 1017 版本标（纯函数，供选择器与单测；条件逐字镜像上游）。
 * @param providerId - 模型目录中的 provider id。
 * @param modelId - 模型目录中的模型 id。
 * @param modelName - 模型目录中的展示名（服务端原始名）。
 * @returns 三个条件同时命中时为 true。
 */
export function shows1017Badge(providerId: string, modelId: string, modelName: string): boolean {
  return BADGE_PROVIDER_IDS.includes(providerId)
    && modelId === BADGE_MODEL_ID
    && modelName === BADGE_MODEL_NAME
}
