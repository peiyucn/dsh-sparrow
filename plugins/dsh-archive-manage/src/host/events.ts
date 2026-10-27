/** 补官方 session-controller 公开事件的类型（本插件 emit 用；运行时由宿主事件总线处理）。 */

import type { SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * 官方 session-controller 公开事件（@mode emit，见 dsh-api-session-controller types.ts）：
     * 会话离开宿主时客户端会话列表据此即时移除条目。移入回收站/删除成功后会话目录已移走，
     * 补发此事件让侧边栏「未分组」等列表立即同步（2026-08-30 修复残留条目）。
     */
    'api-session/removed'(sessionId: SessionId): void
    /** 官方公开事件：会话回到列表（载荷形状对齐官方 SessionSummary 的插件可用子集，见 dsh-api-session-controller types.ts）。 */
    'api-session/added'(summary: { sessionId: SessionId; updatedAt: number; running: boolean; blank: boolean; parentSessionId?: SessionId; origin?: 'subagent'; cwd?: string; agentAvailable: boolean }): void
  }
}
