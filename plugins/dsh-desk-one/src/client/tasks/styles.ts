

import { TASK_ARCHIVE_CSS } from './styles/archive.js'
import { TASK_BOARD_CSS } from './styles/board.js'
import { TASK_CARD_CSS } from './styles/card.js'
import { TASK_DRAG_CSS } from './styles/drag.js'
import { TASK_GROUP_CSS } from './styles/group.js'


const TASK_AREAS = [TASK_BOARD_CSS, TASK_CARD_CSS, TASK_DRAG_CSS, TASK_GROUP_CSS, TASK_ARCHIVE_CSS]

export const TASKS_CSS = `\n${TASK_AREAS.map(area => area.replace(/^\n+/u, '').replace(/\n+$/u, '')).join('\n')}\n\n`
