/**
 * 类型扩充：下列槽位与词典命名空间尚未随 client 包发布，运行时由官方 web 端
 * 声明并提供，这里只补类型层；input.model 座本插件以 priority -1 遮蔽官方 ModelSelect。
 *
 * ⚠️ `conversation.input.model` 的子槽 `conversation.input.model.label`（single/session/inline，
 * owner `{ provider, model, placement, selected }`）由官方 ui-model-selection 注册父槽时声明，
 * 本插件必须在同一父槽上遮蔽时**不声明**它：ui-slots 规定一个子槽只有一个声明者
 * （上游 `ui-slots/src/index.ts:1245-1250`，"already declared" 即抛），重复声明会让本注册
 * 失败并退回官方选择器。因此本插件选择器不消费该子槽，其他 label 贡献不渲染；官方临时
 * 1017 版本标改由 `model-label-1017.ts` 按官方同条件自绘镜像。
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
