import type { FishSpecies } from '../data/fishingData';

export interface DetailedFishFeatures {
  region: string;
  location: string;
  depthLayer: string;
  season: string;
  bait: string;
  sizeRange: string;
  bodyShape: string;
  color: string;
  pattern: string;
  finShape: string;
  specialTraits: string[];
  extraDescription: string;
}

export interface FishRecipeItem {
  dishName: string;
  method: string;
  difficulty: string;
  tips: string;
}

export interface FishAnatomicalDetails {
  bodyAndColor: string;
  finsAndSpines: string;
  headMouthPattern: string;
}

export interface SimilarSpeciesCandidate {
  speciesName: string;
  scientificName: string;
  similarityPercent: number;
  differentiatingPoints: string;
  edible: boolean;
  toxicity: string;
  imageUrl?: string;
}

export interface FishSearchAnalysis {
  speciesName: string;
  scientificName: string;
  aliases?: string[];
  matchConfidence: number;
  isUncertain?: boolean;
  uncertaintyReason?: string;
  imageUrl?: string;
  analysisSummary: string;
  habitat: string;
  features: string;
  anatomicalDetails?: FishAnatomicalDetails;
  edible: boolean;
  edibilityStatus: string;
  edibilityReason: string;
  toxicity: string;
  fishingBan: string;
  protected: boolean;
  protectionNote?: string;
  recommendedRecipes: FishRecipeItem[];
  similarSpecies?: SimilarSpeciesCandidate[];
}

export interface FishRelatedCandidate {
  speciesName: string;
  scientificName?: string;
  similarityPercent?: number;
  reason: string;
  edible: boolean;
  imageUrl?: string;
}

export interface FishSearchResponse {
  matchedFish: FishSearchAnalysis;
  relatedCandidates: FishRelatedCandidate[];
}

export interface FeatureSearchResultItem {
  speciesName: string;
  scientificName?: string;
  matchScore: number;
  isUncertain?: boolean;
  imageUrl?: string;
  description: string;
  visualDescription?: string;
  anatomicalDetails?: FishAnatomicalDetails;
  differentiatingPoints?: string;
  matchingTraits?: string[];
  edible: boolean;
  edibilityStatus?: string;
  edibilityReason?: string;
  toxicity: string;
  fishingBan: string;
  recipe: string;
  recommendedRecipes?: FishRecipeItem[];
  similarSpecies?: SimilarSpeciesCandidate[];
}

export function normalizeFishRecipes(
  edible: boolean,
  recipes?: FishRecipeItem[] | null,
  fallbackRecipeText?: string
): FishRecipeItem[] {
  if (!edible) return [];
  const cleaned = Array.isArray(recipes)
    ? recipes
        .filter((r) => r && typeof r.dishName === 'string' && r.dishName.trim().length > 0)
        .map((r) => ({
          dishName: r.dishName.trim(),
          method: (r.method || '').trim(),
          difficulty: (r.difficulty || '초급').trim(),
          tips: (r.tips || '').trim(),
        }))
    : [];

  if (cleaned.length > 0) return cleaned;
  if (fallbackRecipeText && fallbackRecipeText.trim()) {
    return [
      {
        dishName: '추천 기본 손질·조리법',
        method: fallbackRecipeText.trim(),
        difficulty: '초급',
        tips: '싱싱한 상태에서 내장과 비늘을 깨끗이 제거한 뒤 조리하세요.',
      },
    ];
  }
  return [];
}

export const SPECIAL_TRAIT_OPTIONS = [
  '이빨이 날카로움',
  '주둥이가 뾰족함',
  '몸을 부풀림',
  '등·아가미에 강한 가시/독침',
  '눈이 한쪽에 몰려 있음',
  '입 주변 수염 있음',
  '비늘이 거의 없고 미끈함',
  '옆줄(측선)이 뚜렷함',
] as const;

export const QUICK_AI_NOTE_TRAITS = [
  '등·아가미 가시 있음',
  '줄무늬 뚜렷함',
  '작은 반점 있음',
  '납작한 체형',
  '배가 부풀어 오름',
  '붉은빛 체색',
] as const;

export function createDefaultDetailedFeatures(region: string = '남해'): DetailedFishFeatures {
  return {
    region,
    location: '방파제/테트라포드',
    depthLayer: '중층·바닥 주변',
    season: '가을 (9~11월)',
    bait: '갯지렁이/크릴 (생미끼)',
    sizeRange: '15cm ~ 30cm (중형)',
    bodyShape: '타원형/돔 형태',
    color: '은회색/흑색',
    pattern: '세로 줄무늬',
    finShape: '등지느러미 가시 발달 · V자형 꼬리',
    specialTraits: [],
    extraDescription: '',
  };
}

/**
 * Formats detailed feature criteria into a structured Korean summary string.
 */
export function formatFeatureSummary(features: DetailedFishFeatures): string {
  const parts: string[] = [
    `해역: ${features.region}`,
    `장소: ${features.location}`,
    `수심층: ${features.depthLayer}`,
    `계절: ${features.season}`,
    `체장: ${features.sizeRange}`,
    `체형: ${features.bodyShape}`,
    `체색: ${features.color}`,
    `무늬: ${features.pattern}`,
    `지느러미: ${features.finShape}`,
  ];

  if (features.bait) {
    parts.push(`미끼: ${features.bait}`);
  }
  if (features.specialTraits.length > 0) {
    parts.push(`특이사항: ${features.specialTraits.join(', ')}`);
  }
  if (features.extraDescription.trim()) {
    parts.push(`추가 메모: ${features.extraDescription.trim()}`);
  }

  return parts.join(' | ');
}

/**
 * Combines photo-ID quick traits, estimated size, depth, and free text into notes for Gemini.
 */
export function buildCombinedAiNotes(params: {
  locationLabel: string;
  estimatedSizeCm?: string;
  depthMeter?: string;
  selectedTraits: string[];
  freeText: string;
}): string {
  const items: string[] = [`현재 위치: ${params.locationLabel}`];
  if (params.estimatedSizeCm?.trim()) {
    items.push(`추정 크기: ${params.estimatedSizeCm.trim()}cm`);
  }
  if (params.depthMeter?.trim()) {
    items.push(`포획 수심: ${params.depthMeter.trim()}m`);
  }
  if (params.selectedTraits.length > 0) {
    items.push(`외형 특징: ${params.selectedTraits.join(', ')}`);
  }
  if (params.freeText.trim()) {
    items.push(`상세 설명: ${params.freeText.trim()}`);
  }
  return items.join(' / ');
}

/**
 * Matches a predicted species name against the local encyclopedia for photo & deep-link comparison.
 */
export function findMatchingEncyclopediaFish(
  speciesName: string,
  encyclopedia: FishSpecies[]
): FishSpecies | null {
  const normalized = speciesName.replace(/\s+/g, '').toLowerCase();
  if (!normalized) return null;

  for (const fish of encyclopedia) {
    const baseName = fish.name.split('(')[0].replace(/\s+/g, '').toLowerCase();
    const aliases = baseName.split('/').map((s) => s.trim()).filter(Boolean);
    for (const alias of aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return fish;
      }
    }
  }
  return null;
}
