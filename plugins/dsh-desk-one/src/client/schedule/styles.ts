/**
 * Schedule page CSS. The calendar page fits the panel: toolbar + one-line upcoming strip +
 * a month/week surface that stretches to the remaining height (no scrollbars). List and sources
 * pages scroll inside their own surface. Sub-pages (sources / detail) replace the calendar in-panel,
 * matching the notes-trash / task-archive navigation language.
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
.dsh-desk-schedule-range { font-size: 14px; font-weight: 600; min-width: 120px; }
.dsh-desk-schedule-viewtabs { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-viewtab {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-viewtab[data-active='true'] { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.dsh-desk-schedule-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.dsh-desk-schedule-synced { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); white-space: nowrap; }
.dsh-desk-schedule-chip {
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); background: transparent; color: inherit;
  font: inherit; font-size: 12px; line-height: 22px; padding: 0 8px; border-radius: 6px; cursor: pointer;
  display: inline-flex; align-items: center; text-decoration: none;
}
.dsh-desk-schedule-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-chip:disabled { opacity: .55; cursor: default; }
.dsh-desk-schedule-icon {
  border: 0; background: transparent; color: inherit; font-size: 18px; line-height: 22px;
  width: 24px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-icon:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-error { flex-basis: 100%; margin: 0; font-size: 12px; color: #c2410c; }
.dsh-desk-schedule-hint { margin: 8px 0; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-link { border: 0; background: transparent; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
.dsh-desk-schedule-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px;
}
.dsh-desk-schedule-empty p { margin: 0; }

/* one-line upcoming strip */
.dsh-desk-schedule-upcoming {
  flex: none; display: flex; align-items: center; gap: 4px 10px; min-width: 0;
  height: 28px; overflow: hidden;
  font-size: 12px;
}
.dsh-desk-schedule-upcoming-label { flex: none; font-weight: 600; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-upcoming-empty { color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-upcoming-item {
  display: flex; align-items: center; gap: 5px; min-width: 0; max-width: 33%;
  border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; padding: 2px 4px; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-upcoming-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-upcoming-day { flex: none; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-upcoming-time { flex: none; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-upcoming-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-upcoming .dsh-desk-schedule-link { margin-left: auto; flex: none; }
.dsh-desk-schedule-colorbar { display: inline-block; width: 3px; min-width: 3px; height: 13px; border-radius: 2px; }

/* calendar surface */
.dsh-desk-schedule-main {
  flex: 1; min-height: 0; display: flex;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: var(--dsw-radius-lg, 16px);
  overflow: hidden;
}

/* month: fills, never scrolls */
.dsh-desk-schedule-month { flex: 1; min-height: 0; display: flex; flex-direction: column; font-size: 11px; }
.dsh-desk-schedule-month-head { flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-month-head span { padding: 6px 8px; color: var(--dsw-alias-label-tertiary, #8a919f); font-weight: 600; }
.dsh-desk-schedule-month-body { flex: 1; min-height: 0; display: grid; }
.dsh-desk-schedule-month-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-height: 0; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-month-cell { min-height: 0; overflow: hidden; padding: 3px 5px; border-right: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); display: flex; flex-direction: column; gap: 1px; }
.dsh-desk-schedule-month-cell[data-outside='true'] { opacity: .45; }
.dsh-desk-schedule-month-cell[data-today='true'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 8%, transparent); }
.dsh-desk-schedule-month-day { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-month-events { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 1px; }
.dsh-desk-schedule-month-chip {
  display: flex; align-items: center; gap: 4px; min-width: 0; border: 0; background: transparent; color: inherit;
  font: inherit; font-size: 10px; text-align: left; padding: 1px 2px; border-radius: 4px; cursor: pointer;
}
.dsh-desk-schedule-month-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-month-chip > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-month-time { flex: none; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-more-count { font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); }

/* week: fills, never scrolls */
.dsh-desk-schedule-week { flex: 1; min-height: 0; display: flex; flex-direction: column; font-size: 11px; }
.dsh-desk-schedule-week-head { flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-week-day { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 0; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-week-day[data-today='true'] { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-schedule-week-allday {
  flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
  max-height: 52px; overflow: hidden; padding: 2px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-schedule-week-allday-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0 2px; overflow: hidden; }
.dsh-desk-schedule-week-allday-chip { display: flex; align-items: center; gap: 4px; min-width: 0; border: 0; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: inherit; font: inherit; font-size: 10px; padding: 2px 4px; cursor: pointer; overflow: hidden; }
.dsh-desk-schedule-week-allday-chip > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-week-body { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-week-col { position: relative; min-width: 0; border-left: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-week-hour { position: absolute; left: 0; right: 0; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-week-block {
  position: absolute; display: flex; flex-direction: column; gap: 1px; overflow: hidden;
  border: 0; border-left: 2px solid; border-radius: 4px; padding: 1px 3px; cursor: pointer;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 70%, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 8%);
  color: inherit; font: inherit; text-align: left; font-size: 9px; line-height: 12px;
}
.dsh-desk-schedule-week-block strong { font-weight: 600; }

/* list: scrolls inside the surface */
.dsh-desk-schedule-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
.dsh-desk-schedule-list-day h4 { margin: 8px 0 3px; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
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

/* event detail card (floating card, not a page: events are peeked, management is paged) */
.dsh-desk-schedule-detail-card {
  position: absolute; right: 16px; bottom: 16px; z-index: 6;
  width: min(360px, calc(100% - 32px)); max-height: 62%;
  box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px; font-size: 12px; overflow-y: auto;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, .18);
}
.dsh-desk-schedule-detail-card header { display: flex; align-items: center; gap: 7px; }
.dsh-desk-schedule-detail-card h3 { margin: 0; font-size: 13px; font-weight: 600; flex: 1; overflow-wrap: anywhere; }
.dsh-desk-schedule-detail-card dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; }
.dsh-desk-schedule-detail-card dt { color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-detail-card dd { margin: 0; }
.dsh-desk-schedule-detail-desc { white-space: pre-wrap; }
.dsh-desk-schedule-detail-card footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-desk-schedule-readonly { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); }

/* sources page (in-panel, not a modal) */
.dsh-desk-schedule-sources-page { display: flex; flex-direction: column; gap: 16px; max-width: 620px; }
.dsh-desk-schedule-connection-card {
  display: flex; flex-direction: column; gap: 8px; font-size: 12px;
  padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.dsh-desk-schedule-connection-card header { display: flex; align-items: center; gap: 8px; }
.dsh-desk-schedule-connection-card h3 { margin: 0; font-size: 13px; }
.dsh-desk-schedule-connection-status { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-connection-status[data-error='true'] { color: #c2410c; }
.dsh-desk-schedule-connection-card label { display: flex; flex-direction: column; gap: 4px; }
.dsh-desk-schedule-connection-card input {
  font: inherit; padding: 6px 8px; border-radius: 6px; color: inherit;
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); background: transparent;
}
.dsh-desk-schedule-provider { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-provider.is-wecom { background: #2f8d5b; }
.dsh-desk-schedule-provider.is-icloud { background: #4a90d9; }
.dsh-desk-schedule-provider.is-outlook { background: #2f6fd0; }
.dsh-desk-schedule-form-note { margin: 0; color: var(--dsw-alias-label-tertiary, #8a919f); font-size: 11px; }
.dsh-desk-schedule-form-ok { margin: 0; color: #2f8d5b; }
.dsh-desk-schedule-form-actions { display: flex; gap: 8px; align-items: center; }
.dsh-desk-schedule-source { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; font-size: 12px; }
.dsh-desk-schedule-calendar { display: flex; align-items: center; gap: 6px; }
.dsh-desk-schedule-colorbutton {
  width: 12px; height: 12px; min-width: 12px; padding: 0; border: 0; border-radius: 50%;
  cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.14);
}
.dsh-desk-schedule-calendar-toggle {
  flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; border: 0; background: transparent;
  color: inherit; font: inherit; font-size: 12px; text-align: left; padding: 2px; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-calendar-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-calendar[data-hidden='true'] { opacity: .45; }
.dsh-desk-schedule-calendar[data-hidden='true'] .dsh-desk-schedule-colorbutton { background: var(--dsw-alias-label-tertiary, #8a919f) !important; }
.dsh-desk-schedule-calendar-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-calendar-count { margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); }

@container (max-width: 760px) {
  .dsh-desk-schedule-upcoming-item { max-width: 45%; }
  .dsh-desk-schedule-actions { width: 100%; margin-left: 0; justify-content: flex-end; }
}
`
