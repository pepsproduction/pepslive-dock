# PepsLive Dock Stream Deck V1

ปลั๊กอินนี้ออกแบบให้ใช้กับ PepsLive Dock ที่รันจาก GitHub Pages ได้ โดยไม่ต้องมี local server

## หลักการเชื่อมต่อ

Stream Deck -> OBS WebSocket -> Text Source `PEPS_CommandBus` -> PepsLive Dock -> OBS Sources / Google Sheet

เพราะ GitHub Pages เป็นเว็บ static จึงรับ HTTP command จาก Stream Deck โดยตรงไม่ได้ จึงใช้ `PEPS_CommandBus` เป็นตัวกลางใน OBS

## วิธีติดตั้ง

1. ปิด Stream Deck software ก่อน
2. เปิดไฟล์ `install_streamdeck_plugin_windows.bat`
3. เปิด Stream Deck software ใหม่
4. ลากปุ่มจากหมวด `PepsLive Dock` ไปวางบน Stream Deck
5. กดปุ่มใดก็ได้ แล้วตั้งค่าใน Property Inspector:
   - OBS Host: `127.0.0.1`
   - OBS Port: `4455`
   - OBS Password: รหัส OBS WebSocket
   - CommandBus Source: `PEPS_CommandBus`
6. เปิด PepsLive Dock ใน OBS Dock แล้วกด Connect OBS
7. กด Create Sources เพื่อสร้าง `PEPS_CommandBus` และ source อื่น ๆ

## ปุ่มที่มีใน V1

- Team A/B +1, +2, +3, -1
- Start / Pause / Reset Timer
- Undo
- Load Selected Match
- Load Next Match
- Save Result
- Finish Match
- Sync OBS
- Team A FX / Team B FX / Hide FX
- Sport: Football / Basketball 3x3 / Basketball 5v5
- Status: LIVE / BREAK / FULL TIME
- Next Period
- Reset Match

## หมายเหตุ

ต้องเปิด PepsLive Dock อยู่เสมอ ถ้า Dock ไม่เปิด Stream Deck จะเขียนคำสั่งเข้า OBS ได้ แต่ไม่มีตัวอ่านคำสั่งไปประมวลผลต่อ


## ปุ่ม Source Actions เพิ่มเติม

```text
Source Action 1
Source Action 2
Source Action 3
Source Action 4
Source Action 5
Source Action 6
Hide All Actions
```

ปุ่มเหล่านี้จะส่งคำสั่งไปที่ `PEPS_CommandBus` แล้วให้ PepsLive Dock V1 อ่านค่าและสั่ง OBS ตาม Settings > Source Actions
