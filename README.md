# PepsLive Dock V1

GitHub-ready OBS Dock สำหรับควบคุมคะแนนกีฬา พร้อมหน้าล็อกอิน, Google Sheet, OBS WebSocket, Stream Deck และ Source Actions

## สิ่งที่มีในชุดนี้

- หน้า Login ก่อนใช้งาน: กรอกชื่อผู้ใช้ + เลือกจังหวัดแบบค้นหา/เลื่อนหา
- แสดงจำนวนผู้ใช้ออนไลน์ต่อจากจังหวัด
- คลิกจำนวนออนไลน์เพื่อดู Popup รายชื่อผู้ใช้งานทั้งหมด
- โหลดแมตช์จาก Google Sheet
- บันทึกผลกลับ Google Sheet ผ่าน Apps Script Webhook
- เชื่อม OBS WebSocket
- สร้าง Source ราย Tag ด้วยปุ่ม `+`
- รองรับ Team Color Tags
- มี Source Actions 6 ปุ่ม สำหรับเปิด/ปิด Source หรือ Group ใน OBS
- Source Actions ใช้กับ Stream Deck ได้
- ปรับ Dock Layout ได้ว่าจะโชว์/ซ่อน/เรียงลำดับ Module ไหน
- ทุกหมวด Settings มีปุ่มวิธีการใช้งานแบบ Popup

## ไฟล์หลัก

```text
index.html
PepsLive_Dock_V1.html
```

## วิธีใช้งานบน GitHub Pages

1. อัปไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub repository
2. เปิด Settings > Pages
3. เลือก Deploy from branch > main > root
4. เปิด URL GitHub Pages
5. Login ด้วยชื่อผู้ใช้และจังหวัด
6. ไปที่ Settings เพื่อใส่ Google Sheet URL, Apps Script Webhook URL และ OBS WebSocket

## Google Sheet Schema

```text
MatchID, LogoA, TeamA, LogoB, TeamB, Label1, Label2, Label3, Label4, Label5, ScoreA, ScoreB, FinalScore, MatchStatus, Winner, FinishedAt, UpdatedAt, UpdatedBy, Note, TeamA_PrimaryColor, TeamA_SecondaryColor, TeamB_PrimaryColor, TeamB_SecondaryColor, Revision, LastOperationID
```

สีเก็บเป็น `#RRGGBB` และใช้ค่าเดียวกันใน Google Sheet, Dock และ OBS Color Source โดย template `.xlsx` มีแท็บ `Team Colors` สำหรับดูและแก้สีทั้งสองทีมแบบชัดเจน ส่วน `.csv` มีเฉพาะตาราง `Matches` ดูรายละเอียดที่ [docs/SHEET_SCHEMA.md](docs/SHEET_SCHEMA.md)

## Apps Script

เอาโค้ดในไฟล์นี้ไปวางใน Google Sheet > ส่วนขยาย > Apps Script แล้ว Deploy เป็น Web App:

```text
bridge/google_apps_script_save_result.gs
```

คู่มือติดตั้งแบบละเอียดสำหรับ Google Sheet ของผู้ใช้เองอยู่ที่ [docs/GOOGLE_APPS_SCRIPT_WEBHOOK_INSTALL_TH.md](docs/GOOGLE_APPS_SCRIPT_WEBHOOK_INSTALL_TH.md)

### ติดตั้งให้คนภายนอกใช้ Google Sheet ของตัวเอง

วิธีแนะนำคือให้ผู้ใช้สร้าง/คัดลอก Google Sheet ของตัวเองก่อน แล้ววางสคริปต์นี้เป็น bound Apps Script ในชีตนั้น:

1. เปิด Google Sheet ของผู้ใช้เอง
2. ไปที่ Extensions > Apps Script
3. วางโค้ดจาก `bridge/google_apps_script_save_result.gs`
4. กลับไปที่ Google Sheet แล้ว reload หน้า 1 ครั้ง
5. เปิดเมนู `PepsLive > Install / Repair Sheet`
6. Deploy เป็น Web App โดยเลือก Execute as: Me และ Who has access: Anyone with the link
7. นำ Web App URL ไปใส่ใน Dock > Settings > Sheet > Apps Script Webhook URL
8. กด `Setup Check` หรือ `ทดสอบ Webhook`

ถ้าชีตขาดหัวตาราง ให้กด `Repair Sheet` ใน Dock หรือเมนู `PepsLive > Repair Sheet Schema` ใน Google Sheet ระบบจะเติม Match Schema V2 และสร้างชีตเสริม `Team Colors`, `PepsLiveOperations`, `PepsLiveUsers`, `PepsLiveRemote`, `PepsLiveRemoteState`, `PepsLiveRemoteDevices` ให้เอง

เตรียมสีล่วงหน้าได้สองทาง: แก้ค่าในคอลัมน์สีของแท็บ `Team Colors` หรือเปิด `PepsLive > Pick OBS Color` แล้วเลือก Primary/Secondary ของทั้งสองทีมและบันทึกครั้งเดียว ทั้งสองทางจะซิงก์กลับตาราง `Matches` พร้อมเพิ่ม `Revision` จากนั้นกด `Load Sheet` ใน Dock

เมื่อกด `Setup Check` หรือ `ทดสอบ Webhook` Dock จะรับ GID ของตาราง `Matches` จาก Apps Script และใส่ใน `Default GID` อัตโนมัติ จึงไม่โหลดผิดไปที่แท็บ `Team Colors` แม้ URL ที่นำมาวางจะเปิดอยู่คนละแท็บ

Webhook Token เป็นทางเลือกเสริมสำหรับงานที่ต้องการกันคนอื่นยิง Webhook ถ้าต้องใช้ ให้เปิดเมนู `PepsLive > Generate Webhook Token` แล้วนำ token ไปใส่ใน Dock ช่อง `Webhook Token`

ระบบนี้ใช้ Apps Script ตัวเดียวสำหรับ:

- Save Result
- Finish Match
- Online Users / Presence
- Mobile Remote ผ่าน QR Code

### ติดตั้ง Sheet / Webhook แบบเร็ว

1. เปิด Dock แล้วไปที่ Settings > Sheet
2. กด `แบบฟอร์ม` เพื่อดาวน์โหลด Excel template แล้วนำไปสร้าง Google Sheet ของงาน
3. กด `โหลดสคริป` เพื่อดาวน์โหลด Apps Script เป็นไฟล์ `.txt`
4. คัดลอกโค้ดจากไฟล์ `.txt` ไปวางใน Google Sheet > Extensions > Apps Script
5. Deploy เป็น Web App และตั้งสิทธิ์ให้ผู้ใช้ที่มีลิงก์เรียกใช้งานได้
6. นำ Web App URL กลับมาใส่ช่อง Apps Script Webhook URL
7. กด `ทดสอบ Webhook` ถ้าขึ้น Webhook OK พร้อมเลขเวอร์ชัน แปลว่า Save Result และ Presence พร้อมใช้งาน
8. ถ้าขึ้น Old Script ให้คัดลอกสคริปต์ล่าสุดไปวางและ Deploy เป็น Web App เวอร์ชันใหม่อีกครั้ง

### Presence / Online Users

- ผู้ใช้ Online คือ session ที่ heartbeat ภายใน 90 วินาทีล่าสุด
- เมื่อ logout หรือปิดหน้า Dock ระบบจะพยายาม mark Offline ทันที และยังมี TTL 90 วินาทีเป็น fallback
- Sheet `PepsLiveUsers` จะเก็บ `FirstSeen`, `LastSeen`, `OfflineAt`, `Status`, `LastAction` เพื่อดูประวัติคนที่เคย login แม้ออฟไลน์แล้ว
- ถ้าไม่ใส่ Webhook URL หรือ Webhook ใช้งานไม่ได้ Dock จะแสดงคำเตือนแทนการแสดงรายชื่อหลอก

### Mobile Remote

1. ตั้งค่า Apps Script Webhook ให้ขึ้น `Webhook V2 OK 2026-07-15.1` หรือใหม่กว่า
2. กดปุ่มรูปมือถือบนแถบบนของ Dock
3. สแกน QR Code ด้วยมือถือ หรือ copy link ไปเปิดในมือถือ
4. มือถือจะเปิดหน้า Remote แยก พร้อมปุ่มควบคุมคะแนน เวลา Save Result, Finish Match, Load Next Match, Sync OBS และ Source Actions
5. ปุ่มในมือถือเพิ่ม/ลบได้อย่างอิสระและเก็บเฉพาะในเครื่องมือถือ ไม่กระทบหน้า Dock หลัก

Mobile Remote จะพยายามเชื่อมต่อแบบ Direct P2P ผ่าน WebRTC/PeerJS ก่อนเพื่อให้มือถือสั่ง Dock ได้แม้ Apps Script ยังไม่ได้อัปเดต จากนั้นจึงใช้ชีต `PepsLiveRemote` เป็นคิวสำรอง และใช้ `PepsLiveRemoteState` / `PepsLiveRemoteDevices` สำหรับสถานะคะแนนล่าสุดกับรายชื่อมือถือที่เชื่อมต่อเมื่อ deploy Apps Script รุ่นใหม่แล้ว ถ้ามือถือขึ้นว่าส่งคำสั่งไม่ได้ ให้โหลดสคริปต์ล่าสุดแล้ว Deploy Apps Script ใหม่ก่อนทดสอบอีกครั้ง

## ตรวจ syntax ก่อนอัปโหลด

ถ้ามี Node.js ในเครื่อง สามารถตรวจ JavaScript ใน Dock และ Apps Script ได้ด้วยคำสั่ง:

```text
node scripts/check-syntax.js
```

คำสั่งนี้ไม่ต้องติดตั้ง dependency เพิ่ม และใช้แทน GitHub Actions ได้ในช่วงที่ Actions ยังไม่พร้อมใช้งาน

## โลโก้ทีม

### GitHub / URL Mode
วางไฟล์ไว้ใน:

```text
logos/
```

เช่น Sheet ใส่ `A1` ระบบจะหา:

```text
logos/A1.png
logos/A1.jpg
logos/A1.webp
logos/A1.svg
```

### Local Folder Mode
ใช้สำหรับเครื่องงานจริงที่ต้องการกรอก path เช่น:

```text
C:\\PepsLive\\logos\\
```

> หมายเหตุ: GitHub Pages ไม่สามารถอ่าน path ในเครื่องได้เต็มแบบโปรแกรม desktop จึงแนะนำให้ใช้ `logos/` ใน repo หรือ URL สำหรับงานผ่านเว็บ

## Stream Deck

ติดตั้งจากโฟลเดอร์:

```text
streamdeck_plugin/
```

มีปุ่ม Source Action 1-6 และ Hide All Actions เพิ่มแล้ว

## OBS Source สำคัญ

ดูรายละเอียดใน:

```text
docs/OBS_SOURCES.md
```

## Patch note: Settings / Timer stability fix

- แก้ปัญหากดปุ่มตั้งค่าแล้ว Settings Drawer ไม่เปิด
- แก้ Start Timer ให้เริ่มนับเวลาได้ แม้เป็นกีฬานับถอยหลังและเวลายังเป็น 00:00
- เพิ่ม runtime safety ไม่ให้ optional settings section ที่ถูกถอดออกทำให้ปุ่มหลักพัง



## Patch: Settings Top Bar

- ย้ายปุ่ม `ตั้งค่า` ออกจาก Quick Match ไปอยู่บนแถบบน ต่อจากสถานะระบบ/ออนไลน์
- ปุ่มตั้งค่าจะไม่หายไปเมื่อซ่อน Quick Match ใน Dock Layout
- Quick Match เหลือเฉพาะส่วนเลือกคู่แข่งขัน

## Logo Image Source Workflow

เวอร์ชันนี้ใช้ `PEPS_LogoA` และ `PEPS_LogoB` เป็น OBS **Image Source** เพื่อให้ PNG โปร่งใสแสดงผลถูกต้องใน OBS Preview/Program

วิธีใช้งานที่แนะนำ:

```text
1. วางโลโก้ไว้ในเครื่อง เช่น C:/PepsLive/logos/A1.png
2. ใน Google Sheet ใส่ LogoA = A1 และ LogoB = A2
3. Settings > Logos
4. Logo Mode = Local Folder
5. Local Folder Path = C:/PepsLive/logos/
6. กด บันทึกค่าโลโก้
7. กด ซ่อม Logo Image Sources
8. กด Sync OBS
```

ปุ่มเลือกโฟลเดอร์ใช้สำหรับแสดงตัวอย่างใน Dock เท่านั้น ถ้าจะให้ OBS Image Source แสดงผล ต้องกรอก `Local Folder Path` จริง


## หมายเหตุโลโก้ใน Dock และ OBS

- OBS Preview ใช้ `Image Source` และต้องใช้ path จริง เช่น `C:/PepsLive/logos/A1.png`
- หน้า PepsLive Dock จะใช้ preview แยกต่างหาก โดยดูจากไฟล์ที่เลือกใน browser หรือ path `logos/` ใน GitHub repo
- ถ้า OBS ขึ้นโลโก้แล้วแต่ Dock ไม่ขึ้น ให้ตรวจว่าใน repo มีไฟล์ `logos/A1.png` หรือกดเลือกโฟลเดอร์โลโก้ใหม่ในหน้า Settings > Logos


## Fixed9: Dock Logo Preview

ถ้า OBS แสดงโลโก้แล้วแต่หน้า Dock ไม่แสดง ให้ตรวจว่าไฟล์โลโก้อยู่ใน `logos/` บน GitHub หรือกดเลือกโฟลเดอร์โลโก้ใน Settings > Logos เพื่อให้ Dock ใช้ไฟล์นั้น preview ได้ใน session ปัจจุบัน. ระบบจะลองนามสกุลอัตโนมัติ เช่น `.png`, `.jpg`, `.webp`, `.svg`.

OBS ยังใช้ Local Folder Path จริง เช่น `C:/PepsLive/logos/` สำหรับ Image Source เหมือนเดิม.

## Scoreboard Skin Studio Sync

PepsLive Dock can now publish match state to **PepsLive Scoreboard Skin Studio** using shared protocol.

### Protocol
- `protocol`: `PEPSLIVE_SCOREBOARD_STATE_V1`
- `channel`: `pepslive-scoreboard-state-v1`
- `localStorage fallback`: `pepslive.scoreboard.sharedState.v1`
- `custom event`: `pepslive:scoreboard-state-updated`
- `source`: `pepslive-dock`

### Background Sync
- The old visible **Scoreboard Skin Studio Sync** panel has been removed from the Dock UI.
- Sync now starts automatically in the background when Dock V1 loads.
- Use the **Skin** popup to choose skins, copy URLs, or apply OBS Browser Sources.
- If an Apps Script Webhook URL is configured, Dock V1 can use it as the relay endpoint automatically for OBS Browser Source URLs.
- Advanced localStorage keys still exist for legacy/debug workflows, but normal users do not need to touch them.

### Exported Fields (summary)
- Event: `eventName`, `eventLogo`
- Home: `homeName`, `homeShortName`, `homeScore`, `homeLogo`, `theme.homeColor`
- Away: `awayName`, `awayShortName`, `awayScore`, `awayLogo`, `theme.awayColor`
- Clock/Status: `gameClock`, `periodLabel`, `statusLabel`
- Football extras: `addedTime`, `aggregateScore`, `penaltyScore`, `goalScorerList`, `cardInfo`
- Basketball extras: `shotClock`, `homeFouls`, `awayFouls`, `homeTimeouts`, `awayTimeouts`, `possession`, `bonus`

### Overlay URLs
- Base: [https://pepsproduction.github.io/pepslive-scoreboard-skin-studio/](https://pepsproduction.github.io/pepslive-scoreboard-skin-studio/)
- Live example: [https://pepsproduction.github.io/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01](https://pepsproduction.github.io/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01)
- Summary example: [https://pepsproduction.github.io/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01](https://pepsproduction.github.io/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01)

### Same-origin note
BroadcastChannel/localStorage sync works best when Dock and Skin Studio share the same origin, e.g. both under `https://pepsproduction.github.io`.
If opened on different origins (`localhost` different port, `file://`, other domain), sync may not propagate.

### Troubleshooting
- Overlay not updating: open overlay with `debug=1` and verify `source=pepslive-dock`.
- OBS still shows old state: refresh Browser Source cache or regenerate URL (`v=timestamp`).
- Sync disabled accidentally: check panel toggle or `pepslive.scoreboardSkinSync.enabled`.

## Real Browser Sync Test (Phase 3.1.1)

ทดสอบ Sync แบบ browser-to-browser ให้ใช้ **origin เดียวกัน** เท่านั้น

### 1) เปิด Same-Origin Local Server

```bash
node scripts/serve-same-origin.mjs
```

### 2) URL สำหรับทดสอบ

- Dock UI: [http://127.0.0.1:8123/pepslive-dock/PepsLive_Dock_V1.html](http://127.0.0.1:8123/pepslive-dock/PepsLive_Dock_V1.html)
- Live overlay debug (Football): [http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&debug=1](http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&debug=1)
- Summary overlay debug (Football): [http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01&debug=1](http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01&debug=1)
- Live overlay debug (Basketball): [http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/live.html?skin=BB-LIVE-01&debug=1](http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/live.html?skin=BB-LIVE-01&debug=1)
- Summary overlay debug (Basketball): [http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=BB-SUM-01&debug=1](http://127.0.0.1:8123/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=BB-SUM-01&debug=1)

### 3) วิธีทดสอบ Sync

1. เข้า Dock แล้วเปิด `Enable Sync`
2. กด `Publish Current State`
3. เปลี่ยนคะแนน/เวลา/สถานะจาก workflow เดิมของ Dock
4. ดู overlay debug box ว่า source เป็น `pepslive-dock`
5. ตรวจค่า score/team/clock/status ว่าอัปเดตตาม Dock

### 4) ตรวจ localStorage

- key: `pepslive.scoreboard.sharedState.v1`
- ต้องมี payload ที่ `protocol = PEPSLIVE_SCOREBOARD_STATE_V1`
- `source` ต้องเป็น `pepslive-dock`

### 5) Same-Origin Warning

กรณีเหล่านี้อาจไม่ sync:
- Dock เปิดจาก `file://`
- Dock เปิดที่ `localhost:xxxx` แต่ overlay เปิดที่ `127.0.0.1:yyyy`
- Dock/overlay คนละ domain

BroadcastChannel/localStorage จะทำงานได้ดีที่สุดเมื่อทั้งสองหน้าอยู่ origin เดียวกัน

### 6) Smoke Script

```bash
node scripts/check-skin-sync-browser.mjs
```

สคริปต์นี้จะ:
- start same-origin server
- เช็ก HTTP 200 ของ Dock + overlay URLs
- ถ้ามี Playwright จะรัน browser automation ต่อ
- ถ้าไม่มี Playwright จะพิมพ์ manual checklist ให้อัตโนมัติ

## Scoreboard Skin Studio URL Handoff

PepsLive Dock V1 now also listens for the Skin Studio URL handoff channel:

- Channel: `PEPSLIVE_STUDIO_SYNC`
- Protocol: `PEPSLIVE_STUDIO_SYNC_V1`
- localStorage key: `pepslive.scoreboardSkinStudio.lastUrls`

Workflow:
1. Open PepsLive Scoreboard Skin Studio and choose a skin/theme/display options.
2. Skin Studio broadcasts the latest Live/Summary portable Browser Source URLs.
3. In Dock V1, use `Copy Live URL` / `Copy Summary URL`, or create the `SkinLive` / `SkinSummary` Browser sources from OBS Tags / Sources.
4. Paste the copied URL into OBS Browser Source if using manual mode.

Notes:
- Dock V1 still controls score/team/time. Skin Studio only controls scoreboard appearance.
- For live updates, open Dock V1 and overlay under the same origin, or use a relay URL.
- If no Studio URL has been received yet, Dock V1 falls back to default `FB-LIVE-01` / `FB-SUM-01` URLs.

## Scoreboard Skin Studio Reliable Relay

ใช้โหมดนี้เมื่อ Dock V1 กับ OBS Browser Source ไม่ได้แชร์ browser profile เดียวกัน ทำให้ `BroadcastChannel` / `localStorage` ไม่ส่งถึงกัน แม้จะเป็น URL เดียวกันก็ตาม

### Local QA Relay

```bash
node scripts/serve-same-origin.mjs
```

จากนั้นใน Dock:

1. เปิด `Enable Sync`
2. เปิด `Enable Relay Publisher`
3. กด `Use Local QA Relay`
4. กด `Publish Relay Now`
5. Copy `Relay Live URL` หรือ `Relay Summary URL` ไปใส่ OBS Browser Source

Local relay endpoint:

```text
http://127.0.0.1:8123/pepslive-relay/state.json
```

### Apps Script Relay

ถ้าใช้ Google Apps Script webhook ของ Dock อยู่แล้ว ให้อัปเดตสคริปต์จากไฟล์:

```text
bridge/google_apps_script_save_result.gs
```

จากนั้นใน Dock:

1. ใส่ Apps Script Web App URL ใน Settings > Google Sheet
2. กด `Use Apps Script Relay`
3. เปิด `Enable Relay Publisher`
4. Copy `Relay Live URL` หรือ `Relay Summary URL`

Dock จะส่ง payload ด้วย action `scoreboardSkinRelaySet` และ overlay จะอ่านด้วย `scoreboardSkinRelayGet`.

### Relay Smoke Test

```bash
node scripts/check-scoreboard-skin-relay.mjs
```

สคริปต์นี้จะ start local server, POST payload เข้า relay, GET payload กลับมา และเช็ก overlay URL ที่มี `?relay=`.

## Quick Start: Skin Studio + Dock V1 แบบขั้นตอนน้อยที่สุด

วิธีแนะนำสำหรับใช้งานจริงกับ OBS คือใช้ **Relay URL** เพราะเสถียรกว่าเมื่อ OBS Browser Source ไม่ได้แชร์ browser profile กับหน้า Dock

### ครั้งแรกเท่านั้น

1. เปิด `PepsLive_Dock_V1.html`
2. ไปที่ Settings > Google Sheet แล้วใส่ Apps Script Web App URL
3. อัปเดต Apps Script จากไฟล์ `bridge/google_apps_script_save_result.gs`

### เวลาใช้งานจริง

1. เปิด Dock V1 แล้วเลือกแมตช์ตาม workflow เดิม
2. ในกล่อง `Scoreboard Skin Studio Sync` กด `Use Apps Script Relay`
3. กด `Copy Live URL` หรือ `Copy Summary URL`
4. วาง URL ใน OBS Browser Source

หลังจากนั้นให้ควบคุมคะแนน/เวลา/ทีมจาก Dock V1 เหมือนเดิม ระบบจะ publish payload ไปให้ overlay อัตโนมัติประมาณวินาทีละ 1 ครั้งตอน timer เดิน

### โหมดทดสอบในเครื่อง

ถ้ายังไม่มี Apps Script ให้รัน local relay ก่อน:

```bash
node scripts/serve-same-origin.mjs
```

จากนั้นเปิด Dock จาก:

```text
http://127.0.0.1:8123/pepslive-dock/PepsLive_Dock_V1.html
```

แล้วกด `Use Local QA Relay` จากนั้น Copy Live URL / Summary URL ไปทดสอบได้ทันที

### ปุ่ม Copy URL ตอนนี้ทำงานแบบ Smart URL

- ถ้า Relay เปิดอยู่: `Copy Live URL` / `Copy Summary URL` จะ copy URL ที่มี `?relay=` ให้เอง
- ถ้า Relay ไม่เปิด: จะ fallback เป็น portable/same-origin URL ปกติ
- ถ้า Skin Studio ส่ง URL ล่าสุดมาแล้ว: Dock จะใช้ skin/theme ล่าสุดนั้นเป็นฐาน URL ก่อน


## Phase 5.0 Embedded Skin Popup Workflow

PepsLive Dock V1 now has a short **Skin** button near Settings. It opens PepsLive Scoreboard Skin Studio inside a popup iframe with `?embed=1`.

Recommended fast workflow:

1. Open `PepsLive_Dock_V1.html`.
2. Click **Skin**.
3. Choose a scoreboard skin, adjust theme/display options, and preview inside the popup.
4. Click **Apply Live Scoreboard Source** or **Apply Summary Board Source** if OBS WebSocket is connected, or copy the Live/Summary URL manually.
5. Keep controlling score, team, clock, and match status from Dock V1 as usual.

Notes:

- The Skin popup only controls scoreboard appearance and Browser Source URLs.
- Dock V1 remains the source of truth for score/time/team data.
- Skin Studio sends URL updates back to Dock V1 by `postMessage`, BroadcastChannel, and localStorage fallback.
- For OBS Browser Source, Relay URL mode is still recommended when OBS does not share the same browser profile as the Dock page.

## Current Skin Workflow

1. Open Dock V1.
2. Click **Skin**.
3. Choose/customize the scoreboard skin in the popup.
4. Click **Apply Live Scoreboard Source** or **Apply Summary Board Source** if OBS WebSocket is connected, or copy Live/Summary URL manually.
5. Control score, teams, and clock from Dock V1 as usual.

The visible Sync panel is no longer shown. Background sync still publishes Dock state to the scoreboard overlay.


## Current Stable Skin Source URL Behavior

- The visible `Scoreboard Skin Studio Sync` card is removed from Dock V1.
- Click **Skin** to choose the scoreboard style, then click **Apply Live Scoreboard Source** or **Apply Summary Board Source**, or copy the Live/Summary URL.
- Dock V1 now embeds the current score/team/clock snapshot into the Skin Studio Browser Source URL.
- If an Apps Script Webhook URL is configured, Dock V1 publishes the latest relay payload before applying the OBS Browser Source URL.
- Relay URLs use 1 second polling, so score changes should update without jumping back to the mock preview screen.


### Apps Script Webhook Update Note

- Use the latest `bridge/google_apps_script_save_result.gs` script for Save Result, Presence, and Scoreboard Skin Relay.
- Latest expected webhook version: `2026-07-15.1` with Match Schema V2, revision-safe saves, the visible Team Colors sheet, and two-way Sheet color sync.
