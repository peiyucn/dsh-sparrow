/**
 * CodeBuddy 模型选择器：遮蔽官方 conversation.input.model 单槽位的 vendored
 * 实现（源码自官方 ui-model-selection 的 ModelSelect.tsx / ModelSelect.module.css，
 * MIT License，© 2026 DeepSeek；本仓库仅做插件化适配）。
 *
 * 与官方的差异只有一处：模型行把展示名拆成「模型名 | 积分系数」两列，
 * 系数右对齐（官方选择器只渲染 model.name，没有描述列）。其余行为——
 * 两层面板（模型/推理等级）、键盘导航、外点关闭、Toast 锚定、目录共享
 * （同一个 ctx.modelDirectories store）——与官方一致。
 * 槽位遮蔽靠官方注册表语义：同 cell 不同 priority 共存、最低者渲染，
 * 本插件以 priority: -1 注册（默认 0 即官方条目）。
 */

import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type FocusEvent, type KeyboardEvent,
} from 'react'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14,
  IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 展示名拆分：与 host 侧 catalog.splitDisplayName 同规则（两空格是系数
 * 列的锚点）。client 包不能 import host 侧 catalog（会拖进 dsh-llm），
 * 此处局部镜像并保持同步。
 */
function splitDisplayName(name: string): { left: string; right?: string } {
  const index = name.lastIndexOf('  ')
  if (index < 0) return { left: name }
  return { left: name.slice(0, index), right: name.slice(index + 2) }
}

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
  /** Owner 共享：输入行被占用时锁定（与官方 ModelSelect 一致）。 */
  locked: boolean
  /** 本会话是否支持模型选择（subagent 寻址会话不可用）。 */
  available: boolean
  /** 会话共享模型目录 store（与官方 /model 弹层同源）。 */
  directory: DirectoryStoreLike
  /** 确保共享目录已加载（错误落在 store 上）。 */
  load: () => void
  /** 提交完整 provider/model/reasoning 选择。 */
  select: (selection: Selection) => Promise<boolean>
  t: (key: string, vars?: Record<string, string>) => string
}

/** 极简 clsx（避免给 client bundle 引入运行时依赖）。 */
function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ')
}

/** Which pane the dropdown shows: the two-row root or one drilled-in list. */
type Pane = 'root' | 'model' | 'effort'

/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

/** Ensure the picker styles are injected exactly once (classes are plugin-owned). */
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
    '.ccb-model-menu { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 20; display: flex; flex-direction: column; width: max-content; min-width: min(280px, calc(100vw - 32px)); max-width: min(460px, calc(100vw - 32px)); max-height: min(360px, calc(100vh - 96px)); overflow: hidden; padding: 4px; border: 0; border-radius: 20px; background: var(--dsw-specific-menu); --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent); color: var(--dsw-alias-label-primary); --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }',
    '.ccb-model-status, .ccb-model-empty { padding: 10px; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }',
    '.ccb-model-error, .ccb-model-warning { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; padding: 7px 8px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }',
    '.ccb-model-warning { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-state-warn-label); }',
    '.ccb-model-retry { flex: 0 0 auto; padding: 0; border: none; background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }',
    '.ccb-model-groups { min-height: 0; overflow-y: auto; }',
    '.ccb-model-group + .ccb-model-group { margin-top: 4px; }',
    '.ccb-model-groupTitle { position: sticky; top: 0; z-index: 1; padding: 5px 8px 3px; background: var(--dsw-specific-menu); color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; font-weight: 500; }',
    '.ccb-model-option { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: auto; min-width: 100%; min-height: 38px; padding: 6px 8px; border: none; border-radius: 10px; outline: none; background: transparent; color: inherit; text-align: left; cursor: pointer; }',
    '.ccb-model-option:hover:not(:disabled), .ccb-model-option:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccb-model-option:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }',
    '.ccb-model-optionCopy { display: flex; flex: 1; flex-direction: column; min-width: 0; }',
    '.ccb-model-row { display: flex; align-items: baseline; gap: 10px; min-width: 0; }',
    '.ccb-model-name { flex: 1 1 auto; min-width: 0; overflow: hidden; color: inherit; font-size: 14px; line-height: 20px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }',
    '.ccb-model-coef { flex: 0 0 auto; color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }',
    '.ccb-model-check { display: grid; place-items: center; flex: 0 0 18px; color: var(--dsw-alias-label-primary); }',
    '.ccb-model-cell { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: auto; min-width: 100%; height: 40px; padding: 0 10px; border: none; border-radius: 10px; background: transparent; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; cursor: pointer; text-align: left; }',
    '.ccb-model-cell:hover { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccb-model-cellLabel { flex: 0 0 auto; white-space: nowrap; }',
    '.ccb-model-cellValue { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--dsw-alias-label-tertiary); }',
    '.ccb-model-cellChevron { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); }',
  ].join('\n')
  document.head.append(style)
}

/**
 * Render the composer model seat (adapted official ModelSelect).
 * @param props - owner share + injected directory face + locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
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
  const id = useId()

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
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
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

  if (!available) return null

  const show = (): void => {
    setPane('root')
    setOpen(true)
    reload()
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
        <span className="ccb-model-triggerLabel">{modelLabel}</span>
        {effortLabel !== undefined && <span className="ccb-model-triggerEffort">{effortLabel}</span>}
        <IconChevronDownOutline14 className={clsx('ccb-model-chevron', open && 'ccb-model-chevronOpen')} />
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
                <span className="ccb-model-cellValue">{modelLabel}</span>
                <IconChevronRightOutline14 className="ccb-model-cellChevron" />
              </button>
              {reasoning !== undefined && (
                <button ref={itemRef()} type="button" role="menuitem" className="ccb-model-cell" onClick={() => { setPane('effort') }}>
                  <span className="ccb-model-cellLabel">{t('picker.menu.effort')}</span>
                  <span className="ccb-model-cellValue">{effortLabel}</span>
                  <IconChevronRightOutline14 className="ccb-model-cellChevron" />
                </button>
              )}
            </>
          )}

          {pane === 'model' && (
            <>
              {state.status === 'loading' && (
                <div className="ccb-model-status">{t('picker.status.loading')}</div>
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
              <div className={clsx('ccb-model-groups', 'scrollable')}>
                {state.groups.map((group) => {
                  const headingId = id + '-' + group.id
                  return (
                    <section role="group" aria-labelledby={headingId} className="ccb-model-group" key={group.id}>
                      <div className="ccb-model-groupTitle" id={headingId}>{group.name}</div>
                      {group.models.map((model) => {
                        const selected = state.current?.provider === group.id && state.current.model === model.id
                        const split = splitDisplayName(model.name)
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
                                <span className="ccb-model-name">{split.left}</span>
                                {split.right !== undefined
                                  ? <span className="ccb-model-coef">{split.right}</span>
                                  : null}
                              </span>
                            </span>
                            <span className="ccb-model-check">
                              {selected ? <IconCheckOutline16 /> : null}
                            </span>
                          </button>
                        )
                      })}
                    </section>
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
              {effortChoices.length === 0
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
                      {effectiveEffort === level.effort ? <IconCheckOutline16 /> : null}
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
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
