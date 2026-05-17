

# Changelog

## Phase 5.0 - Embedded Skin Studio Popup

- Added a **Skin** button in PepsLive Dock V1.
- Added an embedded Skin Studio popup using `dock.html?embed=1`.
- Added apply actions for Live, Summary, and Both OBS Browser Sources.
- Added quick copy buttons for generated Live and Summary overlay URLs.
- Connected iframe handoff through `postMessage` while keeping BroadcastChannel/localStorage support.
- No score, timer, team, or match-control workflow was changed.

## Phase 5.1 - Hide Skin Sync Panel

- Removed the visible Scoreboard Skin Studio Sync card from Dock V1.
- Kept background Skin Studio state publishing enabled automatically.
- Auto-uses the Apps Script Webhook URL as relay endpoint when available.
- Normal workflow is now through the Skin popup and OBS Browser Source copy/apply actions.
