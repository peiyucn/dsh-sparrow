


export const NOTEBOOK_PAGE_SIZE = 20


export interface PageSlice<Row> {
  readonly rows: readonly Row[]

  readonly page: number

  readonly pages: number
}


export function paginate<Row>(rows: readonly Row[], page: number, pageSize = NOTEBOOK_PAGE_SIZE): PageSlice<Row> {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1
  const current = Math.min(Math.max(1, requested), pages)
  const start = (current - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), page: current, pages }
}


export interface RootedPage<Entry> {

  readonly rootPath: string | undefined
  readonly entries: readonly Entry[]
  readonly total: number
}


export function pageForRoot<Entry>(
  page: RootedPage<Entry> | null,
  rootPath: string | undefined,
): RootedPage<Entry> | null {
  return page !== null && page.rootPath === rootPath ? page : null
}
