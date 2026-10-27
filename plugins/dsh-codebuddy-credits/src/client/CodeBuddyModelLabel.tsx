/**
 * 模型行的只读事实（倍率 · 上下文）—— 官方 `conversation.input.model.label` 扩展槽的贡献者。
 *
 * ⚠️ 这个槽是 **single**（`ui-model-selection/src/client/slots.ts`）：只能有一个贡献者渲染整条标签，
 * 官方自己那个「1017 临时版本标」插件（`ui-deepseek-model-label-1017`）就是它的贡献者。我们挂上去
 * 就必须**同时保留官方的 1017 标**（按官方同条件镜像，见 `model-label-1017.ts`），并对其余 provider
 * 渲染与官方一致的「名字（+ 标）」—— 否则等于把官方功能弄丢。
 *
 * 事实串只对**本插件 provider** 生效（`PROVIDER_ID`），且只在菜单行 / 根菜单当前值里显示
 * （`placement === 'trigger'` 时不加，触发器保持干净）。
 *
 * 上游契约（`ModelLabelOwner`）：`{ provider: { id, name }, model: { id, name }, placement, selected }`，
 * 非交互、纯展示；不要在这里挂事件。
 */
import { useSyncExternalStore } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { PROVIDER_ID } from '../constants.js'
import { BADGE_1017_TEXT, shows1017Badge } from './model-label-1017.js'
import { getModelFacts, subscribeModelFacts } from './model-facts.js'
import { formatModelFacts } from './format.js'
import { CCB_CLASS } from './styles.js'

/** 官方 label 扩展槽传给贡献者的 owner 字段（只声明用到的部分，其余忽略）。 */
export interface CodeBuddyModelLabelProps {
  readonly provider?: { readonly id: string; readonly name: string }
  readonly model?: { readonly id: string; readonly name: string }
  readonly placement?: 'trigger' | 'menu' | 'option'
  readonly selected?: boolean
}

/**
 * 渲染一条模型标签：名字 +（官方 1017 标，按官方条件镜像）+（本 provider 的只读事实）。
 *
 * 逐字段做防御：上游万一改契约（字段缺失 / 改名），退化为「只渲染名字」而不是把整个菜单弄崩。
 */
export function CodeBuddyModelLabel(props: CodeBuddyModelLabelProps): React.ReactNode {
  const factsByModel = useSyncExternalStore(subscribeModelFacts, getModelFacts)
  const providerId = props.provider?.id ?? ''
  const modelId = props.model?.id ?? ''
  const name = props.model?.name ?? ''
  if (name === '') return null
  const facts = providerId === PROVIDER_ID && props.placement !== 'trigger'
    ? formatModelFacts(factsByModel.get(modelId))
    : undefined
  return (
    <span className={CCB_CLASS.modelLabel}>
      <span className={CCB_CLASS.modelLabelName}>{name}</span>
      {shows1017Badge(providerId, modelId, name)
        ? <Tag tone="info">{BADGE_1017_TEXT}</Tag>
        : null}
      {facts === undefined ? null : <span className={CCB_CLASS.modelLabelFacts}>{facts}</span>}
    </span>
  )
}
