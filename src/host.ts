/**
 * dsh-sparrow — 麻雀虽小,五脏俱全。
 * host 半:每个功能一个模块(FIM 转发、归档会话管理…),官方支持后退役对应模块。
 */

export const name = 'dsh-sparrow'

export const inject = ['tools']

interface ToolDef {
  name: string
  description: string
  parameters: unknown
  execute: () => Promise<{ ok: boolean; message: string }>
}

interface SparrowCtx {
  tools: { register: (def: ToolDef, label?: string) => unknown }
}

export function apply(ctx: SparrowCtx) {
  console.log('[dsh-sparrow] host loaded — 麻雀虽小,五脏俱全')
  // M1 将注册 session_archive 工具(归档会话查看/恢复),M2 将注册 FIM 转发路由。
  ctx.tools.register({
    name: 'sparrow',
    description: 'dsh-sparrow 插件集合状态:查看已启用的模块。',
    parameters: { type: 'object', properties: {}, required: [] },
    async execute() {
      return {
        ok: true,
        message: 'dsh-sparrow 已启用模块:骨架(即将加入:M1 归档会话管理 / M2 FIM 补全)',
      }
    },
  })
}
