/**
 * 官方 provider 行头的私有 DOM seam，集中一处，便于官方改结构时整体失效/修正。
 *
 * 只**读**官方 DOM（`li > 行头 div > 操作 span > 第一个 button`）并在 section 顶部插入本卡自有提示节点；
 * 不替换 / 不包装 / 不覆写官方函数。官方改行头结构即静默降级：
 *  - 捕获不到「编辑」→ 本卡不再展开（官方编辑器按原行为打开，按钮位置与样式始终是官方的）；
 *  - 提示插不进去 → 只是不显示「已保存」，Key 的保存 / 清空不受影响。
 */

import { CCB_CLASS } from './styles.js'

/** 官方行头：`li > div:first-child`（setup 姿态可能没有这个 div）。 */
function rowHead(root: HTMLElement): Element | null {
  const li = root.closest('li')
  return li?.querySelector(':scope > div:first-child') ?? null
}

/** 行头右侧的操作区：`div > span:last-child`（setup 姿态的占位编辑器没有这个 span）。 */
function rowActions(root: HTMLElement): Element | null {
  return rowHead(root)?.querySelector(':scope > span:last-child') ?? null
}

/** 点击是否命中官方行头「编辑」按钮（捕获阶段用；命中即拦下官方编辑器、切换本卡）。 */
export function isRowEditTrigger(root: HTMLElement | null, target: EventTarget | null): boolean {
  if (root === null || target === null || !(target instanceof Node)) return false
  const button = rowActions(root)?.querySelector('button:first-of-type') ?? null
  return button !== null && (button === target || button.contains(target))
}

/** 首装 setup 姿态：行头存在但没有操作区，折叠会让卡片完全空掉，需自动展开一次。 */
export function shouldAutoExpandSetup(root: HTMLElement | null): boolean {
  if (root === null) return false
  const head = rowHead(root)
  if (head === null) return false
  return head.querySelector(':scope > span:last-child') === null
}

/**
 * 绿色保存提示插到 section 顶部（官方 savedProvider 位置，intro 与列表之间）：
 * 无对应公开槽位只能 DOM 插入；返回 disposer（React 19 ref cleanup 兼容也可直接忽略）。
 */
export function insertSavedNotice(root: HTMLElement | null, text: string): (() => void) | undefined {
  if (root === null) return undefined
  const li = root.closest('li')
  if (li === null) return undefined
  const rows = li.parentElement
  const section = rows?.parentElement
  if (rows === null || rows === undefined || section === null || section === undefined) return undefined
  const notice = document.createElement('p')
  notice.textContent = text
  notice.setAttribute('role', 'status')
  notice.setAttribute('aria-live', 'polite')
  notice.className = CCB_CLASS.cardNotice
  section.insertBefore(notice, rows)
  return () => { notice.remove() }
}
