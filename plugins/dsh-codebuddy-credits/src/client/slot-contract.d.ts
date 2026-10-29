/**
 * 类型扩充：下列槽位与词典命名空间尚未随 client 包发布，运行时由官方 web 端声明并提供，
 * 这里只补类型层。
 *
 * ⚠️ **不声明 `conversation.input.model`**：本插件不注册该槽（模型选择器 = 官方 ui-model-selection）。
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
    /**
     * 官方两条统计胶囊 entry：activity order 0、usage order 1，各带 `data-composer-stat`，容器 `.dock`
     * 带 `data-composer-dock`（上游 `ui-conversation/src/client/skeleton/InputBar.tsx:520`）。
     * 本插件 order 2 挂会话积分胶囊，作为 `.dock` flex 行的第三个子项；形状对齐官方 `.pill`。
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
      | 'picker.trigger.loading'
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
      | 'autoAdapt.label'
      | 'autoAdapt.hint'
      | 'autoAdapt.failed'
  }
}

export {}
