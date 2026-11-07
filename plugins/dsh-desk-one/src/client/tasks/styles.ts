/** Task board CSS: toolbar, lanes, groups, cards, drag ghost, archive list and due warnings. */

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
  /* No horizontal scrollbar: below the threshold the lanes switch to their compact form. */
  overflow: hidden;
}
/* Lanes are equal columns; the header stays put while the card list scrolls (scrollbars hidden). */
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
/* Card: the whole card is the drag handle; inputs keep their own gestures. */
.dsh-task-card {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px 4px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-left: 3px solid #787774;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 1px 2px rgba(20, 25, 40, 0.05);
  cursor: grab;
  touch-action: none;
}
.dsh-task-card[data-dragging='true'] {
  opacity: 0.45;
  cursor: grabbing;
}
.dsh-task-card[data-due-soon='true'] {
  border-color: #d9a441;
  box-shadow: 0 1px 2px rgba(20, 25, 40, 0.05), inset 0 0 0 1px color-mix(in srgb, #d9a441 55%, transparent);
}
.dsh-task-card[data-overdue='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 55%, transparent);
}
.dsh-task-card[data-color='default'] { border-left-color: #787774; }
.dsh-task-card[data-color='yellow'] { border-left-color: #c29343; }
.dsh-task-card[data-color='green'] { border-left-color: #548164; }
.dsh-task-card[data-color='blue'] { border-left-color: #487ca5; }
.dsh-task-card[data-color='pink'] { border-left-color: #b35488; }
/* View mode: card text is plain, non-selectable text so the whole card stays a grab surface.
   Textareas/inputs only exist while editing and re-enable selection. */
.dsh-task-card {
  user-select: none;
}
.dsh-task-card textarea,
.dsh-task-card input {
  user-select: text;
}
.dsh-task-text {
  cursor: text;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dsh-task-body-empty {
  opacity: 0.6;
}
/* Auto-growing textareas: wrapping text, never a scrollbar inside the card. */
.dsh-task-title {
  box-sizing: border-box;
  width: 100%;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-task-body {
  box-sizing: border-box;
  width: 100%;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 17px;
}
.dsh-task-body::placeholder {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  opacity: 0.65;
}
.dsh-task-foot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  margin-top: 2px;
}
.dsh-task-color-pop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: -4px;
  z-index: 20;
  display: flex;
  gap: 7px;
  padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 10px 26px -14px rgba(20, 25, 40, 0.45);
}
.dsh-task-color-swatch {
  appearance: none;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.dsh-task-color-swatch[data-color='default'] { background: #787774; }
.dsh-task-color-swatch[data-color='yellow'] { background: #c29343; }
.dsh-task-color-swatch[data-color='green'] { background: #548164; }
.dsh-task-color-swatch[data-color='blue'] { background: #487ca5; }
.dsh-task-color-swatch[data-color='pink'] { background: #b35488; }
.dsh-task-color-swatch[data-active='true'] {
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #ffffff), 0 0 0 3.5px rgba(55, 53, 47, 0.55);
}
/* Linked sessions: chips carry their state as tint + border (no separate status dot). */
.dsh-task-sessions {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 2px;
}
.dsh-task-session-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
/* The @ entry starts its own line so it never reads as another chip of the linked row. */
.dsh-task-session-addrow {
  display: flex;
  align-items: center;
  min-height: 16px;
}
.dsh-task-session {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  padding: 1px 2px 1px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-task-session[data-state='running'] {
  border-color: color-mix(in srgb, #2e9e5b 45%, transparent);
  background: color-mix(in srgb, #2e9e5b 12%, var(--dsw-alias-bg-layer-1, #ffffff));
  color: color-mix(in srgb, #1d6b3f 72%, var(--dsw-alias-label-secondary, #6b7280));
}
.dsh-task-session[data-state='idle'] {
  border-color: color-mix(in srgb, var(--dsw-alias-label-secondary, #6b7280) 18%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 88%, var(--dsw-alias-label-primary, #1f2329));
}
.dsh-task-session[data-state='loading'] {
  border-color: color-mix(in srgb, #d9a441 45%, transparent);
  background: color-mix(in srgb, #d9a441 12%, var(--dsw-alias-bg-layer-1, #ffffff));
}
.dsh-task-session[data-state='archived'],
.dsh-task-session[data-state='unavailable'] {
  border-color: color-mix(in srgb, var(--dsw-alias-label-tertiary, #8a919f) 28%, transparent);
  border-style: dashed;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-session[data-state='unavailable'] {
  opacity: 0.65;
}
.dsh-task-session-title {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.dsh-task-session-title:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-session-remove {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
  opacity: 0.55;
}
.dsh-task-session-remove:hover {
  opacity: 1;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-task-session-remove svg {
  width: 9px;
  height: 9px;
}
.dsh-task-session-add {
  appearance: none;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  cursor: pointer;
}
.dsh-task-session-add:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-session-pop {
  /* Body portal: left/top/width/max-height come from useAnchoredPanel. */
  position: fixed;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 12px 30px -16px rgba(20, 25, 40, 0.5);
}
.dsh-task-session-search {
  box-sizing: border-box;
  width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  outline: none;
}
.dsh-task-session-list {
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  scrollbar-width: none;
}
.dsh-task-session-list::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.dsh-task-session-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
}
.dsh-task-session-option[data-state='running'] {
  border-color: color-mix(in srgb, #2e9e5b 34%, transparent);
  background: color-mix(in srgb, #2e9e5b 9%, transparent);
}
.dsh-task-session-option[data-state='loading'] {
  border-color: color-mix(in srgb, #d9a441 34%, transparent);
  background: color-mix(in srgb, #d9a441 9%, transparent);
}
.dsh-task-session-option[data-state='archived'],
.dsh-task-session-option[data-state='unavailable'] {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--dsw-alias-label-tertiary, #8a919f) 26%, transparent);
}
.dsh-task-session-option:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-task-session-option[aria-pressed='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 10%, transparent);
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-session-option:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh-task-session-option-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-task-session-option-state {
  flex: none;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-session-empty {
  margin: 4px 2px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-color {
  appearance: none;
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
/* Stacked colour card: current colour front, palette neighbours fanned out behind. */
.dsh-task-color-layer {
  position: absolute;
  top: 3px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-task-color-layer[data-depth='2'] {
  transform: translate(4px, -3px);
  opacity: 0.5;
}
.dsh-task-color-layer[data-depth='1'] {
  transform: translate(2px, -1.5px);
  opacity: 0.75;
}
.dsh-task-color-layer[data-depth='0'] {
  z-index: 1;
}
.dsh-task-color-layer[data-color='default'] { background: #787774; }
.dsh-task-color-layer[data-color='yellow'] { background: #c29343; }
.dsh-task-color-layer[data-color='green'] { background: #548164; }
.dsh-task-color-layer[data-color='blue'] { background: #487ca5; }
.dsh-task-color-layer[data-color='pink'] { background: #b35488; }
/* Due date: a calendar icon does the labelling; the bare date never stands alone. */
.dsh-task-due {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  padding: 1px 2px;
  margin-left: -2px;
  border-radius: var(--dsw-radius-xs, 4px);
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-task-due:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-task-due-icon {
  flex: none;
  width: 12px;
  height: 12px;
}
.dsh-task-due[data-set='true'] {
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-task-due:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-due-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-task-due[data-soon='true'] {
  color: #a97b1f;
  font-weight: 500;
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
/* Ghost card that follows the pointer while dragging. */
.dsh-task-ghost {
  box-sizing: border-box;
  opacity: 0.94;
  transform: scale(1.02);
  box-shadow: 0 14px 32px -16px rgba(20, 25, 40, 0.5);
  cursor: grabbing;
}
/* Draft card: an empty title cancels instead of creating an empty task. */
.dsh-task-draft {
  flex: none;
  padding: 8px 10px;
  border: 1px dashed var(--dsw-alias-border-l2, #cfd4dc);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
}
/* One-level groups inside a lane: a bordered container so a group reads as a real block. */
.dsh-task-group {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
  padding: 6px 8px 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 82%, var(--dsw-alias-label-primary, #1f2329));
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dsh-task-group[data-over='true'] {
  border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 74%, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 35%, transparent);
}
.dsh-task-group[data-dragging='true'] {
  opacity: 0.45;
}
.dsh-task-group-head {
  display: grid;
  grid-template-columns: 16px 18px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 4px;
  row-gap: 1px;
  align-items: center;
  min-height: 28px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm, 8px);
}
.dsh-task-group-head:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
/* Two-row header: row 1 = name, row 2 = count; grip / chevron / actions span both rows. */
.dsh-task-group-head > .dsh-task-group-grip {
  grid-column: 1;
  grid-row: 1 / span 2;
}
.dsh-task-group-head > .dsh-task-add {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.dsh-task-group-main {
  grid-column: 3;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dsh-task-group-title {
  display: flex;
  align-items: center;
  min-width: 0;
}
.dsh-task-group-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 14px;
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-group-meta .dsh-task-count {
  margin-left: 0;
  font-size: 11px;
  white-space: nowrap;
}
.dsh-task-group-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 16px;
  height: 22px;
  margin-left: -2px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: grab;
  opacity: 0.45;
  transition: opacity 0.12s ease;
}
.dsh-task-group-head:hover .dsh-task-group-grip {
  opacity: 0.95;
}
.dsh-task-group-grip:active {
  cursor: grabbing;
}
/* Whole-group drag: the cloned group block follows the pointer, exactly like a card ghost. */
.dsh-task-group-ghost {
  position: fixed;
  box-sizing: border-box;
  opacity: 0.96;
  pointer-events: none;
  box-shadow: 0 18px 40px -20px rgba(20, 25, 40, 0.55);
}
.dsh-task-group-grip svg {
  display: block;
  width: 8px;
  height: 14px;
}
.dsh-task-group-name {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 2px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: text;
}
.dsh-task-group-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 1px 4px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  outline: none;
}
.dsh-task-group-actions {
  grid-column: 4;
  grid-row: 1 / span 2;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
/* Compact group header icons: match each other and stay quieter than the lane buttons. */
.dsh-task-iconbtn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--dsw-radius-xs, 4px);
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-task-iconbtn svg {
  display: block;
  width: 14px;
  height: 14px;
}
.dsh-task-iconbtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-task-iconbtn-danger[data-confirm='true'] {
  color: var(--dsw-alias-state-error-primary, #c62828);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 10%, transparent);
}
.dsh-task-group-head:hover .dsh-task-group-actions {
  opacity: 1;
}
.dsh-task-group-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
}
.dsh-task-group-empty {
  margin: 4px 2px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-group-new {
  padding: 2px 2px 0;
}
/* Compact lanes: count-only columns for narrow panels (replaces a horizontal scrollbar). */
.dsh-task-lane[data-compact='true'] {
  padding: 8px;
}
.dsh-task-compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.dsh-task-compact-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-task-compact-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-task-compact-count {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-variant-numeric: tabular-nums;
}
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
`
