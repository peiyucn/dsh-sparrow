/**
 * Schedule page CSS. Layout contract:
 *  - calendar page = toolbar + upcoming card + calendar card; month/week fill the remaining height
 *  - week grid: 8 hours per screen (inner = 300% of the viewport), anchored on the current time
 *  - sources page replaces the calendar in-panel (management is paged, like the notes trash)
 *  - event detail is a floating card anchored at the click position, closed by outside click / Esc
 */

export const SCHEDULE_CSS = `
.dsh-desk-schedule {
  container-type: inline-size;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 8px) 16px 14px;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-schedule-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: calc(var(--dsh-desk-header-h) + 10px) 20px 18px;
  box-sizing: border-box;
}
.dsh-desk-schedule-pagehead { display: flex; align-items: center; gap: 10px; }
.dsh-desk-schedule-pagehead h2 { margin: 0; font-size: 15px; font-weight: 600; }

/* toolbar */
.dsh-desk-schedule-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
  padding-bottom: 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-schedule-nav { display: flex; align-items: center; gap: 6px; }
.dsh-desk-schedule-range {
  font-size: 14px; font-weight: 600; width: 168px; flex: none;
  display: inline-flex; align-items: center; height: 24px; line-height: 24px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-desk-schedule-viewtabs { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-viewtab {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-viewtab[data-active='true'] { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.dsh-desk-schedule-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.dsh-desk-schedule-synced { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); white-space: nowrap; }
.dsh-desk-schedule-chip {
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); background: transparent; color: inherit;
  font: inherit; font-size: 12px; height: 24px; padding: 0 8px; border-radius: 6px; cursor: pointer;
  display: inline-flex; align-items: center; text-decoration: none;
}
.dsh-desk-schedule-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-chip:disabled { opacity: .55; cursor: default; }
.dsh-desk-schedule-icon {
  border: 0; background: transparent; color: inherit; font-size: 16px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-icon svg { display: block; }
.dsh-desk-schedule-icon:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-error { flex-basis: 100%; margin: 0; font-size: 12px; color: #c2410c; }
.dsh-desk-schedule-hint { margin: 8px 0; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-graph-login { display: inline-flex; align-items: center; gap: 6px; }
.dsh-desk-schedule-link { border: 0; background: transparent; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
.dsh-desk-schedule-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px;
}
.dsh-desk-schedule-empty p { margin: 0; }

/* top row: Today (left) + Upcoming (right), equal width, calendar takes the rest */
.dsh-desk-schedule-top {
  flex: none; display: grid; gap: 8px; height: 150px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.dsh-desk-schedule-upcoming {
  height: 100%; overflow: hidden;
}
.dsh-desk-schedule-today {
  box-sizing: border-box; height: 100%; min-width: 0; display: flex; flex-direction: column; gap: 4px;
  padding: 7px 10px 8px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-radius: var(--dsw-radius-lg, 16px);
  overflow: hidden;
}
.dsh-desk-schedule-today > header { display: flex; align-items: baseline; gap: 8px; }
.dsh-desk-schedule-today > header h3 { margin: 0; font-size: 13px; font-weight: 600; }
.dsh-desk-schedule-today > header span { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); }
/* Left = today's events, right = clickable counts, divided by a hairline. */
.dsh-desk-today-split { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.85fr); gap: 8px; }
.dsh-desk-today-events { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.dsh-desk-today-subhead { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-today-events ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
.dsh-desk-today-event {
  display: flex; align-items: center; gap: 5px; width: 100%; min-width: 0; border: 0; background: transparent;
  color: inherit; font: inherit; font-size: 11px; padding: 2px 3px; border-radius: 5px; cursor: pointer; text-align: left;
}
.dsh-desk-today-event:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-today-event-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-today-stats {
  min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px;
  padding-left: 8px; border-left: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-today-stat {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 11px; line-height: 16px; text-align: left; padding: 3px 4px;
  border-radius: 5px; cursor: pointer;
}
.dsh-desk-today-stat:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-today-actions { display: flex; align-items: center; gap: 5px; margin-top: auto; flex-wrap: wrap; }
.dsh-desk-today-actions .dsh-desk-action { height: 26px; padding: 0 8px; font-size: 11px; gap: 2px; border-radius: 8px; }

/** Compact switch shared by the management page. */
.dsh-desk-switch {
  flex: none; width: 26px; height: 15px; padding: 0; border: 0; border-radius: 999px; position: relative; cursor: pointer;
  background: var(--dsw-alias-border-l2, #cfd4dc); transition: background .15s ease;
}
.dsh-desk-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.22); transition: left .15s ease;
}
.dsh-desk-switch[data-on='true'] { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-switch[data-on='true']::after { left: 13px; }
.dsh-desk-schedule-upcoming {
  height: 100%; min-height: 0; box-sizing: border-box; padding: 7px 10px 8px;
  display: flex; flex-direction: column; gap: 3px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: var(--dsw-radius-lg, 16px);
}
.dsh-desk-schedule-upcoming header {
  display: flex; align-items: center; justify-content: space-between; flex: none;
  font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #6b7280);
}
/* Range slider: pick how many days ahead the upcoming card covers. */
.dsh-desk-upcoming-range { flex: none; display: flex; align-items: center; gap: 8px; }
.dsh-desk-upcoming-range input[type='range'] { flex: 1; min-width: 0; height: 4px; accent-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); cursor: pointer; }
.dsh-desk-upcoming-range-label { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); white-space: nowrap; }
.dsh-desk-schedule-upcoming ul { flex: 1; min-height: 0; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; overflow: auto; }
.dsh-desk-schedule-upcoming-item {
  display: flex; align-items: center; gap: 7px; width: 100%; min-width: 0;
  border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px;
  padding: 3px 4px; border-radius: 6px; cursor: pointer; text-align: left;
}
.dsh-desk-schedule-upcoming-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-upcoming-day { flex: none; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-upcoming-time { flex: none; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-upcoming-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-colorbar { display: inline-block; width: 3px; min-width: 3px; height: 13px; border-radius: 2px; }

/* calendar surface */
.dsh-desk-schedule-main {
  flex: 1; min-height: 0; display: flex;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: var(--dsw-radius-lg, 16px);
  overflow: hidden;
}

/* month: fills, never scrolls; wheel switches month */
.dsh-desk-schedule-month { flex: 1; min-height: 0; display: flex; flex-direction: column; font-size: 11px; }
.dsh-desk-schedule-month-head { flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-month-head span { padding: 6px 8px; color: var(--dsw-alias-label-tertiary, #8a919f); font-weight: 600; }
.dsh-desk-schedule-month-head span[data-weekend='true'] { color: #c2410c; }
.dsh-desk-schedule-month-body { flex: 1; min-height: 0; display: grid; }
.dsh-desk-schedule-month-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-height: 0; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-month-cell { min-height: 0; overflow: hidden; padding: 3px 5px; border-right: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); display: flex; flex-direction: column; gap: 1px; }
.dsh-desk-schedule-month-cell[data-weekend='true'] { background: color-mix(in srgb, #f59e0b 4%, transparent); }
.dsh-desk-schedule-month-cell[data-outside='true'] { opacity: .45; }
.dsh-desk-schedule-month-cell[data-today='true'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 8%, transparent); }
.dsh-desk-schedule-month-day {
  align-self: flex-start; flex: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 11px; width: 18px; height: 16px; border-radius: 50%; cursor: pointer; padding: 0;
}
.dsh-desk-schedule-month-day:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.08)); }
.dsh-desk-schedule-month-cell[data-weekend='true'] .dsh-desk-schedule-month-day { color: #c2410c; }
.dsh-desk-schedule-month-cell[data-today='true'] .dsh-desk-schedule-month-day { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); color: #fff; }
.dsh-desk-schedule-month-events { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 1px; }
.dsh-desk-schedule-month-chip {
  display: flex; align-items: center; gap: 4px; min-width: 0; border: 0; background: transparent; color: inherit;
  font: inherit; font-size: 10px; text-align: left; padding: 1px 2px; border-radius: 4px; cursor: pointer;
}
.dsh-desk-schedule-month-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-month-chip > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-month-time { flex: none; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-more-count {
  align-self: flex-start; border: 0; background: transparent; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  font: inherit; font-size: 10px; padding: 0 2px; cursor: pointer; border-radius: 4px;
}
.dsh-desk-schedule-more-count:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }

/* week: 8h per screen, inner canvas = 24h (300% of the viewport) */
.dsh-desk-schedule-week { flex: 1; min-height: 0; display: flex; flex-direction: column; font-size: 11px; }
.dsh-desk-schedule-week-head { flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-week-day { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 0; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-week-day[data-weekend='true'] { color: #c2410c; }
.dsh-desk-schedule-week-day[data-today='true'] { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-schedule-week-allday {
  flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
  max-height: 52px; overflow: hidden; padding: 2px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-schedule-week-allday-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0 2px; overflow: hidden; }
.dsh-desk-schedule-week-allday-chip { display: flex; align-items: center; gap: 4px; min-width: 0; border: 0; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: inherit; font: inherit; font-size: 10px; padding: 2px 4px; cursor: pointer; overflow: hidden; }
.dsh-desk-schedule-week-allday-chip > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-week-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.dsh-desk-schedule-week-inner { position: relative; height: 300%; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-week-col { position: relative; min-width: 0; border-left: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-week-col[data-weekend='true'] { background: color-mix(in srgb, #f59e0b 4%, transparent); }
.dsh-desk-schedule-week-hour { position: absolute; left: 0; right: 0; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-week-now { position: absolute; left: 0; right: 0; height: 0; border-top: 1.5px solid #e5484d; z-index: 3; }
.dsh-desk-schedule-week-now::before { content: ''; position: absolute; left: -3px; top: -4px; width: 6px; height: 6px; border-radius: 50%; background: #e5484d; }
.dsh-desk-schedule-week-block {
  position: absolute; display: flex; flex-direction: column; gap: 1px; overflow: hidden;
  border: 0; border-left: 2px solid; border-radius: 4px; padding: 1px 3px; cursor: pointer;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 70%, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 8%);
  color: inherit; font: inherit; text-align: left; font-size: 9px; line-height: 12px;
}
.dsh-desk-schedule-week-block strong { font-weight: 600; }

/* list: scrolls inside the surface */
.dsh-desk-schedule-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
.dsh-desk-schedule-list-day { padding: 2px 4px 6px; border-radius: 10px; }
.dsh-desk-schedule-list-day[data-today='true'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 6%, transparent); }
.dsh-desk-schedule-list-day h4 {
  margin: 8px 0 4px; padding-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #6b7280);
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-schedule-list-day[data-today='true'] h4 { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-schedule-list-day h4[data-weekend='true'] { color: #c2410c; }
.dsh-desk-schedule-row {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: 0; background: transparent; color: inherit; font: inherit; padding: 4px 2px; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-row-time { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); min-width: 40px; }
.dsh-desk-schedule-row-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-row-cal { margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-conflict { width: 14px; height: 14px; border-radius: 50%; background: #f59e0b; color: #fff; font-size: 10px; line-height: 14px; text-align: center; }
.dsh-desk-schedule-more { margin: 8px auto; display: block; border: 0; background: transparent; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); font: inherit; font-size: 12px; cursor: pointer; }

/* event detail: fixed card anchored at the click point (not a page) */
.dsh-desk-schedule-detail-card {
  position: fixed; z-index: 50; box-sizing: border-box;
  max-height: 70vh; display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px; font-size: 12px; overflow-y: auto;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: 10px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, .22);
}
.dsh-desk-schedule-detail-card header { display: flex; align-items: center; gap: 7px; }
.dsh-desk-schedule-detail-card h3 {
  margin: 0; font-size: 13px; font-weight: 600; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-desk-schedule-detail-source { margin: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); overflow-wrap: anywhere; }
.dsh-desk-schedule-detail-card dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; }
.dsh-desk-schedule-detail-card dt { color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-detail-card dd { margin: 0; }
.dsh-desk-schedule-detail-desc { white-space: pre-wrap; max-height: 96px; overflow-y: auto; }
.dsh-desk-schedule-detail-card footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 2px; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-readonly { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); }

/* sources page (in-panel, not a modal) */
.dsh-desk-schedule-sources-page { display: flex; flex-direction: column; gap: 16px; max-width: 620px; }
.dsh-desk-schedule-connection-card {
  display: flex; flex-direction: column; gap: 8px; font-size: 12px;
  padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.dsh-desk-schedule-form-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
.dsh-desk-schedule-connection-card header { display: flex; align-items: center; gap: 8px; }
.dsh-desk-schedule-connection-card h3 { margin: 0; font-size: 13px; }
.dsh-desk-schedule-connection-status {
  margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-schedule-connection-status[data-error='true'] { color: #c2410c; }
.dsh-desk-schedule-connection-card label { display: flex; flex-direction: column; gap: 4px; }
.dsh-desk-schedule-connection-card input {
  font: inherit; padding: 6px 8px; border-radius: 6px; color: inherit;
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); background: transparent;
}
.dsh-desk-schedule-form-note { margin: 0; color: var(--dsw-alias-label-tertiary, #8a919f); font-size: 11px; }
.dsh-desk-schedule-form-ok { margin: 0; color: #2f8d5b; }
.dsh-desk-schedule-form-actions { display: flex; gap: 8px; align-items: center; }
.dsh-desk-schedule-source {
  display: flex; flex-direction: column; gap: 2px; padding: 10px 0 2px; font-size: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-schedule-statusdot {
  width: 8px; height: 8px; min-width: 8px; border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #b8bec8);
}
.dsh-desk-schedule-statusdot[data-on='true'] { background: #2f9e5b; }
.dsh-desk-schedule-connection-count { font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); margin-left: 6px; }
.dsh-desk-schedule-connection-form { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-subscription { display: flex; flex-direction: column; gap: 2px; padding: 8px 0 4px; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-subscription:first-of-type { border-top: 0; }
.dsh-desk-schedule-subscription-head { display: flex; align-items: center; gap: 6px; padding-bottom: 2px; }
.dsh-desk-schedule-subscription-head .dsh-desk-schedule-link { margin-left: auto; font-size: 11px; }
.dsh-desk-schedule-mgmt-row {
  display: flex; align-items: center; gap: 7px; min-width: 0; padding: 6px 2px;
  border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-schedule-mgmt-row:first-of-type { border-top: 0; }
.dsh-desk-schedule-mgmt-row[data-off='true'] .dsh-desk-schedule-mgmt-name { color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-mgmt-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dsh-desk-schedule-mgmt-count { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-mgmt-label { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); margin-left: 6px; }
.dsh-desk-schedule-sync-hint { margin: 0 0 4px; font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-colorbutton {
  width: 12px; height: 12px; min-width: 12px; padding: 0; border: 0; border-radius: 50%;
  cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.14);
}

@container (max-width: 760px) {
  .dsh-desk-schedule-actions { width: 100%; margin-left: 0; justify-content: flex-end; }
}
@container (max-width: 900px) {
  /* Keep the two top cards side by side even in a narrow panel; only tighten the right column. */
  .dsh-desk-schedule-top { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.dsh-desk-schedule-steps { margin: 6px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-steps summary { cursor: pointer; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-steps ol { margin: 6px 0 0 18px; padding: 0; }
`
