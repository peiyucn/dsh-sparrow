

export const name = 'dsh-chat-fim'
export const PACKAGE_NAME = '@dsh-sparrow/dsh-chat-fim'
export const LOCALE_NAMESPACE = 'chat-fim'


export const COMPLETE_ROUTE_PATH = '/api/chat-fim/complete'


export const SLOT_INPUT_LEFT = 'conversation.input.left'
export const SLOT_INPUT_DOCK = 'conversation.input.dock'
export const SLOT_INPUT_OVERLAY = 'conversation.input.overlay'
export const SLOT_ORDER = 30
export const SWITCH_SLOT_ID = 'chat-fim-switch'
export const DOCK_SLOT_ID = 'chat-fim'
export const MENU_SLOT_ID = 'chat-fim-menu'


export const ENABLED_STORAGE_KEY = 'dsh-chat-fim:enabled'
export const SENSITIVITY_STORAGE_KEY = 'dsh-chat-fim:sensitivity'


export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const SUPPORT_CHECK_TIMEOUT_MS = 5_000


export const DEFAULT_MAX_BODY_BYTES = 64 * 1024


export const ECHO_USER_PREFIX_CHARS = 10
export const ECHO_ASSISTANT_WINDOW_CHARS = 15


export const RING_MEASURE_INTERVAL_MS = 300


export const RING_THICKNESS = 2


export const MENU_MAX_HEIGHT = 400


export const MENU_Z_INDEX = 100
export const RING_Z_INDEX = 900
export const POPOVER_Z_INDEX = 1100


export const MAX_DIAGNOSTIC_SESSIONS = 256


export const FIM_SUPPORT_UNKNOWN_RETRY_MS = 500
export const FIM_SUPPORT_UNKNOWN_RETRY_FACTOR = 2
export const FIM_SUPPORT_UNKNOWN_RETRIES = 5


export const STYLE_ATTR = 'data-dsh-chat-fim'
export const STYLE_SELECTOR = `style[${STYLE_ATTR}]`
