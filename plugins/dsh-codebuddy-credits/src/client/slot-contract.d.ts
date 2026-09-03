/**
 * 类型扩充：client 包发布停在 0.1.1-rc.2，下列槽位与词典命名空间的类型
 * 声明尚未随包发布；运行时由官方 web 端声明并提供，这里只补类型层。
 * - settings.models.provider-card：官方设置 → 模型页扩展槽位（keyed by
 *   owning settings namespace），挂 Key 配置卡。
 * - conversation.session.header.actions：会话头部操作区（kind=list，
 *   scope=session），挂 CodeBuddy 额度小卡；occupant 拿框架注入的
 *   SessionStandardProps（sessionId/useProjection 等，ui-session 声明）。
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
    'conversation.session.header.actions': {
      kind: 'list'
      scope: 'session'
      owner: { children?: never }
    }
  }

  interface LocaleNamespaceMap {
    'codebuddy-credits':
      | 'key.placeholder'
      | 'key.save'
      | 'key.remove'
      | 'state.configured'
      | 'state.missing'
      | 'saved'
      | 'error.empty'
      | 'error.saveFailed'
      | 'error.removeFailed'
      | 'account.enterprise'
      | 'account.personal'
      | 'indicator.open'
      | 'indicator.title'
      | 'indicator.loading'
      | 'indicator.loadFailed'
      | 'indicator.noKey'
      | 'indicator.balance'
      | 'indicator.reset'
      | 'indicator.model.title'
      | 'indicator.model.context'
      | 'indicator.model.vision'
      | 'indicator.model.efforts'
  }
}

export {}
