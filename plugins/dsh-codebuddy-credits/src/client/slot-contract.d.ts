/**
 * 类型扩充：client 包发布停在 0.1.1-rc.2，下列槽位与词典命名空间的类型
 * 声明尚未随包发布；运行时由官方 web 端声明并提供，这里只补类型层。
 * - conversation.input.model：composer 模型座（kind=single，scope=session，
 *   owner 传 locked）。本插件以 priority -1 注册遮蔽官方 ModelSelect。
 * - settings.models.provider-card：官方设置 → 模型页扩展槽位（keyed by
 *   owning settings namespace），挂 Key 配置卡。
 * - conversation.session.header.actions：会话头部操作区（kind=list，
 *   scope=session），挂 CodeBuddy 额度小卡；occupant 拿框架注入的
 *   SessionStandardProps（sessionId/useProjection 等，ui-session 声明）。
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.input.model': {
      kind: 'single'
      scope: 'session'
      owner: { locked: boolean }
    }
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
      | 'key.label'
      | 'key.placeholder'
      | 'key.stored'
      | 'key.illegal'
      | 'action.cancel'
      | 'action.apply'
      | 'action.applying'
      | 'state.configured'
      | 'state.configuredShort'
      | 'action.edit'
      | 'saved'
      | 'error.empty'
      | 'error.saveFailed'
      | 'account.enterprise'
      | 'account.personal'
      | 'indicator.open'
      | 'indicator.title'
      | 'indicator.loading'
      | 'indicator.loadFailed'
      | 'indicator.quotaTitle'
      | 'indicator.used'
      | 'indicator.remainingLabel'
      | 'indicator.reset'
      | 'indicator.resetDays'
      | 'indicator.model.title'
      | 'indicator.model.context'
      | 'indicator.model.vision'
      | 'indicator.model.efforts'
      | 'picker.trigger.fallback'
      | 'picker.trigger.loading'
      | 'picker.trigger.selectAria'
      | 'picker.trigger.aria'
      | 'picker.trigger.ariaEffort'
      | 'picker.menu.aria'
      | 'picker.menu.model'
      | 'picker.menu.effort'
      | 'picker.effort.providerDefault'
      | 'picker.status.loading'
      | 'picker.error.action'
      | 'picker.action.reload'
      | 'picker.warning.groupLoad'
      | 'picker.empty.models'
      | 'picker.empty.efforts'
  }
}

export {}
