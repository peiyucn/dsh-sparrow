/**
 * 输入框工具行左侧的开关胶囊（挂在 conversation.input.left）：点击切换开关，右侧 ▾ 弹出触发灵敏度三档。
 * 类名一律取自 styles.ts 的类名表；本文件不含任何 CSS。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDownOutlineRegular, IconSparkleRegular, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatFimSwitchProps } from './contracts.js'
import { anchorPointsEqual } from './geometry.js'
import {
  setSuggestEnabled, setTriggerSensitivity, useSuggestBusy, useSuggestEnabled, useSuggestError,
  useSuggestSupported, useTriggerSensitivity,
} from './store.js'
import { CHAT_FIM_CLASS } from './styles.js'
import type { TriggerSensitivity } from '../suggest.js'

/** 类名表别名：JSX 与事件里的选择器都走它，不手写字符串。 */
const cls = CHAT_FIM_CLASS

/** 灵敏度弹层预宽：左缘对齐后向窗内钳制时用的宽度上界。 */
const PICKER_MAX_WIDTH = 360

/** 高/中/低 → 自下而上点亮 3/2/1 个点（恒显 3 个占位点，档位只靠颜色区分）。 */
const DOT_LIT_COUNT: Record<TriggerSensitivity, number> = { eager: 3, standard: 2, conservative: 1 }

/** 灵敏度三档的展示顺序（弹层选项与三点顺序同源）。 */
const SENSITIVITY_LEVELS = ['eager', 'standard', 'conservative'] as const

/** 输入框工具行左侧的开关胶囊：点击切换开关，右侧 ▾ 弹出触发灵敏度三档。 */
export function ChatFimSwitch(props: ChatFimSwitchProps) {
  const { t } = props
  const enabled = useSuggestEnabled()
  const busy = useSuggestBusy()
  const error = useSuggestError()
  const supported = useSuggestSupported()
  const sensitivity = useTriggerSensitivity()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPoint, setPickerPoint] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const switchRef = useRef<HTMLButtonElement | null>(null)

  /** 档位显示名（locale）。 */
  const label = t(`sensitivity.${sensitivity}`)

  /** 依据开关胶囊矩形计算弹层锚点：左缘对齐开关（官方 Menu 的 start 对齐），贴右窗缘时向内钳制；空间不够向上弹出。 */
  const computePickerPoint = (): { x: number; y: number; up: boolean } | null => {
    const rect = switchRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    const estimate = 128 + 8
    const up = rect.bottom + estimate > window.innerHeight
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - 8 - PICKER_MAX_WIDTH))
    return { x, y: up ? rect.top - 4 : rect.bottom + 4, up }
  }

  const openPicker = (): void => {
    setPickerPoint(computePickerPoint())
    setPickerOpen(true)
  }

  // 弹层打开时：点外部关闭、Esc 关闭；滚动/缩放**跟随重定位**（官方下拉行为，
  // 不关闭——生成中的会话流式输出会带动聊天区滚动，关掉弹层就是这里的 bug）。
  useEffect(() => {
    if (!pickerOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest(`.${cls.sensitivityPopover}`) !== null) return
      if (switchRef.current !== null && switchRef.current.contains(event.target)) return
      setPickerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPickerOpen(false)
    }
    const reposition = (): void => {
      const next = computePickerPoint()
      if (next === null) setPickerOpen(false)
      // 滚动事件高频（逐帧）：锚点数值无变化时不写状态，避免逐事件重渲染。
      else setPickerPoint(prev => (anchorPointsEqual(prev, next) ? prev : next))
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [pickerOpen])

  if (!supported) return null
  return (
    <>
      <button
        ref={switchRef}
        type="button"
        className={enabled ? `${cls.switch} ${cls.switchOn}` : `${cls.switch} ${cls.switchOff}`}
        title={busy ? t('dock.busy') : error ?? (enabled ? t('sensitivity.hint', { label }) : t('switch.offHint'))}
        aria-pressed={enabled}
        aria-busy={busy}
        onClick={() => {
          // 标签点击恒切换开关；弹层开着时一并收起（官方 PermissionSelect 触发器再点即合）。
          if (pickerOpen) setPickerOpen(false)
          setSuggestEnabled(!enabled)
        }}
      >
        <span className={cls.switchIcon} aria-hidden><IconSparkleRegular size={14} /></span>
        <span className={cls.switchLabel}>{t('switch.label')}</span>
        <span
          className={cls.switchPicker}
          role="button"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-label={t('sensitivity.aria', { label })}
          title={t('sensitivity.aria', { label })}
          onClick={(event) => {
            // 灵敏度触发区（三点 + ▾）：只开合灵敏度菜单，不切换开关；再点收起（官方 PermissionSelect 同款 toggle）。
            event.stopPropagation()
            if (pickerOpen) setPickerOpen(false)
            else openPicker()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              if (pickerOpen) setPickerOpen(false)
              else openPicker()
            }
          }}
        >
          <span className={cls.dots} aria-hidden>
            {SENSITIVITY_LEVELS.map((level, index) => (
              <span
                key={level}
                className={DOT_LIT_COUNT[sensitivity] > 2 - index ? `${cls.dot} ${cls.dotOn}` : cls.dot}
              />
            ))}
          </span>
          <span
            className={pickerOpen ? `${cls.switchArrow} ${cls.switchArrowOpen}` : cls.switchArrow}
            aria-hidden
          >
            <IconChevronDownOutlineRegular size={12} />
          </span>
        </span>
      </button>
      {error !== null ? (
        <span className={cls.error} title={error}>⚠</span>
      ) : null}
      {pickerOpen && pickerPoint !== null
        ? createPortal(
          <MenuSurface
            className={cls.sensitivityPopover}
            role="listbox"
            aria-label={t('sensitivity.aria', { label: '' })}
            style={{
              left: pickerPoint.x,
              top: pickerPoint.y,
              transform: pickerPoint.up ? 'translateY(-100%)' : undefined,
            }}
            onMouseDown={(event) => {
              // 防止点按把焦点从输入框夺走（combobox 惯例）。
              event.preventDefault()
            }}
          >
            {SENSITIVITY_LEVELS.map(level => (
              <button
                key={level}
                type="button"
                role="option"
                aria-selected={level === sensitivity}
                className={cls.sensitivityOption}
                onClick={() => {
                  setTriggerSensitivity(level)
                  setPickerOpen(false)
                }}
              >
                <span className={cls.sensitivityOptionCheck} aria-hidden>{level === sensitivity ? '✓' : ''}</span>
                <span>{t(`sensitivity.${level}`)}</span>
                <span className={cls.sensitivityOptionRule}>{t(`sensitivity.${level}.rule`)}</span>
              </button>
            ))}
          </MenuSurface>,
          document.body,
        )
        : null}
    </>
  )
}
