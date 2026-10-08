# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.0-rc.2 (2026-10-08)

- Version-line alignment with official dsh 0.2.0-rc.2; no user-perceivable change.
- Fixed the suggestion switch and candidate menu disappearing.
- Fixed a warning message showing the wrong colour.
- A timed-out suggestion request now reports the actual reason.

## 0.1.5-rc.2.1 (2026-09-21)

- Fixed the suggestion switch ignoring the selected model right after DSH starts.

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- The suggestion switch and the candidate menu are visible again on dsh 0.1.5.
- Suggestions stay responsive in very long sessions.
- Suggestions now follow the current main model, and default to deepseek-flash.

## 0.1.2-rc.1.1 (2026-09-09)

- A suggestion is now shown only in the session it belongs to.
- On a dsh version this plugin does not support, it turns itself off and leaves dsh working.
- The suggestion card now blurs together with the background when a dialog opens.
- No suggestion request is sent for a session this plugin does not recognize.

## 0.1.2-rc.1 (2026-09-05)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- The FIM switch now follows the selected model as soon as you switch models.
- Clicking the suggestion card no longer steals focus from the input box, so Tab still works.
- Other websites can no longer send suggestion requests on your behalf.
- Tab adoption now also works when the draft contains files or prompts mentioned with @.
- A small 🐦 dsh-sparrow brand line sits in the bottom-left corner of the suggestion card.

## 0.1.0 (2026-09-02)

- First stable release.

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- Fixed a gap around the composer card while a suggestion is shown.

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Version-line alignment 0.1.0-alpha.2; no functional change.

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First release.
- Suggests what you may type next after a pause. **Tab** adopts, **Esc** dismisses.
- Suggestions follow the main model, and the card shows the model and temperature used.
- The switch is labelled **FIM** in both Chinese and English.
- **Three trigger sensitivity levels** (high / medium / low) control when a suggestion is triggered; your choice is remembered.
- The completion language follows your draft, and a suggestion stops at the first sentence end.
- Suggestions that only repeat the conversation are dropped.
- The switch is off by default and its state is remembered; it stays hidden while the main model is not a DeepSeek model.
- Uses the DeepSeek API key configured in dsh, never sends it to the browser, and also works on the new-session page.

