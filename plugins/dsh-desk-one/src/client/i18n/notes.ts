/** Locale fragment: sticky-note wall, note cards and the trash view. */

export const zh = {
  'note.created': '创建于',
  'note.placeholder': '写点什么…',
  'trash.empty': '垃圾桶是空的',
  'trash.full': '垃圾桶满了，请先清空一下吧。',
  'trash.title': '垃圾桶',
  'trash.total': '共 {count} 个便签',
  'wall.askDesk': '「帮我记一条便签…」',
  'wall.full': '便签太多了，请先清理一下吧。',
  'wall.tip': '双击空白处新建便签',
  'wall.tipAlt': '或点击顶栏「+便签」，也可以直接对我说',
} as const

/** Same keys as `zh`; the `satisfies` keeps the two views in lockstep at compile time. */
export const en = {
  'note.created': 'Created',
  'note.placeholder': 'Write something…',
  'trash.empty': 'The trash is empty',
  'trash.full': 'The trash is full — empty it first.',
  'trash.title': 'Trash',
  'trash.total': '{count} notes in total',
  'wall.askDesk': '"Note this down: …"',
  'wall.full': 'Too many notes — clear some of them first.',
  'wall.tip': 'Double-click empty space',
  'wall.tipAlt': 'or click "+ Note" in the top bar, or just tell me',
} satisfies Record<keyof typeof zh, string>
