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
  1. ไฟล์ที่เลือกจากปุ่มเลือกโฟลเดอร์ใน session ปัจจุบัน
  2. URL หรือ Data URL จาก logoMap
  3. Repo/Base Path เช่น `logos/A1.png`
  4. `logos/default.svg` ถ้าโหลดไม่สำเร็จ
- ตรวจว่า `logoPreviewUrl()` ไม่ส่ง `C:/...` เข้า `<img>` ของ Dock โดยตรง
