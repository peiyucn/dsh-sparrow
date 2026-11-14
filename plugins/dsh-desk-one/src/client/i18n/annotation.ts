/** Locale fragment: the annotation landing page (批注). */

export const zh = {
  'annotation.count': '{count} 条',
  'annotation.createWorkspace': '新建工作区',
  'annotation.drafts': '批注草稿',
  'annotation.hint': '挑一个工作区里的 Markdown / 文本文件，逐行批注；批注会带着行号发进对话。',
  'annotation.loadFailed': '加载失败：{message}',
  'annotation.loading': '加载中…',
  'annotation.openFailed': '无法打开文件，稍后再试',
  'annotation.openFiles': '打开工作区文件',
  'annotation.records': '批注记录',
  'annotation.recent': '最近批注',
  'annotation.title': '批注',
  'annotation.workspaceHint': '批注对象是工作区里的文件。还没有工作区，先建一个（和官方「新建工作区」同一套流程）。',
} as const

/** Same keys as `zh`; the `satisfies` keeps the two views in lockstep at compile time. */
export const en = {
  'annotation.count': '{count} annotation(s)',
  'annotation.createWorkspace': 'New workspace',
  'annotation.drafts': 'Annotation drafts',
  'annotation.hint': 'Pick a Markdown or text file in a workspace and annotate lines; the annotations go into the conversation with their line numbers.',
  'annotation.loadFailed': 'Could not load: {message}',
  'annotation.loading': 'Loading…',
  'annotation.openFailed': 'Could not open the file; try again later',
  'annotation.openFiles': 'Open workspace files',
  'annotation.records': 'Submitted annotations',
  'annotation.recent': 'Recent annotations',
  'annotation.title': 'Annotations',
  'annotation.workspaceHint': 'Annotations live in workspace files. Create a workspace first (same flow as the official “New workspace”).',
} satisfies Record<keyof typeof zh, string>
