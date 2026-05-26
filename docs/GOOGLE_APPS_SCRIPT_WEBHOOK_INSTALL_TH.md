# วิธีติดตั้ง PepsLive Apps Script Webhook สำหรับ Google Sheet ของผู้ใช้เอง

คู่มือนี้ใช้กับไฟล์ Apps Script ล่าสุด:

```text
bridge/google_apps_script_save_result.gs
```

เวอร์ชันที่คาดหวังใน Dock: `2026-05-26.1`

Webhook ตัวนี้ใช้สำหรับ Save Result, Finish Match, Online Users, Mobile Remote และ Scoreboard Skin Relay โดยข้อมูลจะถูกเขียนลง Google Sheet ของเจ้าของชีตคนนั้นเอง ไม่ได้ผูกกับชีตของ PepsProduction

## สิ่งที่ต้องมี

1. Google account ของผู้ใช้
2. Google Sheet ของงานตัวเอง
3. หน้า PepsLive Dock
4. ไฟล์ Apps Script ล่าสุดจาก repo นี้

ลิงก์ไฟล์ล่าสุด:

- GitHub: https://github.com/pepsproduction/pepslive-dock/blob/main/bridge/google_apps_script_save_result.gs
- Raw file: https://raw.githubusercontent.com/pepsproduction/pepslive-dock/main/bridge/google_apps_script_save_result.gs

## ติดตั้งครั้งแรก

### 1. เตรียม Google Sheet

สร้าง Google Sheet ใหม่ หรือคัดลอกจาก template ที่ Dock ให้โหลดใน Settings > Sheet

หัวตารางหลักควรมีคอลัมน์เหล่านี้:

```text
MatchID, LogoA, TeamA, LogoB, TeamB, Label1, Label2, Label3, Label4, Label5, ScoreA, ScoreB, FinalScore, MatchStatus, Winner, FinishedAt, UpdatedAt, UpdatedBy, Note
```

ถ้ายังไม่มีหัวตารางครบ ไม่เป็นไร เดี๋ยวใช้เมนู Repair เติมให้ได้

### 2. เปิด Apps Script ของชีต

ใน Google Sheet ให้ไปที่:

```text
Extensions > Apps Script
```

ถ้า Google สร้างไฟล์ `Code.gs` เปล่าให้ ให้ลบโค้ดตัวอย่างเดิมออกทั้งหมด

### 3. วางโค้ด Webhook ล่าสุด

เปิดไฟล์นี้จาก repo:

```text
bridge/google_apps_script_save_result.gs
```

คัดลอกโค้ดทั้งหมด แล้ววางลงใน Apps Script จากนั้นกด Save

แนะนำให้ตั้งชื่อโปรเจกต์ Apps Script เป็น:

```text
PepsLive Dock Webhook
```

### 4. กลับไปที่ Google Sheet แล้ว reload หน้า

กลับไปหน้า Google Sheet แล้ว refresh/reload หน้า 1 ครั้ง

หลัง reload จะเห็นเมนูใหม่ชื่อ:

```text
PepsLive
```

### 5. รัน Install / Repair

กดเมนู:

```text
PepsLive > Install / Repair Sheet
```

ครั้งแรก Google จะให้ authorize:

1. เลือกบัญชี Google ของเจ้าของชีต
2. ถ้ามีคำเตือนว่า app ยังไม่ได้ verify ให้กด Advanced
3. กด Go to PepsLive Dock Webhook
4. กด Allow

เมนูนี้จะทำ 4 อย่าง:

- จำ Spreadsheet ID ของชีตนี้ไว้ใน Script Properties
- ตรวจ/เติมหัวตารางหลักของ match sheet
- สร้างชีต `PepsLiveConfig`
- สร้างชีตเสริมสำหรับระบบ online/mobile remote ถ้ายังไม่มี

ชีตเสริมที่อาจถูกสร้าง:

```text
PepsLiveConfig
PepsLiveUsers
PepsLiveRemote
PepsLiveRemoteState
PepsLiveRemoteDevices
```

### 6. ตั้ง Webhook Token ถ้าต้องการ

ขั้นตอนนี้เป็นทางเลือก แต่แนะนำถ้าจะเปิด Web App แบบ Anyone with the link

กดเมนู:

```text
PepsLive > Generate Webhook Token
```

ระบบจะแสดง token ให้ copy เก็บไว้ แล้วนำไปใส่ใน Dock ช่อง:

```text
Settings > Sheet > Webhook Token
```

ถ้าไม่ตั้ง token คนที่รู้ Web App URL จะสามารถเรียก webhook ได้ง่ายกว่า แต่การติดตั้งจะง่ายขึ้น

### 7. Deploy เป็น Web App

ในหน้า Apps Script กด:

```text
Deploy > New deployment
```

ตั้งค่าตามนี้:

```text
Select type: Web app
Description: PepsLive Dock Webhook
Execute as: Me
Who has access: Anyone with the link
```

จากนั้นกด Deploy แล้ว copy URL ที่ได้

URL ที่ควรใช้จะลงท้ายด้วย:

```text
/exec
```

อย่าใช้ URL ที่ลงท้ายด้วย `/dev` สำหรับงานจริง เพราะ `/dev` ใช้ทดสอบเฉพาะเจ้าของสคริปต์

## ตั้งค่าใน PepsLive Dock

เปิด Dock แล้วไปที่:

```text
Settings > Sheet
```

ใส่ค่าดังนี้:

```text
Google Sheet URL: URL ของ Google Sheet งานนี้
Apps Script Webhook URL: Web App URL ที่ลงท้าย /exec
Webhook Token: token จากเมนู Generate Webhook Token ถ้ามี
Default GID: 0 หรือ gid ของ sheet หลัก
```

จากนั้นกด:

```text
บันทึกค่า
Setup Check
ทดสอบ Webhook
โหลด Sheet
```

ถ้าพร้อมใช้งาน ควรเห็นข้อความประมาณนี้:

```text
Setup OK
Webhook OK v2026-05-26.1
```

## ทดสอบ Save Result

1. โหลด Sheet ใน Dock
2. เลือก match ที่มี `MatchID`
3. กด Load Match
4. เปลี่ยนคะแนน
5. กด Save Result หรือ Finish Match
6. กลับไปดู Google Sheet

ค่าที่ควรถูกอัปเดต:

```text
TeamA
TeamB
ScoreA
ScoreB
FinalScore
MatchStatus
Winner
FinishedAt
UpdatedAt
UpdatedBy
Note
```

## อัปเดตจากสคริปต์เก่า

ถ้าเคยติดตั้ง Apps Script ไว้แล้ว ให้ทำแบบนี้:

1. เปิด Google Sheet เดิม
2. ไปที่ Extensions > Apps Script
3. ลบโค้ดเดิมใน `Code.gs`
4. วางโค้ดล่าสุดจาก `bridge/google_apps_script_save_result.gs`
5. กด Save
6. กลับไปที่ Google Sheet แล้ว reload
7. กด `PepsLive > Install / Repair Sheet`
8. ไปที่ Apps Script แล้วกด `Deploy > Manage deployments`
9. กดไอคอน edit ของ Web App เดิม
10. เลือก Version เป็น `New version`
11. กด Deploy
12. กลับไปที่ Dock แล้วกด `ทดสอบ Webhook`

สำคัญ: ถ้าแก้โค้ดแล้วไม่สร้าง New version ใน deployment, Web App URL เดิมอาจยังรันโค้ดเก่าอยู่

## ปัญหาที่พบบ่อย

### ไม่เห็นเมนู PepsLive

ให้ reload หน้า Google Sheet อีกครั้ง ถ้ายังไม่ขึ้น ให้ตรวจว่าโค้ดถูกวางใน Apps Script ที่ผูกกับชีตนั้นจริง ไม่ใช่ standalone script คนละไฟล์

### ขึ้น `run_pepslive_install_first`

ยังไม่ได้กด:

```text
PepsLive > Install / Repair Sheet
```

ให้กดเมนูนี้ก่อน แล้วลอง `Setup Check` ใหม่

### ขึ้น `schema_missing_columns`

หัวตารางยังไม่ครบ ให้กด:

```text
PepsLive > Repair Sheet Schema
```

หรือใน Dock กด:

```text
Repair Sheet
```

### ขึ้น `invalid_webhook_token`

token ใน Dock ไม่ตรงกับ token ใน Apps Script

วิธีแก้:

1. กด `PepsLive > Generate Webhook Token` ใหม่
2. copy token ล่าสุดไปใส่ Dock
3. กดบันทึกค่า
4. กดทดสอบ Webhook ใหม่

ถ้าไม่ต้องการใช้ token ให้ล้างค่า `WebhookToken` ในชีต `PepsLiveConfig` และล้างช่อง Webhook Token ใน Dock

### ขึ้น `match_not_found`

ค่า `MatchID` ใน Dock ไม่ตรงกับแถวใน Google Sheet ให้ตรวจว่าคู่ที่โหลดมาจากชีตเดียวกับชีตที่ Webhook เขียนกลับอยู่

### ทดสอบ Webhook แล้วขึ้น Old Script

แปลว่า Web App ยังเป็นโค้ดเก่า ให้ไปที่:

```text
Apps Script > Deploy > Manage deployments > Edit > Version: New version > Deploy
```

### Webhook ใช้ไม่ได้ในบัญชีบริษัท/โรงเรียน

Google Workspace บางองค์กรอาจปิด Apps Script หรือปิด Web App แบบ Anyone with the link ต้องให้ admin เปิดสิทธิ์ หรือใช้บัญชี Google ส่วนตัวสำหรับชีตงานนั้น

## Checklist ก่อนส่งให้คนอื่นใช้

1. Google Sheet เป็นของผู้ใช้คนนั้นเอง
2. Apps Script วางโค้ดล่าสุด `v2026-05-26.1`
3. กด `PepsLive > Install / Repair Sheet` แล้ว
4. Deploy Web App เป็น `/exec`
5. Dock ใส่ Google Sheet URL ถูกตัว
6. Dock ใส่ Apps Script Webhook URL ถูกตัว
7. ถ้าใช้ token ต้องใส่ token ตรงกัน
8. `Setup Check` ผ่าน
9. `ทดสอบ Webhook` ขึ้น `Webhook OK v2026-05-26.1`
10. Save Result แล้ว Google Sheet อัปเดตจริง
