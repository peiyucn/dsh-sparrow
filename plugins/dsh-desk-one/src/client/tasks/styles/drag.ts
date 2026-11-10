/** Drag ghosts: the card clone that follows the pointer. */

export const TASK_DRAG_CSS = `
/* Ghost card that follows the pointer while dragging. */
.dsh-task-ghost {
  box-sizing: border-box;
  opacity: 0.94;
  transform: scale(1.02);
  box-shadow: 0 14px 32px -16px rgba(20, 25, 40, 0.5);
  cursor: grabbing;
}
`
