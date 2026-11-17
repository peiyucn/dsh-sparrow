


export const LEGACY_1017_TEXT = '1017'


const BADGE_PROVIDER_IDS: readonly string[] = ['deepseek-official', 'deepseek-account']


const BADGE_MODEL_ID = 'deepseek-flash'


const BADGE_MODEL_NAME = 'DeepSeek-V4.1-Flash'


export function showsLegacy1017Badge(providerId: string, modelId: string, modelName: string): boolean {
  return BADGE_PROVIDER_IDS.includes(providerId)
    && modelId === BADGE_MODEL_ID
    && modelName === BADGE_MODEL_NAME
}
