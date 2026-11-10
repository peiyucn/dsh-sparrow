/** Board shell, lane columns/headers and drop indicators. */

export const TASK_BOARD_CSS = `
/* Board shell: fills the tab content area; narrow panels switch lanes to their compact form. */
.dsh-desk-tasksview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
  padding: calc(var(--dsh-desk-header-h) + 14px) 28px 8px;
}
.dsh-task-lanes {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  /* No horizontal scrollbar: below the threshold the lanes switch to their compact form. */
  overflow: hidden;
}
/* Lanes are equal columns; the header stays put while the card list scrolls with a thin scrollbar. */
.dsh-task-lane {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px 10px 8px;
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
/* Lane names read as compact section labels: uppercase Latin, tracked, bold and brand-coloured. */
.dsh-task-lane-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
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
  padding: 0;
  border-radius: var(--dsw-radius-xs, 4px);
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-task-lane-head .dsh-task-add:first-of-type {
  margin-left: auto;
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
  gap: 8px;
  padding: 2px;
  /* Visible thin scrollbar when a lane overflows a screen, so content scrolls instead of squeezing. */
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 24%, transparent) transparent;
  scrollbar-gutter: stable;
}
.dsh-task-list::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dsh-task-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 24%, transparent);
  background-clip: content-box;
}
.dsh-task-list::-webkit-scrollbar-track {
  background: transparent;
}
.dsh-task-archive {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 24%, transparent) transparent;
}
.dsh-task-archive::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dsh-task-archive::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 24%, transparent);
  background-clip: content-box;
}
.dsh-task-lane[data-collapsed='true'] .dsh-task-list {
  flex: none;
}
/* Unified lane sequence: each top-level block is an ungrouped card or one group. */
.dsh-task-block {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
/* Insertion line sits above the child card/group background, otherwise its top edge covers it. */
.dsh-task-block[data-drop='true']::before {
  content: '';
  position: absolute;
  z-index: 3;
  left: 2px;
  right: 2px;
  top: -1px;
  height: 2px;
  border-radius: 1px;
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  pointer-events: none;
}
.dsh-task-block-dropend {
  flex: none;
  height: 2px;
  margin: 0 2px;
  border-radius: 1px;
  background: transparent;
}
.dsh-task-block-dropend[data-active='true'] {
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
}
/* Precise insertion line for card drags (before a card / after the last one). */
.dsh-task-card-dropmark {
  flex: none;
  height: 2px;
  margin: 1px 2px;
  border-radius: 2px;
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 16%, transparent);
}
.dsh-task-empty {
  margin: 12px 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
`
