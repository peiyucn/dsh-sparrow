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
 * Find the workspace that owns one absolute file path.
 *
 * The longest matching root wins, so a workspace nested inside another one is not shadowed by its
 * parent. This replaces the removed "library root" check for the official file-preview entry.
 * @param workspaces - registered workspaces.
 * @param absolutePath - previewed file path.
 * @returns the owning workspace, or `undefined` when the file is outside every workspace.
 */
export function findWorkspaceForPath(
  workspaces: readonly WorkspacePathView[],
  absolutePath: string,
): WorkspacePathView | undefined {
  const file = normalizeAbsolute(absolutePath)
  // Windows drive and UNC paths are case-insensitive; POSIX paths are not.
  const caseless = /^[A-Za-z]:\//u.test(file) || file.startsWith('//')
  const fold = (value: string): string => (caseless ? value.toLowerCase() : value)
  const target = fold(file)
  let best: WorkspacePathView | undefined
  let bestLength = -1
  for (const workspace of workspaces) {
    const prefix = fold(normalizeAbsolute(workspace.path))
    if (target !== prefix && !target.startsWith(`${prefix}/`)) continue
    if (prefix.length > bestLength) {
      best = workspace
      bestLength = prefix.length
    }
  }
  return best
}

/**
 * Path of one file relative to its workspace root, `/`-separated.
 * @param absolutePath - previewed file path.
 * @param rootPath - owning workspace root.
 * @returns the relative path.
 */
export function relativeToWorkspace(absolutePath: string, rootPath: string): string {
  const file = normalizeAbsolute(absolutePath)
  const root = normalizeAbsolute(rootPath)
  return file.slice(root.length + 1)
}

/** Normalize one absolute path for prefix comparison (`/`, no trailing separator). */
function normalizeAbsolute(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '')
}


/** Library creation through DSH's own workspace flow. */
export interface WorkspaceAccess {
  /** Registered workspaces (empty before the service attaches). */
  list(): readonly WorkspacePathView[]
  /** Pick a folder through DSH's picker and register it as a workspace. */
  createFromPicker(): Promise<WorkspacePathView | null>
  /** Pick any folder through DSH's picker, without registering it (link a subfolder). */
  pickDirectory(): Promise<string | null>
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
    async pickDirectory() {
      if (navigation === undefined) return null
      const path = await navigation.pickDirectory()
      return path === null || path === '' ? null : path
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
