/**
 * Pointer-drag helpers shared by card and whole-group gestures: ghost construction, fixed
 * placement, and the per-gesture text-selection lock.
 */

/** Copy live input values into a cloned node (cloneNode keeps attributes, not DOM properties). */
function copyFieldValues(source: HTMLElement, clone: HTMLElement): void {
  const sources = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  const copies = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  sources.forEach((field, index) => {
    const copy = copies[index]
    if (copy !== undefined) copy.value = field.value
  })
}

/** Build a pointer-following ghost from the real card (values copied; original stays dimmed). */
export function createCardGhost(card: HTMLElement): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-ghost')
  ghost.removeAttribute('data-task-id')
  copyFieldValues(card, ghost)
  return ghost
}

/** Whole-group ghost: the header + its cards move together, exactly like a card. */
export function createGroupGhost(group: HTMLElement): HTMLElement {
  const ghost = group.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-group-ghost')
  ghost.removeAttribute('data-dragging')
  ghost.querySelectorAll<HTMLElement>('[data-group-id]').forEach(node => node.removeAttribute('data-group-id'))
  copyFieldValues(group, ghost)
  return ghost
}

/** Pin a ghost to the viewport at the drag's starting rectangle. */
export function placeGhost(ghost: HTMLElement, left: number, top: number, width: number): void {
  ghost.style.position = 'fixed'
  ghost.style.left = `${left}px`
  ghost.style.top = `${top}px`
  ghost.style.width = `${width}px`
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '9999'
}

/**
 * Suppress native text selection while a pointer drag is possible. Because clicks must still
 * work (field editing / double-click rename), this is applied per gesture and always restored.
 */
export function lockSelection(): () => void {
  const previous = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  window.getSelection()?.removeAllRanges()
  let released = false
  return () => {
    if (released) return
    released = true
    document.body.style.userSelect = previous
  }
}
