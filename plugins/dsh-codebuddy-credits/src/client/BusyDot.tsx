/**
 * 本插件统一的**加载中**呈现：光秃秃一个官方转圈，**不带可见文字**。
 *
 * ## 为什么要有这个共享件
 *
 * owner 2026-09-30：「codebuddy 插件的额度卡片，现在还是 loading 纯文字，是不是也改成转圈？」
 * 查下来本插件有 **3 处**独立的纯文字 loading（额度卡片、账号行、配额行），文案键还不一样
 * （`picker.trigger.loading` / `indicator.loading`）。与其在三处各写一遍，
 * 不如一个组件统一 —— 顺带保证**新增第 4 处时不会再退回纯文字**。
 *
 * ## 为什么只有转圈、没有文字
 *
 * 与 `dsh-archive-manage` / `dsh-file-manage` 同一口径（2026-09-30 改判）：官方
 * `ui-primitives` 的 `StateDot(state="ongoing")` 共 8 处用法，**基本都是光秃秃一个转圈**
 * （替掉按钮/行里的图标那种用法）；唯一带可见文字的是 `LoadingIndicator`（文档读取专用），
 * 而且它写的是**具体动作**（如「正在读取」），不是通用的 loading。
 *
 * 文案不丢：挂在容器的 `aria-label` 上（官方 `LoadingIndicator` 也是 wrapper 带
 * `role` + `aria-label`、spinner 自身 `aria-hidden`），读屏器仍会念。
 *
 * ⚠️ 颜色**不覆盖**：官方 `.spinner` 自带 `--dsw-alias-label-tertiary`（中性灰），
 * 我们直接用它，既不是主色也没有彩色 —— 与面板那套「转圈改中性色」的结论一致。
 */
import type { ReactElement } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'

export interface BusyDotProps {
  /** 无障碍名称（读屏器念的内容）；**不渲染成可见文字**。 */
  readonly label: string
  /** 容器附加样式（各调用点的字号/行高语境不同，由调用方给）。 */
  readonly style?: React.CSSProperties
}

/** 一个官方转圈，居中占位的加载态。 */
export function BusyDot({ label, style }: BusyDotProps): ReactElement {
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', ...style }}
    >
      <StateDot state="ongoing" />
    </span>
  )
}
