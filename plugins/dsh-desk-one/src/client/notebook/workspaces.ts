


export interface WorkspacePathView {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
}


export interface WorkspacesServiceLike {
  readonly list: { getSnapshot(): { readonly items: readonly WorkspacePathView[] } }
  create(input: { readonly path: string }): Promise<WorkspacePathView>
}


export interface UiWorkspaceLike {
  pickDirectory(): Promise<string | null>
}


export function findWorkspaceForPath(
  workspaces: readonly WorkspacePathView[],
  absolutePath: string,
): WorkspacePathView | undefined {
  const file = normalizeAbsolute(absolutePath)

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


export function relativeToWorkspace(absolutePath: string, rootPath: string): string {
  const file = normalizeAbsolute(absolutePath)
  const root = normalizeAbsolute(rootPath)
  return file.slice(root.length + 1)
}


function normalizeAbsolute(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '')
}



export interface WorkspaceAccess {

  list(): readonly WorkspacePathView[]

  createFromPicker(): Promise<WorkspacePathView | null>
  attach(service: WorkspacesServiceLike): () => void
  attachNavigation(navigation: UiWorkspaceLike): () => void
}


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
