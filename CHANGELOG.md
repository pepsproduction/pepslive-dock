

# Changelog

## Phase 5.3 - Stable Skin Relay Publishing

- Scoreboard Skin Relay publishes score/team/clock changes faster while timer-driven updates remain throttled by the Skin Sync adapter.
- Applying Skin Studio Browser Sources now avoids resetting OBS Browser Source URLs when only live match data changed.
- Updated the Apps Script webhook guidance and script version for Scoreboard Skin Relay support.

## Phase 5.2 - Stable Skin Source URLs

- Skin Studio Browser Source URLs now include the current Dock V1 match snapshot in the portable `state` parameter.
- Applying Live/Summary/Both Skin Sources publishes the latest relay payload before updating OBS Browser Source URL.
- Relay URLs now request 1 second polling to reduce score update delay.
- The visible Skin Sync panel remains removed; background publishing is still automatic.

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
