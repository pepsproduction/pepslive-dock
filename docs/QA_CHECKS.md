# QA Checks - Fixed7 Image Source Logo

ตรวจแล้วก่อนแพ็ก:

- JavaScript syntax ผ่าน `node --check`
- ไม่มี duplicate id ใน HTML
- required ids ครบ:
  - btnRepairLogoSources
  - setLogoMode
  - setLogoFolderPath
  - setLogoExts
  - obsTagTable
  - btnCreateSources
  - btnSyncObs
  - btnPickLogoFolder
  - logoFolderInput
  - logoPreviewGrid
  - btnStart
  - clock
  - btnOpenSettings
  - drawer
  - drawerBackdrop
- required functions ครบ:
  - tagInputKind
  - createSourceByTag
  - repairLogoSources
  - ensureLogoImageSource
  - setLogo
  - logoObsValue
  - logoLocalObsPath
  - joinLocalFolderPath
  - getObsInputKind
  - renderObsTagTable
- LogoA / LogoB ใช้ `image_source`
- ไม่มี `logo_viewer.html` ในแพ็ก
- ไม่มี reference ไปยัง `logo_viewer.html`

## ข้อควรทดสอบบนเครื่องจริง

- กด Settings > Logos > ซ่อม Logo Image Sources แล้ว OBS ต้องมี `PEPS_LogoA` และ `PEPS_LogoB` เป็น Image Source
- ตั้ง `Local Folder Path` เป็น path จริง เช่น `C:/PepsLive/logos/`
- กด Sync OBS แล้วโลโก้ PNG ต้องขึ้นใน OBS Preview พร้อมพื้นหลังโปร่งใส


## Fixed8 Dock Logo Preview
- OBS Image Source ยังใช้ `Logo Folder Path` จริง เช่น `C:/PepsLive/logos/`
- หน้า Dock preview จะพยายามแสดงจากลำดับนี้:
  1. ภาพย่อจากโฟลเดอร์ที่เลือกและจำไว้ใน IndexedDB
  2. URL หรือ Data URL จาก logoMap
  3. Repo/Base Path เช่น `logos/A1.png`
  4. `logos/default.svg` ถ้าโหลดไม่สำเร็จ
- ตรวจว่า `logoPreviewUrl()` ไม่ส่ง `C:/...` เข้า `<img>` ของ Dock โดยตรง


## Fixed9 Dock Logo Preview QA
- `logoPreviewCandidates()` exists and tries selected folder, URL/data/blob, repo logos path, then default.
- `setDockLogoImage()` exists and falls back across extensions on image load error.
- `renderMatch()` uses `setDockLogoImage()` for `logoA` and `logoB`.
- `logoObsFile()` remains separated from Dock preview and still returns OBS Image Source path.
- OBS Image Source pipeline is unchanged from Fixed7/Fixed8.

## Firebase Team Color / Local Logo QA

- เจ้าของห้องจาก Browser profile เดียวกับ Host เห็น `OWNER LIVE ROOM`; Viewer อื่นไม่เห็นปุ่มแก้สี
- แก้สีทีมปัจจุบันแล้วตาราง Viewer, Dock LIVE SCORE และ OBS Color Source เปลี่ยนตรงกัน
- แก้ทีมที่ยังไม่แข่งแล้วสีถูกใช้เมื่อ Load คู่นั้น
- `คืนค่าจาก Sheet` กลับไปใช้ค่าต้นทางครั้งแรกที่ทีมนั้นถูก seed จาก Google Sheet/Excel เข้า Room
- โหมด Firebase ไม่เรียก Apps Script color sync และหลังปิดห้อง/สลับโหมดสี Firebase ไม่ไหลไป Google Sheet
- เลือก Folder A แล้วเปลี่ยน Folder B หรือกด `ลืมโฟลเดอร์` โลโก้เก่าต้องหายจาก Viewer
- reload หน้า Dock แล้วภาพย่อ local กลับมาจาก IndexedDB; ถ้าสิทธิ์หมดต้องมีปุ่มเชื่อมโฟลเดอร์เดิม
- path โฟลเดอร์ย่อยจับคู่ได้ และ basename ซ้ำต้องไม่เลือกไฟล์ผิดโฟลเดอร์
- Viewer ไม่ cache Base64 catalog ลง localStorage และ Firebase Rules ปฏิเสธ slot โลโก้เกิน `l_127`
- เปิด Dock สองแท็บแล้วมีเพียงแท็บเดียวเป็น Firebase writer
- ทดสอบ Viewer ที่ 390×650 และ 1280×720 รวม Escape, focus return และ Tab ภายในตัวแก้สี
