/**
 * CodeBuddy 模型选择器：vendored 自官方 ui-model-selection 的 ModelSelect（MIT License，© 2026 DeepSeek）。
 * 遮蔽官方 conversation.input.model 槽位；相对官方只多一列只读事实（积分系数 · 上下文长度，按模型 id 查
 * model-facts 共享表；模型名保持服务端原名，查不到只显示名字）；priority: -1 靠官方注册表「同 cell 最低者渲染」生效。
 * 另按官方同条件自绘 1017 版本标（官方该标走 conversation.input.model.label 子槽，本插件遮蔽后
 * 无法消费，只能镜像；见 model-label-1017.ts 的镜像说明）。
 */

import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type FocusEvent, type KeyboardEvent,
} from 'react'
import {
  // 图标名只标字形与字重（Regular = 1px 描边），渲染尺寸一律由显式 size prop 决定。
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular,
  IconWarningOutlineRegular, MenuGroup, observeStickyMenuGroups, Tag, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { getMaxMode, subscribeMaxMode } from './maxMode.js'
import { BusyDot } from './BusyDot.js'
import { formatModelFacts } from './format.js'
import { BADGE_1017_TEXT, shows1017Badge } from './model-label-1017.js'
import {
  PROVIDER_ID, ensureModelFacts, getModelFacts, subscribeModelFacts,
} from './model-facts.js'

/** 与官方 ModelDirectoryState 对齐的最小形状（runtime 由官方 web 提供）。 */
export interface DirectoryState {
  current: { provider: string; model: string; reasoningEffort?: string } | null
  routable: boolean | null
  groups: readonly {
    id: string
    name: string
    models: readonly {
      id: string
      name: string
      description?: string
      reasoning?: {
        efforts: readonly { id: string; name: string; description?: string }[]
        defaultEffort?: string
      }
    }[]
  }[]
  failures: readonly { id: string; name: string; message: string }[]
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  error: string | null
}

interface Selection {
  provider: string
  model: string
  reasoningEffort?: string
}

interface DirectoryStoreLike {
  getSnapshot(): DirectoryState
  subscribe(fn: () => void): () => void
}

export interface CodeBuddyModelSelectProps {
  /** 输入行被占用时锁定（同官方 ModelSelect）。 */
  locked: boolean
  /** subagent 寻址会话不可用（恒 false）。 */
  available: boolean
  /** 与官方 /model 弹层同源的模型目录 store。 */
  directory: DirectoryStoreLike
  load: () => void
  /** 返回是否被接受；未被接受时错误读 store。 */
  select: (selection: Selection) => Promise<boolean>
  t: (key: string, vars?: Record<string, string>) => string
}

/** 极简 clsx：不给 client bundle 引入运行时依赖。 */
function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ')
}

/**
 * 模型名（含官方 1017 版本标的自绘镜像，见 model-label-1017.ts 的镜像说明）。
 * 官方把标注入 `conversation.input.model.label` 子槽；本插件遮蔽整个选择器且无法声明该子槽，
 * 故在 trigger / 当前模型行 / 选项行三处按官方同条件自绘 `<Tag tone="info">1017</Tag>`。
 */
function ModelNameLabel({ providerId, modelId, modelName }: {
  providerId: string
  modelId: string
  modelName: string
}) {
  if (!shows1017Badge(providerId, modelId, modelName)) return <>{modelName}</>
  return (
    <span className="ccb-model-1017-label">
      <span className="ccb-model-1017-name">{modelName}</span>{' '}
      <Tag tone="info">{BADGE_1017_TEXT}</Tag>
    </span>
  )
}

/** 下拉当前层：root 为两行入口，其余为下钻列表。 */
type Pane = 'root' | 'model' | 'effort'

/** 一个档位行；effort 为 undefined 表示保留 provider 默认。 */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

/** picker 样式只注入一次（类名归本插件所有）。 */
let pickerStylesInstalled = false

export function ensurePickerStyles(): void {
  if (pickerStylesInstalled || typeof document === 'undefined') return
  pickerStylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-model-root { position: relative; min-width: 0; }',
    '.ccb-model-trigger { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 220px; max-width: min(360px, 45cqw); height: 28px; padding: 0 4px 0 8px; border: none; border-radius: 24px; outline: none; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; font-weight: 500; cursor: pointer; }',
    '.ccb-model-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccb-model-trigger:focus-visible { box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }',
    '.ccb-model-trigger:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }',
    '.ccb-model-triggerLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ccb-model-triggerEffort { flex: 0 0 auto; color: var(--dsw-alias-label-caption); }',
    '.ccb-model-chevron { flex: 0 0 auto; color: var(--dsw-alias-label-caption); transition: transform 120ms ease; }',
    '.ccb-model-chevronOpen { transform: rotate(180deg); }',
    // ⚠️ `--dsh-theme-tone-menu-inner-radius` = 本菜单同心内圆角（外圆角 20 − 内边距 4 = 16 = --dsw-radius-lg），供 theme-tone 的滚动容器圆角规则读取。
    '.ccb-model-menu { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 20; display: flex; flex-direction: column; width: max-content; min-width: min(280px, calc(100vw - 32px)); max-width: min(460px, calc(100vw - 32px)); max-height: min(360px, calc(100vh - 96px)); overflow: hidden; padding: 4px; border: 0; border-radius: 20px; background: var(--dsw-specific-menu); backdrop-filter: var(--dsw-menu-backdrop-filter); --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); --dsh-theme-tone-menu-inner-radius: var(--dsw-radius-lg, 16px); box-shadow: var(--dsw-elevation-prominent); color: var(--dsw-alias-label-primary); --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }',
    '.ccb-model-status, .ccb-model-empty { padding: 10px; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }',
    '.ccb-model-error, .ccb-model-warning { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; padding: 7px 8px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }',
    '.ccb-model-warning { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-state-warn-label); }',
    '.ccb-model-retry { flex: 0 0 auto; padding: 0; border: none; background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }',
    // ⚠️ 滚动容器圆角由 theme-tone 统一施加（它同时管官方菜单与本菜单），本插件不自己写——两条都带 !important，重复声明会互相打架。
    '.ccb-model-groups { min-height: 0; overflow-y: auto; overflow-x: hidden; }',
    // ⚠️ 分组标题与分组间距**交给官方 `MenuGroup` 原语**（渲染 `section[role=group]` + 1×1 观测哨兵 + `data-menu-group-heading`，
    // 标题在非吸顶态**透明**、吸顶（`data-stuck`）才上官方底色）—— 与官方 rc.3 ModelSelect 同一套观感。
    // 别再自己写标题底色：旧实现是「永远不透明 + 一层 --dsw-specific-menu 渐变」，在官方默认档下看着就像被改过的实心横条。
    '.ccb-model-option { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: auto; min-width: 100%; min-height: 38px; padding: 6px 8px; border: none; border-radius: 10px; outline: none; background: transparent; color: inherit; text-align: left; cursor: pointer; }',
    '.ccb-model-option:hover:not(:disabled), .ccb-model-option:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccb-model-option:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }',
    '.ccb-model-optionCopy { display: flex; flex: 1; flex-direction: column; min-width: 0; }',
    '.ccb-model-row { display: flex; align-items: baseline; gap: 10px; min-width: 0; }',
    '.ccb-model-name { flex: 1 1 auto; min-width: 0; overflow: hidden; color: inherit; font-size: 14px; line-height: 20px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }',
    // 官方 1017 版本标的镜像排版（上游 ui-deepseek-model-label-1017 的 .label）：名字与 Tag 同一行、4px 间距。
    '.ccb-model-1017-label { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; vertical-align: baseline; white-space: nowrap; }',
    '.ccb-model-1017-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
    '.ccb-model-facts { flex: 0 0 auto; color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }',
    '.ccb-model-check { display: grid; place-items: center; flex: 0 0 18px; color: var(--dsw-alias-label-primary); }',
    '.ccb-model-cell { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: auto; min-width: 100%; height: 40px; padding: 0 10px; border: none; border-radius: 10px; background: transparent; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; cursor: pointer; text-align: left; }',
    '.ccb-model-cell:hover { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccb-model-cellLabel { flex: 0 0 auto; white-space: nowrap; }',
    '.ccb-model-cellValue { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--dsw-alias-label-tertiary); }',
    '.ccb-model-cellChevron { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); }',
  ].join('\n')
  document.head.append(style)
}

export function CodeBuddyModelSelect(
  { locked, available, directory, load, select, t }:
  CodeBuddyModelSelectProps,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  /** 分组列表的滚动容器（官方 `observeStickyMenuGroups` 的 root：标题只在它里面吸顶）。 */
  const groupsRef = useRef<HTMLDivElement | null>(null)
  const id = useId()

  // Max 模式（推理档位锁）：只影响展示与请求（host 侧强制 max），
  // 用户逐模型档位偏好保留不覆盖，解锁后原样恢复。
  const maxMode = useSyncExternalStore(subscribeMaxMode, getMaxMode)

  // 模型只读事实表（按模型 id 查）；查不到事实的行只显示模型名。
  const modelFactTable = useSyncExternalStore(subscribeModelFacts, getModelFacts)

  const choices = useMemo(() => state.groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: { provider: group.id, model: model.id },
    })),
  ), [state.groups])
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  // 锁定态只对 codebuddy-credits 域内的 reasoning 模型生效——槽位遮蔽的是全 provider，
  // 其他 provider 的请求不走本插件适配器，呈现锁定态会与真实行为脱节。
  const lockedByMax = maxMode
    && state.current?.provider === 'codebuddy-credits'
    && reasoning !== undefined
  const effectiveEffort = lockedByMax ? 'max' : state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortChoices: EffortChoice[] = reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('picker.effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map(effort => ({
        key: 'effort:' + effort.id,
        effort: effort.id,
        label: effort.name,
      })),
    ]
  const busy = state.status === 'selecting'

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  /**
   * 分组标题吸顶观测（官方 `MenuGroup` 契约）：标题默认透明，**只有被滚到容器顶部时才上官方底色**。
   * ⚠️ 必须先有滚动容器再看：`observeStickyMenuGroups` 只认 `:scope > [data-menu-group]` 的直接结构；
   * 分组变化（加载完成 / 搜索过滤）后要重新观测，旧观测随 cleanup 断开。
   */
  useEffect(() => {
    const viewport = groupsRef.current
    if (viewport === null || !open || pane !== 'model') return
    return observeStickyMenuGroups(viewport)
  }, [open, pane, state.groups])

  if (!available) return null

  const show = (): void => {
    setPane('root')
    setOpen(true)
    reload()
    // 事实表尚空时补一次 /status（额度卡未挂载时才真正发请求，单飞）。
    ensureModelFacts()
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = (Math.max(active, 0) + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      if (pane !== 'root') setPane('root')
      else close(true)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    close()
  }

  const settleSelection = (accepted: boolean): void => {
    if (accepted) {
      if (rootRef.current !== null) close(true)
      return
    }
    const message = directory.getSnapshot().error
    if (message !== null) {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: t('picker.error.action', { message }) })
    }
  }

  const choose = (selection: Selection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    const selection: Selection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const waiting = state.current === null && state.status === 'loading'
  const modelLabel = waiting
    ? t('picker.trigger.loading')
    : currentChoice?.model.name
      ?? (state.current === null ? t('picker.trigger.fallback') : state.current.provider + '/' + state.current.model)
  const effortLabel = reasoning === undefined
    ? undefined
    : lockedByMax
      ? t('picker.effort.max')
      : effectiveEffort === undefined
        ? undefined
        : effortChoices.find(level => level.effort === effectiveEffort)?.label
          ?? reasoning.efforts.find(level => level.id === effectiveEffort)?.name
          ?? effectiveEffort
  const triggerLabel = effortLabel === undefined ? modelLabel : modelLabel + ' · ' + effortLabel
  const triggerAria = waiting
    ? t('picker.trigger.loading')
    : state.current === null
      ? t('picker.trigger.selectAria')
      : effortLabel === undefined
        ? t('picker.trigger.aria', { model: modelLabel })
        : t('picker.trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  itemRefs.current = []
  let itemIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div ref={rootRef} className="ccb-model-root" onKeyDown={onRootKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="ccb-model-trigger"
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id + '-menu' : undefined}
        title={triggerLabel}
        disabled={locked}
        onClick={() => {
          if (open) {
            close()
          } else {
            show()
          }
        }}
      >
        <span className="ccb-model-triggerLabel">
          {currentChoice === undefined
            ? modelLabel
            : (
              <ModelNameLabel
                providerId={currentChoice.group.id}
                modelId={currentChoice.model.id}
                modelName={currentChoice.model.name}
              />
            )}
        </span>
        {effortLabel !== undefined && <span className="ccb-model-triggerEffort">{effortLabel}</span>}
        <IconChevronDownOutlineRegular size={14} className={clsx('ccb-model-chevron', open && 'ccb-model-chevronOpen')} />
      </button>

      {open && (
        <div
          id={id + '-menu'}
          className="ccb-model-menu"
          role="menu"
          aria-label={t('picker.menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {pane === 'root' && (
            <>
              <button ref={itemRef()} type="button" role="menuitem" className="ccb-model-cell" onClick={() => { setPane('model') }}>
                <span className="ccb-model-cellLabel">{t('picker.menu.model')}</span>
                <span className="ccb-model-cellValue">
                  {currentChoice === undefined
                    ? modelLabel
                    : (
                      <ModelNameLabel
                        providerId={currentChoice.group.id}
                        modelId={currentChoice.model.id}
                        modelName={currentChoice.model.name}
                      />
                    )}
                </span>
                <IconChevronRightOutlineRegular size={14} className="ccb-model-cellChevron" />
              </button>
              {reasoning !== undefined && (
                <button ref={itemRef()} type="button" role="menuitem" className="ccb-model-cell" onClick={() => { setPane('effort') }}>
                  <span className="ccb-model-cellLabel">{t('picker.menu.effort')}</span>
                  <span className="ccb-model-cellValue">{effortLabel}</span>
                  <IconChevronRightOutlineRegular size={14} className="ccb-model-cellChevron" />
                </button>
              )}
            </>
          )}

          {pane === 'model' && (
            <>
              {state.status === 'loading' && (
                <div className="ccb-model-status"><BusyDot label={t('picker.status.loading')} /></div>
              )}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className="ccb-model-error">
                  <span>{t('picker.error.action', { message: state.error })}</span>
                  <button type="button" className="ccb-model-retry" onClick={reload}>{t('picker.action.reload')}</button>
                </div>
              )}
              {state.failures.map(failure => (
                <div className="ccb-model-warning" key={failure.id}>
                  <span>{t('picker.warning.groupLoad', { name: failure.name, message: failure.message })}</span>
                  <button type="button" className="ccb-model-retry" onClick={reload}>{t('picker.action.reload')}</button>
                </div>
              ))}
              <div className={clsx('ccb-model-groups', 'scrollable')} ref={groupsRef}>
                {state.groups.map((group) => {
                  return (
                    <MenuGroup key={group.id} label={group.name}>
                      {group.models.map((model) => {
                        const selected = state.current?.provider === group.id && state.current.model === model.id
                        // 只读事实只套用本 provider 的行：其他 provider 的条目即使 id 相同也不查表。
                        const facts = group.id === PROVIDER_ID
                          ? formatModelFacts(modelFactTable.get(model.id))
                          : undefined
                        return (
                          <button
                            ref={itemRef()}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            className={clsx('ccb-model-option', selected && 'ccb-model-selected')}
                            key={model.id}
                            title={model.name}
                            disabled={busy}
                            onClick={() => { choose({ provider: group.id, model: model.id }) }}
                          >
                            <span className="ccb-model-optionCopy">
                              <span className="ccb-model-row">
                                <span className="ccb-model-name">
                                  <ModelNameLabel providerId={group.id} modelId={model.id} modelName={model.name} />
                                </span>
                                {facts === undefined
                                  ? null
                                  : <span className="ccb-model-facts">{facts}</span>}
                              </span>
                            </span>
                            <span className="ccb-model-check">
                              {selected ? <IconCheckOutlineRegular size={16} /> : null}
                            </span>
                          </button>
                        )
                      })}
                    </MenuGroup>
                  )
                })}
              </div>
              {state.status === 'ready' && choices.length === 0 && (
                <div className="ccb-model-empty">{t('picker.empty.models')}</div>
              )}
            </>
          )}

          {pane === 'effort' && (
            <>
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className="ccb-model-error">
                  <span>{t('picker.error.action', { message: state.error })}</span>
                  <button type="button" className="ccb-model-retry" onClick={reload}>{t('picker.action.reload')}</button>
                </div>
              )}
              {lockedByMax
                ? (
                  <>
                    {/* Max 锁定态：其余档位置灰；解锁入口在额度卡。 */}
                    {[
                      { key: 'effort:max', label: t('picker.effort.max') },
                      ...effortChoices.filter(level => level.key !== 'effort:max'),
                    ].map(level => {
                      const isMax = level.key === 'effort:max'
                      return (
                        <button
                          ref={itemRef()}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isMax}
                          className={clsx('ccb-model-option', isMax && 'ccb-model-selected')}
                          key={level.key}
                          disabled
                          title={isMax ? undefined : t('picker.max.lockedHint')}
                        >
                          <span className="ccb-model-optionCopy">
                            <span className="ccb-model-name">{level.label}</span>
                          </span>
                          <span className="ccb-model-check">
                            {isMax ? <IconCheckOutlineRegular size={16} /> : null}
                          </span>
                        </button>
                      )
                    })}
                    <div className="ccb-model-empty">{t('picker.max.locked')}</div>
                  </>
                )
                : effortChoices.length === 0
                  ? <div className="ccb-model-empty">{t('picker.empty.efforts')}</div>
                  : effortChoices.map(level => (
                    <button
                      ref={itemRef()}
                      type="button"
                      role="menuitemradio"
                      aria-checked={effectiveEffort === level.effort}
                      className={clsx('ccb-model-option', effectiveEffort === level.effort && 'ccb-model-selected')}
                      key={level.key}
                      disabled={busy}
                      onClick={() => { chooseEffort(level.effort) }}
                    >
                      <span className="ccb-model-optionCopy">
                        <span className="ccb-model-name">{level.label}</span>
                      </span>
                      <span className="ccb-model-check">
                        {effectiveEffort === level.effort ? <IconCheckOutlineRegular size={16} /> : null}
                      </span>
                    </button>
                  ))}
            </>
          )}
        </div>
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular size={16} />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
