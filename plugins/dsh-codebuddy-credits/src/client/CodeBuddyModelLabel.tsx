
import { useSyncExternalStore } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { PROVIDER_ID } from '../constants.js'
import { LEGACY_1017_TEXT, showsLegacy1017Badge } from './legacy-1017-badge.js'
import { getModelFacts, subscribeModelFacts } from './model-facts.js'
import { formatModelFacts } from './format.js'
import { CCB_CLASS } from './styles.js'


type BadgeText = string | { readonly en: string; readonly [locale: string]: string }


export interface ModelLabelInjected {

  readonly resolveText: (text: BadgeText) => string

  readonly subscribeLocale: (listener: () => void) => () => void

  readonly localeRevision: () => number
}


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


function fallbackText(text: BadgeText): string {
  return typeof text === 'string' ? text : text.en
}


export function CodeBuddyModelLabel(props: CodeBuddyModelLabelProps): React.ReactNode {
  const subscribeLocale = props.subscribeLocale ?? (() => () => {})
  const localeRevision = props.localeRevision ?? (() => 0)

  useSyncExternalStore(subscribeLocale, localeRevision)
  const factsByModel = useSyncExternalStore(subscribeModelFacts, getModelFacts)
  const providerId = props.provider?.id ?? ''
  const modelId = props.model?.id ?? ''
  const name = props.model?.name ?? ''
  if (name === '') return null
  const badge = props.model?.badge



  const badgeText = badge !== undefined
    ? (props.resolveText ?? fallbackText)(badge.text)
    : (showsLegacy1017Badge(providerId, modelId, name) ? LEGACY_1017_TEXT : undefined)
  const badgeTone = badge === undefined ? 'info' as const : badge.tone
  const tag = badgeText === undefined
    ? null
    : <Tag tone={badgeTone}>{badgeText}</Tag>

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
