/**
 * Notebook library access: DSH's own workspace flow chooses the folder, so the library is a
 * registered workspace (the AI can edit inside it) instead of an arbitrary path.
 *
 * Both services are optional in the client half (a host without them must still boot), so the
 * holder starts empty and the action reports "unavailable" instead of failing the panel.
 */

/** The slice of one projected workspace the notebook needs. */
export interface WorkspacePathView {
  readonly workspaceId: string
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

/**
 * Find the workspace that owns a library root (the root is a registered workspace directory,
 * though it may be a subfolder of one).
 * @param workspaces - registered workspaces.
 * @param rootPath - absolute library root.
 * @returns the owning workspace, or `undefined` when the root is not inside any workspace.
 */
export function findWorkspaceForRoot(
  workspaces: readonly WorkspacePathView[],
  rootPath: string,
): WorkspacePathView | undefined {
  const normalized = rootPath.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
  return workspaces.find((workspace) => {
    const path = workspace.path.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
    return normalized === path || normalized.startsWith(`${path}/`)
  })
}

/** Library creation through DSH's own workspace flow. */
export interface WorkspaceAccess {
  /** Registered workspaces (empty before the service attaches). */
  list(): readonly WorkspacePathView[]
  /** Pick a folder through DSH's picker and register it as a workspace. */
  createFromPicker(): Promise<WorkspacePathView | null>
  attach(service: WorkspacesServiceLike): () => void
  attachNavigation(navigation: UiWorkspaceLike): () => void
}

/** Create the holder; every call answers synchronously regarding availability. */
export function createWorkspaceAccess(): WorkspaceAccess {
  let workspaces: WorkspacesServiceLike | undefined
  let navigation: UiWorkspaceLike | undefined
  return {
    list: () => workspaces?.list.getSnapshot().items ?? [],
    async createFromPicker() {
      if (navigation === undefined || workspaces === undefined) return null
      const path = await navigation.pickDirectory()
      if (path === null || path === '') return null
      return await workspaces.create({ path })
    },
    attach(service) {
      workspaces = service
      return () => { if (workspaces === service) workspaces = undefined }
    },
    attachNavigation(service) {
      navigation = service
      return () => { if (navigation === service) navigation = undefined }
    },
  }
}
