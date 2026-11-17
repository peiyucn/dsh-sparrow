

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


const cls = CHAT_FIM_CLASS


const PICKER_MAX_WIDTH = 360


const DOT_LIT_COUNT: Record<TriggerSensitivity, number> = { eager: 3, standard: 2, conservative: 1 }


const SENSITIVITY_LEVELS = ['eager', 'standard', 'conservative'] as const


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


  const label = t(`sensitivity.${sensitivity}`)


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
