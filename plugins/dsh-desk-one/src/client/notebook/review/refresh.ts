


export const REVIEW_REFRESH_INTERVAL_MS = 5_000


export function shouldRefreshOnShow(wasVisible: boolean, visible: boolean): boolean {
  return visible && !wasVisible
}
