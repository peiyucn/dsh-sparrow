

export const NOTEBOOK_CSS = `
/* --- fixed page shell ---------------------------------------------------- */
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  container-type: inline-size;
  padding: calc(var(--dsh-desk-header-h) + 16px) clamp(20px, 3vw, 40px) 16px;
}
.dsh-desk-notebook-error,
.dsh-desk-notebook-notice {
  box-sizing: border-box;
  flex: none;
  width: 100%;
  max-width: min(1100px, 100%);
  margin: 0 auto 10px;
  padding: 8px 12px;
  border-radius: var(--dsw-radius-md, 12px);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-error {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 8%, transparent);
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-notebook-notice {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03));
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-notebook-search {
  flex: 1 1 260px;
  min-width: 0;
}
.dsh-desk-notebook-tabs {
  flex: 0 1 420px;
  min-width: 0;
}
/* Official SegmentedTabs pills center their label and allow wrapping; English filter labels are
   longer than zh, so a two-line pill used to break the toolbar row. Keep every tab label on one
   line and ellipsize on a very narrow panel instead. */
.dsh-desk-notebook-tabs [role='tab'] {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- list: one card, internally scrolling rows, page footer -------------- */

.dsh-desk-notebook-card {
  box-sizing: border-box;
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-desk-notebook-cardhead {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-notebook-cardhead-title {
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-desk-notebook-cardhead-hint {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
}
.dsh-desk-notebook-cardhead-usage {
  margin-left: 0;
}
.dsh-desk-notebook-rows {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.dsh-desk-notebook-row {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-notebook-row:nth-child(1) {
  border-top: 0;
}
.dsh-desk-notebook-rowbody {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
button.dsh-desk-notebook-rowbody {
  cursor: pointer;
}
.dsh-desk-notebook-rowtitle {
  flex: 0 0 34%;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-rowpath {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-rowmeta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
}
.dsh-desk-notebook-rowdate {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-desk-notebook-rowaction {
  display: inline-flex;
  flex: none;
  align-items: center;
}
.dsh-desk-notebook-empty {
  margin: 0;
  padding: 14px 12px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-pager {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-height: 28px;
}
.dsh-desk-notebook-pagerstatus {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

/* --- loading state: centred spinner / hint ------------------------------ */
.dsh-desk-notebook-center {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 24px 0 48px;
}
/* --- review record detail ------------------------------------------------ */
.dsh-desk-notebook-recorddialog {
  width: min(560px, 100%);
}
.dsh-desk-notebook-record {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dsh-desk-notebook-recordmeta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-desk-notebook-recordtitle {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
.dsh-desk-notebook-recordpath {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.dsh-desk-notebook-recorddate {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-recordannos {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
}
.dsh-desk-notebook-recordanno {
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-recordannohead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.dsh-desk-notebook-recordanno-no {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-recordanno-range {
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-recordquote {
  margin: 0 0 4px;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.dsh-desk-notebook-recordtext {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.dsh-desk-notebook-recordactions {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dsh-desk-notebook-recorddelete {
  color: var(--dsw-alias-state-error-primary, #c62828);
}

/* Vertical page: one content column with an equal-width top band; the search field sits left and
   the white workspace-files button sits right at the same width and height. */
.dsh-desk-notebook-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: min(960px, 100%);
  min-height: 0;
  margin: 0 auto;
}
/* Top band: search on the left, the fixed-width workspace-files button on the right. Both widths
   are fixed in zh and en (the button is 340px, the search fills the rest of the list width), so
   changing the interface language never shifts this row. */
.dsh-desk-notebook-toprow {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.dsh-desk-notebook-toprow .dsh-desk-notebook-search {
  flex: 1 1 auto;
  min-width: 0;
}
.dsh-desk-notebook-filesbtn {
  flex: none;
  width: 340px;
  max-width: 50%;
  height: 32px;
  min-height: 32px;
  padding: 0 12px;
  gap: 0;
  font-size: 12px;
  white-space: nowrap;
  border-radius: var(--dsw-radius-md, 12px);
}
.dsh-desk-notebook-filesbtn-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-desk-notebook-filesbtn-icon {
  display: inline-flex;
  flex: none;
  margin: 0 1px;
  color: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-notebook-filesbtn-icon svg {
  display: block;
  width: 15px;
  height: 15px;
}
.dsh-desk-notebook-filesbtn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-desk-notebook-homehead {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.dsh-desk-notebook-homehead-title {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-desk-notebook-homehead-count {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
}
/* The four views now live in the list header, sized to their content rather than the page width. */
.dsh-desk-notebook-cardhead .dsh-desk-notebook-tabs {
  flex: none;
  width: max-content;
  max-width: 100%;
}
.dsh-desk-notebook-cardhead-spacer {
  flex: 1 1 auto;
}

/* Unlinked home: the workspace picker is visible by default, not behind a first click. */
.dsh-desk-notebook-home {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dsh-desk-notebook-homeempty {
  margin: 0;
  padding: 14px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-notebook-homelist {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-notebook-homerow {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  background: none;
  text-align: left;
  font: inherit;
  color: var(--dsw-alias-label-primary, #1f2329);
  cursor: pointer;
}
.dsh-desk-notebook-homelist li:last-child .dsh-desk-notebook-homerow {
  border-bottom: 0;
}
.dsh-desk-notebook-homerow:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-homerow-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-desk-notebook-homeactions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-desk-notebook-homehints {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-desk-notebook-homehints .dsh-desk-page-hint {
  margin: 0;
}

/* The header clips its glass layer; let the workspace dropdown paint past the header bottom. */
.dsh-desk-header[data-workspace-menu='open'] {
  overflow: visible;
}

/* Header workspace selector + menu. */
.dsh-desk-notebook-workspaceselect {
  position: relative;
}
.dsh-desk-notebook-workspacebtn {
  max-width: 260px;
}
.dsh-desk-notebook-workspacelabel {
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-notebook-workspacename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.dsh-desk-notebook-workspacecaret {
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-notebook-workspacemenu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  width: min(300px, calc(100vw - 64px));
  max-height: 340px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
}
.dsh-desk-notebook-workspaceitem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  text-align: left;
  font: inherit;
  color: var(--dsw-alias-label-primary, #1f2329);
  cursor: pointer;
}
.dsh-desk-notebook-workspaceitem:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-workspaceitem[data-current='true'] {
  background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.08));
}
.dsh-desk-notebook-workspaceitem-title {
  font-size: 13px;
  line-height: 18px;
}
.dsh-desk-notebook-workspaceempty {
  margin: 4px 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-notebook-workspacesep {
  height: 1px;
  margin: 6px 4px;
  background: var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-notebook-workspaceaction {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  text-align: left;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
}
.dsh-desk-notebook-workspaceaction:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}


/* Narrow panel: the search takes a full row and the files button drops below it. */
@container (max-width: 760px) {
  .dsh-desk-notebook-toprow {
    flex-wrap: wrap;
  }
  .dsh-desk-notebook-toprow .dsh-desk-notebook-search {
    flex: 1 1 100%;
  }
  .dsh-desk-notebook-filesbtn {
    width: 100%;
    max-width: 100%;
  }
}
`
