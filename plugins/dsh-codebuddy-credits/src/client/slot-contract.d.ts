/**
 * 类型扩充：官方 master 的 Models 设置页扩展槽位（settings.models.provider-card，
 * keyed by owning settings namespace）。client 包发布停在 0.1.1-rc.2，该槽位的
 * 类型声明尚未随包发布；运行时由官方 web 端声明并提供，这里只补类型层。
 * 组件不读 owner props（数据经本机 host 路由），故按最小形状声明。
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.models.provider-card': {
      kind: 'keyed'
      scope: 'root'
      owner: {
        provider: { provider: string; displayName: string }
        configured: boolean
        keyConfigured: boolean
      }
    }
  }

  interface LocaleNamespaceMap {
    'codebuddy-credits':
      | 'key.placeholder'
      | 'key.save'
      | 'key.remove'
      | 'models.refresh'
      | 'models.added'
      | 'models.unchanged'
      | 'quota.line'
      | 'state.configured'
      | 'state.missing'
      | 'state.active'
      | 'saved'
      | 'error.empty'
      | 'error.saveFailed'
      | 'error.removeFailed'
      | 'error.refreshFailed'
  }
}

export {}
