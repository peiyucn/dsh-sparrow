/**
 * Browser-side folder picking for the notebook root.
 *
 * The picker is a shared Host seam (`remote.directoryPicker`): the browser asks
 * the Host to list one directory level, so paths never get composed client-side.
 * The service is optional in the client half (a host without the picker must
 * still boot), so the holder starts unavailable and the UI degrades to
 * "workspace root only" instead of failing.
 */

/** One child directory as the Host reports it. */
export interface DirectoryEntryView {
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}

/** One directory level plus its ancestry. */
export interface DirectoryListingView {
  readonly path: string
  readonly entries: readonly DirectoryEntryView[]
  readonly truncated: boolean
}

/** Remote result shape the picker namespace answers with. */
type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** The slice of the directory-picker Remote namespace this module needs. */
export interface DirectoryPickerLike {
  list(path: string, signal?: AbortSignal): Promise<RemoteResult<DirectoryListingView>>
}

/** Optional folder browser the notebook picker uses. */
export interface DirectoryBrowser {
  /** Whether the seam is currently attached. */
  available(): boolean
  /**
   * List one level.
   * @param path - absolute directory path.
   * @param signal - cancels the request.
   * @returns the level.
   */
  list(path: string, signal?: AbortSignal): Promise<DirectoryListingView>
  /**
   * Attach the Remote namespace.
   * @param service - the namespace.
   * @returns detach.
   */
  attach(service: DirectoryPickerLike): () => void
}

/** Create the holder; every call answers synchronously regarding availability. */
export function createDirectoryBrowser(): DirectoryBrowser {
  let attached: DirectoryPickerLike | undefined
  return {
    available: () => attached !== undefined,
    async list(path, signal) {
      const service = attached
      if (service === undefined) throw new Error('目录选择器不可用')
      const result = await service.list(path, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    attach(service) {
      attached = service
      return () => { if (attached === service) attached = undefined }
    },
  }
}

/** Parent of a `/`-separated path; a drive root and `/` are their own parent. */
export function parentDirectory(path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/\/+$/u, '')
  if (normalized === '') return '/'
  if (/^[A-Za-z]:$/u.test(normalized)) return `${normalized}/`
  const cut = normalized.lastIndexOf('/')
  if (cut < 0) return normalized
  const parent = normalized.slice(0, cut)
  return parent === '' ? '/' : parent
}
