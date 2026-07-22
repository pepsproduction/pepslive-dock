# Google Sheet / Excel Schema สำหรับ PepsLive Dock V1

## แหล่งข้อมูลที่รองรับ

- `Google Sheet` ใช้สำหรับงานหลายเครื่องและบันทึกผลกลับผ่าน Apps Script
- `Excel (.xlsx)` โหลดจากเครื่องเข้าสู่ Match Loader ได้โดยตรง ระบบจะเลือกแท็บ `Matches` ก่อน หรือเลือกแท็บแรกที่มีหัวตารางครบ
- โหมด Excel เป็นการอ่านไฟล์ต้นฉบับเท่านั้น เมื่อกด `Save` หรือ `Finish` ระบบจะเก็บสถานะไว้ใน Dock และ Firebase Match Room (ถ้าเปิดใช้งาน) แต่จะไม่แก้ไฟล์ `.xlsx`
- รองรับตารางไม่เกิน 1,000 แถวทั้ง Google Sheet และ Excel เพื่อส่งทุกคู่ไป Match Room Viewer; ไฟล์ Excel ต้องไม่เกิน 10 MB และไม่รองรับ `.xls` รุ่นเก่าหรือสูตรที่ต้องคำนวณใหม่

ถ้าต้องการให้ผลการแข่งขันเขียนกลับและแชร์ข้ามเครื่อง ให้ใช้ Google Sheet; ถ้าต้องการเปิดรายชื่อแมตช์อย่างรวดเร็วจากไฟล์ในเครื่อง ให้ใช้ Excel

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

ถ้า `MatchID` มีเลขศูนย์นำหน้า เช่น `001` ให้กำหนดเซลล์เป็นข้อความ (`Plain text`) ตั้งแต่ต้น ไม่ควรใช้ตัวเลขพร้อมรูปแบบ `000` เพราะตัวอ่าน Excel อาจได้ค่าเป็น `1`

สีใช้รูปแบบ `#RRGGBB` เช่น `#FF6A00` และเก็บเป็นตัวพิมพ์ใหญ่ ช่องสีที่เว้นว่างจะใช้สีสำรองจาก Dock ส่วน `Revision` กับ `LastOperationID` ให้ระบบจัดการเอง

## แท็บ Team Colors

ไฟล์ template `.xlsx` รุ่นล่าสุดมีแท็บ `Team Colors` แยกจากตาราง `Matches` เพื่อให้เห็นชื่อทีมและสีทั้ง 4 ช่องโดยไม่ต้องเลื่อนไปคอลัมน์ด้านขวา ไฟล์ `.csv` ไม่สามารถมีหลายแท็บได้ จึงมีเฉพาะข้อมูล `Matches`; ถ้าต้องการหน้าจัดการสีให้ใช้ `.xlsx` หรือรัน Apps Script รุ่นล่าสุดกับ Google Sheet เดิม

เมื่อนำไฟล์ `.xlsx` มาโหลดจากเครื่อง Dock จะอ่านค่าจากแท็บ `Matches` เท่านั้น ดังนั้นให้แก้คอลัมน์สีท้ายแท็บ `Matches` โดยตรงก่อนโหลด ส่วนการซิงก์สีจากแท็บ `Team Colors` กลับไป `Matches` ใช้ได้เมื่อไฟล์ถูกติดตั้งเป็น Google Sheet ผ่าน Apps Script

`Matches` ยังเป็นข้อมูลหลักของระบบ ส่วน `Team Colors` เป็นหน้าจัดการสำหรับผู้ปฏิบัติงาน เมื่อแก้ค่า HEX ในคอลัมน์ `PrimaryColor A`, `SecondaryColor A`, `PrimaryColor B` หรือ `SecondaryColor B` Apps Script จะตรวจรูปแบบและซิงก์กลับ `Matches` อัตโนมัติ ถ้าใช้ปุ่ม `Fill color` ระบบจะอ่านสีพื้นจริงของเซลล์ เปลี่ยนรหัส `#RRGGBB` ให้ตรงกัน และเพิ่ม `Revision` ผ่านเส้นทางบันทึกเดียวกัน การแก้สีผ่าน `PepsLive > Pick OBS Color` จะอัปเดตทั้งสองแท็บด้วยวิธีเดียวกัน Dock รุ่นล่าสุดอ่าน revision สีทุกประมาณ 3 วินาที และส่งการแก้สีจาก Dock กลับ Sheet อัตโนมัติ

รายการสีใช้ Operation Type `SHEET_COLOR_PICK` หรือ `DOCK_COLOR_SYNC` ใน `PepsLiveOperations` ทำให้ Dock ตรวจได้ว่า revision ที่เพิ่มขึ้นเป็นการแก้สีล้วน หากมี `MATCH_SAVE` หรือ revision ที่ตรวจสอบไม่ได้ ระบบจะไม่เลื่อน base revision เองและจะให้ผู้ใช้ `Load Sheet` แล้ว `Load Match` ใหม่เพื่อป้องกันคะแนนหรือผลการแข่งขันถูกเขียนทับ

ถ้า Google Sheet เดิมยังไม่เห็นแท็บนี้ ให้วาง Apps Script รุ่นล่าสุด กด Save, reload Google Sheet แล้วรัน `PepsLive > Install / Repair Sheet`

## เตรียมสีล่วงหน้า

1. วาง Apps Script รุ่นล่าสุดและรัน `PepsLive > Install / Repair Sheet`
2. เปิดแท็บ `Team Colors` แล้วกด `Fill color` ที่ช่องสี, แก้ HEX โดยตรง หรือเปิด `PepsLive > Pick OBS Color`
3. เลือก MatchID แล้วกำหนด PrimaryColor / SecondaryColor ของทั้งสองทีม
4. ตรวจว่ารหัส HEX ตรงกับสีพื้น, `Sync Status` กลับเป็น `READY` และค่าใน `Matches` ถูกอัปเดต
5. เปิด match เดียวกันใน Dock แล้วตรวจว่าสีเปลี่ยนตามอัตโนมัติภายในประมาณ 3 วินาที
6. ใน Dock กด `Load Sheet` และ `Load Match`

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
