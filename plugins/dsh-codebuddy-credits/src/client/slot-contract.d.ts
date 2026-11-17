

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

    'conversation.session.header.utilities': {
      kind: 'list'
      scope: 'session'
      owner: { children?: never }
    }

    'conversation.input.dock': {
      kind: 'list'
      scope: 'session'
      owner: { session: { sessionId: unknown }; input: unknown }
    }

    'conversation.chat.assistant-actions': {
      kind: 'list'
      scope: 'session'
      owner: { messageId: string }
    }

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
