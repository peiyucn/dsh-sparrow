


export const SETTINGS_NAMESPACE = 'llm-codebuddy-credits'

export const PROVIDER_ID = 'codebuddy-credits'

export const DISPLAY_NAME = 'CodeBuddy Credits'

export const LOCALE_NAMESPACE = 'codebuddy-credits'

export const API_PREFIX = `/api/${PROVIDER_ID}`

export const CREDIT_PROJECTION_KEY = 'codebuddyCredits'

export const STYLE_SELECTOR = 'style[data-dsh-codebuddy-credits]'

export const MARK_FONT_PX = 18

export const MARK_COLLAPSE_PX = 656

export const API_KEY_ENV = 'CODEBUDDY_CREDITS_API_KEY'

export const LEGACY_API_KEY_ENV = 'CODEBUDDY_API_KEY'

export const CODEBUDDY_ORIGIN = 'https://copilot.tencent.com'

export const PROFILE_URL = `${CODEBUDDY_ORIGIN}/profile/`

export const BASE_URL = `${CODEBUDDY_ORIGIN}/v2`

export const CONFIG_URL = `${CODEBUDDY_ORIGIN}/v3/config`

export const ACCOUNTS_URL = `${CODEBUDDY_ORIGIN}/v2/accounts`

export const QUOTA_URL = `${CODEBUDDY_ORIGIN}/v2/billing/meter/get-enterprise-user-usage`

export const CLIENT_NAME = 'deepseek harness'

export const CLI_UA_MARKER = 'CLI/unknown'

export const CODEBUDDY_CLI_VERSION = '2.137.1'

export const REQUEST_USER_AGENT = `${CLIENT_NAME.replace(/ /g, '')} ${CLI_UA_MARKER} CodeBuddy/${CODEBUDDY_CLI_VERSION}`

export const FALLBACK_SYSTEM_PROMPT = 'You are a helpful assistant.'

export const PRODUCT_HEADER = 'SaaS'


export const STREAM_IDLE_TIMEOUT_MS = 300_000

export const MODEL_DISCOVERY_TIMEOUT_MS = 15_000

export const ACCOUNT_FETCH_TIMEOUT_MS = 5_000

export const QUOTA_FETCH_TIMEOUT_MS = 10_000

export const MODEL_REFRESH_COOLDOWN_MS = 60_000

export const IMAGE_FACTS_WAIT_MS = 1_000

export const DEFAULT_CONTEXT_WINDOW = 262_144

export const DEFAULT_MAX_TOKENS = 32_768

export const IMAGE_REQUEST_POLICY = {
  maxPixels: 2000 * 2000,
  maxBytes: 3_932_160,
} as const
