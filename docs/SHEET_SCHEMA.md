# Google Sheet / Excel Schema สำหรับ PepsLive Dock V1

## แหล่งข้อมูลที่รองรับ

- `Google Sheet` โหลดรายการแข่งขันผ่าน URL ของชีต
- `Excel (.xlsx)` โหลดจากเครื่องเข้าสู่ Match Loader ได้โดยตรง ระบบจะเลือกแท็บ `Matches` ก่อน หรือเลือกแท็บแรกที่มีหัวตารางครบ
- Excel เป็นแหล่งข้อมูลแบบอ่านอย่างเดียว ระบบจะไม่แก้ไฟล์ `.xlsx` ต้นฉบับ
- รองรับตารางไม่เกิน 1,000 แถวทั้ง Google Sheet และ Excel เพื่อส่งทุกคู่ไป Match Room Viewer; ไฟล์ Excel ต้องไม่เกิน 10 MB และไม่รองรับ `.xls` รุ่นเก่าหรือสูตรที่ต้องคำนวณใหม่

การเลือก Google Sheet หรือ Excel กำหนดเฉพาะว่า Dock จะโหลดรายชื่อแมตช์จากที่ใด ส่วนปลายทางที่ใช้บันทึกผลให้เลือกแยกต่างหากใน Settings

## แหล่งโหลดและระบบอัปเดตผล

Dock โหลดตารางได้ทั้ง Google Sheet และ Excel ในทั้งสองโหมด แต่จะส่งผลการแข่งขันไปเพียงระบบเดียวตามที่เลือก เพื่อป้องกันข้อมูลสองปลายทางไม่ตรงกัน

| ระบบอัปเดตผล | แหล่งที่โหลดได้ | เมื่อกด `Save` / `Finish` | ข้อควรรู้ |
| --- | --- | --- | --- |
| `Google Apps Script` (แบบเดิม) | Google Sheet หรือ Excel | ถ้าโหลดจาก Google Sheet จะเขียนผลกลับผ่าน Apps Script; ถ้าโหลดจาก Excel จะบันทึกใน Dock เท่านั้น | ใช้ Revision, Pending และการซิงก์สีของระบบเดิม; ไม่ส่งผลไป Firebase |
| `Firebase Realtime Database` (แบบใหม่) | Google Sheet หรือ Excel | บันทึกใน Dock และส่งไป Firebase Match Room ที่เปิดอยู่ | ไม่เขียนผลกลับ Google Sheet และไม่แก้ไฟล์ Excel |

หน้า Settings แยกส่วนแสดงผลตามระบบที่บันทึกแล้วอย่างชัดเจน:

- ส่วน `แหล่งข้อมูลแมตช์` และ `Match Schema V2` แสดงทั้งสองโหมด เพราะ Google Sheet และ Excel เป็นแหล่งรายชื่อร่วม
- เมื่อใช้ `Google Apps Script` จะแสดงเฉพาะ Webhook, คู่มือติดตั้ง, Setup/Repair และ Google Pending โดยซ่อนส่วนจัดการ Firebase
- เมื่อใช้ `Firebase Realtime Database` จะแสดงเฉพาะสถานะ Firebase และทางลัดไปจัดการ Match Room โดยซ่อน Webhook, คู่มือติดตั้ง และ Google Pending
- การคลิกเลือก radio อย่างเดียวยังไม่เปลี่ยนส่วนที่แสดง ต้องกด `บันทึกและเปลี่ยนระบบ` และรอหน้ารีโหลดก่อนเสมอ

### วิธีเปลี่ยนระบบ

1. เปิด `Settings > Sheet`
2. ที่หัวข้อ `ระบบอัปเดตผลการแข่งขัน` เลือก `Google Apps Script` หรือ `Firebase Realtime Database` เพียงหนึ่งรายการ
3. กด `บันทึกและเปลี่ยนระบบ` แล้วรอหน้า Dock รีโหลดหนึ่งครั้ง
4. ถ้าเลือก Firebase ให้ไปที่หน้า `04 ระบบ > Firebase Match Room` แล้วกด `สร้างห้อง` ก่อนบันทึกผล

### ตัวป้องกันการสลับระบบ

- ระบบจะอ่านสถานะล่าสุดจากเครื่องก่อนเปลี่ยนโหมด และไม่ให้เปลี่ยนขณะที่แมตช์มี Unsaved, Timer กำลังเดิน หรือมี Google Pending ค้างอยู่ แม้รายการนั้นถูกสร้างจากอีกแท็บ
- ก่อนเปลี่ยนจาก Firebase กลับเป็น Google Apps Script ต้องปิด Firebase Match Room และรอให้รายการซิงก์เสร็จก่อน
- ถ้าเครื่องมี Firebase Room เดิมค้างอยู่แต่ Settings อยู่ในโหมด Google Apps Script ระบบยังอนุญาตให้สลับกลับ Firebase เพื่อกู้หรือปิดห้องเดิมได้
- ระบบจะไม่ย้ายรายการ Pending จากระบบหนึ่งไปอีกระบบหนึ่งโดยอัตโนมัติ
- โหมด Firebase ต้องมีห้องที่เปิดอยู่และ Host พร้อมใช้งาน มิฉะนั้น `Save` / `Finish` จะถูกหยุดพร้อมข้อความแนะนำ
- Firebase ใช้ได้เมื่อเปิด Dock ผ่าน `http://127.0.0.1`, `localhost` หรือ GitHub Pages เท่านั้น ไม่รองรับการเปิดไฟล์ด้วย `file://`
- ถ้าอีกแท็บเปลี่ยนระบบอยู่ แท็บเก่าจะหยุดปุ่มบันทึกและให้ Reload ก่อน เพื่อไม่ให้สองแท็บส่งผลไปคนละระบบ
- การ Import state จะคงระบบอัปเดตผลที่เลือกอยู่ในเครื่องนี้ การเปลี่ยนระบบต้องทำผ่านปุ่มเฉพาะเท่านั้น
- Firebase Match Room หนึ่งห้องมี Host เจ้าของเพียงหนึ่งรายที่เขียนข้อมูลได้ ส่วน Viewer อ่านและคัดลอกข้อมูลได้เท่านั้น
- ไม่ว่าเลือกโหมดใด ไฟล์ Excel ต้นฉบับจะไม่ถูกแก้ไข

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
