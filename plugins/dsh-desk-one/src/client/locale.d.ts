/** desk-one locale 命名空间扩充：值为字典键的字符串联合。 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desk-one':
      | 'button.label'
      | 'page.title'
      | 'page.subtitle'
      | 'tab.overview'
      | 'tab.notes'
      | 'action.newNote'
      | 'action.delete'
      | 'action.drag'
      | 'action.retry'
      | 'color.default'
      | 'color.yellow'
      | 'color.green'
      | 'color.blue'
      | 'color.pink'
      | 'note.placeholder'
      | 'state.loading'
      | 'state.empty'
      | 'state.loadFailed'
      | 'state.saveFailed'
  }
}

export {}
