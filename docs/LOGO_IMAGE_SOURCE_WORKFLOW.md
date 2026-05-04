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

3. ใน PepsLive Dock ไปที่ Settings > Logos

```text
Logo Mode = Local Folder
Local Folder Path = C:/PepsLive/logos/
Extensions = png,jpg,jpeg,webp,svg
```

4. กด บันทึกค่าโลโก้
5. กด ซ่อม Logo Image Sources
6. กด Sync OBS

## หมายเหตุ

ปุ่มเลือกโฟลเดอร์ใน browser ใช้สำหรับ Preview ใน Dock เท่านั้น เพราะเว็บบน GitHub Pages ไม่สามารถอ่าน path จริงของเครื่องได้ถาวรด้วยเหตุผลด้านความปลอดภัย

OBS Image Source ต้องใช้ path จริง เช่น `C:/PepsLive/logos/A1.png`
