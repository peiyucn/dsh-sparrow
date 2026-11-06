/** Task board CSS: toolbar, lanes, cards, archive list and drag feedback. */

export const TASKS_CSS = `
/* Board shell: fills the tab content area; lanes scroll horizontally on narrow panels. */
.dsh-desk-tasksview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
  padding-bottom: 8px;
}
.dsh-task-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.dsh-task-sort {
  display: flex;
  align-items: center;
  gap: 2px;
}
.dsh-task-tool {
  appearance: none;
  border: none;
  background: transparent;
  padding: 3px 8px;
  border-radius: var(--dsw-radius-sm, 8px);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.dsh-task-tool:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-task-tool[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-lanes {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
}
/* Lanes are equal columns; the lane header stays put while its card list scrolls. */
.dsh-task-lane {
  flex: 1 1 0;
  min-width: 220px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: var(--dsw-radius-lg, 16px);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 90%, var(--dsw-alias-label-primary, #1f2329));
}
.dsh-task-lane[data-over='true'] {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 45%, transparent);
}
.dsh-task-lane-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-task-count {
  margin-left: 2px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-add {
  appearance: none;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0;
  border-radius: var(--dsw-radius-xs, 4px);
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-task-add + .dsh-task-add {
  margin-left: 0;
}
.dsh-task-add:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-add svg {
  display: block;
  width: 14px;
  height: 14px;
}
.dsh-task-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px;
}
.dsh-task-lane[data-collapsed='true'] .dsh-task-list {
  display: none;
}
.dsh-task-empty {
  margin: 12px 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
/* Card: paper-like surface; the left edge carries the task colour (reuses the note palette). */
.dsh-task-card {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 6px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-left: 3px solid #787774;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 1px 2px rgba(20, 25, 40, 0.05);
  cursor: grab;
  touch-action: none;
}
.dsh-task-card[data-dragging='true'] {
  opacity: 0.4;
  cursor: grabbing;
}
.dsh-task-card[data-color='default'] { border-left-color: #787774; }
.dsh-task-card[data-color='yellow'] { border-left-color: #c29343; }
.dsh-task-card[data-color='green'] { border-left-color: #548164; }
.dsh-task-card[data-color='blue'] { border-left-color: #487ca5; }
.dsh-task-card[data-color='pink'] { border-left-color: #b35488; }
.dsh-task-title {
  box-sizing: border-box;
  width: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-task-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
}
.dsh-task-colors {
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-task-card:hover .dsh-task-colors,
.dsh-task-card:focus-within .dsh-task-colors {
  opacity: 1;
}
.dsh-task-color {
  appearance: none;
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.dsh-task-color[data-color='default'] { background: #787774; }
.dsh-task-color[data-color='yellow'] { background: #c29343; }
.dsh-task-color[data-color='green'] { background: #548164; }
.dsh-task-color[data-color='blue'] { background: #487ca5; }
.dsh-task-color[data-color='pink'] { background: #b35488; }
.dsh-task-color[data-active='true'] {
  box-shadow: 0 0 0 1.5px var(--dsw-alias-bg-layer-1, #ffffff), 0 0 0 2.5px rgba(55, 53, 47, 0.45);
}
.dsh-task-due {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-task-due[data-empty='true'] {
  opacity: 0;
}
.dsh-task-card:hover .dsh-task-due[data-empty='true'],
.dsh-task-card:focus-within .dsh-task-due[data-empty='true'] {
  opacity: 1;
}
.dsh-task-due[data-overdue='true'] {
  color: var(--dsw-alias-state-error-primary, #c62828);
  font-weight: 500;
}
.dsh-task-due-input {
  width: 112px;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 11px;
}
.dsh-task-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-task-card:hover .dsh-task-actions,
.dsh-task-card:focus-within .dsh-task-actions {
  opacity: 1;
}
.dsh-desk-iconbtn-danger[data-confirm='true'] {
  color: var(--dsw-alias-state-error-primary, #c62828);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 10%, transparent);
}
/* Draft card: a bare input until the title is committed (empty titles cancel instead of saving). */
.dsh-task-draft {
  flex: none;
  padding: 8px 10px;
  border: 1px dashed var(--dsw-alias-border-l2, #cfd4dc);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
}
/* Archive view: same row anatomy as the notes trash. */
.dsh-task-archive {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.dsh-task-archive-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-task-archive-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-task-archive-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #787774;
}
.dsh-task-archive-dot[data-color='default'] { background: #787774; }
.dsh-task-archive-dot[data-color='yellow'] { background: #c29343; }
.dsh-task-archive-dot[data-color='green'] { background: #548164; }
.dsh-task-archive-dot[data-color='blue'] { background: #487ca5; }
.dsh-task-archive-dot[data-color='pink'] { background: #b35488; }
.dsh-task-archive-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
.dsh-task-archive-lane {
  flex: none;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
`
