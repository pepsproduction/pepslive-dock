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

function roomFixture({
  ownerUid = OWNER_UID,
  roomCode = ROOM_CODE,
  publicView = true,
  current = {},
  meta = {},
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

  if (matches) room.matches = matches;
  if (audit) room.audit = audit;
  return room;
}

function createRoomPayload(ownerUid = OWNER_UID, roomCode = ROOM_CODE, overrides = {}) {
  const payload = roomFixture({ ownerUid, roomCode, ...overrides });
  payload.meta.createdAt = serverTimestamp();
  payload.meta.updatedAt = serverTimestamp();
  payload.current.updatedAt = serverTimestamp();
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
    matches: { [eventId]: historyEntry(eventId) },
    audit: { [eventId]: auditEntry(eventId) },
  });
  const db = dbFor(VIEWER_UID);

  await assertSucceeds(get(ref(db, `${roomPath()}/current`)));
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
    matches: { [eventId]: historyEntry(eventId) },
    audit: { [eventId]: auditEntry(eventId) },
  });

  const viewerDb = dbFor(VIEWER_UID);
  await assertFails(get(ref(viewerDb, `${roomPath()}/current`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/matches`)));
  await assertFails(get(ref(viewerDb, `${roomPath()}/meta/publicView`)));

  const ownerDb = dbFor(OWNER_UID);
  await assertSucceeds(get(ref(ownerDb, `${roomPath()}/current`)));
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
  }
});

test('owner current transaction succeeds without a meta timestamp write', async () => {
  await seedRoom();
  const ownerDb = dbFor(OWNER_UID);
  const currentRef = ref(ownerDb, `${roomPath()}/current`);

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

test('score, clock, revision, sport, color, and status validators reject bad values', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const currentRef = ref(db, `${roomPath()}/current`);

  for (const score of [-1, 1.5, 1_000, '3']) {
    await assertFails(update(currentRef, { scoreA: score }));
  }
  await assertFails(update(currentRef, { clockSec: -1 }));
  await assertFails(update(currentRef, { clockSec: 86_401 }));
  await assertFails(update(currentRef, { clockSec: 1.5 }));
  await assertFails(update(currentRef, { timerRunning: 'false' }));
  await assertFails(update(currentRef, { sport: 'basketball' }));
  await assertFails(update(currentRef, { teamAPrimaryColor: '#FFF' }));
  await assertFails(update(currentRef, { status: 'FINISHED' }));
  await assertFails(update(currentRef, { revision: 0 }));
  await assertFails(update(currentRef, { updatedAt: SEEDED_AT - 1 }));
  await assertFails(update(currentRef, { updatedAt: Date.now() + 120_000 }));

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

  await assertFails(update(currentRef, { teamAName: 'A'.repeat(101) }));
  await assertFails(update(currentRef, { teamAName: '' }));
  await assertFails(update(currentRef, { label1: 'x'.repeat(151) }));
  await assertFails(update(currentRef, { matchId: 'x'.repeat(161) }));
  await assertFails(update(currentRef, { label2: 'x'.repeat(151) }));
  await assertFails(update(currentRef, { label3: 'x'.repeat(201) }));
  await assertFails(update(currentRef, { label4: 'x'.repeat(151) }));
  await assertFails(update(currentRef, { label5: 'x'.repeat(201) }));
  await assertFails(update(currentRef, { unexpected: true }));
  await assertFails(remove(ref(db, `${roomPath()}/current/teamAName`)));

  await assertSucceeds(
    update(currentRef, {
      label1: 'x'.repeat(150),
      matchId: 'x'.repeat(160),
      label2: 'x'.repeat(150),
      label3: 'x'.repeat(200),
      label4: 'x'.repeat(150),
      label5: 'x'.repeat(200),
    }),
  );
});

test('meta limits, immutable identity fields, and OPEN/CLOSED status are enforced', async () => {
  await seedRoom();
  const db = dbFor(OWNER_UID);
  const metaRef = ref(db, `${roomPath()}/meta`);

  await assertSucceeds(
    update(metaRef, { status: 'CLOSED', updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
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
  await seedRoom();
  const db = dbFor(OWNER_UID);

  await assertFails(remove(ref(db, `${roomPath()}/current`)));
  await assertFails(remove(ref(db, `${roomPath()}/meta`)));
  await assertFails(remove(ref(db, roomPath())));
});
