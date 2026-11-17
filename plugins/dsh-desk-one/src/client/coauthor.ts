


export interface CoauthorStartOptions {
  readonly prompt?: string
  readonly whenDraftExists?: 'replace' | 'append' | 'keep'
}


export interface CoauthorNavigationLike {

  startSession(workspaceId?: string, options?: CoauthorStartOptions): void
}


export interface CoauthorBridge {

  start(prompt: string): boolean
  attachNavigation(service: CoauthorNavigationLike): () => void
}


export function createCoauthorBridge(): CoauthorBridge {
  let navigation: CoauthorNavigationLike | undefined
  return {
    start(prompt) {
      if (navigation === undefined) return false


      navigation.startSession(undefined, { prompt, whenDraftExists: 'append' })
      return true
    },
    attachNavigation(service) {
      navigation = service
      return () => { if (navigation === service) navigation = undefined }
    },
  }
}
