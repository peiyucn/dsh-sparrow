/**
 * Workspace access behind the notebook library action.
 *
 * The library IS a DSH workspace: creating one reuses DSH's own flow (its folder
 * picker, then Workspace Controller registration), so the notebook never invents
 * a second way to choose a directory and the "must live under a workspace" rule
 * holds by construction.
 *
 * Both services are optional in the client half (a host without them must still
 * boot), so the holder starts empty and the action reports "unavailable" instead
 * of failing the panel.
 */

/** The part of one projected workspace the notebook needs. */
export interface WorkspacePathView {
  readonly path: string
  readonly title: string
}

/** The slice of the client Workspace Controller service this holder depends on. */
export interface WorkspacesServiceLike {
  readonly list: { getSnapshot(): { readonly items: readonly WorkspacePathView[] } }
  create(input: { readonly path: string }): Promise<WorkspacePathView>
}

/** The slice of the official workspace navigation service (its folder picker). */
export interface UiWorkspaceLike {
  pickDirectory(): Promise<string | null>
}

/** Library creation through DSH's own workspace flow. */
export interface WorkspaceAccess {
  /** Current workspace rows; empty before the service attaches. */
  list(): readonly WorkspacePathView[]
  /**
   * Run DSH's workspace creation: its folder picker, then registration.
   * @returns the created (or idempotently resolved) workspace, or null when the operator cancels.
   */
  createFromPicker(): Promise<WorkspacePathView | null>
  /**
   * Attach the Workspace Controller service.
   * @param service - the client workspaces service.
   * @returns detach.
   */
  attach(service: WorkspacesServiceLike): () => void
  /**
   * Attach the workspace navigation service (folder picker).
   * @param navigation - the uiWorkspace service.
   * @returns detach.
   */
  attachNavigation(navigation: UiWorkspaceLike): () => void
}

/** Create the holder; every call answers synchronously regarding availability. */
export function createWorkspaceAccess(): WorkspaceAccess {
  let workspaces: WorkspacesServiceLike | undefined
  let navigation: UiWorkspaceLike | undefined
  return {
    list: () => workspaces?.list.getSnapshot().items ?? [],
    async createFromPicker() {
      if (workspaces === undefined || navigation === undefined) throw new Error('工作区服务不可用')
      const path = await navigation.pickDirectory()
      if (path === null) return null
      return await workspaces.create({ path })
    },
    attach(service) {
      workspaces = service
      return () => { if (workspaces === service) workspaces = undefined }
    },
    attachNavigation(value) {
      navigation = value
      return () => { if (navigation === value) navigation = undefined }
    },
  }
}
