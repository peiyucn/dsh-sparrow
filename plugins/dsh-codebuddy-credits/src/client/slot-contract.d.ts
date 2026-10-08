/**
 * 类型扩充：下列槽位与词典命名空间尚未随 client 包发布，运行时由官方 web 端
 * 声明并提供，这里只补类型层；input.model 座本插件以 priority -1 遮蔽官方 ModelSelect。
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
    /** 官方 session log 下载按钮占 order 0；本插件 order -10 排在其左。 */
    'conversation.session.header.utilities': {
      kind: 'list'
      scope: 'session'
      owner: { children?: never }
    }
    /** 本插件在此挂 blank 会话 hero 额度入口锚点：hero 态官方 header 隐藏、utilities 不渲染，故改读根元素 data-phase 判相位。 */
    'conversation.input.dock': {
      kind: 'list'
      scope: 'session'
      owner: { session: { sessionId: unknown }; input: unknown }
    }
    /** 官方渲染顺序：复制 → 本槽位 → 分支 → Usage 胶囊 → 时间；本插件挂每轮积分胶囊。 */
    'conversation.chat.assistant-actions': {
      kind: 'list'
      scope: 'session'
      owner: { messageId: string }
    }
    /** 官方统计胶囊行在 order 0；本插件 order 1 挂会话积分胶囊，并把自有节点追加进官方行（按 [data-composer-stats] 寻址），形状对齐官方 .pill。 */
    'conversation.composer.dock': {
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
      | 'action.clearKey'
      | 'error.clearFailed'
      | 'state.configured'
      | 'state.configuredShort'
      | 'action.edit'
      | 'saved.provider'
      | 'error.empty'
      | 'error.saveFailed'
      | 'account.enterprise'
      | 'account.personal'
      | 'indicator.open'
      | 'indicator.title'
      | 'indicator.loading'
      | 'indicator.profile'
      | 'indicator.loadFailed'
      | 'indicator.quotaTitle'
      | 'indicator.used'
      | 'indicator.remainingLabel'
      | 'indicator.reset'
      | 'indicator.resetDays'
      | 'indicator.model.features'
      | 'indicator.model.visionFeature'
      | 'indicator.model.reasoningFeature'
      | 'turnCredit.aria'
      | 'turnCredit.label'
      | 'turnCredit.title'
      | 'turnCredit.calls'
      | 'turnCredit.perCall'
      | 'stats.sessionCredits'
      | 'stats.sessionCreditsAria'
      | 'stats.sessionCreditsTitle'
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
      | 'picker.effort.max'
      | 'picker.max.locked'
      | 'picker.max.lockedHint'
      | 'indicator.max.title'
      | 'indicator.max.hint'
      | 'indicator.max.failed'
      | 'models.title'
      | 'models.fetch'
      | 'models.fetching'
      | 'models.updated'
      | 'models.latest'
      | 'models.empty'
      | 'models.failed'
  }
}

export {}
