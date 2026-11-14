/** Locale fragment: note-wall actions (create, drag, trash, clear, retry). */

export const zh = {
  'action.backToWall': '返回便签墙',
  'action.clearTrash': '清空垃圾桶',
  'action.clearTrashConfirm': '确认清空',
  'action.delete': '永久删除',
  'action.drag': '拖动',
  'action.loadMore': '加载更多',
  'action.newNote': '便签',
  'action.notebook': '笔记',
  'action.restore': '恢复',
  'action.retry': '重试',
  'action.smash': 'Smash!',
  'action.smashConfirm': '确认全部扔进垃圾桶？',
  'action.trash': '放入垃圾桶',
} as const

/** Same keys as `zh`; the `satisfies` keeps the two views in lockstep at compile time. */
export const en = {
  'action.backToWall': 'Back to wall',
  'action.clearTrash': 'Empty trash',
  'action.clearTrashConfirm': 'Confirm empty',
  'action.delete': 'Delete forever',
  'action.drag': 'Drag',
  'action.loadMore': 'Load more',
  'action.newNote': 'Note',
  'action.notebook': 'Notebook',
  'action.restore': 'Restore',
  'action.retry': 'Retry',
  'action.smash': 'Smash!',
  'action.smashConfirm': 'Move all to trash?',
  'action.trash': 'Move to trash',
} satisfies Record<keyof typeof zh, string>
