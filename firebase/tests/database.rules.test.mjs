import { readFile } from 'node:fs/promises';
import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  get,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';

const PROJECT_ID = 'demo-pepslive-match-room';
const ROOM_CODE = '123456';
const OWNER_UID = 'owner-anon-uid';
const VIEWER_UID = 'viewer-anon-uid';
const OTHER_UID = 'other-anon-uid';
const SEEDED_AT = 1_700_000_000_000;

const anonymousClaims = {
  provider_id: 'anonymous',
  firebase: { sign_in_provider: 'anonymous' },
};

let testEnv;

function authenticated(uid) {
  return testEnv.authenticatedContext(uid, anonymousClaims);
}

function dbFor(uid) {
  return authenticated(uid).database();
}

function roomPath(roomCode = ROOM_CODE) {
  return `matchRoomsV1/${roomCode}`;
}

function currentSnapshot(overrides = {}) {
  return {
    matchKey: 'match_001',
    matchId: 'M-001',
    teamAName: 'Team A',
    teamBName: 'Team B',
    scoreA: 3,
    scoreB: 2,
    logoA: '',
    logoB: '',
    teamAPrimaryColor: '#FF3366',
    teamASecondaryColor: '#FFFFFF',
    teamBPrimaryColor: '#3366FF',
    teamBSecondaryColor: '#000000',
    sport: 'football',
    clockSec: 5_400,
    clockText: '90:00',
    clockMode: 'down',
    timerRunning: false,
    period: '2nd Half',
    status: 'LIVE',
    matchStatus: 'LIVE',
    label1: 'PepsLive Cup',
    label2: 'Main Stadium',
    label3: 'รอบคัดเลือก',
    label4: 'Group A',
    label5: '',
    updatedAt: SEEDED_AT,
    revision: 1,
    ...overrides,
  };
}

function scheduleItem(overrides = {}) {
  return {
    order: 0,
    matchKey: 'm_TTAwMQ',
    matchId: 'M-001',
    teamAName: 'Team A',
    teamBName: 'Team B',
    teamAKey: 't_team_a',
    teamBKey: 't_team_b',
    logoA: 'A1',
    logoB: 'B1',
    teamAPrimaryColor: '#FF3366',
    teamASecondaryColor: '#FFFFFF',
    teamBPrimaryColor: '#3366FF',
    teamBSecondaryColor: '#000000',
    scoreA: 0,
    scoreB: 0,
    hasScore: false,
    hasResult: false,
    matchStatus: '',
    winner: '',
    label1: 'Round 1',
    label2: 'Match 1',
    label3: 'Main Stadium',
    label4: 'Group A',
    label5: '',
    ...overrides,
  };
}

function scheduleSnapshot(overrides = {}) {
  const items = overrides.items ?? { i_000: scheduleItem() };
  return {
    version: 1,
    source: 'google',
    fingerprint: 'f_1234ABCD',
    revision: 1,
    updatedAt: SEEDED_AT,
    count: Object.keys(items).length,
    ...(Object.keys(items).length ? { items } : {}),
    ...overrides,
  };
}

function teamColorProfile(overrides = {}) {
  return {
    teamKey: 't_team_a',
    teamName: 'Team A',
    logoRef: 'A1',
    primaryColor: '#FF3366',
    secondaryColor: '#FFFFFF',
    sheetPrimaryColor: '#AA0000',
    sheetSecondaryColor: '#111111',
    source: 'google',
    revision: 1,
    updatedAt: SEEDED_AT,
    ...overrides,
  };
}

function logoAsset(overrides = {}) {
  return {
    logoKey: 'l_000',
    logoRef: 'A1',
    fileName: 'A1.png',
    mime: 'image/webp',
    bytes: 9,
    dataUrl: 'data:image/webp;base64,AAAAAAAAAAAA',
    revision: 1,
    updatedAt: SEEDED_AT,
    ...overrides,
  };
}

function roomFixture({
  ownerUid = OWNER_UID,
  roomCode = ROOM_CODE,
  publicView = true,
  current = {},
  meta = {},
  schedule,
  teamColors,
  logoAssets,
  matches,
  audit,
} = {}) {
  const room = {
    meta: {
      ownerUid,
      roomCode,
      publicView,
      status: 'OPEN',
      eventName: 'PepsLive Cup',
      venue: 'Main Stadium',
      round: 'รอบคัดเลือก',
      group: 'Group A',
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      ...meta,
    },
    current: currentSnapshot(current),
  };

  if (schedule) room.schedule = schedule;
  if (teamColors) room.teamColors = teamColors;
  if (logoAssets) room.logoAssets = logoAssets;
  if (matches) room.matches = matches;
  if (audit) room.audit = audit;
  return room;
}

function createRoomPayload(ownerUid = OWNER_UID, roomCode = ROOM_CODE, overrides = {}) {
  const payload = roomFixture({ ownerUid, roomCode, ...overrides });
  payload.meta.createdAt = serverTimestamp();
  payload.meta.updatedAt = serverTimestamp();
  payload.current.updatedAt = serverTimestamp();
  if (overrides.schedule !== null) {
    payload.schedule = overrides.schedule || scheduleSnapshot();
    payload.schedule.updatedAt = serverTimestamp();
  }
  return payload;
}

function historyEntry(eventId, overrides = {}) {
  return {
    ...currentSnapshot({
      status: 'FULL TIME',
      matchStatus: 'FINISHED',
      timerRunning: false,
      revision: 2,
    }),
    eventId,
    createdAt: SEEDED_AT,
    ...overrides,
  };
}

function auditEntry(eventId, ownerUid = OWNER_UID, overrides = {}) {
  return {
    eventId,
    actorUid: ownerUid,
    action: 'FINISH',
    matchKey: 'match_001',
    matchId: 'M-001',
    createdAt: SEEDED_AT,
    revision: 2,
    ...overrides,
  };
}

async function seedRoom(options = {}) {
  const fixture = roomFixture(options);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), roomPath(fixture.meta.roomCode)), fixture);
  });
  return fixture;
}

function finishUpdatePayload(eventId, ownerUid = OWNER_UID, overrides = {}) {
  const finishedCurrent = currentSnapshot({
    scoreA: 3,
    scoreB: 2,
    status: 'FULL TIME',
    matchStatus: 'FINISHED',
    timerRunning: false,
    updatedAt: serverTimestamp(),
    revision: 2,
    ...(overrides.current || {}),
  });

  const history = {
    ...finishedCurrent,
    eventId,
    createdAt: serverTimestamp(),
    ...(overrides.history || {}),
  };

  const audit = {
    eventId,
    actorUid: ownerUid,
    action: 'FINISH',
    matchKey: finishedCurrent.matchKey,
    matchId: finishedCurrent.matchId,
    createdAt: serverTimestamp(),
    revision: finishedCurrent.revision,
    ...(overrides.audit || {}),
  };

  return {
    [`${roomPath()}/current`]: finishedCurrent,
    [`${roomPath()}/matches/${eventId}`]: history,
    [`${roomPath()}/audit/${eventId}`]: audit,
    [`${roomPath()}/meta/updatedAt`]: serverTimestamp(),
  };
}

before(async () => {
  const rules = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules },
  });
});

afterEach(async () => {
  await testEnv.clearDatabase();
});

after(async () => {
  await testEnv.cleanup();
});

test('authenticated viewer reads only public child paths', async () => {
  const eventId = 'op_public_001';
  await seedRoom({
    schedule: scheduleSnapshot(),
    teamColors: { t_team_a: teamColorProfile() },
    logoAssets: { l_000: logoAsset() },
    matches: { [eventId]: historyEntry(eventId) },
    audit: { [eventId]: auditEntry(eventId) },
  });
  const db = dbFor(VIEWER_UID);

  await assertSucceeds(get(ref(db, `${roomPath()}/current`)));
  await assertSucceeds(get(ref(db, `${roomPath()}/schedule`)));
  await assertSucceeds(get(ref(db, `${roomPath()}/teamColors`)));
  await assertSucceeds(get(ref(db, `${roomPath()}/logoAssets`)));
  await assertSucceeds(get(ref(db, `${roomPath()}/matches`)));
  for (const field of [
    'publicView',
    'status',
    'eventName',
    'venue',
    'round',
    'group',
    'createdAt',
    'updatedAt',
  ]) {
    await assertSucceeds(get(ref(db, `${roomPath()}/meta/${field}`)));
  }

  await assertFails(get(ref(db, roomPath())));
  await assertFails(get(ref(db, 'matchRoomsV1')));
  await assertFails(get(ref(db)));
  await assertFails(get(ref(db, `${roomPath()}/meta`)));
  await assertFails(get(ref(db, `${roomPath()}/meta/ownerUid`)));
  await assertFails(get(ref(db, `${roomPath()}/meta/roomCode`)));
  await assertFails(get(ref(db, `${roomPath()}/audit`)));
});

test('private room is invisible to a viewer but readable by its owner at child paths', async () => {
  const eventId = 'op_private_001';
  await seedRoom({
    publicView: false,
    schedule: scheduleSnapshot(),
    teamColors: { t_team_a: teamColorProfile() },
    logoAssets: { l_000: logoAsset() },
    matches: { [eventId]: historyEntry(eventId) },
    audit: { [eventId]: auditEntry(eventId) },
  });

  const viewerDb = dbFor(VIEWER_UID);
  await assertFails(get(ref(viewerDb, `${roomPath()}/current`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/schedule`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/teamColors`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/logoAssets`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/matches`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/meta/publicView`)));

  const ownerDb = dbFor(OWNER_UID);
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/current`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/schedule`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/teamColors`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/logoAssets`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/matches`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/audit`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/meta/ownerUid`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/meta/roomCode`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/meta/status`)));
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/meta`)));
  await assertFails(get(ref(ownerDb, roomPath())));
});

test('unauthenticated clients cannot read a public room', async () => {
  await seedRoom();
  const db = testEnv.unauthenticatedContext().database();

  await assertFails(get(ref(db, `${roomPath()}/current`)));
  await assertFails(get(ref(db, `${roomPath()}/schedule`)));
  await assertFails(get(ref(db, `${roomPath()}/matches`)));
  await assertFails(get(ref(db, `${roomPath()}/meta/status`)));
});

test('owner creates one complete six-digit room with server timestamps', async () => {
  const ownerDb = dbFor(OWNER_UID);
  await assertSucceeds(
    set(ref(ownerDb, roomPath()), createRoomPayload()),
  );

  const stored = await assertSucceeds(get(ref(ownerDb, `${roomPath()}/current`)));
  assert.equal(stored.val().scoreA, 3);
  const storedSchedule = await assertSucceeds(get(ref(ownerDb, `${roomPath()}/schedule`)));
  assert.equal(storedSchedule.val().count, 1);

  await assertSucceeds(
    set(
      ref(ownerDb, roomPath('567890')),
      createRoomPayload(OWNER_UID, '567890', { schedule: null }),
    ),
  );
  await assertFails(
    set(
      ref(ownerDb, roomPath('678901')),
      createRoomPayload(OWNER_UID, '678901', {
        schedule: scheduleSnapshot({ items: { i_1000: scheduleItem() } }),
      }),
    ),
  );

  const otherDb = dbFor(OTHER_UID);
  await assertFails(
    set(
      ref(otherDb, roomPath('234567')),
      createRoomPayload(OWNER_UID, '234567'),
    ),
  );
  await assertFails(
    set(
      ref(ownerDb, roomPath('12345')),
      createRoomPayload(OWNER_UID, '12345'),
    ),
  );
  await assertFails(
    set(
      ref(ownerDb, roomPath('345678')),
      createRoomPayload(OWNER_UID, '345678', {
        current: { scoreA: -1 },
      }),
    ),
  );
  await assertFails(
    set(
      ref(ownerDb, roomPath('456780')),
      createRoomPayload(OWNER_UID, '456780', {
        current: { revision: 2 },
      }),
    ),
  );
  await assertFails(
    set(
      ref(ownerDb, roomPath('456781')),
      createRoomPayload(OWNER_UID, '456781', {
        meta: { status: 'CLOSED' },
      }),
    ),
  );
  const seededEventId = 'op_seeded_001';
  await assertFails(
    set(
      ref(ownerDb, roomPath('456782')),
      createRoomPayload(OWNER_UID, '456782', {
        current: {
          status: 'FULL TIME',
          matchStatus: 'FINISHED',
          timerRunning: false,
        },
        matches: {
          [seededEventId]: historyEntry(seededEventId, {
            revision: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        },
        audit: {
          [seededEventId]: auditEntry(seededEventId, OWNER_UID, {
            revision: 1,
            createdAt: serverTimestamp(),
          }),
        },
      }),
    ),
  );
  await assertFails(
    set(
      ref(ownerDb, `${roomPath('456789')}/meta`),
      createRoomPayload(OWNER_UID, '456789').meta,
    ),
  );
});

test('viewer, unauthenticated user, and another owner cannot write room data', async () => {
  await seedRoom();
  const viewerDb = dbFor(VIEWER_UID);
  const unauthDb = testEnv.unauthenticatedContext().database();
  const otherDb = dbFor(OTHER_UID);

  for (const db of [viewerDb, unauthDb, otherDb]) {
    await assertFails(set(ref(db, `${roomPath()}/current/scoreA`), 9));
    await assertFails(
      update(ref(db, `${roomPath()}/meta`), {
        status: 'CLOSED',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      set(ref(db, `${roomPath()}/matches/op_denied`), historyEntry('op_denied')),
    );
    await assertFails(
      set(ref(db, `${roomPath()}/audit/op_denied`), auditEntry('op_denied')),
    );
    await assertFails(
      set(ref(db, `${roomPath()}/schedule`), scheduleSnapshot({ revision: 2, updatedAt: Date.now() })),
    );
  }
});

test('owner current transaction succeeds without a meta timestamp write', async () => {
  await seedRoom();
  const ownerDb = dbFor(OWNER_UID);
  const currentRef = ref(ownerDb, `${roomPath()}/current`);

  await assertFails(
    update(currentRef, {
      scoreA: 4,
      revision: 1,
      updatedAt: Date.now(),
    }),
  );
  await assertFails(
    update(currentRef, {
      scoreA: 4,
      revision: 3,
      updatedAt: Date.now(),
    }),
  );
  await assertSucceeds(
    runTransaction(currentRef, (value) => currentSnapshot({
      ...(value || {}),
      scoreA: Number(value?.scoreA || 3) + 1,
      revision: Number(value?.revision || 0) + 1,
      updatedAt: Date.now(),
    })),
  );

  const stored = await get(currentRef);
  assert.equal(stored.val().scoreA, 4);
  assert.equal(stored.val().revision, 2);
});

test('owner replaces the public schedule while schema, revision, and room status stay valid', async () => {
  await seedRoom({ schedule: scheduleSnapshot() });
  const ownerDb = dbFor(OWNER_UID);
  const scheduleRef = ref(ownerDb, `${roomPath()}/schedule`);
  const twoMatches = {
    i_000: scheduleItem(),
    i_001: scheduleItem({
      order: 1,
      matchKey: 'm_TTAwMg',
      matchId: 'M-002',
      teamAName: 'เธ—เธตเธกเน€เธซเธเธทเธญ',
      teamBName: 'เธ—เธตเธกเนเธ•เน',
      scoreA: 2,
      scoreB: 1,
      hasScore: true,
      hasResult: true,
      matchStatus: 'FINISHED',
      winner: 'เธ—เธตเธกเน€เธซเธเธทเธญ',
    }),
  };

  await assertSucceeds(set(scheduleRef, scheduleSnapshot({
    items: twoMatches,
    fingerprint: 'f_2345BCDE',
    revision: 2,
    updatedAt: Date.now(),
  })));
  const stored = await get(scheduleRef);
  assert.equal(stored.val().count, 2);
  assert.equal(stored.val().items.i_001.matchId, 'M-002');

  await assertFails(set(scheduleRef, scheduleSnapshot({
    items: twoMatches,
    fingerprint: 'f_3456CDEF',
    revision: 2,
    updatedAt: Date.now(),
  })));
  await assertFails(remove(scheduleRef));

  const invalidPayloads = [
    scheduleSnapshot({ count: 1_001, fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ source: 'private-url', fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ fingerprint: 'not-a-fingerprint', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ items: { i_1000: scheduleItem() }, fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ items: { i_000: scheduleItem({ scoreA: -1 }) }, fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ items: { i_000: scheduleItem({ hasResult: true, matchStatus: 'FINISHED' }) }, fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ items: { i_000: scheduleItem({ hasScore: true, hasResult: true, matchStatus: 'LIVE' }) }, fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
    scheduleSnapshot({ items: { i_000: scheduleItem({ unexpected: true }) }, fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() }),
  ];
  const missingTeam = scheduleSnapshot({ fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() });
  delete missingTeam.items.i_000.teamAName;
  invalidPayloads.push(missingTeam);
  const missingHasScore = scheduleSnapshot({ fingerprint: 'f_3456CDEF', revision: 3, updatedAt: Date.now() });
  delete missingHasScore.items.i_000.hasScore;
  invalidPayloads.push(missingHasScore);
  for (const payload of invalidPayloads) await assertFails(set(scheduleRef, payload));

  await assertSucceeds(set(scheduleRef, scheduleSnapshot({
    items: {},
    source: 'none',
    fingerprint: 'f_4567DEFA',
    revision: 3,
    updatedAt: Date.now(),
  })));
  await assertSucceeds(update(ref(ownerDb, `${roomPath()}/meta`), {
    status: 'CLOSED',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(set(scheduleRef, scheduleSnapshot({
    fingerprint: 'f_5678EFAB',
    revision: 4,
    updatedAt: Date.now(),
  })));
});

test('owner manages the Firebase team color database while viewers remain read-only', async () => {
  await seedRoom({ schedule: scheduleSnapshot() });
  const ownerDb = dbFor(OWNER_UID);
  const viewerDb = dbFor(VIEWER_UID);
  const otherDb = dbFor(OTHER_UID);
  const unauthDb = testEnv.unauthenticatedContext().database();
  const profileRef = ref(ownerDb, `${roomPath()}/teamColors/t_team_a`);
  const first = { ...teamColorProfile(), updatedAt: serverTimestamp() };

  await assertFails(set(ref(viewerDb, `${roomPath()}/teamColors/t_team_a`), first));
  await assertFails(set(ref(otherDb, `${roomPath()}/teamColors/t_team_a`), first));
  await assertFails(set(ref(unauthDb, `${roomPath()}/teamColors/t_team_a`), first));
  await assertSucceeds(set(profileRef, first));

  await assertSucceeds(set(profileRef, {
    ...teamColorProfile({
      primaryColor: '#ABCDEF',
      secondaryColor: '#222222',
      source: 'viewer',
      revision: 2,
    }),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(set(profileRef, {
    ...teamColorProfile({
      primaryColor: '#AA0000',
      secondaryColor: '#111111',
      source: 'google',
      revision: 3,
    }),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(set(profileRef, {
    ...teamColorProfile({
      sheetPrimaryColor: '#123456',
      sheetSecondaryColor: '#654321',
      revision: 4,
    }),
    updatedAt: serverTimestamp(),
  }));

  const invalidProfiles = [
    teamColorProfile({ primaryColor: '#FFF', revision: 5 }),
    teamColorProfile({ source: 'apps-script', revision: 5 }),
    teamColorProfile({ revision: 6 }),
    teamColorProfile({ teamName: 'Tampered', revision: 5 }),
    teamColorProfile({ unexpected: true, revision: 5 }),
  ];
  for (const profile of invalidProfiles) {
    await assertFails(set(profileRef, { ...profile, updatedAt: serverTimestamp() }));
  }
  await assertFails(remove(profileRef));
});

test('local logo assets are public-readable but owner-only, raster-only, and size-capped', async () => {
  await seedRoom();
  const ownerDb = dbFor(OWNER_UID);
  const viewerDb = dbFor(VIEWER_UID);
  const assetRef = ref(ownerDb, `${roomPath()}/logoAssets/l_000`);
  const first = { ...logoAsset(), updatedAt: serverTimestamp() };

  await assertFails(set(ref(viewerDb, `${roomPath()}/logoAssets/l_000`), first));
  await assertSucceeds(set(assetRef, first));
  await assertSucceeds(get(ref(viewerDb, `${roomPath()}/logoAssets/l_000`)));
  await assertSucceeds(set(assetRef, {
    ...logoAsset({
      dataUrl: 'data:image/png;base64,AAAAAAAAAAAA',
      mime: 'image/png',
      revision: 2,
    }),
    updatedAt: serverTimestamp(),
  }));

  const invalidAssets = [
    logoAsset({ mime: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,AAAA', revision: 3 }),
    logoAsset({ bytes: 52_001, revision: 3 }),
    logoAsset({ dataUrl: 'data:text/html;base64,AAAA', revision: 3 }),
    logoAsset({ revision: 4 }),
    logoAsset({ unexpected: true, revision: 3 }),
  ];
  for (const asset of invalidAssets) {
    await assertFails(set(assetRef, { ...asset, updatedAt: serverTimestamp() }));
  }
  await assertFails(remove(ref(viewerDb, `${roomPath()}/logoAssets/l_000`)));
  await assertSucceeds(remove(assetRef));

  const cappedCatalog = Object.fromEntries(Array.from({ length: 128 }, (_, index) => {
    const key = `l_${String(index).padStart(3, '0')}`;
    return [key, logoAsset({ logoKey: key, logoRef: `ASSET-${index}`, fileName: `${index}.webp` })];
  }));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `${roomPath()}/logoAssets`), cappedCatalog);
  });
  const overflow = logoAsset({
    logoKey: 'l_128',
    logoRef: 'OVERFLOW',
    fileName: 'overflow.webp',
  });
  await assertFails(set(ref(ownerDb, `${roomPath()}/logoAssets/l_128`), {
    ...overflow,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(remove(ref(ownerDb, `${roomPath()}/logoAssets/l_000`)));
  await assertSucceeds(set(ref(ownerDb, `${roomPath()}/logoAssets/l_000`), {
    ...logoAsset({ logoRef: 'REPLACEMENT', fileName: 'replacement.webp' }),
    updatedAt: serverTimestamp(),
  }));
});

test('closed Firebase room rejects team color and logo asset changes', async () => {
  await seedRoom({
    meta: { status: 'CLOSED' },
    teamColors: { t_team_a: teamColorProfile() },
    logoAssets: { l_000: logoAsset() },
  });
  const ownerDb = dbFor(OWNER_UID);
  await assertFails(set(ref(ownerDb, `${roomPath()}/teamColors/t_team_a`), {
    ...teamColorProfile({ primaryColor: '#ABCDEF', revision: 2 }),
    updatedAt: serverTimestamp(),
  }));
  await assertFails(set(ref(ownerDb, `${roomPath()}/logoAssets/l_000`), {
    ...logoAsset({ revision: 2 }),
    updatedAt: serverTimestamp(),
  }));
  await assertFails(remove(ref(ownerDb, `${roomPath()}/logoAssets/l_000`)));
});

test('owner clears local logo payloads before closing a room', async () => {
  await seedRoom({
    logoAssets: {
      l_000: logoAsset(),
      l_001: logoAsset({ logoKey: 'l_001', logoRef: 'A2', fileName: 'A2.webp' }),
    },
  });
  const ownerDb = dbFor(OWNER_UID);
  const assetsRef = ref(ownerDb, `${roomPath()}/logoAssets`);
  await assertSucceeds(update(ref(ownerDb, roomPath()), {
    logoAssets: null,
    'meta/status': 'CLOSED',
    'meta/updatedAt': serverTimestamp(),
  }));
  const cleared = await assertSucceeds(get(assetsRef));
  assert.equal(cleared.exists(), false);
  const status = await assertSucceeds(get(ref(ownerDb, `${roomPath()}/meta/status`)));
  assert.equal(status.val(), 'CLOSED');
});

test('score, clock, revision, sport, color, and status validators reject bad values', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const currentRef = ref(db, `${roomPath()}/current`);
  const withNextRevision = (patch) => ({
    revision: 2,
    updatedAt: Date.now(),
    ...patch,
  });

  for (const score of [-1, 1.5, 1_000, '3']) {
    await assertFails(update(currentRef, withNextRevision({ scoreA: score })));
  }
  await assertFails(update(currentRef, withNextRevision({ clockSec: -1 })));
  await assertFails(update(currentRef, withNextRevision({ clockSec: 86_401 })));
  await assertFails(update(currentRef, withNextRevision({ clockSec: 1.5 })));
  await assertFails(update(currentRef, withNextRevision({ timerRunning: 'false' })));
  await assertFails(update(currentRef, withNextRevision({ sport: 'basketball' })));
  await assertFails(update(currentRef, withNextRevision({ teamAPrimaryColor: '#FFF' })));
  await assertFails(update(currentRef, withNextRevision({ status: 'FINISHED' })));
  await assertFails(update(currentRef, withNextRevision({ revision: 0 })));
  await assertFails(update(currentRef, withNextRevision({ revision: 3 })));
  await assertFails(update(currentRef, withNextRevision({ updatedAt: SEEDED_AT - 1 })));
  await assertFails(update(currentRef, withNextRevision({ updatedAt: Date.now() + 120_000 })));

  await assertSucceeds(
    update(currentRef, {
      clockSec: 86_400,
      sport: 'basket5',
      status: 'CLOSED',
      teamAPrimaryColor: '#Aa00Ff',
      updatedAt: Date.now(),
      revision: 2,
    }),
  );
});

test('text limits, required fields, and allowlists reject malformed snapshots', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const currentRef = ref(db, `${roomPath()}/current`);
  const withNextRevision = (patch) => ({
    revision: 2,
    updatedAt: Date.now(),
    ...patch,
  });

  await assertFails(update(currentRef, withNextRevision({ teamAName: 'A'.repeat(101) })));
  await assertFails(update(currentRef, withNextRevision({ teamAName: '' })));
  await assertFails(update(currentRef, withNextRevision({ label1: 'x'.repeat(151) })));
  await assertFails(update(currentRef, withNextRevision({ matchId: 'x'.repeat(161) })));
  await assertFails(update(currentRef, withNextRevision({ label2: 'x'.repeat(151) })));
  await assertFails(update(currentRef, withNextRevision({ label3: 'x'.repeat(201) })));
  await assertFails(update(currentRef, withNextRevision({ label4: 'x'.repeat(151) })));
  await assertFails(update(currentRef, withNextRevision({ label5: 'x'.repeat(201) })));
  await assertFails(update(currentRef, withNextRevision({ unexpected: true })));
  await assertFails(update(currentRef, withNextRevision({ teamAName: null })));

  await assertSucceeds(
    update(currentRef, withNextRevision({
      label1: 'x'.repeat(150),
      matchId: 'x'.repeat(160),
      label2: 'x'.repeat(150),
      label3: 'x'.repeat(200),
      label4: 'x'.repeat(150),
      label5: 'x'.repeat(200),
    })),
  );
});

test('meta limits, immutable identity fields, and terminal CLOSED status are enforced', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const metaRef = ref(db, `${roomPath()}/meta`);

  await assertSucceeds(
    update(metaRef, { status: 'CLOSED', updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { status: 'OPEN', updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { status: 'closed', updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { eventName: 'x'.repeat(151), updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { venue: 'x'.repeat(201), updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { round: 'x'.repeat(101), updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { group: 'x'.repeat(101), updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { ownerUid: OTHER_UID, updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { roomCode: '654321', updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { createdAt: SEEDED_AT + 1, updatedAt: serverTimestamp() }),
  );
  await assertFails(
    update(metaRef, { extra: 'nope', updatedAt: serverTimestamp() }),
  );
});

test('closed room rejects current, match history, and audit writes', async () => {
  await seedRoom({ meta: { status: 'CLOSED' } });
  const db = dbFor(OWNER_UID);

  await assertFails(
    set(
      ref(db, `${roomPath()}/current`),
      currentSnapshot({
        scoreA: 4,
        revision: 2,
        updatedAt: Date.now(),
      }),
    ),
  );

  const eventId = 'op_closed_001';
  const eventUpdates = finishUpdatePayload(eventId);
  delete eventUpdates[`${roomPath()}/current`];
  await assertFails(update(ref(db), eventUpdates));

  const storedHistory = await get(ref(db, `${roomPath()}/matches/${eventId}`));
  const storedAudit = await get(ref(db, `${roomPath()}/audit/${eventId}`));
  assert.equal(storedHistory.exists(), false);
  assert.equal(storedAudit.exists(), false);
});

test('finish is one authorized multi-path write with matching idempotency event IDs', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const eventId = 'google_op-ABC_123';

  await assertSucceeds(update(ref(db), finishUpdatePayload(eventId)));

  const current = await get(ref(db, `${roomPath()}/current`));
  const history = await get(ref(db, `${roomPath()}/matches/${eventId}`));
  const audit = await get(ref(db, `${roomPath()}/audit/${eventId}`));
  assert.equal(current.val().status, 'FULL TIME');
  assert.equal(history.val().eventId, eventId);
  assert.equal(audit.val().actorUid, OWNER_UID);
  assert.equal(audit.val().action, 'FINISH');
});

test('finish rejects orphan, mismatched, invalid, or non-owner event writes', async () => {
  await seedRoom();
  const ownerDb = dbFor(OWNER_UID);
  const validEventId = 'op_valid_001';

  const missingAudit = finishUpdatePayload(validEventId);
  delete missingAudit[`${roomPath()}/audit/${validEventId}`];
  await assertFails(update(ref(ownerDb), missingAudit));

  const missingMatch = finishUpdatePayload(validEventId);
  delete missingMatch[`${roomPath()}/matches/${validEventId}`];
  await assertFails(update(ref(ownerDb), missingMatch));

  const missingCurrent = finishUpdatePayload(validEventId);
  delete missingCurrent[`${roomPath()}/current`];
  await assertFails(update(ref(ownerDb), missingCurrent));

  const mismatchedIds = finishUpdatePayload(validEventId);
  const mismatchedAudit = mismatchedIds[`${roomPath()}/audit/${validEventId}`];
  delete mismatchedIds[`${roomPath()}/audit/${validEventId}`];
  mismatchedIds[`${roomPath()}/audit/op_other_002`] = {
    ...mismatchedAudit,
    eventId: 'op_other_002',
  };
  await assertFails(update(ref(ownerDb), mismatchedIds));

  const badEmbeddedId = finishUpdatePayload(validEventId, OWNER_UID, {
    history: { eventId: 'op_other_002' },
  });
  await assertFails(update(ref(ownerDb), badEmbeddedId));

  const badActor = finishUpdatePayload(validEventId, OWNER_UID, {
    audit: { actorUid: OTHER_UID },
  });
  await assertFails(update(ref(ownerDb), badActor));

  const badAction = finishUpdatePayload(validEventId, OWNER_UID, {
    audit: { action: 'DELETE' },
  });
  await assertFails(update(ref(ownerDb), badAction));

  const mismatchedAuditMatch = finishUpdatePayload(validEventId, OWNER_UID, {
    audit: { matchId: 'M-OTHER' },
  });
  await assertFails(update(ref(ownerDb), mismatchedAuditMatch));

  const mismatchedAuditRevision = finishUpdatePayload(validEventId, OWNER_UID, {
    audit: { revision: 3 },
  });
  await assertFails(update(ref(ownerDb), mismatchedAuditRevision));

  const mismatchedHistoryScore = finishUpdatePayload(validEventId, OWNER_UID, {
    history: { scoreA: 99 },
  });
  await assertFails(update(ref(ownerDb), mismatchedHistoryScore));

  const mismatchedHistoryLogo = finishUpdatePayload(validEventId, OWNER_UID, {
    history: { logoA: 'https://example.com/wrong-logo.png' },
  });
  await assertFails(update(ref(ownerDb), mismatchedHistoryLogo));

  const mismatchedHistoryColor = finishUpdatePayload(validEventId, OWNER_UID, {
    history: { teamAPrimaryColor: '#ABCDEF' },
  });
  await assertFails(update(ref(ownerDb), mismatchedHistoryColor));

  const mismatchedHistoryLabel = finishUpdatePayload(validEventId, OWNER_UID, {
    history: { label3: 'Wrong history label' },
  });
  await assertFails(update(ref(ownerDb), mismatchedHistoryLabel));

  const badKey = 'event id with spaces';
  await assertFails(update(ref(ownerDb), finishUpdatePayload(badKey)));

  await assertFails(
    update(ref(dbFor(OTHER_UID)), finishUpdatePayload(validEventId, OTHER_UID)),
  );
});

test('finish requires the atomic meta timestamp update', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const eventId = 'op_atomic_001';
  const updates = finishUpdatePayload(eventId);
  delete updates[`${roomPath()}/meta/updatedAt`];

  await assertFails(update(ref(db), updates));
});

test('history and audit events are append-only and cannot be replayed or deleted', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const eventId = 'op_once_001';

  await assertSucceeds(update(ref(db), finishUpdatePayload(eventId)));
  await assertFails(update(ref(db), finishUpdatePayload(eventId)));
  await assertFails(remove(ref(db, `${roomPath()}/matches/${eventId}`)));
  await assertFails(remove(ref(db, `${roomPath()}/audit/${eventId}`)));
});

test('owner cannot delete required nodes or an existing room', async () => {
  await seedRoom({ schedule: scheduleSnapshot() });
  const db = dbFor(OWNER_UID);

  await assertFails(remove(ref(db, `${roomPath()}/current`)));
  await assertFails(remove(ref(db, `${roomPath()}/schedule`)));
  await assertFails(remove(ref(db, `${roomPath()}/meta`)));
  await assertFails(remove(ref(db, roomPath())));
});
