/**
 * Schedule page CSS. The page is a container: the three fixed areas are laid out by container
 * width (not viewport) so the panel adapts inside the conversation column.
 */

export const SCHEDULE_CSS = `
.dsh-desk-schedule {
  container-type: inline-size;
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  /* The panel header is a fixed 76px overlay; content must start below it. */
  padding: calc(var(--dsh-desk-header-h) + 10px) 16px 16px;
  color: var(--dsw-alias-label-primary, #1f2329);
}

.dsh-desk-schedule-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 4px 0 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
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
.dsh-desk-schedule-synced {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  white-space: nowrap;
}
.dsh-desk-schedule-chip {
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); background: transparent; color: inherit;
  font: inherit; font-size: 12px; line-height: 22px; padding: 0 8px; border-radius: 6px; cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center;
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

.dsh-desk-schedule-grid {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-areas: 'upcoming main sources';
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(200px, 240px);
  gap: 12px;
}
.dsh-desk-schedule-grid > * { min-height: 0; }

.dsh-desk-schedule-upcoming,
.dsh-desk-schedule-sources,
.dsh-desk-schedule-main {
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: var(--dsw-radius-lg, 16px);
  overflow: auto;
}
.dsh-desk-schedule-upcoming, .dsh-desk-schedule-sources { padding: 10px 12px; }
.dsh-desk-schedule-main { padding: 10px 14px; }

.dsh-desk-schedule-panelhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; font-size: 12px; font-weight: 600; }
.dsh-desk-schedule-dayblock { margin-bottom: 10px; }
.dsh-desk-schedule-dayblock h4, .dsh-desk-schedule-list-day h4 { margin: 6px 0 4px; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-upcoming-row, .dsh-desk-schedule-row {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: 0; background: transparent; color: inherit; font: inherit; padding: 4px 2px; border-radius: 6px; cursor: pointer;
}
.dsh-desk-schedule-upcoming-row:hover, .dsh-desk-schedule-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-colorbar { display: inline-block; width: 3px; min-width: 3px; height: 14px; border-radius: 2px; }
.dsh-desk-schedule-upcoming-time, .dsh-desk-schedule-row-time { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); min-width: 40px; }
.dsh-desk-schedule-upcoming-title, .dsh-desk-schedule-row-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-row-cal { margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-conflict { width: 14px; height: 14px; border-radius: 50%; background: #f59e0b; color: #fff; font-size: 10px; line-height: 14px; text-align: center; }
.dsh-desk-schedule-more { margin: 8px auto; display: block; border: 0; background: transparent; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); font: inherit; font-size: 12px; cursor: pointer; }

.dsh-desk-schedule-month { font-size: 11px; }
.dsh-desk-schedule-month-head, .dsh-desk-schedule-month-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-month-head span { padding: 4px 6px; color: var(--dsw-alias-label-tertiary, #8a919f); font-weight: 600; }
.dsh-desk-schedule-month-row { border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-month-cell { min-height: 86px; padding: 4px; border-right: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); display: flex; flex-direction: column; gap: 2px; }
.dsh-desk-schedule-month-cell[data-outside='true'] { opacity: .45; }
.dsh-desk-schedule-month-cell[data-today='true'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 8%, transparent); }
.dsh-desk-schedule-month-day { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-month-chip { display: flex; align-items: center; gap: 4px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 10px; text-align: left; padding: 1px 2px; border-radius: 4px; cursor: pointer; overflow: hidden; }
.dsh-desk-schedule-month-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-month-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-more-count { font-size: 10px; color: var(--dsw-alias-label-tertiary, #8a919f); }

.dsh-desk-schedule-week { display: flex; flex-direction: column; font-size: 11px; }
.dsh-desk-schedule-week-head { display: grid; grid-template-columns: 44px repeat(7, minmax(0, 1fr)); }
.dsh-desk-schedule-week-gutter { display: flex; flex-direction: column; justify-content: space-between; color: var(--dsw-alias-label-tertiary, #8a919f); font-size: 10px; }
.dsh-desk-schedule-week-head > .dsh-desk-schedule-week-gutter { height: 30px; }
.dsh-desk-schedule-week-day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 2px 0; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-week-day[data-today='true'] { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-schedule-week-allday { display: grid; grid-template-columns: 44px repeat(7, minmax(0, 1fr)); border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); padding: 3px 0; }
.dsh-desk-schedule-week-allday-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0 2px; }
.dsh-desk-schedule-week-allday-chip { display: flex; align-items: center; gap: 4px; border: 0; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: inherit; font: inherit; font-size: 10px; padding: 2px 4px; cursor: pointer; overflow: hidden; }
.dsh-desk-schedule-week-body { display: grid; grid-template-columns: 44px repeat(7, minmax(0, 1fr)); overflow: auto; }
.dsh-desk-schedule-week-body > .dsh-desk-schedule-week-gutter { height: ${24 * 32}px; }
.dsh-desk-schedule-week-col { position: relative; border-left: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-week-hour { position: absolute; left: 0; right: 0; border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); }
.dsh-desk-schedule-week-block {
  position: absolute; display: flex; flex-direction: column; gap: 1px; overflow: hidden;
  border: 0; border-left: 2px solid; border-radius: 4px; padding: 2px 4px; cursor: pointer;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 70%, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 8%);
  color: inherit; font: inherit; text-align: left; font-size: 10px;
}
.dsh-desk-schedule-week-block strong { font-weight: 600; }

.dsh-desk-schedule-source { margin-bottom: 10px; }
.dsh-desk-schedule-source h4 { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); font-weight: 600; }
.dsh-desk-schedule-source-account { font-weight: 400; color: var(--dsw-alias-label-tertiary, #8a919f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-desk-schedule-source-error { margin-left: auto; font-size: 10px; color: #c2410c; }
.dsh-desk-schedule-source-errornote {
  margin: 2px 0 6px;
  font-size: 11px;
  line-height: 15px;
  color: #c2410c;
  overflow-wrap: anywhere;
}
.dsh-desk-schedule-provider { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-provider.is-wecom { background: #2f8d5b; }
.dsh-desk-schedule-provider.is-icloud { background: #4a90d9; }
.dsh-desk-schedule-provider.is-outlook { background: #2f6fd0; }
.dsh-desk-schedule-calendar {
  display: flex; align-items: center; gap: 6px; width: 100%; font-size: 12px; padding: 2px 0;
}
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

.dsh-desk-schedule-detail {
  position: absolute; right: 20px; bottom: 20px; width: min(360px, calc(100% - 40px));
  background: var(--dsw-alias-bg-base, #fff); border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: var(--dsw-radius-lg, 16px); box-shadow: 0 12px 32px rgba(0,0,0,.16); padding: 12px 14px; z-index: 20;
}
.dsh-desk-schedule-detail header { display: flex; align-items: center; gap: 8px; }
.dsh-desk-schedule-detail h3 { flex: 1; margin: 0; font-size: 14px; }
.dsh-desk-schedule-detail dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 10px 0; font-size: 12px; }
.dsh-desk-schedule-detail dt { color: var(--dsw-alias-label-tertiary, #8a919f); }
.dsh-desk-schedule-detail dd { margin: 0; }
.dsh-desk-schedule-detail-desc { white-space: pre-wrap; max-height: 120px; overflow: auto; }
.dsh-desk-schedule-detail footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-desk-schedule-readonly { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8a919f); }

.dsh-desk-schedule-connections {
  position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; gap: 10px;
  margin: auto; width: min(520px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto;
  padding: 16px 18px; background: var(--dsw-alias-bg-base, #fff);
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); border-radius: var(--dsw-radius-lg, 16px);
  box-shadow: 0 16px 48px rgba(0,0,0,.2);
}
.dsh-desk-schedule-connections header { display: flex; align-items: center; }
.dsh-desk-schedule-connections h3 { flex: 1; margin: 0; font-size: 15px; }
.dsh-desk-schedule-connections-tabs { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-schedule-connections-form { display: flex; flex-direction: column; gap: 10px; font-size: 12px; }
.dsh-desk-schedule-connections-form label { display: flex; flex-direction: column; gap: 4px; }
.dsh-desk-schedule-connections-form input {
  font: inherit; padding: 6px 8px; border-radius: 6px; color: inherit;
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea); background: transparent;
}
.dsh-desk-schedule-connections-status { margin: 0; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-desk-schedule-connections-status[data-error='true'] { color: #c2410c; }
.dsh-desk-schedule-form-note { margin: 0; color: var(--dsw-alias-label-tertiary, #8a919f); font-size: 11px; }
.dsh-desk-schedule-form-ok { margin: 0; color: #2f8d5b; }
.dsh-desk-schedule-form-actions { display: flex; gap: 8px; align-items: center; }

@container (max-width: 1179px) {
  .dsh-desk-schedule-grid {
    grid-template-areas: 'upcoming upcoming' 'main sources';
    grid-template-columns: minmax(0, 1fr) minmax(200px, 240px);
  }
  .dsh-desk-schedule-upcoming { max-height: 180px; }
  .dsh-desk-schedule-upcoming-body { display: flex; gap: 16px; overflow-x: auto; }
  .dsh-desk-schedule-dayblock { min-width: 150px; }
}
@container (max-width: 899px) {
  .dsh-desk-schedule-grid {
    grid-template-areas: 'upcoming' 'main' 'sources';
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }
  .dsh-desk-schedule-upcoming { max-height: none; }
  .dsh-desk-schedule-upcoming-body { display: block; overflow: visible; }
}
`
