# dsh-file-manage

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

DeepSeek Files API cloud file management — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

Large images pasted into DSH are auto-uploaded to the DeepSeek Files API, but DSH has no built-in management UI. This plugin adds a "Cloud Files" entry at the top of the sidebar (beside the Plugins and Automations entries): it opens a page in the main area listing every cloud file under your API key — pagination, upload/expiry times, sizes, single-file deletion, and one-click file_id copy. No extra credentials are needed.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-file-manage
```

Requires dsh 0.2.0-rc.2 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-file-manage` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Usage

* **Entry**: the "Cloud Files" icon at the top of the sidebar, opening the page in the main area
* **Getting back**: The cloud files page is a normal main-area page, not a dialog — it does not dim or block the interface. Return to a conversation the usual way: pick a session in the sidebar, or use New Session
* **List**: in the order the service returns (this plugin does not re-sort) with "Load more" at the bottom (20 more files per click); each row shows filename / size / upload time / expiry time (when present)
* **Quota**: the page header shows the total count and a quota bar (used storage / the 25 GiB limit)
* **Delete**: per-row delete with confirmation; "DSH auto-uploaded" files (`dsh-` prefix) get an extra note — sessions referencing them will transparently re-upload on next use (may be slower)
* **Copy file_id**: one-click copy per row
* **Errors**: classified messages for auth failures / rate limits / server errors, with retry

## Limitations

* The Files API has **no batch-delete endpoint** — no "delete all", only per-file deletion
* The Files API has **no download endpoint** — content cannot be previewed or downloaded
* Quota: at most 10000 files / 25 GiB per key
* **Where files come from**: DSH auto-uploads to the Files API only on the **DeepSeek model path**; with other models the list mostly shows files you or external tools uploaded
* **Expiry**: DSH auto-uploads files with a default **7-day** expiry (the API has no permanent option); expired files are transparently re-uploaded on next use — tune `fileExpiresAfterSeconds` (1h–30d) in the `llm-deepseek` settings section

## Screenshot

![Cloud Files page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-file-manage.png)

## Uninstall & leftovers

* The plugin keeps no local state; uninstalling leaves the cloud files untouched and DSH behavior unchanged

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-file-manage/CHANGELOG.md)
