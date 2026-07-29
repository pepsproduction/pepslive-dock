import assert from 'node:assert/strict';
import test from 'node:test';

import { formatResultText, formatTeamsText } from '../assets/export.js';
import {
  MAX_LOGO_DATA_URL_LENGTH,
  MAX_SCHEDULE_ITEMS,
  logoAssetsFingerprint,
  normalizeLogoAssets,
  normalizeSchedule,
  normalizeTeamColors,
  scheduleFingerprint,
  safeLogoKey,
  safeTeamKey,
  teamColorsFingerprint,
} from '../assets/room-model.js';

test('schedule keeps Sheet order, Thai names, leading-zero IDs, and finished scores', () => {
  const schedule = normalizeSchedule({
    source: 'excel',
    rows: [
      {
        MatchID: '001',
        TeamA: 'ทีมบ้านเหนือ',
        TeamB: 'ทีมบ้านใต้',
        FinalScore: '3-2',
        MatchStatus: 'FINISHED',
        Winner: 'ทีมบ้านเหนือ',
        Label1: 'รอบชิงชนะเลิศ',
        Note: 'must stay private',
        UpdatedBy: 'operator@example.com',
        SheetUrl: 'https://docs.google.com/private',
      },
      {
        MatchID: '002',
        TeamA: 'Peps Academy',
        TeamB: 'Sisaket United',
      },
    ],
  });

  assert.equal(schedule.version, 1);
  assert.equal(schedule.source, 'excel');
  assert.equal(schedule.count, 2);
  assert.deepEqual(Object.keys(schedule.items), ['i_000', 'i_001']);
  assert.equal(schedule.items.i_000.matchId, '001');
  assert.equal(schedule.items.i_000.teamAName, 'ทีมบ้านเหนือ');
  assert.equal(schedule.items.i_000.scoreA, 3);
  assert.equal(schedule.items.i_000.scoreB, 2);
  assert.equal(schedule.items.i_000.hasScore, true);
  assert.equal(schedule.items.i_000.hasResult, true);
  assert.equal(schedule.items.i_000.matchStatus, 'FINISHED');
  assert.equal(schedule.items.i_001.order, 1);

  const publicPayload = JSON.stringify(schedule);
  assert.equal(publicPayload.includes('must stay private'), false);
  assert.equal(publicPayload.includes('operator@example.com'), false);
  assert.equal(publicPayload.includes('docs.google.com'), false);
});

test('schedule limit is explicit and never truncates Sheet rows silently', () => {
  const rows = Array.from({ length: MAX_SCHEDULE_ITEMS + 1 }, (_, index) => ({
    MatchID: String(index + 1),
    TeamA: `A${index}`,
    TeamB: `B${index}`,
  }));
  assert.throws(
    () => normalizeSchedule({ source: 'google', rows }),
    new RegExp(`schedule_limit_${MAX_SCHEDULE_ITEMS}`),
  );
});

test('schedule fingerprint is deterministic and changes with public match data', () => {
  const first = normalizeSchedule({ source: 'google', rows: [{ MatchID: '001', TeamA: 'A', TeamB: 'B' }] });
  const same = normalizeSchedule({ source: 'google', rows: [{ MatchID: '001', TeamA: 'A', TeamB: 'B' }] });
  const changed = normalizeSchedule({ source: 'google', rows: [{ MatchID: '001', TeamA: 'A', TeamB: 'C' }] });
  assert.equal(scheduleFingerprint(first), scheduleFingerprint(same));
  assert.notEqual(scheduleFingerprint(first), scheduleFingerprint(changed));
  assert.match(scheduleFingerprint(first), /^f_[0-9A-F]{8}$/);
});

test('live scores never unlock the Final Score copy action', () => {
  const schedule = normalizeSchedule({
    source: 'google',
    rows: [{
      MatchID: '009',
      TeamA: 'Team Live A',
      TeamB: 'Team Live B',
      ScoreA: '2',
      ScoreB: '1',
      FinalScore: '2-1',
      MatchStatus: 'LIVE',
      Winner: 'Team Live A',
    }],
  });

  assert.equal(schedule.items.i_000.scoreA, 2);
  assert.equal(schedule.items.i_000.scoreB, 1);
  assert.equal(schedule.items.i_000.hasScore, true);
  assert.equal(schedule.items.i_000.hasResult, false);
  assert.equal(schedule.items.i_000.winner, '');
});

test('finished rows need both scores or a valid FinalScore before copy is unlocked', () => {
  const schedule = normalizeSchedule({
    source: 'google',
    rows: [
      { MatchID: '010', TeamA: 'A', TeamB: 'B', MatchStatus: 'FINISHED' },
      { MatchID: '011', TeamA: 'C', TeamB: 'D', ScoreA: '3', MatchStatus: 'FINISHED' },
      { MatchID: '012', TeamA: 'E', TeamB: 'F', FinalScore: '2-1', MatchStatus: 'FINISHED' },
      { MatchID: '013', TeamA: 'G', TeamB: 'H', ScoreA: '3', ScoreB: 'invalid', MatchStatus: 'FINISHED' },
    ],
  });

  assert.equal(schedule.items.i_000.hasScore, false);
  assert.equal(schedule.items.i_000.hasResult, false);
  assert.equal(schedule.items.i_001.hasScore, false);
  assert.equal(schedule.items.i_001.hasResult, false);
  assert.equal(schedule.items.i_002.hasScore, true);
  assert.equal(schedule.items.i_002.hasResult, true);
  assert.equal(schedule.items.i_003.hasScore, false);
  assert.equal(schedule.items.i_003.hasResult, false);
});

test('copy formats stay concise for the Final Score workflow', () => {
  const match = { teamAName: 'ทีมเหนือ', teamBName: 'ทีมใต้', scoreA: 4, scoreB: 3 };
  assert.equal(formatTeamsText(match), 'ทีมเหนือ vs ทีมใต้');
  assert.equal(formatResultText(match), 'ทีมเหนือ 4-3 ทีมใต้');
});

test('schedule publishes team keys, logo references, and normalized Sheet colors', () => {
  const schedule = normalizeSchedule({
    source: 'google',
    rows: [{
      MatchID: '021',
      TeamA: 'Peps United',
      LogoA: 'PEPS-A',
      TeamA_PrimaryColor: '#aa11ff',
      TeamA_SecondaryColor: 'invalid',
      TeamB: 'Bangkok FC',
      LogoB: 'BKK.png',
      TeamB_PrimaryColor: '#0022CC',
      TeamB_SecondaryColor: '#ffffff',
    }],
  });
  const match = schedule.items.i_000;
  assert.equal(match.teamAKey, safeTeamKey('Peps United', 'PEPS-A'));
  assert.equal(match.teamBKey, safeTeamKey('Bangkok FC', 'BKK.png'));
  assert.equal(match.logoA, 'PEPS-A');
  assert.equal(match.logoB, 'BKK.png');
  assert.equal(match.teamAPrimaryColor, '#AA11FF');
  assert.equal(match.teamASecondaryColor, '');
  assert.equal(match.teamBPrimaryColor, '#0022CC');
  assert.equal(match.teamBSecondaryColor, '#FFFFFF');
});

test('team color database is seeded once per team and retains Sheet defaults', () => {
  const schedule = normalizeSchedule({
    source: 'excel',
    rows: [
      {
        MatchID: '031',
        TeamA: 'Same Team',
        LogoA: 'same',
        TeamA_PrimaryColor: '#123456',
        TeamB: 'First Rival',
      },
      {
        MatchID: '032',
        TeamA: 'Second Rival',
        TeamB: 'Same Team',
        LogoB: 'same',
        TeamB_PrimaryColor: '#654321',
      },
    ],
  });
  const colors = normalizeTeamColors(schedule);
  const key = safeTeamKey('Same Team', 'same');
  assert.equal(colors.count, 3);
  assert.equal(colors.items[key].primaryColor, '#123456');
  assert.equal(colors.items[key].sheetPrimaryColor, '#123456');
  assert.equal(colors.items[key].source, 'excel');
  assert.match(teamColorsFingerprint(colors), /^c_[0-9A-F]{8}$/);
});

test('local logo assets accept only capped raster data URLs and fingerprint deterministically', () => {
  const accepted = normalizeLogoAssets({
    assets: [{
      logoRef: 'PEPS-A',
      fileName: 'PEPS-A.svg',
      dataUrl: 'data:image/webp;base64,AAAAAAAAAAAA',
      bytes: 9,
    }],
  });
  const key = 'l_000';
  assert.equal(accepted.count, 1);
  assert.equal(accepted.items[key].mime, 'image/webp');
  assert.equal(accepted.items[key].dataUrl, 'data:image/webp;base64,AAAAAAAAAAAA');
  assert.match(logoAssetsFingerprint(accepted), /^a_[0-9A-F]{8}$/);

  const stableSlots = normalizeLogoAssets({
    assets: [
      {
        slot: 126,
        logoRef: 'LIVE-A',
        fileName: 'LIVE-A.webp',
        dataUrl: 'data:image/webp;base64,AAAAAAAAAAAA',
        bytes: 9,
      },
      {
        slot: 127,
        logoRef: 'LIVE-B',
        fileName: 'LIVE-B.webp',
        dataUrl: 'data:image/webp;base64,BBBBBBBBBBBB',
        bytes: 9,
      },
    ],
  });
  assert.equal(stableSlots.items.l_126.logoRef, 'LIVE-A');
  assert.equal(stableSlots.items.l_127.logoRef, 'LIVE-B');

  const rejected = normalizeLogoAssets({
    assets: [
      { logoRef: 'svg', dataUrl: 'data:image/svg+xml;base64,AAAA', bytes: 3 },
      { logoRef: 'huge', dataUrl: `data:image/png;base64,${'A'.repeat(MAX_LOGO_DATA_URL_LENGTH)}`, bytes: 3 },
    ],
  });
  assert.equal(rejected.count, 0);
});

test('team and logo keys stay distinct when long Thai labels share the same prefix', () => {
  const teamPrefix = 'ทีมเยาวชนจังหวัดเชียงใหม่'.repeat(3);
  const logoPrefix = 'โลโก้การแข่งขันกีฬาประจำจังหวัด'.repeat(8);
  const firstTeamKey = safeTeamKey(`${teamPrefix}หนึ่ง`, 'ตราสโมสรเดียวกัน');
  const secondTeamKey = safeTeamKey(`${teamPrefix}สอง`, 'ตราสโมสรเดียวกัน');
  const firstLogoKey = safeLogoKey(`${logoPrefix}หนึ่ง`);
  const secondLogoKey = safeLogoKey(`${logoPrefix}สอง`);

  assert.notEqual(firstTeamKey, secondTeamKey);
  assert.notEqual(firstLogoKey, secondLogoKey);
  assert.match(firstTeamKey, /^t_[A-Za-z0-9_-]{1,96}$/);
  assert.match(firstLogoKey, /^l_[A-Za-z0-9_-]{1,96}$/);
});
