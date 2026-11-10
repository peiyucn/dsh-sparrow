/** Notes feature CSS: wall, sticky card, bottom actions, trash view and Smash animation. */

export const NOTES_CSS = `
/* Inside the notes tab: wall / trash; the bottom-right corner is left to the floating action group. */
/* Inside the notes tab: wall / trash, filling the whole available area (no blank reserved for the floating buttons anymore). */

/* Wall: fixed width, vertically infinite; the wall owns scrolling, so notes may sit below the viewport.
   No backdrop (owner 2026-11-06: a backdrop looks dirty and shrinks the interaction area); keep the page's clean base. */
.dsh-desk-wall {
  position: relative;
  width: 100%;
  max-width: 100%;
  z-index: 0; /* Establishes a stacking context: however large a note's z, it only compares inside the wall, so buttons always cover them. */
  flex: 1;
  min-height: 0;
  /* Fixed width, vertically infinite canvas: notes may live below the viewport and the wall
     scrolls to them. Horizontal overflow stays clipped so the width never changes. */
  overflow-x: hidden;
  overflow-y: auto;
}
/* Faint hint centered on an empty wall: two tiers (main + secondary), colors kept very light so it never competes with notes. */
.dsh-desk-wall::-webkit-scrollbar-track {
  /* Official conversation-scroll trick: only the top is pushed below the header; the bottom
     keeps a 2px inset so the thumb can still reach the last row. */
  margin: calc(var(--dsh-desk-header-h) + 2px) 2px 2px;
  background: transparent;
}
.dsh-desk-wall-canvas {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: calc(100% - var(--dsh-desk-header-h));
  margin-top: var(--dsh-desk-header-h);
}
.dsh-desk-wall-tip {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 0 16px;
  text-align: center;
  pointer-events: none;
  user-select: none;
}
.dsh-desk-wall-tip-main {
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 26%, transparent);
}
.dsh-desk-wall-tip-sub {
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 16%, transparent);
}
.dsh-desk-wall-hint {
  position: absolute;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 16px;
  text-align: center;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  pointer-events: none;
}
/* Sticky: the notes wall's basic unit. Real sticky notes are square-cornered paper, so no large radii
   and no gradients. Palette follows Notion's light-mode background swatches (low saturation, warm neutrals); text uses Notion ink #37352F. */
.dsh-desk-note {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  border: 1px solid rgba(55, 53, 47, 0.08);
  border-radius: 2px;
  background-color: #f4f1ea;
  color: #37352f;
  box-shadow: 0 1px 1px rgba(24, 28, 40, 0.05), 0 6px 16px -10px rgba(24, 28, 40, 0.28);
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: box-shadow 0.14s ease;
}
.dsh-desk-note:hover {
  box-shadow: 0 2px 4px rgba(24, 28, 40, 0.07), 0 14px 26px -16px rgba(24, 28, 40, 0.4);
}
.dsh-desk-note:active {
  cursor: grabbing;
}
/* Dragging a sticky tilts it slightly — the physical-paper cue the task board deliberately lacks. */
.dsh-desk-note[data-dragging='true'] {
  transform: rotate(-1.4deg);
  box-shadow: 0 10px 26px -12px rgba(24, 28, 40, 0.45);
  cursor: grabbing;
  z-index: 100000;
}
/* Paper color is the same hue as the Notion dark color tag at medium depth (one step lighter than the tag,
   one step darker than the old paper): the paper says "this is a note", the tag says "which color this is". */
.dsh-desk-note[data-color='default'] { background-color: #e4e0d9; }
.dsh-desk-note[data-color='yellow'] { background-color: #e9d3a3; }
.dsh-desk-note[data-color='green'] { background-color: #bccebb; }
.dsh-desk-note[data-color='blue'] { background-color: #b8cad8; }
.dsh-desk-note[data-color='pink'] { background-color: #e0c0ce; }
.dsh-desk-note-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  margin-bottom: 2px;
}
/* Drag affordance: compact six-dot grip (2 columns × 3 rows, 2px dots, 2px gaps), always visible at low
   contrast and slightly clearer on hover. No text, no background block; everything outside the body is draggable, this only hints "grab here". */
.dsh-desk-note-grip {
  flex: none;
  display: grid;
  grid-template-columns: repeat(2, 2px);
  grid-template-rows: repeat(3, 2px);
  gap: 2px;
  color: rgba(55, 53, 47, 0.26);
  cursor: grab;
  transition: color 0.12s ease;
}
.dsh-desk-note-grip i {
  display: block;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
}
.dsh-desk-note:hover .dsh-desk-note-grip {
  color: rgba(55, 53, 47, 0.5);
}
.dsh-desk-note:active .dsh-desk-note-grip {
  cursor: grabbing;
}
.dsh-desk-note-colors {
  display: flex;
  gap: 5px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-colors,
.dsh-desk-note:focus-within .dsh-desk-note-colors {
  opacity: 1;
}
/* Swatches: Notion's dark text colors (#C29343 / #548164 / #487CA5 / #B35488 / #787774), whose hue stays
   clear at small sizes; same hue as the paper, one step darker, forming the "paper + tag" layering. */
.dsh-desk-dot {
  appearance: none;
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.dsh-desk-dot:hover {
  transform: scale(1.12);
}
.dsh-desk-dot[data-color='default'] { background: #787774; }
.dsh-desk-dot[data-color='yellow'] { background: #c29343; }
.dsh-desk-dot[data-color='green'] { background: #548164; }
.dsh-desk-dot[data-color='blue'] { background: #487ca5; }
.dsh-desk-dot[data-color='pink'] { background: #b35488; }
.dsh-desk-dot[data-active='true'] {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 3px rgba(55, 53, 47, 0.55);
}
/* Small icon on the sticky (trash): stays deep ink so it reads under both light and dark themes. */
.dsh-desk-note-action {
  color: rgba(55, 53, 47, 0.55);
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-action,
.dsh-desk-note:focus-within .dsh-desk-note-action {
  opacity: 1;
}
.dsh-desk-note-action:hover {
  background: rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.92);
}
.dsh-desk-note-created {
  flex: none;
  align-self: flex-start;
  margin-top: 2px;
  color: rgba(55, 53, 47, 0.34);
  font-size: 10px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  cursor: default;
  user-select: none;
}
.dsh-desk-note-body {
  box-sizing: border-box;
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  overflow: auto;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 21px;
  cursor: text;
}
.dsh-desk-note-body::placeholder {
  color: rgba(55, 53, 47, 0.3);
}
/* Bottom-right resize: hit area enlarged to 26px (easy to grab) while the visible corner stays two minimal thin lines (drawn on a pseudo-element). */
.dsh-desk-note-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 26px;
  height: 26px;
  cursor: nwse-resize;
  touch-action: none;
}
.dsh-desk-note-resize::after {
  content: '';
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid rgba(55, 53, 47, 0.32);
  border-bottom: 1.5px solid rgba(55, 53, 47, 0.32);
  border-bottom-right-radius: 1px;
  opacity: 0;
  transition: opacity 0.12s ease, border-color 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-resize::after,
.dsh-desk-note:focus-within .dsh-desk-note-resize::after {
  opacity: 1;
}
.dsh-desk-note-resize:hover::after {
  border-color: rgba(55, 53, 47, 0.6);
}
/* Smash animation: stickies fly upward and fade out one after another; persistence runs once, after the animation ends. */
@keyframes dsh-desk-smash-out {
  from { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
  to { opacity: 0; transform: translateY(-16px) rotate(-4deg) scale(0.94); }
}
.dsh-desk-note-smashing {
  animation: dsh-desk-smash-out 260ms ease-in forwards;
  pointer-events: none;
}
/* Trash: the second view inside the notes wall (enter / return through the bottom-right icon). */
.dsh-desk-trash {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* Reserve the floating buttons' height at the end of the list so the last row is not covered. */
  padding-bottom: 88px;
}
.dsh-desk-trash-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-trash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-trash-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #787774;
}
.dsh-desk-trash-dot[data-color='default'] { background: #787774; }
.dsh-desk-trash-dot[data-color='yellow'] { background: #c29343; }
.dsh-desk-trash-dot[data-color='green'] { background: #548164; }
.dsh-desk-trash-dot[data-color='blue'] { background: #487ca5; }
.dsh-desk-trash-dot[data-color='pink'] { background: #b35488; }
.dsh-desk-trash-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
.dsh-desk-trash-meta {
  flex: none;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}

`
