/** archive-session locale 命名空间扩充：值为字典键的字符串联合。 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'archive-session':
      | 'button.label'
      | 'dialog.title'
      | 'dialog.close'
      | 'dialog.intro'
      | 'loading'
      | 'section.archived'
      | 'section.backups'
      | 'empty.archived'
      | 'empty.backups'
      | 'legacy.hint'
      | 'legacy.badge'
      | 'legacy.restoreTitle'
      | 'action.backup'
      | 'action.delete'
      | 'action.restore'
      | 'action.restoreAll'
      | 'action.deleteAll'
      | 'state.running'
      | 'state.live'
      | 'state.backendUnsupported'
      | 'confirm.backup'
      | 'confirm.delete'
      | 'confirm.deleteMismatch'
      | 'confirm.deleteBackup'
      | 'confirm.restoreAll'
      | 'confirm.restoreAll.withLegacy'
      | 'confirm.deleteAll'
      | 'confirm.deleteAllPhrase'
      | 'confirm.deleteAllMismatch'
      | 'confirm.cancel'
      | 'notice.restored'
      | 'notice.skippedLegacy'
      | 'notice.failed'
      | 'notice.deleted'
  }
}

export {}
