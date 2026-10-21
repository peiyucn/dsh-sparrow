/**
 * 流式输出期间的 DOM 变动判定（纯函数，无宿主依赖，便于单测）。
 *
 * 背景：流式输出时，对话内容每帧都有 childList 变动。此前实现里每一批变动都会触发
 * ①锚点扫描（全文档 `querySelectorAll`，成本**随会话 DOM 线性增长**：约 3.4K 节点 1.2ms、
 *   23K 节点 9.5ms）与 ②相位收敛重测（强制样式/布局、连续多帧）。长会话里这两笔叠到每帧
 *   渲染上，就是可感的掉帧；会话内容一收起（DOM 变小）就明显缓解 —— 正是 owner 观察到的现象。
 *
 * 但「对话内容」的变动不会改变 UI chrome 的锚点，也不会改变相位几何（相位只随左右栏/窗口
 * 尺寸/吸顶行这类**布局**变化），所以内容变动可以**推迟**到变动停止后再补测一次。
 */
export interface MutationSignal {
  /** 变动目标是否落在对话滚动容器内（= 消息内容渲染，不涉及 UI chrome）。 */
  readonly insideContent: boolean
  /** 新增 / 移除的节点里是否出现锚点依赖的 UI 元素（菜单 / 弹层 / 导航 / 输入卡 …）。 */
  readonly anchorLike: boolean
}

/** 一批变动是否「只是对话内容在流式渲染」——是则推迟探测，否则按原节奏立即处理。 */
export function isContentChurn(signals: readonly MutationSignal[]): boolean {
  return signals.length > 0 && signals.every(signal => signal.insideContent && !signal.anchorLike)
}

/** 一条变动里与判定有关的最小信息（由调用方从 `MutationRecord` 与 DOM 查询里提取）。 */
export interface RecordSignal {
  /** 变动目标落在对话内容容器内。 */
  readonly insideContent: boolean
  /** 增 / 删的节点里出现锚点类元素。 */
  readonly anchorLike: boolean
}

/**
 * {@link isContentChurn} 的**流式版**：按批逐条判定，**一发现反例立即返回 false**。
 *
 * 为什么单独提供：切会话 / 长流式一轮能有上百条 `MutationRecord`，调用方若先把整批映射成
 * `MutationSignal[]` 再 `every`，就会为「其实第二条就已经能定论」的批次白做完整映射
 * （每项一次数组分配 + 一次 `closest()`）。两者**语义等价**：都是
 * 「非空 且 每一条都 insideContent 且都不 anchorLike」。
 *
 * @param records 逐条信号；由调用方惰性提供（建议传生成器，避免预分配整批数组）。
 */
export function isContentChurnByRecords(records: Iterable<RecordSignal>): boolean {
  let seen = false
  for (const record of records) {
    seen = true
    if (!record.insideContent || record.anchorLike) return false
  }
  return seen
}
