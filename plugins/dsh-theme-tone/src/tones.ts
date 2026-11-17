

import {
  BOTTOM_VARIABLE,
  LEFT_VARIABLE,
  PANEL_VARIABLE,
  TOP_STOP_VARIABLE,
  TOP_VARIABLE,
} from './constants.js'


export const TOP_STOP = '62%'

export type ColorScheme = 'light' | 'dark'


export const LIGHT_TONE_IDS = ['official', 'blue', 'sakura', 'green'] as const


export const DARK_TONE_IDS = ['official', 'violet', 'crimson', 'forest'] as const

export type LightToneId = typeof LIGHT_TONE_IDS[number]

export type DarkToneId = typeof DARK_TONE_IDS[number]

export type ToneId = LightToneId | DarkToneId


export interface ToneSpec {

  available: boolean

  base: string

  sidebarFill: string

  tint: string

  top: string

  bottom: string

  left: string


}


export const DEPTH_ALPHA: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.30, dark: 0.18 })


export const PANEL_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0, dark: 0.14 })


export const SURFACE_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.14, dark: 0.14 })

export type SurfaceRung = 'layer1' | 'layer2' | 'layer3' | 'tip'


export const OFFICIAL_RUNGS: Readonly<Record<ColorScheme, Readonly<Record<SurfaceRung, string>>>> = Object.freeze({
  light: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-60',
  }),
  dark: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-850',
    layer3: '--dsw-static-neutral-bluish-800',
    tip: '--dsw-static-neutral-bluish-800',
  }),
})


export const SURFACE_RUNGS: Readonly<Record<ColorScheme, Readonly<Record<SurfaceRung, string>>>> = Object.freeze({
  light: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-00',
  }),
  dark: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-875',
    layer3: '--dsw-static-neutral-bluish-875',
    tip: '--dsw-static-neutral-bluish-875',
  }),
})


export const SURFACE_TOKENS: readonly Readonly<{ token: string; rung: SurfaceRung }>[] = Object.freeze([
  Object.freeze({ token: '--dsw-alias-bg-layer-1', rung: 'layer1' as const }),
  Object.freeze({ token: '--dsw-alias-bg-layer-2', rung: 'layer2' as const }),
  Object.freeze({ token: '--dsw-alias-bg-layer-3', rung: 'layer3' as const }),
  Object.freeze({ token: '--dsw-specific-input-major', rung: 'layer2' as const }),
])


export const POPUP_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-menu-surface-fill',
    official: Object.freeze({ light: 'rgba(248, 249, 250, 0.58)', dark: 'rgba(67, 69, 74, 0.45)' }),
  }),
  Object.freeze({
    token: '--dsw-specific-menu',
    official: Object.freeze({ light: 'rgba(248, 249, 250, 0.58)', dark: 'rgba(67, 69, 74, 0.45)' }),
  }),
])


export const INSET_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.12, dark: 0.14 })


export const INSET_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-markdown-code-block',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-900' }),
  }),
  Object.freeze({
    token: '--dsw-alias-markdown-code-block-banner',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-850' }),
  }),
  Object.freeze({
    token: '--dsw-specific-tip',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' }),
  }),
])


function depthGlow(tint: string, scheme: ColorScheme): string {
  return tint === '' ? '' : `rgba(${tint}, ${DEPTH_ALPHA[scheme]})`
}


export const DARK_GOLD_TINT = '232, 162, 74'


export const DARK_GOLD_ALPHA: Readonly<Record<'top' | 'left', number>> = Object.freeze({
  top: 0.14,
  left: 0.17,
})


export const LIGHT_GLOW_ALPHA: Readonly<Record<'top' | 'left', number>> = Object.freeze({
  top: 0.16,
  left: 0.19,
})


function toneGlow(tint: string, alpha: number): string {
  return tint === '' ? '' : `rgba(${tint}, ${alpha})`
}


function surfaceFill(tint: string, scheme: ColorScheme, rung: SurfaceRung): string {
  if (tint === '') return `var(${OFFICIAL_RUNGS[scheme][rung]})`
  return rungFill(tint, SURFACE_RUNGS[scheme][rung], PANEL_TINT[scheme])
}


function rungFill(tint: string, rung: string, scale: number): string {
  const reference = `var(${rung})`
  if (tint === '' || scale === 0) return reference
  return `color-mix(in srgb, rgb(${tint}) ${Math.round(scale * 100)}%, ${reference})`
}


export function panelFill(tone: ToneSpec, scheme: ColorScheme, rung: SurfaceRung): string {
  return surfaceFill(tone.tint, scheme, rung)
}


export const WASH_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.25, dark: 0.25 })


export const WASH_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-interactive-bg-hover',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-interactive-bg-active',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.1)', dark: 'rgba(255, 255, 255, 0.14)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-interactive-bg-hover-accent',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.14)', dark: 'rgba(255, 255, 255, 0.24)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-bg-skeleton',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.08)' }),
  }),
])


export const BORDER_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-border-l1',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.06)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l2-darkmode-thin',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.06)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l2',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.12)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l3',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.16)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l4',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.16)', dark: 'rgba(255, 255, 255, 0.2)' }),
  }),
])


export const SCROLLBAR_TOKENS: readonly Readonly<{
  token: string
  light: string
  dark: string
}>[] = Object.freeze([
  Object.freeze({ token: '--dsw-alias-scrollbar-bg-l1', light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-700' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-bg-l2', light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-600' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-hover-l1', light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-600' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-hover-l2', light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-550' }),
])


export const STATE_TOKENS: readonly Readonly<{
  token: string
  light: string
  dark: string
}>[] = Object.freeze([
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-active', light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-active-accent', light: '--dsw-static-deepseek-100', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-bg-module-platform', light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-button-elevated-fill', light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-alias-button-floating-fill', light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-850' }),
  Object.freeze({ token: '--dsw-alias-button-floating-hover', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-button-ghost-active-fill', light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-alias-button-ghost-active-hover', light: '--dsw-static-neutral-bluish-150', dark: '--dsw-static-neutral-bluish-700' }),
])


export function washFill(tint: string, scheme: ColorScheme, official: string, scale = WASH_TINT[scheme]): string {
  if (tint === '' || scale === 0) return official
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/u.exec(official)
  if (match === null) return official
  const hue = tint.split(',').map(part => Number.parseInt(part.trim(), 10))
  const mixed = [0, 1, 2].map(i => Math.round(hue[i] * scale + Number(match[i + 1]) * (1 - scale)))
  return `rgba(${mixed[0]}, ${mixed[1]}, ${mixed[2]}, ${match[4]})`
}


export interface ThemeToneSettings {
  lightTone: LightToneId
  darkTone: DarkToneId
}


export const DEFAULT_SETTINGS: ThemeToneSettings = Object.freeze({
  lightTone: 'official',
  darkTone: 'violet',
})


export const LIGHT_TONES: Readonly<Record<LightToneId, ToneSpec>> = Object.freeze({
  official: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '',
    top: '',
    bottom: '',
    left: '',

  }),
  sakura: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',

    tint: '248, 198, 214',
    top: toneGlow('248, 198, 214', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('248, 198, 214', 'light'),
    left: toneGlow('248, 198, 214', LIGHT_GLOW_ALPHA.left),

  }),
  blue: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '145, 215, 235',
    top: toneGlow('145, 215, 235', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('145, 215, 235', 'light'),
    left: toneGlow('145, 215, 235', LIGHT_GLOW_ALPHA.left),

  }),
  green: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '176, 226, 186',
    top: toneGlow('176, 226, 186', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('176, 226, 186', 'light'),
    left: toneGlow('176, 226, 186', LIGHT_GLOW_ALPHA.left),

  }),
})


export const DARK_TONES: Readonly<Record<DarkToneId, ToneSpec>> = Object.freeze({
  official: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-950)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-900)',
    tint: '',
    top: '',
    bottom: '',
    left: '',

  }),
  violet: Object.freeze({
    available: true,
    base: '#0a0a10',
    sidebarFill: '#14141c',
    tint: '96, 78, 168',
    top: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.top),
    bottom: depthGlow('96, 78, 168', 'dark'),
    left: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.left),

  }),
  crimson: Object.freeze({
    available: true,
    base: '#0f0a0b',
    sidebarFill: '#191415',
    tint: '144, 58, 86',
    top: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.top),
    bottom: depthGlow('144, 58, 86', 'dark'),
    left: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.left),

  }),
  forest: Object.freeze({
    available: true,
    base: '#0a0f0b',
    sidebarFill: '#141915',
    tint: '55, 118, 92',
    top: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.top),
    bottom: depthGlow('55, 118, 92', 'dark'),
    left: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.left),

  }),
})


export const LIGHT_TOKENS: readonly Readonly<{
  token: string
  pick: (tone: ToneSpec, scheme: ColorScheme) => string
}>[] = Object.freeze([
  Object.freeze({
    token: TOP_VARIABLE,
    pick: (tone: ToneSpec) => tone.top === '' ? 'transparent' : tone.top,
  }),
  Object.freeze({
    token: BOTTOM_VARIABLE,
    pick: (tone: ToneSpec) => tone.bottom === '' ? 'transparent' : tone.bottom,
  }),

  Object.freeze({
    token: LEFT_VARIABLE,
    pick: (tone: ToneSpec) => tone.left === '' ? 'transparent' : tone.left,
  }),
])


const TONES_BY_SCHEME: Readonly<Record<ColorScheme, Readonly<Record<string, ToneSpec>>>> = Object.freeze({
  light: LIGHT_TONES,
  dark: DARK_TONES,
})


export function normalizeScheme(scheme: unknown): ColorScheme {
  return scheme === 'dark' ? 'dark' : 'light'
}


export function toneIdsFor(scheme: ColorScheme): readonly ToneId[] {
  return scheme === 'dark' ? DARK_TONE_IDS : LIGHT_TONE_IDS
}


export function availableToneIds(scheme: ColorScheme): ToneId[] {
  const tones = TONES_BY_SCHEME[normalizeScheme(scheme)]
  return toneIdsFor(normalizeScheme(scheme)).filter(id => tones[id]?.available === true)
}


export function toneFor(scheme: ColorScheme, id: ToneId): ToneSpec {
  const axis = normalizeScheme(scheme)
  const tones = TONES_BY_SCHEME[axis]
  const direct = tones[id]
  if (direct !== undefined && direct.available) return direct
  const fallbackId = axis === 'dark' ? DEFAULT_SETTINGS.darkTone : DEFAULT_SETTINGS.lightTone
  return tones[fallbackId] ?? LIGHT_TONES.official
}


export function toneIdOf(settings: ThemeToneSettings, scheme: ColorScheme): ToneId {
  const axis = normalizeScheme(scheme)
  const candidate = axis === 'dark' ? settings?.darkTone : settings?.lightTone
  const spec = candidate === undefined ? undefined : TONES_BY_SCHEME[axis][candidate]
  if (spec !== undefined && spec.available) return candidate as ToneId
  return axis === 'dark' ? DEFAULT_SETTINGS.darkTone : DEFAULT_SETTINGS.lightTone
}


export function toneFieldFor(scheme: ColorScheme): 'lightTone' | 'darkTone' {
  return scheme === 'dark' ? 'darkTone' : 'lightTone'
}


export interface TokenModes {
  light: string
  dark: string
}


export type TokenOverrides = Record<string, TokenModes>


export function tokenOverrides(settings: ThemeToneSettings): TokenOverrides {
  const light = toneFor('light', toneIdOf(settings, 'light'))
  const dark = toneFor('dark', toneIdOf(settings, 'dark'))
  const overrides: TokenOverrides = {
    '--dsw-alias-bg-base': { light: light.base, dark: dark.base },
    '--dsw-specific-sidebar-fill': { light: light.sidebarFill, dark: dark.sidebarFill },
  }
  for (const { token, rung } of SURFACE_TOKENS) {
    overrides[token] = {
      light: surfaceFill(light.tint, 'light', rung),
      dark: surfaceFill(dark.tint, 'dark', rung),
    }
  }
  for (const { token, official } of POPUP_TOKENS) {
    overrides[token] = {
      light: washFill(light.tint, 'light', official.light, PANEL_TINT.light),
      dark: washFill(dark.tint, 'dark', official.dark, PANEL_TINT.dark),
    }
  }
  for (const { token, official } of INSET_TOKENS) {
    overrides[token] = {
      light: rungFill(light.tint, official.light, INSET_TINT.light),
      dark: rungFill(dark.tint, official.dark, INSET_TINT.dark),
    }
  }
  overrides[PANEL_VARIABLE] = {
    light: panelFill(light, 'light', 'layer3'),
    dark: panelFill(dark, 'dark', 'layer3'),
  }
  for (const { token, pick } of LIGHT_TOKENS) {
    overrides[token] = { light: pick(light, 'light'), dark: pick(dark, 'dark') }
  }
  overrides[TOP_STOP_VARIABLE] = { light: TOP_STOP, dark: TOP_STOP }
  for (const entry of STATE_TOKENS) {
    overrides[entry.token] = {
      light: rungFill(light.tint, entry.light, SURFACE_TINT.light),
      dark: rungFill(dark.tint, entry.dark, SURFACE_TINT.dark),
    }
  }

  overrides['--dsw-alias-interactive-bg-hover-solid'] = {
    light: rungFill(light.tint, '--dsw-static-neutral-bluish-75', WASH_TINT.light),
    dark: rungFill(dark.tint, '--dsw-static-neutral-bluish-800', WASH_TINT.dark),
  }
  for (const { token, official } of [...WASH_TOKENS, ...BORDER_TOKENS]) {
    overrides[token] = {
      light: washFill(light.tint, 'light', official.light),
      dark: washFill(dark.tint, 'dark', official.dark),
    }
  }
  for (const { token, light: lightRung, dark: darkRung } of SCROLLBAR_TOKENS) {
    overrides[token] = {
      light: rungFill(light.tint, lightRung, SURFACE_TINT.light),
      dark: rungFill(dark.tint, darkRung, SURFACE_TINT.dark),
    }
  }



  overrides['--dsw-alias-hovercard-bg'] = {
    light: 'var(--dsw-alias-bg-layer-3)',
    dark: 'var(--dsw-alias-bg-layer-3)',
  }
  overrides['--dsw-alias-hovercard-label-primary'] = {
    light: 'var(--dsw-alias-label-primary)',
    dark: 'var(--dsw-alias-label-primary)',
  }
  overrides['--dsw-alias-hovercard-label-secondary'] = {
    light: 'var(--dsw-alias-label-secondary)',
    dark: 'var(--dsw-alias-label-secondary)',
  }
  overrides['--dsw-alias-hovercard-label-tertiary'] = {
    light: 'var(--dsw-alias-label-tertiary)',
    dark: 'var(--dsw-alias-label-tertiary)',
  }
  return overrides
}
