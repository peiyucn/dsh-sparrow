/** Archive view rows plus the floating session preview / expanded chip. */

export const TASK_ARCHIVE_CSS = `
/* Archive view: same row anatomy as the notes trash. */
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
.dsh-task-archive-count {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-variant-numeric: tabular-nums;
}
.dsh-task-archive-group-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-task-archive-group-icon svg {
  display: block;
  width: 14px;
  height: 14px;
}
/* Session preview: a floating layer that visually continues the chip. It never participates
   in card layout, so expanding cannot squeeze the board. */
/* Expanded chip: grows in place, capped by the card width, pushing card height as needed. */
/* Expanded chip: grow to the card width, never past it (border-box keeps padding inside). */
.dsh-task-session[data-expanded='true'] {
  box-sizing: border-box;
  flex: 1 1 100%;
  align-items: flex-start;
  width: auto;
  min-width: 0;
  max-width: 100%;
  padding: 3px 4px 4px 8px;
  border-radius: 10px;
}
.dsh-task-session[data-expanded='true']::before {
  border-radius: 12px;
}
.dsh-task-session[data-expanded='true'] .dsh-task-session-title {
  flex: 1;
  max-width: none;
}
/* Details live inside the chip, inheriting its status tint; compact 2-column grid. */
.dsh-task-session-preview {
  box-sizing: border-box;
  display: flex;
  flex-basis: 100%;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin-top: 3px;
  padding: 3px 2px 1px 0;
  color: inherit;
  font-size: 10px;
  line-height: 15px;
  animation: dsh-task-session-expand 0.12s ease-out;
}
.dsh-task-session-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}
.dsh-task-session-preview-token {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.dsh-task-session-preview-token b {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dsh-task-session-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}
/* Label above value: the value gets the full column width and never needs an ellipsis. */
.dsh-task-session-preview-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
}
.dsh-task-session-preview-label {
  opacity: 0.5;
  font-size: 9px;
  line-height: 12px;
  white-space: nowrap;
}
.dsh-task-session-preview-stat b {
  max-width: 100%;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-task-session-preview-enter {
  appearance: none;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  opacity: 0.62;
  cursor: pointer;
}
.dsh-task-session-preview-enter:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
  opacity: 1;
}
.dsh-task-session-preview-enter svg {
  display: block;
  width: 14px;
  height: 14px;
}
.dsh-task-session-preview-enter:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
@keyframes dsh-task-session-expand {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-task-session-preview { animation: none; }
}
@keyframes dsh-task-session-expand {
  from { opacity: 0; transform: translateY(-2px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-task-session-preview { animation: none; }
}
@keyframes dsh-task-session-expand {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-task-session-preview { animation: none; }
}
`
