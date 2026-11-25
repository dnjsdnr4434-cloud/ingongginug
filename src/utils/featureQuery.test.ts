import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultDetailedFeatures,
  formatFeatureSummary,
  buildCombinedAiNotes,
  findMatchingEncyclopediaFish,
  normalizeFishRecipes,
} from './featureQuery';
import { INITIAL_FISH_ENCYCLOPEDIA } from '../data/fishingData';

test('formatFeatureSummary includes special traits and extra description when provided', () => {
  const features = createDefaultDetailedFeatures('동해');
  features.specialTraits = ['이빨이 날카로움', '등·아가미에 강한 가시/독침'];
  features.extraDescription = '입 주변이 붉고 지느러미 끝이 뾰족함';

  const summary = formatFeatureSummary(features);
  assert.match(summary, /해역: 동해/);
  assert.match(summary, /특이사항: 이빨이 날카로움, 등·아가미에 강한 가시\/독침/);
  assert.match(summary, /추가 메모: 입 주변이 붉고 지느러미 끝이 뾰족함/);
});

test('buildCombinedAiNotes formats optional size, depth, traits, and freeText', () => {
  const result = buildCombinedAiNotes({
    locationLabel: '부산 태종대',
    estimatedSizeCm: '28',
    depthMeter: '12',
    selectedTraits: ['줄무늬 뚜렷함'],
    freeText: '주둥이가 단단함',
  });

  assert.equal(
    result,
    '현재 위치: 부산 태종대 / 추정 크기: 28cm / 포획 수심: 12m / 외형 특징: 줄무늬 뚜렷함 / 상세 설명: 주둥이가 단단함'
  );
});

test('findMatchingEncyclopediaFish matches Korean aliases and parenthesized names', () => {
  const matched = findMatchingEncyclopediaFish('광어', INITIAL_FISH_ENCYCLOPEDIA);
  assert.ok(matched !== null);
  assert.equal(matched.id, 'f3');

  const matchedRed = findMatchingEncyclopediaFish('참돔 (Red Seabream)', INITIAL_FISH_ENCYCLOPEDIA);
  assert.ok(matchedRed !== null);
  assert.equal(matchedRed.id, 'f1');

  const unmatched = findMatchingEncyclopediaFish('존재하지않는어종XYZ', INITIAL_FISH_ENCYCLOPEDIA);
  assert.equal(unmatched, null);
});

test('normalizeFishRecipes suppresses cooking recipes for inedible fish and preserves recipes for edible fish', () => {
  const sampleRecipes = [
    { dishName: '우럭 매운탕', method: '무·마늘·고춧가루로 끓이기', difficulty: '초급', tips: '아가미 제거 필수' },
  ];
  assert.deepEqual(normalizeFishRecipes(false, sampleRecipes, '구이'), []);
  const edibleRecipes = normalizeFishRecipes(true, sampleRecipes, '');
  assert.equal(edibleRecipes.length, 1);
  assert.equal(edibleRecipes[0].dishName, '우럭 매운탕');

  const fallbackRecipes = normalizeFishRecipes(true, [], '소금구이로 드세요');
  assert.equal(fallbackRecipes.length, 1);
  assert.equal(fallbackRecipes[0].method, '소금구이로 드세요');
});
