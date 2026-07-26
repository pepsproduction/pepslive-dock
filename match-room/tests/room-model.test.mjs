import assert from 'node:assert/strict';
import test from 'node:test';

import { formatResultText, formatTeamsText } from '../assets/export.js';
import {
  MAX_SCHEDULE_ITEMS,
  normalizeSchedule,
  scheduleFingerprint,
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
