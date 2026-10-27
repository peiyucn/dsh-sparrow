/**
 * 设置卡入口（槽位注册用的导出名保持不变）：表单实现拆到 ./CodeBuddyProviderCard.tsx，
 * 官方行头 DOM seam 集中在 ./settings-row.ts。保留此文件是为了不改 client/index 的引用。
 */

export { CodeBuddyProviderCard as CodeBuddyCreditsCard } from './CodeBuddyProviderCard.js'
