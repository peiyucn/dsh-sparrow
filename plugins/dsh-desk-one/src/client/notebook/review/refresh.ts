/**
 * Quiet-refresh policy for the review tab.
 *
 * The reviewed file is changed by the conversation (file tools), not by this plugin, so the tab
 * has to poll. A hidden tab stops polling; waiting for the next interval after it returns leaves
 * "this round's changes" stale, which reads as "it does not refresh at all". The visibility
 * transition therefore refreshes immediately, while the interval keeps a visible tab current.
 */

/** Quiet-refresh cadence while the review tab stays on screen (ms). */
export const REVIEW_REFRESH_INTERVAL_MS = 5_000

/**
 * Whether a visibility change needs an immediate refresh.
 * @param wasVisible - tab visibility before this change.
 * @param visible - tab visibility after this change.
 * @returns true only when the tab just became visible.
 */
export function shouldRefreshOnShow(wasVisible: boolean, visible: boolean): boolean {
  return visible && !wasVisible
}
