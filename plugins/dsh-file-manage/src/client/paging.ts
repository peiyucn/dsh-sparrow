/** 文件面板渲染窗口纯逻辑（对齐 archive-manage spec 09）：数据分页与 DOM 渲染窗口分离。 @module dsh-file-manage/client/paging */

/** 渲染窗口大小：每次「加载更多」多显示的行数（owner 定案 2026-09-01：每页 20 条）。 */
export const RENDER_PAGE_SIZE = 20

/**
 * 数据分页大小：每次 list 拉取的行数。大于渲染窗口（200 > 20），
 * 一次游标请求覆盖多次「加载更多」点击，窗口之外的数据不渲染（DOM 有界）。
 */
export const FILE_PAGE_SIZE = 200

/** 窗口内可见行数：min(已加载行数, 窗口上限)；负数/小数钳到安全值（不抛）。 */
export function renderedRowCount(totalRows: number, renderLimit: number): number {
  const total = Math.max(0, Math.trunc(totalRows))
  const limit = Math.max(0, Math.trunc(renderLimit))
  return Math.min(total, limit)
}

/** 「加载更多」是否可见：窗口未盖满已加载行（纯延伸窗口），或服务端还有更多数据（延伸窗口 + 拉页）。 */
export function hasLoadMore(totalRows: number, renderLimit: number, dataHasMore: boolean): boolean {
  return renderedRowCount(totalRows, renderLimit) < totalRows || dataHasMore
}
