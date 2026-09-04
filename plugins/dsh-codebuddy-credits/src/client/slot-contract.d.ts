/**
 * 类型扩充：client 包发布停在 0.1.1-rc.2，下列槽位与词典命名空间的类型
 * 声明尚未随包发布；运行时由官方 web 端声明并提供，这里只补类型层。
 * - conversation.input.model：composer 模型座（kind=single，scope=session，
 *   owner 传 locked）。本插件以 priority -1 注册遮蔽官方 ModelSelect。
 * - settings.models.provider-card：官方设置 → 模型页扩展槽位（keyed by
 *   owning settings namespace），挂 Key 配置卡。
 * - sidebar.footer.action：左侧栏 footer 槽位（kind=list，scope=root，
 *   owner 传 wide）——官方 Settings 上方的堆叠区；本插件挂 CodeBuddy 额度
 *   入口，宽栏以 CSS 落在 Settings 行右侧。
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
    /**
     * 左侧栏 footer 扩展槽位（ui-sidebar 声明；kind=list，scope=root，
     * owner 传 wide=宽栏）。Archive/Cloud Files 同款；本插件挂额度入口。
     */
    'sidebar.footer.action': {
      kind: 'list'
      scope: 'root'
      owner: { wide: boolean }
    }
    /**
     * 官方聊天视图的完成态 assistant 行动作槽位（ui-chat 声明；kind=list，
     * scope=session，owner 传 durable messageId）——官方渲染顺序：复制 →
     * 本槽位 → 分支 → Usage 胶囊 → 时间。本插件挂每轮积分胶囊。
     */
    'conversation.chat.assistant-actions': {
      kind: 'list'
      scope: 'session'
      owner: { messageId: string }
    }
    /**
     * composer 底部扩展槽位（ui-conversation 声明；kind=list，scope=session）。
     * 官方 StatsLine 挂在这里（order 0）——本插件以 order 1 挂会话积分统计行，
     * 渲染在官方统计行之后。
     */
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
      | 'indicator.sessionUsage'
      | 'indicator.recentCalls'
      | 'indicator.callRow'
      | 'turnCredit.aria'
      | 'turnCredit.label'
      | 'turnCredit.title'
      | 'turnCredit.total'
      | 'turnCredit.calls'
      | 'turnCredit.recent'
      | 'stats.sessionCredits'
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
