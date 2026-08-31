/** chat-suggest locale 命名空间扩充：值为字典键的字符串联合，让 register / t 通过类型检查。 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'chat-suggest':
      | 'switch.label'
      | 'switch.onHint'
      | 'switch.offHint'
      | 'dock.busy'
      | 'dock.aria'
      | 'menu.adopt'
      | 'menu.dismiss'
      | 'menu.tokens'
      | 'sensitivity.hint'
      | 'sensitivity.aria'
      | 'sensitivity.eager'
      | 'sensitivity.standard'
      | 'sensitivity.conservative'
      | 'sensitivity.eager.rule'
      | 'sensitivity.standard.rule'
      | 'sensitivity.conservative.rule'
  }
}

export {}
