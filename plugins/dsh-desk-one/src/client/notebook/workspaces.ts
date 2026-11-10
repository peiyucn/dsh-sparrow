/**
 * Workspace paths the panel offers when the notes root has to be chosen.
 *
 * The workspaces service is optional in the client half (a host without it must
 * still boot), so this holder starts empty and the picker simply says there is
 * nothing to choose until the fork attaches.
 */

/** The part of one projected workspace the picker needs. */
export interface WorkspacePathView {
  readonly path: string
  readonly title: string
}

/** The slice of the client workspaces service this holder depends on. */
export interface WorkspacesServiceLike {
  readonly list: { getSnapshot(): { readonly items: readonly WorkspacePathView[] } }
}

/** Read-only list the picker calls on every open (never cached across opens). */
export interface WorkspacePaths {
  /** Current workspace rows; empty before the service attaches. */
  list(): readonly WorkspacePathView[]
  /**
   * Attach the service.
   * @param service - the client workspaces service.
   * @returns detach, restoring the empty state.
   */
  attach(service: WorkspacesServiceLike): () => void
}

/** Create the holder; `list()` answers synchronously and stays safe before attach. */
export function createWorkspacePaths(): WorkspacePaths {
  let attached: WorkspacesServiceLike | undefined
  return {
    list: () => attached?.list.getSnapshot().items ?? [],
    attach(service) {
      attached = service
      return () => { if (attached === service) attached = undefined }
    },
  }
}
