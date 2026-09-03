/** 官方 session-controller 的 Remote 事件选择（面板监听 session/disposed 转发，spec 08 §2.5）。 */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends
    Record<'api-session/removed', true> {}
}

export {}
