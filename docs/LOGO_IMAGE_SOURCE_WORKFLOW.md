# Logo Image Source Workflow

PepsLive Dock V1 ใช้โลโก้แบบ OBS Image Source ตามแนวทางที่เหมาะกับงาน local production

## วิธีที่แนะนำ

1. วางโลโก้ไว้ในเครื่อง เช่น

```text
C:/PepsLive/logos/A1.png
C:/PepsLive/logos/A2.png
```

2. ใน Google Sheet ใส่รหัสโลโก้ เช่น

```text
LogoA = A1
LogoB = A2
```

3. ใน PepsLive Dock ไปที่ `Settings > Logos`
4. กด `เลือกโฟลเดอร์โลโก้` แล้วเลือกโฟลเดอร์ที่เก็บภาพ
5. ตรวจสถานะ `Dock พร้อม` และการจับคู่ทีม
6. ถ้าใช้ Firebase Match Room ระบบจะย่อโลโก้ที่ใช้เป็นภาพนิ่งไม่เกิน 256px และส่งเฉพาะภาพย่อให้ Viewer
7. สำหรับ OBS เปิด `ตั้งค่าขั้นสูงสำหรับ GitHub และ OBS` แล้วใส่ `OBS Folder Path = C:/PepsLive/logos/`
8. กด `ซ่อม OBS Logo Sources` และ `Sync OBS`

## หมายเหตุ

- Browser จำภาพย่อกับสิทธิ์โฟลเดอร์ในเครื่องเดิมผ่าน IndexedDB; ถ้าสิทธิ์หมดให้กด `เชื่อมโฟลเดอร์เดิม`
- `ลืมโฟลเดอร์` ลบเฉพาะแคช Browser และลบภาพเก่าออกจาก Match Room ที่เปิดอยู่ ไม่ลบไฟล์ต้นฉบับ
- รองรับ PNG, JPG, WebP, SVG และ GIF โดย SVG/GIF จะถูก rasterize เป็นภาพนิ่งก่อนใช้
- จำกัดไฟล์ต้นฉบับ 20 MB, 40 ล้านพิกเซล, 500 ไฟล์ต่อการสแกน และส่ง Match Room สูงสุด 128 ภาพ ภาพละไม่เกิน 52 KB
- path จริง, `blob:` URL และชื่อโฟลเดอร์ส่วนตัวไม่ถูกส่งขึ้น Firebase
- เมื่อปิด Room ระบบล้าง payload ภาพย่อออกจาก Firebase ก่อนเปลี่ยนเป็น `CLOSED` เพื่อลดพื้นที่สะสม โดยไม่ลบไฟล์ต้นฉบับหรือแคชในเครื่อง
- OBS Image Source ยังต้องใช้ path จริง เช่น `C:/PepsLive/logos/A1.png`
