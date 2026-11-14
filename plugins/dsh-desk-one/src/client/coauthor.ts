/**
 * Panel ↔ conversation entry ("和 DSH 一起"): open or reuse the current Workspace's blank Session
 * and put one prefilled prompt into its composer. Shared by the header menu and the empty-state
 * buttons; it never sends and touches no private state — the only seam is the official
 * `uiWorkspace.startSession`, whose blank-reuse and draft rules stay official behavior.
 */

/** `StartSessionOptions` subset this bridge uses (structural, so the face stays small). */
export interface CoauthorStartOptions {
  readonly prompt?: string
  readonly whenDraftExists?: 'replace' | 'append' | 'keep'
}

/** Official workspace navigation face required by the bridge (subset of `UiWorkspace`). */
export interface CoauthorNavigationLike {
  /** Open the Workspace blank (reused when possible) with an optional prefilled draft. */
  startSession(workspaceId?: string, options?: CoauthorStartOptions): void
}

/** Panel-side face exposed to the page. */
export interface CoauthorBridge {
  /**
   * Open or reuse the current / most recent Workspace blank and append the prompt to its draft.
   * @param prompt - one user-visible instruction; appended to the draft, never sent.
   * @returns whether the navigation service was available (false = nothing happened).
   */
  start(prompt: string): boolean
  attachNavigation(service: CoauthorNavigationLike): () => void
}

/** Create the bridge; it stays inert until `attachNavigation` receives the official service. */
export function createCoauthorBridge(): CoauthorBridge {
  let navigation: CoauthorNavigationLike | undefined
  return {
    start(prompt) {
      if (navigation === undefined) return false
      // No workspace id on purpose: the official navigation inherits the current or most recent
      // Workspace and shows its own "workspace required" notice when none exists.
      navigation.startSession(undefined, { prompt, whenDraftExists: 'append' })
      return true
    },
    attachNavigation(service) {
      navigation = service
      return () => { if (navigation === service) navigation = undefined }
    },
  }
}
