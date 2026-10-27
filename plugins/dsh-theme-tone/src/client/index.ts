import { buildBackdropCss, backdropPlan, LAYER_SELECTOR, REQUIRED_CSS_FEATURES, STYLE_SELECTOR } from '../backdrop.js'
import { buildGlassCss } from '../glass.js'
import { buildNavPinCss } from '../nav-pin.js'
import { buildSurfaceCss } from '../surfaces.js'
import {
  BACKDROP_CLASS,
  EMBED_ATTR,
  LOCALE_NAMESPACE,
  MARKER_ATTR,
  name,
  PACKAGE_NAME,
  PLAIN_ATTR,
  ROW_ID,
  ROW_ORDER,
  ROW_SLOT,
  SETTINGS_NAMESPACE,
  TOP_VARIABLE,
  BOTTOM_VARIABLE,
  LEFT_VARIABLE,
} from '../constants.js'
import { cssSupports, hasCapability, warnMissingCapabilities, warnUser } from '../compat.js'
import {
  DEFAULT_SETTINGS,
  tokenOverrides,
  toneIdOf,
  toneFieldFor,
  type ColorScheme,
  type ThemeToneSettings,
  type ToneId,
} from '../tones.js'
import { ThemeToneRow, type ThemeToneRowInjected } from './ThemeToneRow.js'
import { readKnownSettings, rememberKnownSettings } from './known-settings.js'
import { en, zh } from './locales.js'
import { createPendingToneTracker, type PendingToneWrite } from './pending.js'
import { buildRowCss } from './styles.js'
import { createThemeToneRowStore } from './store.js'

interface Scope {
  getSnapshot(): { status: 'loading' | 'ready' | 'unavailable'; value?: ThemeToneSettings; writable: boolean }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
}

/** 内嵌浏览器（Electron / VS Code webview）判定：只有它们会触发 Chromium 的合成残影。 */
function isEmbeddedBrowser(): boolean {
  try {
    return /Electron|vscode/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

const DEBUG_GROUPS = ['backdrop', 'glass', 'navpin', 'surfaces'] as const
type DebugGroup = typeof DEBUG_GROUPS[number]

function offGroups(): ReadonlySet<DebugGroup> {
  try {
    const raw = new URLSearchParams(window.location.search).get('dshtone-off') ?? ''
    const wanted = new Set(raw.split(',').map(part => part.trim()).filter(Boolean))
    return new Set(DEBUG_GROUPS.filter(group => wanted.has(group)))
  } catch {
    return new Set()
  }
}

export const inject = ['slots', 'theme', 'locale']

export async function apply(ctx: never): Promise<void> {
  const c = ctx as unknown as Record<string, any>
  if (!warnMissingCapabilities(c, name, [
    { name: 'ctx.theme.getTheme', ok: hasCapability(() => c.theme?.getTheme) },
    { name: 'ctx.theme.overrideTokens', ok: hasCapability(() => c.theme?.overrideTokens) },
    { name: 'ctx.slots.inject', ok: hasCapability(() => c.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => c.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => c.locale?.register) },
    ...REQUIRED_CSS_FEATURES.map(feature => ({ name: `CSS ${feature.name}`, ok: cssSupports(feature.probe) })),
  ])) return
  c.inject(['configForms'], (settingsCtx: never) => install(settingsCtx as never))
}

function install(ctx: never): void {
  const c = ctx as unknown as Record<string, any>
  const markerHost: HTMLElement | null = document.body
  const off = offGroups()

  const ensureStyles = (): HTMLStyleElement => {
    const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
    if (existing !== null) return existing
    const style = document.createElement('style')
    style.setAttribute(MARKER_ATTR, '')
    const part = (group: DebugGroup, build: () => string): string => off.has(group) ? '' : build()
    style.textContent = [
      part('backdrop', buildBackdropCss),
      part('glass', buildGlassCss),
      part('navpin', buildNavPinCss),
      part('surfaces', buildSurfaceCss),
      buildRowCss(),
    ].join('\n')
    document.head.appendChild(style)
    return style
  }

  const ensureLayer = (): HTMLDivElement => {
    const existing = document.querySelector<HTMLDivElement>(LAYER_SELECTOR)
    if (existing !== null) return existing
    const layer = document.createElement('div')
    layer.setAttribute(MARKER_ATTR, '')
    layer.classList.add(BACKDROP_CLASS)
    document.body.appendChild(layer)
    return layer
  }

  const paintPlain = (plain: boolean): void => {
    if (markerHost === null) return
    if (plain) markerHost.setAttribute(PLAIN_ATTR, '')
    else markerHost.removeAttribute(PLAIN_ATTR)
  }

  const resources: { style?: HTMLStyleElement; layer?: HTMLDivElement } = {}
  paintPlain(true)
  if (isEmbeddedBrowser()) markerHost?.setAttribute(EMBED_ATTR, '')
  resources.style = ensureStyles()
  resources.layer = ensureLayer()
  const layer = resources.layer

  const scope = c.configForms.get(SETTINGS_NAMESPACE) as Scope
  const rowStore = createThemeToneRowStore(c.theme.getTheme().active.colorScheme as ColorScheme)
  const pendingTones = createPendingToneTracker()

  let disposeTokens: (() => void) | undefined
  let boundRow: any
  let lastTokenKey = ''
  let revision = 0
  let localSettings: ThemeToneSettings = DEFAULT_SETTINGS
  let hasLocalChoice = false
  let lastReadySettings: ThemeToneSettings | null = null
  let knownSettings: ThemeToneSettings | null = readKnownSettings(window.localStorage)
  let warned = false

  c.effect(() => () => {
    resources.layer?.remove()
    resources.style?.remove()
    disposeTokens?.()
    paintPlain(false)
    markerHost?.removeAttribute(EMBED_ATTR)
  }, `${name}: resources`)

  const readSettings = (): ThemeToneSettings => {
    const snapshot = scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) {
      lastReadySettings = snapshot.value
      rememberSettings(snapshot.value)
    }
    return pendingTones.over(lastReadySettings ?? knownSettings ?? localSettings)
  }

  const rememberSettings = (settings: ThemeToneSettings): void => {
    if (knownSettings !== null && knownSettings.lightTone === settings.lightTone && knownSettings.darkTone === settings.darkTone) return
    knownSettings = { lightTone: settings.lightTone, darkTone: settings.darkTone }
    rememberKnownSettings(window.localStorage, knownSettings)
  }

  const shouldPaint = (): boolean => {
    const status = scope.getSnapshot().status
    if (status === 'loading') return knownSettings !== null
    if (status === 'unavailable') return true
    return lastReadySettings !== null || knownSettings !== null || hasLocalChoice
  }

  const settlePending = (write: PendingToneWrite): void => {
    if (!pendingTones.settle(write)) return
    repaint()
  }

  const paintTokens = (settings: ThemeToneSettings): void => {
    const key = `${settings.lightTone}|${settings.darkTone}`
    if (key === lastTokenKey) return
    disposeTokens = c.theme.overrideTokens(PACKAGE_NAME, tokenOverrides(settings))
    lastTokenKey = key
    paintPlain(backdropPlan(c.theme.getTheme().active.colorScheme as ColorScheme, settings).hidden)
  }

  const syncRow = (scheme: ColorScheme): void => {
    revision += 1
    boundRow?.sync(scheme, toneIdOf(readSettings(), scheme), revision)
  }

  const paintLayer = (snapshot: { active: { colorScheme: ColorScheme } }): void => {
    syncRow(snapshot.active.colorScheme)
    if (!shouldPaint()) return
    const settings = readSettings()
    const plan = backdropPlan(snapshot.active.colorScheme, settings)
    layer.hidden = plan.hidden
    paintPlain(plan.hidden)
    if (plan.hidden) return
    if (markerHost !== null) {
      markerHost.style.setProperty(TOP_VARIABLE, plan.top)
      markerHost.style.setProperty(BOTTOM_VARIABLE, plan.bottom)
      if (plan.left === '') markerHost.style.removeProperty(LEFT_VARIABLE)
      else markerHost.style.setProperty(LEFT_VARIABLE, plan.left)
    }
  }

  const repaint = (): void => {
    syncRow(c.theme.getTheme().active.colorScheme as ColorScheme)
    if (!shouldPaint()) return
    const settings = readSettings()
    paintTokens(settings)
    paintLayer(c.theme.getTheme())
  }

  c.effect(() => scope.subscribe(() => { repaint() }), `${name}: settings`)
  c.on('theme/change', (snapshot: { active: { colorScheme: ColorScheme } }) => { paintLayer(snapshot) })
  c.effect(() => c.locale.register(LOCALE_NAMESPACE, { zh, en }), `${name}: locale`)

  const settleWarn = (): void => {
    if (warned) return
    const snapshot = scope.getSnapshot()
    if (snapshot.status === 'loading') return
    if (snapshot.status === 'ready' && snapshot.writable) return
    warned = true
    warnUser(c as never, `${name}: 本次会话的设置无法写入宿主；色调仍在本次会话内生效，但不会持久化。`)
  }

  c.slots.inject(ROW_SLOT, () => c.slots.register({
    name: ROW_SLOT,
    id: ROW_ID,
    order: ROW_ORDER,
    locale: LOCALE_NAMESPACE,
    store: rowStore,
    inject: (actions: any): ThemeToneRowInjected => {
      boundRow = actions
      repaint()
      return {
        setTone: (id: ToneId, scheme: ColorScheme) => {
          const field = toneFieldFor(scheme)
          const snapshot = scope.getSnapshot()
          localSettings = { ...localSettings, [field]: id }
          hasLocalChoice = true
          const chosen: ThemeToneSettings = { ...(knownSettings ?? localSettings), [field]: id }
          knownSettings = chosen
          rememberKnownSettings(window.localStorage, chosen)
          const pending = pendingTones.begin(field, id)
          repaint()
          if (snapshot.status !== 'ready' || !snapshot.writable) { settleWarn(); return }
          void scope.set(field, id).then(() => settlePending(pending), () => settlePending(pending))
        },
      }
    },
  }, ThemeToneRow as unknown as (props: object) => unknown))

  repaint()
}
