/** Client-side pagination for the notebook list views (the library itself stays server-side). */

/** Rows shown per page in every notebook view. */
export const NOTEBOOK_PAGE_SIZE = 10

/** One page of rows plus the page bounds after clamping. */
export interface PageSlice<Row> {
  readonly rows: readonly Row[]
  /** Clamped 1-based page number actually shown. */
  readonly page: number
  /** Total number of pages (at least 1, so an empty list still renders "1 / 1"). */
  readonly pages: number
}

/**
 * Slice one list into a page, clamping an out-of-range request to the existing bounds.
 * @param rows - the whole filtered list.
 * @param page - requested 1-based page.
 * @param pageSize - rows per page.
 * @returns the page slice plus clamped page and page count.
 */
export function paginate<Row>(rows: readonly Row[], page: number, pageSize = NOTEBOOK_PAGE_SIZE): PageSlice<Row> {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1
  const current = Math.min(Math.max(1, requested), pages)
  const start = (current - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), page: current, pages }
}
