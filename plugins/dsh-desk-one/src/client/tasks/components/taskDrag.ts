


function copyFieldValues(source: HTMLElement, clone: HTMLElement): void {
  const sources = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  const copies = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  sources.forEach((field, index) => {
    const copy = copies[index]
    if (copy !== undefined) copy.value = field.value
  })
}


export function createCardGhost(card: HTMLElement): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-ghost')
  ghost.removeAttribute('data-task-id')
  copyFieldValues(card, ghost)
  return ghost
}


export function createGroupGhost(group: HTMLElement): HTMLElement {
  const ghost = group.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-group-ghost')
  ghost.removeAttribute('data-dragging')
  ghost.querySelectorAll<HTMLElement>('[data-group-id]').forEach(node => node.removeAttribute('data-group-id'))
  copyFieldValues(group, ghost)
  return ghost
}


export function placeGhost(ghost: HTMLElement, left: number, top: number, width: number): void {
  ghost.style.position = 'fixed'
  ghost.style.left = `${left}px`
  ghost.style.top = `${top}px`
  ghost.style.width = `${width}px`
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '9999'
}


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
