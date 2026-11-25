import type { FishSpecies } from '../data/fishingData';
import type { SeaRegion } from './geo';

export interface FishRecipe {
  dishName: string;
  method: string;
  difficulty: string;
  tips: string;
}

export interface AnatomicalDetails {
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

export interface FishSearchResponse {
  matchedFish: {
    speciesName: string;
    scientificName: string;
    aliases?: string[];
    matchConfidence: number;
    isUncertain: boolean;
    uncertaintyReason: string;
    analysisSummary: string;
    habitat: string;
    features: string;
    anatomicalDetails?: AnatomicalDetails;
    edible: boolean;
    edibilityStatus: string;
    edibilityReason: string;
    toxicity: string;
    fishingBan: string;
    protected: boolean;
    protectionNote?: string;
    recommendedRecipes: FishRecipe[];
    similarSpecies?: SimilarSpeciesCandidate[];
    imageUrl?: string;
  };
  relatedCandidates: Array<{
    speciesName: string;
    scientificName: string;
    similarityPercent: number;
    reason: string;
    edible: boolean;
    imageUrl?: string;
  }>;
}

export interface DetailedFishFeatures {
  region: SeaRegion;
  directDescription: string;
  extraDescription?: string;
}

export interface FeatureSearchResultItem {
  speciesName: string;
  scientificName: string;
  matchScore: number;
  isUncertain?: boolean;
  description: string;
  visualDescription?: string;
  anatomicalDetails?: AnatomicalDetails;
  differentiatingPoints?: string;
  matchingTraits: string[];
  edible: boolean;
  edibilityStatus?: string;
  edibilityReason?: string;
  toxicity: string;
  fishingBan: string;
  recipe: string;
  recommendedRecipes?: FishRecipe[];
  imageUrl?: string;
}

export function createDefaultDetailedFeatures(region: SeaRegion): DetailedFishFeatures {
  return {
    region,
    directDescription: '',
    extraDescription: '',
  };
}

export function findMatchingEncyclopediaFish(
  speciesName: string,
  encyclopedia: FishSpecies[]
): FishSpecies | undefined {
  const clean = (speciesName || '')
    .split('(')[0]
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!clean) return undefined;
  return encyclopedia.find((item) => {
    const n = item.name.replace(/\s+/g, '').toLowerCase();
    return n.includes(clean) || clean.includes(n.split('(')[0]);
  });
}

export function normalizeFishRecipes(
  edible: boolean,
  recipes?: FishRecipe[],
  fallbackSummary?: string
): FishRecipe[] {
  if (!edible) return [];
  if (Array.isArray(recipes) && recipes.length > 0) {
    return recipes;
  }
  if (fallbackSummary && fallbackSummary.trim()) {
    return [
      {
        dishName: '기본 손질 및 추천 조리',
        method: fallbackSummary.trim(),
        difficulty: '초급',
        tips: '내장과 비늘을 깨끗이 손질한 뒤 신선할 때 조리하세요.',
      },
    ];
  }
  return [];
}
