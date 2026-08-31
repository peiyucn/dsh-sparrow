/** dsh-nav-pin host half：纯客户端样式注入插件，宿主侧无功能。 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-nav-pin'
export const inject: string[] = []

/** 宿主侧空实现：全部行为在 client half（见 src/client/index.ts）。 */
export function apply(_ctx: Context): void {}
