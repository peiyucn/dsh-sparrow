/** desk-one locale 命名空间扩充：值为字典键的字符串联合。 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desk-one':
      | 'button.label'
      | 'page.title'
      | 'page.subtitle'
      | 'tab.today'
      | 'tab.notes'
      | 'action.newNote'
      | 'action.save'
      | 'action.cancel'
      | 'action.edit'
      | 'action.delete'
      | 'action.confirmDelete'
      | 'action.pin'
      | 'action.unpin'
      | 'action.retry'
      | 'placeholder.title'
      | 'placeholder.body'
      | 'placeholder.search'
      | 'color.default'
      | 'color.yellow'
      | 'color.green'
      | 'color.blue'
      | 'color.pink'
      | 'state.loading'
      | 'state.saving'
      | 'state.empty'
      | 'state.searchEmpty'
      | 'state.loadFailed'
      | 'state.saveFailed'
      | 'state.deleteFailed'
      | 'today.pinned'
      | 'today.counts'
      | 'today.hint'
      | 'meta.updatedAt'
  }
}

export {}
