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
