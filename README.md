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
MatchID, LogoA, TeamA, LogoB, TeamB, Label1, Label2, Label3, Label4, Label5, ScoreA, ScoreB, FinalScore, MatchStatus, Winner, FinishedAt, UpdatedAt, UpdatedBy, Note
```

## Apps Script

เอาโค้ดในไฟล์นี้ไปวางใน Google Sheet > ส่วนขยาย > Apps Script แล้ว Deploy เป็น Web App:

```text
bridge/google_apps_script_save_result.gs
```

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

1. ตั้งค่า Apps Script Webhook ให้ขึ้น `Webhook OK v2026-05-15.3` หรือใหม่กว่า
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

### Enable / Disable
- Toggle in Dock panel: **Scoreboard Skin Studio Sync** (Enable Sync)
- Or set localStorage key: `pepslive.scoreboardSkinSync.enabled` (`true` / `false`)

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
