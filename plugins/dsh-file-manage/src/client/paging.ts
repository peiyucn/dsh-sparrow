/** 文件面板渲染窗口纯逻辑：数据分页与 DOM 渲染窗口分离。 @module dsh-file-manage/client/paging */

/** 窗口内可见行数：min(已加载行数, 窗口上限)；负数/小数钳到安全值（不抛）。 */
export function renderedRowCount(totalRows: number, renderLimit: number): number {
  const total = Math.max(0, Math.trunc(totalRows))
  const limit = Math.max(0, Math.trunc(renderLimit))
  return Math.min(total, limit)
}

/** 「加载更多」是否可见：窗口未盖满已加载行，或服务端还有更多数据。 */
export function hasLoadMore(totalRows: number, renderLimit: number, dataHasMore: boolean): boolean {
  return renderedRowCount(totalRows, renderLimit) < totalRows || dataHasMore
}
