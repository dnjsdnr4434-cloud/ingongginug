import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MESSAGE_TEXT_LEN,
  buildDmThreadId,
  canDeleteDmMessage,
  canDeleteRoom,
  canDeleteRoomMessage,
  canReadRoomMessages,
  generateInviteCode,
  maskProfanity,
  maskProfanityText,
  normalizeInviteCode,
  sanitizeAndMaskMessageText,
  sanitizeMessageText,
  sortParticipantPair,
  validateNewOpenRoomInput,
  validateNicknameInput,
  validatePrivateInviteCode,
} from './messenger';

test('buildDmThreadId creates canonical order-independent thread IDs', () => {
  const id1 = buildDmThreadId('userB99', 'userA11');
  const id2 = buildDmThreadId('userA11', 'userB99');
  assert.equal(id1, 'userA11__userB99');
  assert.equal(id1, id2);
});

test('buildDmThreadId rejects identical UIDs', () => {
  assert.throws(() => buildDmThreadId('sameUser', 'sameUser'));
});

test('sortParticipantPair orders users lexicographically by uid', () => {
  const [first, second] = sortParticipantPair(
    { uid: 'zUser', name: '김낚시' },
    { uid: 'aUser', name: '이바다' }
  );
  assert.equal(first.uid, 'aUser');
  assert.equal(second.uid, 'zUser');
});

test('sanitizeMessageText trims and truncates to schema max length', () => {
  const longText = '가'.repeat(MAX_MESSAGE_TEXT_LEN + 50);
  const cleaned = sanitizeMessageText(`  ${longText}  `);
  assert.equal(cleaned.length, MAX_MESSAGE_TEXT_LEN);
});

test('validateNewOpenRoomInput checks minLength and truncates to maxLength', () => {
  assert.equal(validateNewOpenRoomInput('방', '설명').valid, false);
  assert.equal(validateNewOpenRoomInput('제주 방파제방', '   ').valid, false);
  const ok = validateNewOpenRoomInput('  남해 초보 모임  ', '  방파제 정보 공유  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.cleanTitle, '남해 초보 모임');
  assert.equal(ok.cleanDescription, '방파제 정보 공유');
});

test('validateNicknameInput validates min and max length cleanly', () => {
  assert.equal(validateNicknameInput('낚').valid, false);
  assert.equal(validateNicknameInput('가'.repeat(21)).valid, false);
  const ok = validateNicknameInput('  해운대초보조사  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.cleanNickname, '해운대초보조사');
});

test('validatePrivateInviteCode normalizes and checks allowed characters', () => {
  assert.equal(validatePrivateInviteCode('ab').valid, false);
  assert.equal(validatePrivateInviteCode('코드12').valid, false);
  const ok = validatePrivateInviteCode(' sea-482 ');
  assert.equal(ok.valid, true);
  assert.equal(ok.code, 'SEA-482');
  assert.equal(normalizeInviteCode(' ab12 '), 'AB12');
});

test('generateInviteCode produces valid 6-char invite codes', () => {
  const code = generateInviteCode();
  assert.equal(code.length, 6);
  assert.equal(validatePrivateInviteCode(code).valid, true);
});

test('maskProfanity replaces Korean and English profanity with asterisks of matching length', () => {
  const res1 = maskProfanity('오늘 씨발 파도가 높네 ㅅㅂ');
  assert.equal(res1.hasProfanity, true);
  assert.equal(res1.masked, '오늘 ** 파도가 높네 **');

  const res2 = maskProfanity('What the fuck is that shit');
  assert.equal(res2.hasProfanity, true);
  assert.equal(res2.masked, 'What the **** is that ****');

  const res3 = sanitizeAndMaskMessageText('  개새끼야 조용히 해  ');
  assert.equal(res3.hadProfanity, true);
  assert.equal(res3.text, '***야 조용히 해');
});

test('maskProfanity preserves legitimate Korean fishing terms without false positives', () => {
  const safeSentence =
    '새우와 개불 미끼로 조기, 우럭, 고등어 잡고 미친 손맛 보였어요! 다시마 옆 방파제 추천합니다.';
  const res = maskProfanity(safeSentence);
  assert.equal(res.hasProfanity, false);
  assert.equal(maskProfanityText(safeSentence), safeSentence);
});

test('room and message permission helpers enforce host-only room delete and participant-only read', () => {
  assert.equal(canDeleteRoom('hostUid', 'hostUid'), true);
  assert.equal(canDeleteRoom('hostUid', 'memberUid'), false);
  assert.equal(canDeleteRoom('hostUid', null), false);

  assert.equal(canReadRoomMessages(true, 'memberUid'), true);
  assert.equal(canReadRoomMessages(false, 'memberUid'), false);
  assert.equal(canReadRoomMessages(true, null), false);

  assert.equal(canDeleteRoomMessage('userA', 'hostUid', 'userA'), true);
  assert.equal(canDeleteRoomMessage('userA', 'hostUid', 'hostUid'), true);
  assert.equal(canDeleteRoomMessage('userA', 'hostUid', 'userB'), false);

  assert.equal(canDeleteDmMessage('userA', ['userA', 'userB'], 'userA'), true);
  assert.equal(canDeleteDmMessage('userA', ['userA', 'userB'], 'userB'), false);
  assert.equal(canDeleteDmMessage('userA', ['userA', 'userB'], 'userC'), false);
});

