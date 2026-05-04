# Google Sheet Schema สำหรับ PepsLive Dock V1

ใช้หัวตารางนี้เท่านั้น:

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
```

## ความหมาย Label ที่แนะนำ

```text
Label1 = รอบการแข่งขัน
Label2 = คู่ที่
Label3 = สนาม
Label4 = รุ่น / ประเภท
Label5 = หมายเหตุ
```

## ผลการแข่งขัน

เมื่อกด Save Result หรือ Finish Match ระบบจะอัปเดตแถวเดิมตาม MatchID โดยเขียนค่า:

```text
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
