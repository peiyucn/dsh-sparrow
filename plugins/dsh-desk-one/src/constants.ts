

export const PACKAGE_NAME = 'dsh-desk-one'


export const PREFIX = '/api/desk-one'


export const ROUTES = Object.freeze({
  notes: `${PREFIX}/notes`,
  noteUpdate: `${PREFIX}/notes/update`,
  noteDelete: `${PREFIX}/notes/delete`,
  tasks: `${PREFIX}/tasks`,
  taskUpdate: `${PREFIX}/tasks/update`,
  taskDelete: `${PREFIX}/tasks/delete`,
  groups: `${PREFIX}/groups`,
  groupUpdate: `${PREFIX}/groups/update`,
  groupMove: `${PREFIX}/groups/move`,
  groupArchive: `${PREFIX}/groups/archive`,
  groupDelete: `${PREFIX}/groups/delete`,

  scheduleEvents: `${PREFIX}/schedule/events`,
  scheduleCalendars: `${PREFIX}/schedule/calendars`,
  scheduleCalendarUpdate: `${PREFIX}/schedule/calendars/update`,
  scheduleStatus: `${PREFIX}/schedule/status`,
  scheduleSync: `${PREFIX}/schedule/sync`,
  notebookState: `${PREFIX}/notebook/state`,
  notebookRoot: `${PREFIX}/notebook/root`,
  notebookOpen: `${PREFIX}/notebook/open`,
  notebookOpenById: `${PREFIX}/notebook/open-by-id`,
  notebookSearch: `${PREFIX}/notebook/search`,
  notebookList: `${PREFIX}/notebook/list`,
  notebookDraft: `${PREFIX}/notebook/draft`,
  notebookBaseline: `${PREFIX}/notebook/baseline`,
  notebookFile: `${PREFIX}/notebook/file`,
  notebookHistory: `${PREFIX}/notebook/history`,
  notebookReviewSessions: `${PREFIX}/notebook/review-sessions`,
  scheduleConnectionSave: `${PREFIX}/schedule/connections/save`,
  scheduleConnectionTest: `${PREFIX}/schedule/connections/test`,
  scheduleConnectionRemove: `${PREFIX}/schedule/connections/remove`,
  scheduleSubscriptionAdd: `${PREFIX}/schedule/subscriptions/add`,
  scheduleSubscriptionRemove: `${PREFIX}/schedule/subscriptions/remove`,
  scheduleOutlookLoginStart: `${PREFIX}/schedule/outlook/login/start`,
  scheduleOutlookLoginPoll: `${PREFIX}/schedule/outlook/login/poll`,
  scheduleOutlookDisconnect: `${PREFIX}/schedule/outlook/disconnect`,
  scheduleOutlookCallback: `${PREFIX}/schedule/outlook/callback`,
  })


export const PANEL_ID = 'desk-one'

export const PANEL_IDS = {
  schedule: 'desk-one-schedule',
  notebook: 'desk-one-notebook',
  notes: 'desk-one-notes',
  tasks: 'desk-one-tasks',
  sessions: 'desk-one-sessions',
} as const

export const PANEL_ORDER = 30
export const LOCALE_NAMESPACE = 'desk-one' as const


export const DOMAIN_NAME = 'desk_one'
export const DOMAIN_VERSION = 1

export const NODES_TABLE = 'nodes'

export const EDGES_TABLE = 'edges'


export const DESK_NODE_SCHEMA = 1


export const MAX_BODY_BYTES = 64 * 1024
export const MAX_TITLE_CHARS = 200
export const MAX_BODY_CHARS = 20_000
export const MAX_QUERY_CHARS = 100

export const MAX_GROUP_CHARS = 80

export const MAX_TASK_SESSIONS = 10



export const NOTEBOOK_MAX_FILES = 20_000
export const NOTEBOOK_MAX_DEPTH = 12
export const NOTEBOOK_SCAN_TIMEOUT_MS = 20_000

export const NOTEBOOK_MAX_BYTES = 1_048_576

export const NOTEBOOK_MAX_DRAFTS = 100

export const NOTEBOOK_MAX_REVIEW_SESSIONS = 500

export const NOTEBOOK_MAX_REVIEW_BASELINES = 200

export const NOTEBOOK_BASELINE_MAX_CHARS = NOTEBOOK_MAX_BYTES


export const NOTEBOOK_WRITE_BODY_BYTES = NOTEBOOK_MAX_BYTES * 4

export const NOTEBOOK_HISTORY_WARN_BYTES = 2 * 1024 * 1024

export const NOTEBOOK_CONFIG_ID = 'notebook_config'

export const MAX_ACTIVE_NOTES = 100
export const MAX_TRASH_NOTES = 200

export const TRASH_PAGE_SIZE = 10


export const NOTE_COLORS = ['default', 'yellow', 'green', 'blue', 'pink'] as const


export const TASK_STATUSES = ['todo', 'doing', 'done'] as const




export const SCHEDULE_PROVIDERS = ['wecom', 'icloud', 'outlook', 'ics'] as const
export type ScheduleProvider = (typeof SCHEDULE_PROVIDERS)[number]

export const SCHEDULE_CHANNELS = ['caldav', 'ics', 'graph'] as const
export type ScheduleChannel = (typeof SCHEDULE_CHANNELS)[number]


export const SCHEDULE_COLORS = [
  '#5b8def', '#e2695b', '#4fa86b', '#c98a2e', '#8a6fd1', '#3fa6a0', '#c25b8c', '#7a8a99',
] as const


export const SCHEDULE_PAST_MONTHS = 6
export const SCHEDULE_FUTURE_MONTHS = 3

export const SCHEDULE_SYNC_INTERVAL_MS = 15 * 60_000

export const SCHEDULE_REQUEST_TIMEOUT_MS = 45_000

export const SCHEDULE_SYNC_TIMEOUT_MS = 180_000

export const SCHEDULE_TEST_TIMEOUT_MS = 90_000

export const SCHEDULE_MAX_EVENTS = 5_000

export const SCHEDULE_UPCOMING_MAX_DAYS = 14

export const SCHEDULE_UPCOMING_DEFAULT_DAYS = 6

export const SCHEDULE_LIST_DAYS = 30


export const WECOM_PASSWORD_REF = 'DESK_ONE_WECOM_CALDAV_PASSWORD'
export const ICLOUD_PASSWORD_REF = 'DESK_ONE_ICLOUD_CALDAV_PASSWORD'
export const OUTLOOK_ICS_URL_REF = 'DESK_ONE_OUTLOOK_ICS_URL'
export const OUTLOOK_GRAPH_REFRESH_REF = 'DESK_ONE_OUTLOOK_GRAPH_REFRESH_TOKEN'
export const OUTLOOK_GRAPH_CLIENT_ID = '4d2de5ae-e112-41f5-944e-b17f5136836a'
export const OUTLOOK_GRAPH_TENANT = 'common'
export const OUTLOOK_GRAPH_SCOPE = 'https://graph.microsoft.com/Calendars.ReadWrite offline_access openid profile User.Read'


export const SCHEDULE_VIEW_STORAGE_KEY = 'dsh-desk-one:schedule-view-v2'
export const SCHEDULE_HIDDEN_STORAGE_KEY = 'dsh-desk-one:schedule-hidden-calendars'


export const NOTE_DEFAULT_WIDTH = 208
export const NOTE_DEFAULT_HEIGHT = 168
export const NOTE_MIN_WIDTH = 152
export const NOTE_MIN_HEIGHT = 100
export const NOTE_MAX_SIZE = 2000

export const NOTE_MAX_POSITION = 100000


export const SESSION_INDEX_TTL_MS = 5 * 60_000
export const SESSION_INDEX_MISSING_DAYS = 30


export const SESSION_STREAM_PAGE_SIZE = 10

export const TAB_STORAGE_KEY = 'dsh-desk-one:tab'

export const TASK_SORT_STORAGE_KEY = 'dsh-desk-one:task-sort'

export const TASK_GROUPS_STORAGE_KEY = 'dsh-desk-one:task-groups'

export const TASK_GROUP_COLLAPSE_STORAGE_KEY = 'dsh-desk-one:task-group-collapsed'

export const TASK_BOARD_COMPACT_WIDTH = 720


export const REQUEST_TIMEOUT_MS = 10_000


export const STYLE_SELECTOR = 'style[data-dsh-desk-one]'
