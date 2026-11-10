/**
 * Constants shared by the plugin (both host and client halves may import them; no runtime dependencies allowed).
 * Values crossing requests / renders live here so the same semantics does not drift between host and client.
 */

export const PACKAGE_NAME = 'dsh-desk-one'

/** Route prefix: longer than the official `/api` fence, so this plugin does its own trust check (same approach as dsh-archive-manage). */
export const PREFIX = '/api/desk-one'

/** REST routes; S0 has notes only, S1 adds tasks (schedule / focus will be appended here without changing existing paths). */
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
  /* Schedule (S2, read-only aggregation) */
  scheduleEvents: `${PREFIX}/schedule/events`,
  scheduleCalendars: `${PREFIX}/schedule/calendars`,
  scheduleCalendarUpdate: `${PREFIX}/schedule/calendars/update`,
  scheduleStatus: `${PREFIX}/schedule/status`,
  scheduleSync: `${PREFIX}/schedule/sync`,
  scheduleConnections: `${PREFIX}/schedule/connections`,
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

/** Entry id: both the left-rail panel row id and the key of the center-column `main` slot (official `MainPanelId`). */
export const PANEL_ID = 'desk-one'
/** Left-rail row order: official plugins = 0, schedules = 10, archive-manage = 20; this plugin comes after them. */
export const PANEL_ORDER = 30
export const LOCALE_NAMESPACE = 'desk-one' as const

/** Storage domain: the domain and table names must both match the official `UNIT_NAME_RE` (`^[a-z][a-z0-9_]*$`). */
export const DOMAIN_NAME = 'desk_one'
export const DOMAIN_VERSION = 1
/**
 * Unified object table: all kinds (notes only in S0) share one table and are validated by record shape.
 * Adding a kind later only extends the schema, not the domain description — adding a table changes the backend
 * layout, and a published domain should not be changed again.
 */
export const NODES_TABLE = 'nodes'
/** Edge table declared before use: S0 writes no edges, but once the domain description ships it is unwise to add tables (adding a table changes the backend layout). */
export const EDGES_TABLE = 'edges'

/** Object-level schema version (per object, used for migrations). */
export const DESK_NODE_SCHEMA = 1

/** Write-route request body cap; going over means 400 instead of reading the whole payload into memory first. */
export const MAX_BODY_BYTES = 64 * 1024
export const MAX_TITLE_CHARS = 200
export const MAX_BODY_CHARS = 20_000
export const MAX_QUERY_CHARS = 100
/** Task group name length cap (one-level groups; the name is the group key). */
export const MAX_GROUP_CHARS = 80
/** Max sessions a single task card can link (the UI is a chips row; the cap keeps cards from being covered in them). */
export const MAX_TASK_SESSIONS = 10

/**
 * Product capacity caps (owner 2026-11-06): the note wall is for lightweight notes, and 100 already exceeds
 * human attention; the trash holds at most 200 and must be emptied first when full. Both halves share this truth.
 */
export const MAX_ACTIVE_NOTES = 100
export const MAX_TRASH_NOTES = 200
/** Trash view paging: render 10 rows at a time and load the rest on demand (less rendering is lighter). */
export const TRASH_PAGE_SIZE = 10

/** Note colors: unknown values are always rejected (the client palette and storage validation share this single truth). */
export const NOTE_COLORS = ['default', 'yellow', 'green', 'blue', 'pink'] as const

/** Task status: fixed three lanes, one-to-one with the board's three columns (custom lanes deferred, see spec 03). */
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const

/* ------------------------------ schedule ------------------------------ */

/** Schedule sources: three routes in v1, all read-only mirrors (see docs/spec/05-schedule.md). */
export const SCHEDULE_PROVIDERS = ['wecom', 'icloud', 'outlook', 'ics'] as const
export type ScheduleProvider = (typeof SCHEDULE_PROVIDERS)[number]
/** Access channels for the same provider: CalDAV (WeCom/iCloud) and ICS (Outlook publish link). */
export const SCHEDULE_CHANNELS = ['caldav', 'ics', 'graph'] as const
export type ScheduleChannel = (typeof SCHEDULE_CHANNELS)[number]

/** Calendar palette (8 colors): assigned in order on first sync, editable in the calendar source bar; event entries reuse the color. */
export const SCHEDULE_COLORS = [
  '#5b8def', '#e2695b', '#4fa86b', '#c98a2e', '#8a6fd1', '#3fa6a0', '#c25b8c', '#7a8a99',
] as const

/** Mirror window: past 6 months / next 3 months (recurring events expand into instances inside this window). */
export const SCHEDULE_PAST_MONTHS = 6
export const SCHEDULE_FUTURE_MONTHS = 3
/** Client polling / auto-sync interval: sync every 15 minutes while the panel stays open. */
export const SCHEDULE_SYNC_INTERVAL_MS = 15 * 60_000
/** External request timeout: CalDAV/ICS fetches are slower than ordinary REST, so the limit is relaxed separately. */
export const SCHEDULE_REQUEST_TIMEOUT_MS = 45_000
/** Timeout for the client's schedule sync / connection save calls: the first sync pulls .ics one by one and can far exceed a normal request. */
export const SCHEDULE_SYNC_TIMEOUT_MS = 180_000
/** Timeout for the client's "test connection" (discovery + listing calendars, no event fetch). */
export const SCHEDULE_TEST_TIMEOUT_MS = 90_000
/** Event cap per fetch (keeps an oversized shared calendar from overflowing storage). */
export const SCHEDULE_MAX_EVENTS = 5_000
/** Max selectable days for the "upcoming" slider (counting from tomorrow, minimum 1 day). */
export const SCHEDULE_UPCOMING_MAX_DAYS = 14
/** Default window for "upcoming" (counting from tomorrow). */
export const SCHEDULE_UPCOMING_DEFAULT_DAYS = 6
/** Days loaded at once in the list view (with on-demand "load more"). */
export const SCHEDULE_LIST_DAYS = 30

/** Credential reference names (`ctx.credentials` refs): only the names are stored; values live in the DSH credential store. */
export const WECOM_PASSWORD_REF = 'DESK_ONE_WECOM_CALDAV_PASSWORD'
export const ICLOUD_PASSWORD_REF = 'DESK_ONE_ICLOUD_CALDAV_PASSWORD'
export const OUTLOOK_ICS_URL_REF = 'DESK_ONE_OUTLOOK_ICS_URL'
export const OUTLOOK_GRAPH_REFRESH_REF = 'DESK_ONE_OUTLOOK_GRAPH_REFRESH_TOKEN'
export const OUTLOOK_GRAPH_CLIENT_ID = '4d2de5ae-e112-41f5-944e-b17f5136836a'
export const OUTLOOK_GRAPH_TENANT = 'common'
export const OUTLOOK_GRAPH_SCOPE = 'https://graph.microsoft.com/Calendars.ReadWrite offline_access openid profile User.Read'

/** Schedule UI preferences (pure UI state, no user content): view and calendar visibility. */
export const SCHEDULE_VIEW_STORAGE_KEY = 'dsh-desk-one:schedule-view-v2'
export const SCHEDULE_HIDDEN_STORAGE_KEY = 'dsh-desk-one:schedule-hidden-calendars'

/** Note geometry (px): default size plus drag-resize limits, shared as one truth by the model and the UI. */
export const NOTE_DEFAULT_WIDTH = 208
export const NOTE_DEFAULT_HEIGHT = 168
export const NOTE_MIN_WIDTH = 152
export const NOTE_MIN_HEIGHT = 100
export const NOTE_MAX_SIZE = 2000
/** Upper bound for vertical canvas coordinates: effectively infinite, still blocks corrupt data. */
export const NOTE_MAX_POSITION = 100000

/** Session index: refresh TTL and tombstone retention days (the index is just a foreign key; session content is not copied). */
export const SESSION_INDEX_TTL_MS = 5 * 60_000
export const SESSION_INDEX_MISSING_DAYS = 30

/** Per-section row cap for each render; "load more" advances by this amount. */
export const SESSION_STREAM_PAGE_SIZE = 30
/** Last tab visited (pure UI preference, no user content); switching away and back returns to the same tab. */
export const TAB_STORAGE_KEY = 'dsh-desk-one:tab'
/** Task board sort view preference (manual / created / due), pure UI state. */
export const TASK_SORT_STORAGE_KEY = 'dsh-desk-one:task-sort'
/** Task board group names (one name list per lane; groups are just the task's group field, the list is pure UI state). */
export const TASK_GROUPS_STORAGE_KEY = 'dsh-desk-one:task-groups'
/** Task board group collapse state (key = `${status}:${group}`, pure UI state). */
export const TASK_GROUP_COLLAPSE_STORAGE_KEY = 'dsh-desk-one:task-group-collapsed'
/** Below this task board container width the three lanes collapse into "count mode" (counts only, avoiding a horizontal scrollbar). */
export const TASK_BOARD_COMPACT_WIDTH = 720

/** Panel request timeout: keeps the panel from loading forever when the host hangs. */
export const REQUEST_TIMEOUT_MS = 10_000

/** Selector for the style tag marker attribute (HMR / repeated installs reuse the same element by it). */
export const STYLE_SELECTOR = 'style[data-dsh-desk-one]'
