/**
 * 模型行的只读事实（倍率 · 上下文）—— 官方 `conversation.input.model.label` 扩展槽的贡献者。
 *
 * ⚠️ 这个槽是 **single**（`ui-model-selection/src/client/slots.ts`）：只能有一个贡献者渲染整条标签，
 * 官方在该槽的 fallback 里渲染「名称 + 目录角标 `model.badge`」（触发按钮角标在名称前、菜单/选项在后）。
 * 我们接管后必须**逐字保留**这段官方 fallback：角标文字经插件注入的 `resolveText`（官方
 * `ctx.locale.resolveText`）解析，语言切换时重渲染；否则等于把官方角标弄丢。
 *
 * 事实串只对**本插件 provider** 生效（`PROVIDER_ID`），且只在菜单行 / 根菜单当前值里显示
 * （`placement === 'trigger'` 时不加，触发器保持干净）。
 *
 * 上游契约（`ModelLabelOwner`）：`{ provider: { id, name }, model: ModelCatalogModel, placement, selected }`，
 * 非交互、纯展示；不要在这里挂事件。
 */
import { useSyncExternalStore } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { PROVIDER_ID } from '../constants.js'
import { getModelFacts, subscribeModelFacts } from './model-facts.js'
import { formatModelFacts } from './format.js'
import { CCB_CLASS } from './styles.js'

/** 目录角标文字：字面量或按语言键的翻译表（`LocalizedText` 的只读子集）。 */
type BadgeText = string | { readonly en: string; readonly [locale: string]: string }

/** 发布时由 `client/index.ts` 注入的官方语言读面（slot 插件自带的 `t` 只覆盖本插件的词典）。 */
export interface ModelLabelInjected {
  /** 与官方 ModelSelect fallback 相同：`ctx.locale.resolveText`。 */
  readonly resolveText: (text: BadgeText) => string
  /** 语言切换订阅（官方 locale 服务的 subscribe）。 */
  readonly subscribeLocale: (listener: () => void) => () => void
  /** 语言快照 revision；语言切换时变化，用作 useSyncExternalStore 的快照。 */
  readonly localeRevision: () => number
}

/** 官方 label 扩展槽传给贡献者的 owner 字段（只声明用到的部分，其余忽略）。 */
export interface CodeBuddyModelLabelProps extends Partial<ModelLabelInjected> {
  readonly provider?: { readonly id: string; readonly name: string }
  readonly model?: {
    readonly id: string
    readonly name: string
    readonly badge?: { readonly text: BadgeText; readonly tone: 'neutral' | 'info' | 'success' | 'warning' }
  }
  readonly placement?: 'trigger' | 'menu' | 'option'
  readonly selected?: boolean
}

/** 角标文字解析兜底：注入缺失时按英文字面量渲染，不让整个菜单崩。 */
function fallbackText(text: BadgeText): string {
  return typeof text === 'string' ? text : text.en
}

/**
 * 渲染一条模型标签：名称 +（目录角标，按官方位置）+（本 provider 的只读事实）。
 *
 * 逐字段做防御：上游万一改契约（字段缺失 / 改名），退化为「只渲染名字」而不是把整个菜单弄崩。
 */
export function CodeBuddyModelLabel(props: CodeBuddyModelLabelProps): React.ReactNode {
  const subscribeLocale = props.subscribeLocale ?? (() => () => {})
  const localeRevision = props.localeRevision ?? (() => 0)
  // 订阅语言 revision：官方 resolveText 读服务当前语言，切换后需要重渲染。
  useSyncExternalStore(subscribeLocale, localeRevision)
  const factsByModel = useSyncExternalStore(subscribeModelFacts, getModelFacts)
  const providerId = props.provider?.id ?? ''
  const modelId = props.model?.id ?? ''
  const name = props.model?.name ?? ''
  if (name === '') return null
  const badge = props.model?.badge
  const badgeText = badge === undefined
    ? undefined
    : (props.resolveText ?? fallbackText)(badge.text)
  const tag = badge === undefined || badgeText === undefined
    ? null
    : <Tag tone={badge.tone}>{badgeText}</Tag>
  // 官方 fallback：触发按钮把角标放在名称前，菜单 / 选项放在名称后。
  const badgeBeforeName = props.placement === 'trigger'
  const facts = providerId === PROVIDER_ID && props.placement !== 'trigger'
    ? formatModelFacts(factsByModel.get(modelId))
    : undefined
  return (
    <span className={CCB_CLASS.modelLabel}>
      {badgeBeforeName && tag !== null ? <>{tag}{' '}</> : null}
      <span className={CCB_CLASS.modelLabelName}>{name}</span>
      {!badgeBeforeName && tag !== null ? <>{' '}{tag}</> : null}
      {facts === undefined ? null : <span className={CCB_CLASS.modelLabelFacts}>{facts}</span>}
    </span>
  )
}
