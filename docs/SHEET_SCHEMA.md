# Google Sheet Schema สำหรับ PepsLive Dock V1

## Match Schema V2

เรียงหัวตารางตามนี้ โดย 19 คอลัมน์เดิมยังอยู่ตำแหน่งเดิม และเพิ่มข้อมูลสี/Revision ต่อท้าย:

```text
MatchID
LogoA
TeamA
LogoB
TeamB
Label1
Label2
Label3
Label4
Label5
ScoreA
ScoreB
FinalScore
MatchStatus
Winner
FinishedAt
UpdatedAt
UpdatedBy
Note
TeamA_PrimaryColor
TeamA_SecondaryColor
TeamB_PrimaryColor
TeamB_SecondaryColor
Revision
LastOperationID
```

สีใช้รูปแบบ `#RRGGBB` เช่น `#FF6A00` และเก็บเป็นตัวพิมพ์ใหญ่ ช่องสีที่เว้นว่างจะใช้สีสำรองจาก Dock ส่วน `Revision` กับ `LastOperationID` ให้ระบบจัดการเอง

## แท็บ Team Colors

ไฟล์ template `.xlsx` รุ่นล่าสุดมีแท็บ `Team Colors` แยกจากตาราง `Matches` เพื่อให้เห็นชื่อทีมและสีทั้ง 4 ช่องโดยไม่ต้องเลื่อนไปคอลัมน์ด้านขวา ไฟล์ `.csv` ไม่สามารถมีหลายแท็บได้ จึงมีเฉพาะข้อมูล `Matches`; ถ้าต้องการหน้าจัดการสีให้ใช้ `.xlsx` หรือรัน Apps Script รุ่นล่าสุดกับ Google Sheet เดิม

`Matches` ยังเป็นข้อมูลหลักของระบบ ส่วน `Team Colors` เป็นหน้าจัดการสำหรับผู้ปฏิบัติงาน เมื่อแก้คอลัมน์ `PrimaryColor A`, `SecondaryColor A`, `PrimaryColor B` หรือ `SecondaryColor B` Apps Script จะตรวจรูปแบบ HEX บันทึกสีทั้ง 4 ช่องกลับ `Matches` และเพิ่ม `Revision` อัตโนมัติ การแก้สีผ่าน `PepsLive > Pick OBS Color` จะอัปเดตทั้งสองแท็บด้วยวิธีเดียวกัน

ถ้า Google Sheet เดิมยังไม่เห็นแท็บนี้ ให้วาง Apps Script รุ่นล่าสุด กด Save, reload Google Sheet แล้วรัน `PepsLive > Install / Repair Sheet`

## เตรียมสีล่วงหน้า

1. วาง Apps Script รุ่นล่าสุดและรัน `PepsLive > Install / Repair Sheet`
2. เปิดแท็บ `Team Colors` เพื่อแก้ HEX โดยตรง หรือเปิด `PepsLive > Pick OBS Color`
3. เลือก MatchID แล้วกำหนด PrimaryColor / SecondaryColor ของทั้งสองทีม
4. ตรวจว่า `Sync Status` กลับเป็น `READY` และค่าใน `Matches` ถูกอัปเดต
5. ใน Dock กด `Load Sheet` และ `Load Match`

Dock จะใช้ค่า HEX เดียวกันกับ Team Card และแปลงเป็นค่า ABGR สำหรับ OBS Color Source จากนั้นอ่านค่ากลับจาก OBS เพื่อตรวจสอบความตรงกัน

## การบันทึกที่ปลอดภัย

- ทุก Save/Finish ใช้ `OperationID` และ `Revision` ป้องกันคำสั่งซ้ำและข้อมูลเก่าทับข้อมูลใหม่
- Apps Script ใช้ `LockService` และเก็บประวัติในชีตระบบ `PepsLiveOperations`
- ถ้าการเชื่อมต่อขาด Dock จะเก็บรายการไว้ใน Pending และไม่เปลี่ยนไปแมตช์ถัดไปจนกว่าจะได้รับ ACK
- เมื่อเกิด `revision_conflict` ให้โหลด Sheet ใหม่ ตรวจข้อมูล แล้วเลือก Retry หรือ Discard Pending อย่างชัดเจน

## ความหมาย Label ที่แนะนำ

```text
Label1 = รอบการแข่งขัน
Label2 = คู่ที่
Label3 = สนาม
Label4 = รุ่น / ประเภท
Label5 = หมายเหตุ
```
