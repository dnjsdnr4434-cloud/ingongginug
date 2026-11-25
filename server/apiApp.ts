import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import {
  buildDetailedKoreanAddress,
  calculateDistanceKm,
  extractClientIpFromHeader,
  isInKoreaBounds,
} from '../src/utils/geo';
import { INITIAL_FISH_ENCYCLOPEDIA } from '../src/data/fishingData';

dotenv.config();

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAP_CACHE_TTL_MS = 15 * 60 * 1000;
const FISH_IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const reverseGeocodeCache = new Map<string, CacheEntry<any>>();
const nearbySpotsCache = new Map<string, CacheEntry<any[]>>();
const placeSearchCache = new Map<string, CacheEntry<any[]>>();
const fishImageCache = new Map<string, CacheEntry<string>>();
let googleRestCooldownUntil = 0;

function cleanSpeciesQueryName(raw?: string): string {
  return (raw || '')
    .split('(')[0]
    .split('/')[0]
    .trim();
}

async function fetchWikipediaThumb(lang: 'ko' | 'en', title: string): Promise<string> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return '';
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      cleanTitle
    )}&prop=pageimages&format=json&piprop=thumbnail&pithumbsize=500&redirects=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return '';
    const json: any = await res.json().catch(() => null);
    const pages = json?.query?.pages;
    if (!pages || typeof pages !== 'object') return '';
    for (const page of Object.values<any>(pages)) {
      const src = page?.thumbnail?.source;
      if (typeof src === 'string' && src.startsWith('http') && !/\.svg(\?|$)/i.test(src)) {
        return src;
      }
    }
    return '';
  } catch {
    return '';
  }
}

async function resolveFishImageUrl(speciesName?: string, scientificName?: string): Promise<string> {
  const koName = cleanSpeciesQueryName(speciesName);
  const sciName = cleanSpeciesQueryName(scientificName);
  const cacheKey = `${koName.toLowerCase()}__${sciName.toLowerCase()}`;
  if (!koName && !sciName) return '';

  const cached = fishImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [koThumb, enSciThumb, koSearchThumb] = await Promise.all([
    koName ? fetchWikipediaThumb('ko', koName) : Promise.resolve(''),
    sciName ? fetchWikipediaThumb('en', sciName) : Promise.resolve(''),
    koName && speciesName && speciesName.includes('(')
      ? fetchWikipediaThumb('ko', speciesName.trim())
      : Promise.resolve(''),
  ]);

  let resolved = enSciThumb || koThumb || koSearchThumb || '';

  if (!resolved && (koName || sciName)) {
    const normKo = koName.replace(/\s+/g, '').toLowerCase();
    const normSci = sciName.replace(/\s+/g, '').toLowerCase();
    const encycMatch = INITIAL_FISH_ENCYCLOPEDIA.find((f) => {
      const fName = f.name.replace(/\s+/g, '').toLowerCase();
      const fSci = f.scientificName.replace(/\s+/g, '').toLowerCase();
      return (normKo && fName.includes(normKo)) || (normSci && fSci.includes(normSci));
    });
    if (encycMatch?.image) {
      resolved = encycMatch.image;
    }
  }

  fishImageCache.set(cacheKey, {
    value: resolved,
    expiresAt: Date.now() + FISH_IMAGE_CACHE_TTL_MS,
  });
  return resolved;
}

function parseGeminiJson<T>(rawText: string | undefined, fallback: T): T {
  const cleaned = (rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return fallback;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objStart = cleaned.indexOf('{');
    const arrStart = cleaned.indexOf('[');
    const startIdx =
      objStart >= 0 && arrStart >= 0
        ? Math.min(objStart, arrStart)
        : Math.max(objStart, arrStart);
    if (startIdx >= 0) {
      const endChar = cleaned[startIdx] === '[' ? ']' : '}';
      const endIdx = cleaned.lastIndexOf(endChar);
      if (endIdx > startIdx) {
        try {
          return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as T;
        } catch {
          return fallback;
        }
      }
    }
    return fallback;
  }
}

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  const jsonParser = express.json({ limit: '15mb' });
  app.use((req, res, next) => {
    // Vercel serverless runtime may pre-parse JSON req.body before invoking Express
    if (req.body !== undefined && typeof req.body === 'object') {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  function formatGeminiErrorMessage(err: any): { status: number; message: string } {
    const raw = String(err?.message || err || '');
    if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
      return {
        status: 403,
        message:
          'Gemini API 키가 유효하지 않거나 권한이 없습니다. 환경 변수(GEMINI_API_KEY)를 확인해 주세요.',
      };
    }
    if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
      return {
        status: 503,
        message: '현재 AI 분석 서버에 요청이 몰려 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
      };
    }
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        message: 'AI 요청 한도가 일시적으로 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      };
    }
    if (raw.includes('TIMEOUT') || raw.includes('aborted')) {
      return {
        status: 504,
        message: 'AI 분석 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      };
    }
    return {
      status: 500,
      message: 'AI 어종 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  let hydrogenCooldownUntil = 0;

  async function generateGeminiStructured(options: {
    contents: any;
    responseSchema: any;
    timeoutMs?: number;
  }) {
    const primaryFastTimeoutMs = 6000;
    const liteTimeoutMs = options.timeoutMs ?? 18000;
    const skipHydrogen = Date.now() < hydrogenCooldownUntil;

    const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeout: number }> = [
      ...(skipHydrogen
        ? []
        : [{ model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeout: primaryFastTimeoutMs }]),
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeout: liteTimeoutMs },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.LOW, timeout: liteTimeoutMs },
    ];

    let lastError: any = null;
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      try {
        const callPromise = ai.models.generateContent({
          model: attempt.model,
          contents: options.contents,
          config: {
            thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: options.responseSchema,
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GEMINI_REQUEST_TIMEOUT')), attempt.timeout)
        );
        return await Promise.race([callPromise, timeoutPromise]);
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || '');
        const isTransient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('GEMINI_REQUEST_TIMEOUT') ||
          msg.includes('NOT_FOUND') ||
          msg.includes('404');
        if (attempt.model === 'gemini-4-hydrogen' && isTransient) {
          hydrogenCooldownUntil = Date.now() + 2 * 60 * 1000;
        }
        if (!isTransient) {
          throw err;
        }
        if (i < attempts.length - 1) {
          await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        }
      }
    }
    throw lastError;
  }

  // Health endpoint for deployment & runtime verification
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
      kst: getServerKstClock().displayKst,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Direct AI fish search -> detailed analysis -> edibility verdict -> recommended recipes + similar species with images
  app.post('/api/gemini/search-fish', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'Gemini API 키가 설정되지 않았습니다. 환경 변수(GEMINI_API_KEY)를 확인해 주세요.',
        });
        return;
      }

      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      const region = typeof req.body?.region === 'string' ? req.body.region.trim() : '';
      const locationLabel = typeof req.body?.locationLabel === 'string' ? req.body.locationLabel.trim() : '';

      if (query.length < 1) {
        res.status(400).json({ error: '검색할 물고기 이름이나 특징을 입력해 주세요.' });
        return;
      }

      const prompt = `당신은 대한민국 최고의 해양 어류 분류학자이자 수산 안전·요리 자문가입니다.
사용자가 입력한 물고기 검색어(이름, 방언/속칭, 또는 생김새 직접 설명)를 바탕으로 가장 일치하는 어종을 세밀하게 분석하고,
1) 어종 정밀 해부학적 분석 (체형·체색, 지느러미·가시, 머리·입·무늬)
2) 확정 가능 여부 판정: 입력 정보가 모호하거나 유사한 근연종이 많아 100% 단정이 어려우면 isUncertain=true로 설정하고 불확실 이유(uncertaintyReason)와 함께 가장 가능성이 높은 유사 어종 2~3종(similarSpecies, 정확한 학명 포함)과 구별 포인트를 반드시 제시하세요.
3) 식용 가능 여부 판별(독성·보호생물 포함) 및 식용 가능할 경우 초보자용 추천 요리법을 JSON 스키마에 맞춰 반환하세요.

[검색 입력]
- 검색어/직접 설명: "${query}"
- 사용자 현재 해역/위치: ${region || '대한민국 연안'} ${locationLabel ? `(${locationLabel})` : ''}

[필수 판별 규칙]
- 방언이나 줄임말(예: 우럭=조피볼락, 놀래미=쥐노래미, 꼼장어=먹장어, 고도리=새끼 고등어)도 정확한 정식 국문명과 표준 학명(예: Sebastes schlegelii)으로 매칭하세요.
- 독성이 있거나(복어류 자가 손질, 쏠배감펭, 독가시치, 미역치 등) 해양보호생물·식용 부적합 어종이면 반드시 안전을 최우선으로 판별하세요.
- 특히 복어처럼 치명적 테트로도톡신이 있는 어종은 일반 낚시꾼이 절대 자가 손질·섭취하면 안 되므로 edible=false, edibilityStatus="식용 불가 / 일반인 섭취 금지 (치명적 독성)", recommendedRecipes=[] 로 반환하세요.
- edible이 false인 경우 recommendedRecipes는 반드시 빈 배열([])로 반환하세요.
- edible이 true인 경우 recommendedRecipes에 한국 가정에서 실제로 해먹기 좋은 대표 요리 2~3가지를 구체적인 조리법·난이도·손질 팁과 함께 추천하세요.
- similarSpecies에는 헷갈리기 쉬운 유사 어종 2~3종과 정확한 학명(scientificName), 유사도(similarityPercent), 핵심 구별 포인트(differentiatingPoints)를 반드시 채우세요.`;

      const similarSpeciesSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            speciesName: { type: Type.STRING, description: '유사 어종 정식 국문명' },
            scientificName: { type: Type.STRING, description: '표준 학명 (예: Acanthopagrus schlegelii)' },
            similarityPercent: { type: Type.INTEGER, description: '외형·특징 유사도 (0~100)' },
            differentiatingPoints: { type: Type.STRING, description: '주 후보 어종과의 결정적 외형 구별 포인트' },
            edible: { type: Type.BOOLEAN, description: '식용 가능 여부' },
            toxicity: { type: Type.STRING, description: '독성 유무 및 주의사항' },
          },
          required: ['speciesName', 'scientificName', 'similarityPercent', 'differentiatingPoints', 'edible', 'toxicity'],
        },
        description: '정확히 단정하기 어렵거나 헷갈리기 쉬운 가장 유사한 어종 2~3개',
      };

      const anatomicalSchema = {
        type: Type.OBJECT,
        properties: {
          bodyAndColor: { type: Type.STRING, description: '체형, 체고 비율, 비늘, 기본 체색 및 배/등 색상 대비' },
          finsAndSpines: { type: Type.STRING, description: '등·가슴·꼬리지느러미 형태 및 가시/독침 위치·개수' },
          headMouthPattern: { type: Type.STRING, description: '머리·주둥이·눈·이빨 형태, 줄무늬·반점 등 핵심 식별 무늬' },
        },
        required: ['bodyAndColor', 'finsAndSpines', 'headMouthPattern'],
      };

      const response = await generateGeminiStructured({
        contents: prompt,
        timeoutMs: 14000,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchedFish: {
              type: Type.OBJECT,
              properties: {
                speciesName: { type: Type.STRING, description: '정식 국문 어종명' },
                scientificName: { type: Type.STRING, description: '표준 학명 (예: Pagrus major)' },
                aliases: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '함께 불리는 방언·유사명 목록',
                },
                matchConfidence: { type: Type.INTEGER, description: '검색 일치 신뢰도 (0~100)' },
                isUncertain: { type: Type.BOOLEAN, description: '정확한 단일 어종 확정이 어려우면 true' },
                uncertaintyReason: { type: Type.STRING, description: '단정하기 어렵거나 유사종 비교가 필요한 이유' },
                analysisSummary: { type: Type.STRING, description: 'AI 종합 어종 분석 요약 (생태, 계절성, 초보 낚시꾼 참고점)' },
                habitat: { type: Type.STRING, description: '주요 서식지, 수심, 출현 해역' },
                features: { type: Type.STRING, description: '외형 특징 및 구별 포인트 요약' },
                anatomicalDetails: anatomicalSchema,
                edible: { type: Type.BOOLEAN, description: '일반 낚시인이 안전하게 식용 가능한지 여부' },
                edibilityStatus: { type: Type.STRING, description: '예: 식용 가능 / 식용 가능 (가시 주의) / 식용 불가 · 섭취 금지' },
                edibilityReason: { type: Type.STRING, description: '식용 가능 또는 불가 판별의 구체적 이유와 안전 근거' },
                toxicity: { type: Type.STRING, description: '독성 유무 및 부위 (없으면 "독성 없음")' },
                fishingBan: { type: Type.STRING, description: '금어기 및 금지체장 규정' },
                protected: { type: Type.BOOLEAN, description: '해양보호생물 지정 여부' },
                protectionNote: { type: Type.STRING, description: '보호생물 또는 방생 관련 주의사항' },
                recommendedRecipes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      dishName: { type: Type.STRING, description: '추천 요리명 (예: 참돔 소금구이)' },
                      method: { type: Type.STRING, description: '조리 순서 및 방법 요약' },
                      difficulty: { type: Type.STRING, description: '조리 난이도 (초급 / 중급 / 고급)' },
                      tips: { type: Type.STRING, description: '손질·비린내 제거·맛있게 먹는 팁' },
                    },
                    required: ['dishName', 'method', 'difficulty', 'tips'],
                  },
                  description: '식용 가능(edible=true)일 때만 추천 요리 2~3개, 식용 불가 시 빈 배열 []',
                },
                similarSpecies: similarSpeciesSchema,
              },
              required: [
                'speciesName',
                'scientificName',
                'matchConfidence',
                'isUncertain',
                'uncertaintyReason',
                'analysisSummary',
                'habitat',
                'features',
                'anatomicalDetails',
                'edible',
                'edibilityStatus',
                'edibilityReason',
                'toxicity',
                'fishingBan',
                'protected',
                'recommendedRecipes',
                'similarSpecies',
              ],
            },
            relatedCandidates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speciesName: { type: Type.STRING },
                  scientificName: { type: Type.STRING },
                  similarityPercent: { type: Type.INTEGER },
                  reason: { type: Type.STRING },
                  edible: { type: Type.BOOLEAN },
                },
                required: ['speciesName', 'scientificName', 'similarityPercent', 'reason', 'edible'],
              },
              description: '헷갈리기 쉬운 유사 어종 2~3개',
            },
          },
          required: ['matchedFish', 'relatedCandidates'],
        },
      });

      const parsed = parseGeminiJson<any>(response.text, null);
      if (!parsed || !parsed.matchedFish) {
        res.status(502).json({ error: 'AI 어종 분석 응답을 해석하지 못했습니다. 다시 시도해 주세요.' });
        return;
      }

      if (!parsed.matchedFish.edible) {
        parsed.matchedFish.recommendedRecipes = [];
      }
      if (!Array.isArray(parsed.relatedCandidates)) {
        parsed.relatedCandidates = [];
      }
      const similarList: any[] = Array.isArray(parsed.matchedFish.similarSpecies)
        ? parsed.matchedFish.similarSpecies
        : [];

      const [mainImageUrl, enrichedSimilar, enrichedRelated] = await Promise.all([
        resolveFishImageUrl(parsed.matchedFish.speciesName, parsed.matchedFish.scientificName),
        Promise.all(
          similarList.map(async (sim) => ({
            ...sim,
            imageUrl: await resolveFishImageUrl(sim.speciesName, sim.scientificName),
          }))
        ),
        Promise.all(
          parsed.relatedCandidates.map(async (cand: any) => ({
            ...cand,
            imageUrl: await resolveFishImageUrl(cand.speciesName, cand.scientificName),
          }))
        ),
      ]);

      parsed.matchedFish.imageUrl = mainImageUrl;
      parsed.matchedFish.similarSpecies = enrichedSimilar;
      parsed.relatedCandidates = enrichedRelated;

      res.json(parsed);
    } catch (error: any) {
      console.error('Gemini search-fish error:', error);
      const formatted = formatGeminiErrorMessage(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // API endpoint for AI fish species identification from image or direct text notes
  app.post('/api/gemini/identify', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'Gemini API 키가 설정되지 않았습니다. 환경 변수(GEMINI_API_KEY)를 확인해 주세요.',
        });
        return;
      }

      const { imageBase64, mimeType, userNotes } = req.body;

      const prompt = `당신은 대한민국 최고의 해양 어류 분류학자이자 바다낚시 어종 감별사·요리 자문가입니다.
제공된 물고기 사진(또는 사용자 직접 입력 설명)을 세밀하게 분석하여 아래 JSON 스키마에 맞춰 정확한 정보를 제공해주세요.

분석 기준:
1. 어종명 (국문 및 정확한 표준 학명) 및 AI 종합 분석 요약(analysisSummary)
2. 세밀 해부학 특징(anatomicalDetails):
   - bodyAndColor: 체형, 체고 비율, 비늘 및 체색 대비
   - finsAndSpines: 등·가슴·꼬리지느러미 형태, 가시·독침 유무 및 개수
   - headMouthPattern: 주둥이·눈·이빨·아가미 덮개 특징, 줄무늬/반점 위치
3. 확정 불확실 시 유사 어종 안내 (매우 중요!):
   - 사진 각도·해상도·치어 상태 또는 텍스트 설명만으로 단일 어종을 100% 확정하기 어려우면 반드시 isUncertain=true, uncertaintyReason에 이유를 명시하고,
   - similarSpecies에 가장 유사한 후보 어종 2~3종(국문명, 정확한 학명, 유사도%, 주 후보와의 구별 포인트, 식용 여부, 독성)을 제공하세요.
4. 식용 가능 여부(edible: true/false), 판정 상태(edibilityStatus), 판별 근거(edibilityReason)
   - 독성 어종(복어류 자가 손질, 쏠배감펭, 독가시치, 미역치 등)이나 섭취 금지·보호생물은 반드시 edible=false로 안전하게 판정하세요.
5. 독성 정보 (없으면 "독성 없음"), 금어기 및 금지체장 (수산자원관리법 기준)
6. 추천 조리법:
   - edible=true일 경우 recommendedRecipes에 추천 요리 2~3개와 recipe 요약을 제공
   - edible=false일 경우 recommendedRecipes는 반드시 빈 배열([])로 두고 recipe에는 "식용 불가 - 즉시 방생"을 적으세요.
7. 판별 신뢰도 (confidence: 0~100), 해양보호생물 여부 (protected: true/false)

사용자 직접 입력 설명: ${userNotes || '없음'}`;

      let contents: any;
      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        contents = {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        };
      } else {
        contents = prompt;
      }

      const response = await generateGeminiStructured({
        contents,
        timeoutMs: 15000,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            speciesName: { type: Type.STRING, description: '물고기 한글 이름 (예: 참돔)' },
            scientificName: { type: Type.STRING, description: '표준 학명 (예: Pagrus major)' },
            analysisSummary: { type: Type.STRING, description: 'AI 종합 어종 분석 요약' },
            habitat: { type: Type.STRING, description: '주요 서식지 및 수심' },
            features: { type: Type.STRING, description: '외형 특징 및 AI 추정 근거' },
            anatomicalDetails: {
              type: Type.OBJECT,
              properties: {
                bodyAndColor: { type: Type.STRING },
                finsAndSpines: { type: Type.STRING },
                headMouthPattern: { type: Type.STRING },
              },
              required: ['bodyAndColor', 'finsAndSpines', 'headMouthPattern'],
            },
            isUncertain: { type: Type.BOOLEAN, description: '단일 어종 100% 확정이 어렵거나 유사종 혼동 가능성이 있으면 true' },
            uncertaintyReason: { type: Type.STRING, description: '확정하기 어려운 이유 또는 확인 필요 포인트' },
            edible: { type: Type.BOOLEAN, description: '식용 가능 여부' },
            edibilityStatus: { type: Type.STRING, description: '식용 판별 상태 요약' },
            edibilityReason: { type: Type.STRING, description: '식용 가능/불가 판별 이유' },
            toxicity: { type: Type.STRING, description: "독성 정보 또는 '독성 없음'" },
            fishingBan: { type: Type.STRING, description: '금어기 및 금지체장 규정' },
            recipe: { type: Type.STRING, description: '추천 조리법 및 손질 팁 요약' },
            recommendedRecipes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dishName: { type: Type.STRING },
                  method: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  tips: { type: Type.STRING },
                },
                required: ['dishName', 'method', 'difficulty', 'tips'],
              },
            },
            similarSpecies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speciesName: { type: Type.STRING },
                  scientificName: { type: Type.STRING },
                  similarityPercent: { type: Type.INTEGER },
                  differentiatingPoints: { type: Type.STRING },
                  edible: { type: Type.BOOLEAN },
                  toxicity: { type: Type.STRING },
                },
                required: ['speciesName', 'scientificName', 'similarityPercent', 'differentiatingPoints', 'edible', 'toxicity'],
              },
            },
            confidence: { type: Type.INTEGER, description: '신뢰도 퍼센트 (0-100)' },
            protected: { type: Type.BOOLEAN, description: '해양보호생물 여부' },
            protectionNote: { type: Type.STRING, description: '보호 관련 주의사항' },
          },
          required: [
            'speciesName',
            'scientificName',
            'analysisSummary',
            'habitat',
            'features',
            'anatomicalDetails',
            'isUncertain',
            'uncertaintyReason',
            'edible',
            'edibilityStatus',
            'edibilityReason',
            'toxicity',
            'fishingBan',
            'recipe',
            'recommendedRecipes',
            'similarSpecies',
            'confidence',
            'protected',
          ],
        },
      });

      const data = parseGeminiJson<any>(response.text, null);
      if (!data) {
        res.status(502).json({ error: 'AI 어종 판별 결과를 해석하지 못했습니다. 다시 시도해 주세요.' });
        return;
      }
      if (!data.edible) {
        data.recommendedRecipes = [];
      }

      const similarList: any[] = Array.isArray(data.similarSpecies) ? data.similarSpecies : [];
      const [mainImageUrl, enrichedSimilar] = await Promise.all([
        resolveFishImageUrl(data.speciesName, data.scientificName),
        Promise.all(
          similarList.map(async (sim) => ({
            ...sim,
            imageUrl: await resolveFishImageUrl(sim.speciesName, sim.scientificName),
          }))
        ),
      ]);
      data.imageUrl = mainImageUrl;
      data.similarSpecies = enrichedSimilar;

      res.json(data);
    } catch (error: any) {
      console.error('Gemini identify error:', error);
      const formatted = formatGeminiErrorMessage(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // API endpoint for direct feature-description-based fish search with detailed anatomy & similar species images
  app.post('/api/gemini/search-features', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'Gemini API 키가 설정되지 않았습니다. 환경 변수(GEMINI_API_KEY)를 확인해 주세요.',
        });
        return;
      }

      const {
        region,
        location,
        depthLayer,
        season,
        bait,
        sizeRange,
        bodyShape,
        color,
        pattern,
        finShape,
        specialTraits,
        extraDescription,
        query,
        directDescription,
      } = req.body;

      const primaryText = (directDescription || extraDescription || query || '').trim();
      const traitsText =
        Array.isArray(specialTraits) && specialTraits.length > 0 ? specialTraits.join(', ') : '';

      const optionalContextLines = [
        region ? `- 해역 권역: ${region}` : '',
        location ? `- 포획 장소: ${location}` : '',
        depthLayer ? `- 수심층: ${depthLayer}` : '',
        season ? `- 시기/계절: ${season}` : '',
        bait ? `- 사용 미끼/채비: ${bait}` : '',
        sizeRange ? `- 추정 체장: ${sizeRange}` : '',
        bodyShape ? `- 체형: ${bodyShape}` : '',
        color ? `- 체색: ${color}` : '',
        pattern ? `- 무늬: ${pattern}` : '',
        finShape ? `- 지느러미: ${finShape}` : '',
        traitsText ? `- 특이 특징: ${traitsText}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      if (!primaryText && !optionalContextLines) {
        res.status(400).json({ error: '물고기 외형이나 포획 특징을 직접 입력해 주세요.' });
        return;
      }

      const prompt = `당신은 대한민국 해양 어류 분류 전문가입니다.
사용자가 직접 입력한 물고기 특징 설명을 바탕으로, 대한민국 연안 어종 중 가장 유사한 후보 2~3가지를 세밀한 해부학적 비교, 구별 포인트, 식용 여부, 추천 요리법과 함께 추천하세요.
단일 어종으로 확정이 어려울 때는 가장 가까운 유사 어종을 일치 순위대로 제시하고 서로 어떻게 다른지(differentiatingPoints) 자세히 비교해 주세요.

[사용자 직접 입력 특징]
${primaryText || '없음'}

${optionalContextLines ? `[참고 해역·환경]\n${optionalContextLines}` : ''}

규칙:
- 각 후보의 scientificName에는 정확한 표준 학명(예: Sebastes inermis)만 적어 참고 이미지 매칭이 가능하도록 하세요.
- anatomicalDetails(bodyAndColor, finsAndSpines, headMouthPattern)를 세밀하게 작성하세요.
- edible=false(독성·섭취 금지) 어종이면 recommendedRecipes는 반드시 빈 배열 []로 반환하고, edible=true면 추천 요리 2개를 recommendedRecipes에 포함하세요.`;

      const response = await generateGeminiStructured({
        contents: prompt,
        timeoutMs: 18000,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              speciesName: { type: Type.STRING, description: '어종명 (국문)' },
              scientificName: { type: Type.STRING, description: '표준 학명 (예: Sebastes schlegelii)' },
              matchScore: { type: Type.INTEGER, description: '일치 확률 (0-100)' },
              isUncertain: { type: Type.BOOLEAN, description: '비슷한 종과 혼동 가능성 높으면 true' },
              description: { type: Type.STRING, description: '특징 설명 및 일치 이유' },
              visualDescription: {
                type: Type.STRING,
                description: '사진과 비교할 수 있는 구체적 외형(체형, 눈, 입, 지느러미, 무늬) 시각 묘사',
              },
              anatomicalDetails: {
                type: Type.OBJECT,
                properties: {
                  bodyAndColor: { type: Type.STRING },
                  finsAndSpines: { type: Type.STRING },
                  headMouthPattern: { type: Type.STRING },
                },
                required: ['bodyAndColor', 'finsAndSpines', 'headMouthPattern'],
              },
              differentiatingPoints: {
                type: Type.STRING,
                description: '비슷하게 생긴 다른 어종과의 결정적 구별 방법',
              },
              matchingTraits: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '사용자 입력과 일치하는 핵심 포인트 2~4개',
              },
              edible: { type: Type.BOOLEAN, description: '식용 가능 여부' },
              edibilityStatus: { type: Type.STRING, description: '식용 가능/불가 판별 상태' },
              edibilityReason: { type: Type.STRING, description: '식용 판별 근거' },
              toxicity: { type: Type.STRING, description: "독성 정보 또는 '독성 없음'" },
              fishingBan: { type: Type.STRING, description: '금어기 및 금지체장 정보' },
              recipe: { type: Type.STRING, description: '추천 손질 및 조리법 요약' },
              recommendedRecipes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dishName: { type: Type.STRING },
                    method: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                    tips: { type: Type.STRING },
                  },
                  required: ['dishName', 'method', 'difficulty', 'tips'],
                },
              },
            },
            required: [
              'speciesName',
              'scientificName',
              'matchScore',
              'isUncertain',
              'description',
              'visualDescription',
              'anatomicalDetails',
              'differentiatingPoints',
              'matchingTraits',
              'edible',
              'edibilityStatus',
              'edibilityReason',
              'toxicity',
              'fishingBan',
              'recipe',
              'recommendedRecipes',
            ],
          },
        },
      });

      const data = parseGeminiJson<any[]>(response.text, []);
      const rawList = Array.isArray(data) ? data : [];
      const normalized = await Promise.all(
        rawList.map(async (item) => ({
          ...item,
          imageUrl: await resolveFishImageUrl(item?.speciesName, item?.scientificName),
          recommendedRecipes: item?.edible ? item.recommendedRecipes || [] : [],
        }))
      );
      res.json(normalized);
    } catch (error: any) {
      console.error('Gemini search-features error:', error);
      const formatted = formatGeminiErrorMessage(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Expose provisioned Google Maps API key to client <APIProvider>
  app.get('/api/maps/config', (_req, res) => {
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ apiKey });
  });

  // Unlimited detailed reverse geocoding (OpenStreetMap Nominatim primary + Google Geocoding fallback)
  app.get('/api/maps/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: '유효한 위도/경도 값이 필요합니다.' });
      return;
    }

    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = reverseGeocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.value);
      return;
    }

    // 1. Primary: Unlimited OpenStreetMap Nominatim detailed Korean reverse geocode
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&accept-language=ko&addressdetails=1&zoom=18`;
      const nomRes = await fetch(nomUrl, {
        headers: {
          'User-Agent': 'IltamanseonFishingApp/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (nomRes.ok) {
        const nomData = await nomRes.json().catch(() => null);
        if (nomData && !nomData.error) {
          const details = buildDetailedKoreanAddress(
            nomData.address,
            nomData.display_name || '',
            nomData.name || ''
          );
          const payload = {
            formattedAddress: details.formattedAddress || nomData.display_name || '',
            shortLabel: details.shortLabel,
            placeId: nomData.place_id ? `osm_${nomData.place_id}` : '',
            details,
            provider: 'osm-unlimited',
          };
          reverseGeocodeCache.set(cacheKey, {
            value: payload,
            expiresAt: Date.now() + MAP_CACHE_TTL_MS,
          });
          res.json(payload);
          return;
        }
      }
    } catch (nomErr) {
      console.warn('Nominatim reverse geocode fallback check:', nomErr);
    }

    // 2. Secondary fallback: Google Maps Geocoding v4 (only if key present and not in cooldown)
    const mapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    if (mapsApiKey && Date.now() >= googleRestCooldownUntil) {
      try {
        const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
        url.searchParams.append('location.latitude', String(lat));
        url.searchParams.append('location.longitude', String(lng));
        url.searchParams.append('languageCode', 'ko');
        url.searchParams.append('regionCode', 'KR');

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': mapsApiKey,
            'X-Goog-FieldMask': 'results.placeId,results.formattedAddress,results.addressComponents',
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
          },
          signal: AbortSignal.timeout(4500),
        });

        const payload = await response.json().catch(() => ({}));
        if (response.status === 429 || payload?.error?.status === 'RESOURCE_EXHAUSTED') {
          googleRestCooldownUntil = Date.now() + 6 * 60 * 60 * 1000;
        } else if (response.ok) {
          const firstResult = payload?.results?.[0];
          const out = {
            formattedAddress: firstResult?.formattedAddress || '',
            shortLabel: '',
            placeId: firstResult?.placeId || '',
            details: null,
            provider: 'google',
          };
          reverseGeocodeCache.set(cacheKey, {
            value: out,
            expiresAt: Date.now() + MAP_CACHE_TTL_MS,
          });
          res.json(out);
          return;
        }
      } catch {
        /* ignore and return coordinate fallback */
      }
    }

    res.json({
      formattedAddress: `위도 ${lat.toFixed(4)}, 경도 ${lng.toFixed(4)}`,
      shortLabel: '',
      placeId: '',
      details: null,
      provider: 'coords-fallback',
    });
  });

  // Unlimited map place/region search (OpenStreetMap Nominatim + Photon, zero daily limit)
  app.get('/api/maps/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 1) {
      res.json({ results: [] });
      return;
    }

    const biasLat = Number(req.query.lat);
    const biasLng = Number(req.query.lng);
    const cacheKey = `${q.toLowerCase()}_${Number.isFinite(biasLat) ? biasLat.toFixed(1) : 'x'}`;
    const cached = placeSearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ results: cached.value, unlimited: true });
      return;
    }

    try {
      const resultsMap = new Map<string, any>();

      const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q
      )}&accept-language=ko&addressdetails=1&limit=8`;
      const photonParams = new URLSearchParams({ q, limit: '8' });
      if (Number.isFinite(biasLat) && Number.isFinite(biasLng)) {
        photonParams.set('lat', String(biasLat));
        photonParams.set('lon', String(biasLng));
      }

      const [nomRes, photonRes] = await Promise.allSettled([
        fetch(nomUrl, {
          headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }),
        fetch(`https://photon.komoot.io/api/?${photonParams.toString()}`, {
          headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }),
      ]);

      if (nomRes.status === 'fulfilled' && nomRes.value.ok) {
        const nomList = await nomRes.value.json().catch(() => []);
        if (Array.isArray(nomList)) {
          for (const item of nomList) {
            const pLat = Number(item?.lat);
            const pLng = Number(item?.lon);
            if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
            const details = buildDetailedKoreanAddress(
              item.address,
              item.display_name || '',
              item.name || ''
            );
            const key = `${pLat.toFixed(3)}_${pLng.toFixed(3)}`;
            if (!resultsMap.has(key)) {
              resultsMap.set(key, {
                id: `nom_${item.place_id || key}`,
                name: item.name || details.shortLabel || q,
                address: details.formattedAddress || item.display_name || '',
                lat: pLat,
                lng: pLng,
                categoryLabel: item.type || item.category || '장소',
              });
            }
          }
        }
      }

      if (photonRes.status === 'fulfilled' && photonRes.value.ok) {
        const photonJson = await photonRes.value.json().catch(() => null);
        const features = Array.isArray(photonJson?.features) ? photonJson.features : [];
        for (const f of features) {
          const coords = f?.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) continue;
          const pLng = Number(coords[0]);
          const pLat = Number(coords[1]);
          if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
          const props = f?.properties || {};
          const name = props.name || props.district || props.city || q;
          const addr = [props.country, props.state, props.city, props.district, props.street]
            .filter(Boolean)
            .join(' ');
          const key = `${pLat.toFixed(3)}_${pLng.toFixed(3)}`;
          if (!resultsMap.has(key)) {
            resultsMap.set(key, {
              id: `photon_${props.osm_id || key}`,
              name,
              address: addr || name,
              lat: pLat,
              lng: pLng,
              categoryLabel: props.osm_value || '장소',
            });
          }
        }
      }

      const finalResults = Array.from(resultsMap.values()).slice(0, 8);
      if (finalResults.length > 0) {
        placeSearchCache.set(cacheKey, {
          value: finalResults,
          expiresAt: Date.now() + MAP_CACHE_TTL_MS,
        });
      }
      res.json({ results: finalResults, unlimited: true });
    } catch (error: any) {
      console.error('Unlimited map search error:', error);
      res.json({ results: [], unlimited: true });
    }
  });

  // Helper: fetch driving durations & distances (seconds, meters) via public OSRM table API (no quota limit)
  async function fetchOsrmDrivingTable(
    origin: { lat: number; lng: number },
    destinations: Array<{ lat: number; lng: number }>
  ): Promise<Array<{ drivingMinutes: number; drivingDistanceKm: number }> | null> {
    if (destinations.length === 0) return [];
    try {
      const coordsList = [origin, ...destinations]
        .map((c) => `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`)
        .join(';');
      const url = `https://router.project-osrm.org/table/v1/driving/${coordsList}?sources=0&annotations=duration,distance`;
      const osrmRes = await fetch(url, {
        headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
      });
      if (!osrmRes.ok) return null;
      const json = await osrmRes.json().catch(() => null);
      const durations: Array<number | null> = json?.durations?.[0];
      const distances: Array<number | null> = json?.distances?.[0];
      if (!Array.isArray(durations) || !Array.isArray(distances)) return null;

      return destinations.map((_, idx) => {
        const sec = durations[idx + 1];
        const meters = distances[idx + 1];
        if (typeof sec !== 'number' || !Number.isFinite(sec) || typeof meters !== 'number') {
          return { drivingMinutes: -1, drivingDistanceKm: -1 };
        }
        return {
          drivingMinutes: Math.max(1, Math.round(sec / 60)),
          drivingDistanceKm: Math.round((meters / 1000) * 10) / 10,
        };
      });
    } catch {
      return null;
    }
  }

  function estimateDrivingMinutesFallback(straightKm: number): number {
    const roadKm = straightKm * 1.3;
    const speedKmh = straightKm < 8 ? 32 : 50;
    return Math.max(3, Math.round((roadKm / speedKmh) * 60));
  }

  // Batch road driving duration lookup (OSRM + 75km pre-filter, unlimited)
  app.post('/api/maps/driving-times', async (req, res) => {
    const originLat = Number(req.body?.origin?.lat);
    const originLng = Number(req.body?.origin?.lng);
    const rawDestinations = Array.isArray(req.body?.destinations) ? req.body.destinations : [];

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      res.status(400).json({ error: '유효한 출발지 좌표가 필요합니다.' });
      return;
    }

    const validDestinations = rawDestinations
      .filter((d: any) => d && typeof d.id === 'string' && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)))
      .map((d: any) => {
        const lat = Number(d.lat);
        const lng = Number(d.lng);
        const straightKm = calculateDistanceKm({ lat: originLat, lng: originLng }, { lat, lng });
        return { id: String(d.id), lat, lng, straightKm };
      })
      .filter((d: any) => d.straightKm <= 75)
      .slice(0, 45);

    if (validDestinations.length === 0) {
      res.json({ results: {} });
      return;
    }

    const osrmMetrics = await fetchOsrmDrivingTable(
      { lat: originLat, lng: originLng },
      validDestinations
    );

    const results: Record<string, { drivingMinutes: number; drivingDistanceKm: number }> = {};
    validDestinations.forEach((dest: any, idx: number) => {
      const m = osrmMetrics?.[idx];
      if (m && m.drivingMinutes > 0 && m.drivingDistanceKm >= 0) {
        results[dest.id] = m;
      } else {
        results[dest.id] = {
          drivingMinutes: estimateDrivingMinutesFallback(dest.straightKm),
          drivingDistanceKm: Math.round(dest.straightKm * 1.3 * 10) / 10,
        };
      }
    });

    res.json({ results, provider: osrmMetrics ? 'osrm-driving' : 'estimated-driving' });
  });

  // Unlimited nearby coastal/fishing spots within 1-hour driving range (OSM Photon + Overpass + OSRM driving filter)
  app.post('/api/maps/nearby-fishing-spots', async (req, res) => {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const maxDrivingMinutes = Math.min(Math.max(Number(req.body?.maxDrivingMinutes) || 60, 10), 60);
    const radiusMeters = Math.min(Math.max(Number(req.body?.radiusMeters) || 35000, 3000), 45000);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: '유효한 위도/경도 값이 필요합니다.' });
      return;
    }

    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${radiusMeters},${maxDrivingMinutes}`;
    const cached = nearbySpotsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ places: cached.value, provider: 'osm-unlimited', unlimited: true, maxDrivingMinutes });
      return;
    }

    const placesMap = new Map<string, any>();
    const addCandidate = (candidate: any) => {
      if (!candidate || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return;
      const distKm = calculateDistanceKm({ lat, lng }, { lat: candidate.lat, lng: candidate.lng });
      if (distKm > 65) return;
      if (!placesMap.has(candidate.id)) {
        placesMap.set(candidate.id, { ...candidate, straightKm: distKm });
      }
    };

    const CURATED_INLAND_PARKS = [
      { id: 'inland_yeouido', name: '여의도 한강공원', address: '서울 영등포구 여의동로 330', lat: 37.5284, lng: 126.9329 },
      { id: 'inland_banpo', name: '반포 한강공원', address: '서울 서초구 신반포로11길 40', lat: 37.5103, lng: 126.996 },
      { id: 'inland_ttukseom', name: '뚝섬 한강공원', address: '서울 광진구 강변북로 139', lat: 37.5293, lng: 127.0699 },
      { id: 'inland_nanji', name: '난지 한강공원', address: '서울 마포구 한강난지로 162', lat: 37.5668, lng: 126.8764 },
      { id: 'inland_mangwon', name: '망원 한강공원', address: '서울 마포구 마포나루길 467', lat: 37.5553, lng: 126.8949 },
      { id: 'inland_jamsil', name: '잠실 한강공원', address: '서울 송파구 한가람로 65', lat: 37.5177, lng: 127.0823 },
      { id: 'inland_ilsan', name: '일산 호수공원', address: '경기 고양시 일산동구 호수로 595', lat: 37.6562, lng: 126.7662 },
      { id: 'inland_gwanggyo', name: '광교 호수공원', address: '경기 수원시 영통구 광교호수로 57', lat: 37.2839, lng: 127.0656 },
      { id: 'inland_daejeon', name: '갑천 수변공원', address: '대전 서구 둔산동', lat: 36.3649, lng: 127.3888 },
      { id: 'inland_daegu', name: '수성못 유원지·공원', address: '대구 수성구 두산동', lat: 35.8278, lng: 128.6169 },
      { id: 'inland_gwangju', name: '광주호 호수생태원', address: '광주 북구 충효동 905', lat: 35.1904, lng: 126.9977 },
      { id: 'inland_chuncheon', name: '공지천 의암공원', address: '강원 춘천시 근화동', lat: 37.8758, lng: 127.7124 },
      { id: 'inland_busan_citizen', name: '부산 시민공원·온천천 수변공원', address: '부산 부산진구 시민공원로 73', lat: 35.1683, lng: 129.0574 },
    ];
    for (const pk of CURATED_INLAND_PARKS) {
      addCandidate({
        id: pk.id,
        name: pk.name,
        address: pk.address,
        lat: pk.lat,
        lng: pk.lng,
        types: ['park'],
        primaryTypeLabel: '주변 수변 공원 · 워터프론트',
        source: 'osm_places',
      });
    }

    try {
      const overpassRadius = Math.min(radiusMeters, 20000);
      const parkRadius = Math.min(radiusMeters, 12000);
      const overpassQuery = `[out:json][timeout:6];(node(around:${overpassRadius},${lat},${lng})[leisure~"fishing|marina"];way(around:${overpassRadius},${lat},${lng})[man_made~"pier|breakwater"];node(around:${overpassRadius},${lat},${lng})[man_made~"pier|breakwater"];node(around:${overpassRadius},${lat},${lng})[harbour=yes];node(around:${parkRadius},${lat},${lng})[leisure~"park|recreation_ground|nature_reserve"];way(around:${parkRadius},${lat},${lng})[leisure~"park|recreation_ground|nature_reserve"];);out center 40;`;

      const safeFetch = (url: string, init?: RequestInit) => fetch(url, init).catch(() => null);

      const overpassPromise = safeFetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'User-Agent': 'IltamanseonFishingApp/1.0',
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: overpassQuery }).toString(),
        signal: AbortSignal.timeout(5500),
      });

      const photonTerms = ['낚시터', '방파제', '수변공원', '호수공원', '공원'];
      const photonPromises = photonTerms.map((term) =>
        safeFetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&lat=${lat}&lon=${lng}&limit=10`,
          {
            headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        )
      );

      const boxDeltaLat = 0.38;
      const boxDeltaLng = 0.44;
      const viewbox = `${(lng - boxDeltaLng).toFixed(4)},${(lat + boxDeltaLat).toFixed(
        4
      )},${(lng + boxDeltaLng).toFixed(4)},${(lat - boxDeltaLat).toFixed(4)}`;
      const nomSinglePromise = safeFetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          '공원'
        )}&viewbox=${viewbox}&bounded=1&accept-language=ko&addressdetails=1&limit=10`,
        {
          headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(4500),
        }
      );

      const [overpassRes, nomRes, ...photonResponses] = await Promise.all([
        overpassPromise,
        nomSinglePromise,
        ...photonPromises,
      ]);

      if (overpassRes && overpassRes.ok) {
        const opJson = await overpassRes.json().catch(() => null);
        const elements = Array.isArray(opJson?.elements) ? opJson.elements : [];
        for (const el of elements) {
          const tags = el?.tags || {};
          const name = tags['name:ko'] || tags.name;
          if (!name) continue;
          const pLat = typeof el.lat === 'number' ? el.lat : el?.center?.lat;
          const pLng = typeof el.lon === 'number' ? el.lon : el?.center?.lon;
          if (typeof pLat !== 'number' || typeof pLng !== 'number') continue;

          const typeTag =
            tags.man_made || tags.leisure || tags.natural || (tags.harbour ? 'harbour' : 'coastal');
          addCandidate({
            id: `osm_${el.type}_${el.id}`,
            name,
            address: [tags['addr:city'], tags['addr:district'], tags['addr:street']]
              .filter(Boolean)
              .join(' '),
            lat: pLat,
            lng: pLng,
            types: [typeTag],
            primaryTypeLabel:
              typeTag === 'breakwater'
                ? '방파제 포인트'
                : typeTag === 'pier'
                ? '선착장·부두'
                : typeTag === 'fishing'
                ? '낚시터·낚시공원'
                : typeTag === 'marina' || typeTag === 'harbour'
                ? '항구·마리나'
                : typeTag === 'beach'
                ? '해변·백사장'
                : /수변|호수|강변|한강|해양/.test(name)
                ? '주변 수변 공원 · 워터프론트'
                : '주변 공원 · 야외 힐링 쉼터',
            source: 'osm_places',
          });
        }
      }

      const photonPayloads = await Promise.all(
        photonResponses.map(async (pRes, idx) => {
          if (!pRes || !pRes.ok) return [];
          const json = await pRes.json().catch(() => null);
          const features = Array.isArray(json?.features) ? json.features : [];
          return features.map((feat: any) => ({ feat, term: photonTerms[idx] }));
        })
      );

      for (const { feat, term } of photonPayloads.flat()) {
        const coords = feat?.geometry?.coordinates;
        const pLng = Number(coords?.[0]);
        const pLat = Number(coords?.[1]);
        const props = feat?.properties || {};
        const rawName = String(props.name || term).trim();
        const prefix = props.district || props.city || '';
        const name = rawName === '공원' && prefix ? `${prefix} 공원` : rawName;
        if (!Number.isFinite(pLat) || !Number.isFinite(pLng) || !name) continue;
        const addr = [props.state, props.city, props.county, props.district, props.street]
          .filter(Boolean)
          .join(' ');
        const isFishingTerm = term === '낚시터' || term === '방파제';
        addCandidate({
          id: `ph_${props.osm_id || `${pLat.toFixed(4)}_${pLng.toFixed(4)}`}`,
          name,
          address: addr || props.country || '주변 추천 포인트',
          lat: pLat,
          lng: pLng,
          types: [isFishingTerm ? 'fishing' : 'park', String(props.osm_value || '')].filter(Boolean),
          primaryTypeLabel:
            term === '방파제'
              ? '방파제 포인트'
              : term === '낚시터'
              ? '낚시터·낚시공원'
              : /수변|호수|한강|강변/.test(name) || term === '수변공원' || term === '호수공원'
              ? '주변 수변 공원 · 워터프론트'
              : '주변 공원 · 야외 힐링 쉼터',
          source: 'osm_places',
        });
      }

      if (nomRes && nomRes.ok) {
        const nomList = await nomRes.json().catch(() => []);
        if (Array.isArray(nomList)) {
          for (const item of nomList) {
            const pLat = Number(item?.lat);
            const pLng = Number(item?.lon);
            if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
            const details = buildDetailedKoreanAddress(
              item.address,
              item.display_name || '',
              item.name || ''
            );
            const name = item.name || details.shortLabel || (item.display_name || '').split(',')[0] || '주변 공원';
            if (!name) continue;
            addCandidate({
              id: `nom_${item.place_id || `${pLat.toFixed(4)}_${pLng.toFixed(4)}`}`,
              name,
              address: details.formattedAddress || item.display_name || '',
              lat: pLat,
              lng: pLng,
              types: ['park', String(item.type || '')].filter(Boolean),
              primaryTypeLabel: /수변|호수|한강|강변/.test(name)
                ? '주변 수변 공원 · 워터프론트'
                : '주변 공원 · 야외 힐링 쉼터',
              source: 'osm_places',
            });
          }
        }
      }

      const sortedRaw = Array.from(placesMap.values())
        .sort((a, b) => {
          const aPark = /공원|유원지/.test(String(a.primaryTypeLabel || '')) && !/낚시공원/.test(String(a.name || ''));
          const bPark = /공원|유원지/.test(String(b.primaryTypeLabel || '')) && !/낚시공원/.test(String(b.name || ''));
          if (aPark !== bPark) return aPark ? 1 : -1;
          return a.straightKm - b.straightKm;
        })
        .slice(0, 48);

      const osrmTable = await fetchOsrmDrivingTable({ lat, lng }, sortedRaw);
      const finalPlaces = sortedRaw
        .map((item, idx) => {
          const osrm = osrmTable?.[idx];
          const drivingMinutes =
            osrm && osrm.drivingMinutes > 0
              ? osrm.drivingMinutes
              : estimateDrivingMinutesFallback(item.straightKm);
          const drivingDistanceKm =
            osrm && osrm.drivingDistanceKm >= 0
              ? osrm.drivingDistanceKm
              : Math.round(item.straightKm * 1.3 * 10) / 10;
          const { straightKm: _omit, ...rest } = item;
          return {
            ...rest,
            drivingMinutes,
            drivingDistanceKm,
          };
        })
        .filter((item) => item.drivingMinutes <= maxDrivingMinutes);

      if (finalPlaces.length > 0) {
        nearbySpotsCache.set(cacheKey, {
          value: finalPlaces,
          expiresAt: Date.now() + MAP_CACHE_TTL_MS,
        });
      }
      res.json({ places: finalPlaces, provider: 'osm-unlimited', unlimited: true, maxDrivingMinutes });
    } catch (error: any) {
      console.error('Unlimited nearby spots error:', error);
      const fallbackList = Array.from(placesMap.values())
        .map(({ straightKm, ...rest }) => ({
          ...rest,
          drivingMinutes: estimateDrivingMinutesFallback(straightKm),
          drivingDistanceKm: Math.round(straightKm * 1.3 * 10) / 10,
        }))
        .filter((item) => item.drivingMinutes <= maxDrivingMinutes);
      res.json({ places: fallbackList, provider: 'osm-unlimited', unlimited: true, maxDrivingMinutes });
    }
  });

  // Helper: authoritative Korea Standard Time (Asia/Seoul) clock parts
  function getServerKstClock() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const hourStr = map.hour === '24' ? '00' : (map.hour || '00');
    const year = map.year || '2026';
    const month = map.month || '01';
    const day = map.day || '01';
    const minute = map.minute || '00';
    return {
      isoDatePrefix: `${year}-${month}-${day}`,
      isoHourPrefix: `${year}-${month}-${day}T${hourStr}`,
      displayKst: `${year}년 ${Number(month)}월 ${Number(day)}일 ${hourStr}:${minute} KST`,
      hour: Number(hourStr),
    };
  }

  const COASTAL_MARINE_STATIONS: Array<{ name: string; lat: number; lng: number }> = [
    { name: '인천 연안 해역', lat: 37.4563, lng: 126.5972 },
    { name: '안산·시화방조제 해역', lat: 37.3025, lng: 126.6054 },
    { name: '태안 안흥 해역', lat: 36.6805, lng: 126.1319 },
    { name: '보령 대천 해역', lat: 36.321, lng: 126.505 },
    { name: '군산 새만금 해역', lat: 35.941, lng: 126.531 },
    { name: '목포 연안 해역', lat: 34.782, lng: 126.375 },
    { name: '여수 돌산 해역', lat: 34.725, lng: 127.745 },
    { name: '통영 미륵도 해역', lat: 34.825, lng: 128.431 },
    { name: '부산 해운대 해역', lat: 35.1587, lng: 129.1604 },
    { name: '울산 정자 해역', lat: 35.614, lng: 129.439 },
    { name: '포항 영일만 해역', lat: 36.065, lng: 129.401 },
    { name: '강릉 안목 해역', lat: 37.772, lng: 128.948 },
    { name: '속초 연안 해역', lat: 38.2045, lng: 128.6012 },
    { name: '제주 탑동 해역', lat: 33.521, lng: 126.528 },
  ];

  function buildForecastModelUrl(lat: number, lng: number, model: string): string {
    return `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lng
    )}&models=${encodeURIComponent(
      model
    )}&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,pressure_msl,cloud_cover,visibility,uv_index,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,pressure_msl,cloud_cover,visibility,uv_index,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,precipitation&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max&past_days=1&forecast_days=2&wind_speed_unit=ms&timezone=Asia%2FSeoul`;
  }

  function buildMarineUrl(lat: number, lng: number): string {
    return `https://marine-api.open-meteo.com/v1/marine?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lng
    )}&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&hourly=wave_height,wave_period,wave_direction,swell_wave_height,sea_surface_temperature&past_days=1&forecast_days=2&timezone=Asia%2FSeoul`;
  }

  function buildAirQualityUrl(lat: number, lng: number): string {
    return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lng
    )}&current=pm10,pm2_5,us_aqi&timezone=Asia%2FSeoul`;
  }

  function isFiniteNum(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function calibrateMetric(
    kmaVal: unknown,
    bestVal: unknown,
    jmaVal: unknown,
    mode: 'blend' | 'max' | 'preferPrimary'
  ): number | null {
    const k = isFiniteNum(kmaVal) ? kmaVal : null;
    const b = isFiniteNum(bestVal) ? bestVal : null;
    const j = isFiniteNum(jmaVal) ? jmaVal : null;

    if (mode === 'preferPrimary') {
      return k ?? b ?? j ?? null;
    }
    if (mode === 'max') {
      const vals = [k, b, j].filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.max(...vals) : null;
    }
    if (k !== null && b !== null) {
      return Math.round((0.7 * k + 0.3 * b) * 10) / 10;
    }
    if (k !== null) return Math.round(k * 10) / 10;
    if (b !== null && j !== null) {
      return Math.round((0.6 * b + 0.4 * j) * 10) / 10;
    }
    if (b !== null) return Math.round(b * 10) / 10;
    if (j !== null) return Math.round(j * 10) / 10;
    return null;
  }

  function formatAirQualityLabel(pm10: number | null, pm25: number | null): string | null {
    if (pm25 === null && pm10 === null) return null;
    // Korea Ministry of Environment standard
    if ((pm25 !== null && pm25 >= 76) || (pm10 !== null && pm10 >= 151)) return '매우 나쁨';
    if ((pm25 !== null && pm25 >= 36) || (pm10 !== null && pm10 >= 81)) return '나쁨';
    if ((pm25 !== null && pm25 >= 16) || (pm10 !== null && pm10 >= 31)) return '보통';
    return '좋음';
  }

  // KMA-calibrated live detailed weather, air quality & marine wave/swell/current/SST proxy
  app.get('/api/weather/fishing', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: '유효한 위도/경도 값이 필요합니다.' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const kstClock = getServerKstClock();

    try {
      const [bestSettled, kmaSettled, jmaSettled, marineSettled, airSettled] =
        await Promise.allSettled([
          fetch(buildForecastModelUrl(lat, lng, 'best_match'), { signal: AbortSignal.timeout(5500) }),
          fetch(buildForecastModelUrl(lat, lng, 'kma_seamless'), { signal: AbortSignal.timeout(4500) }),
          fetch(buildForecastModelUrl(lat, lng, 'jma_seamless'), { signal: AbortSignal.timeout(4500) }),
          fetch(buildMarineUrl(lat, lng), { signal: AbortSignal.timeout(5500) }),
          fetch(buildAirQualityUrl(lat, lng), { signal: AbortSignal.timeout(4500) }),
        ]);

      const bestJson =
        bestSettled.status === 'fulfilled' && bestSettled.value.ok
          ? await bestSettled.value.json().catch(() => null)
          : null;
      const kmaJson =
        kmaSettled.status === 'fulfilled' && kmaSettled.value.ok
          ? await kmaSettled.value.json().catch(() => null)
          : null;
      const jmaJson =
        jmaSettled.status === 'fulfilled' && jmaSettled.value.ok
          ? await jmaSettled.value.json().catch(() => null)
          : null;
      const airJson =
        airSettled.status === 'fulfilled' && airSettled.value.ok
          ? await airSettled.value.json().catch(() => null)
          : null;

      const primaryJson =
        bestJson && (isFiniteNum(bestJson?.current?.temperature_2m) || Array.isArray(bestJson?.hourly?.temperature_2m))
          ? bestJson
          : jmaJson && (isFiniteNum(jmaJson?.current?.temperature_2m) || Array.isArray(jmaJson?.hourly?.temperature_2m))
          ? jmaJson
          : kmaJson;

      const primaryCurrent = primaryJson?.current || {};
      const hasPrimaryHourly =
        Array.isArray(primaryJson?.hourly?.temperature_2m) &&
        primaryJson.hourly.temperature_2m.some((v: unknown) => isFiniteNum(v));
      if (!primaryJson || (!isFiniteNum(primaryCurrent.temperature_2m) && !hasPrimaryHourly)) {
        res.status(502).json({ error: '기상 데이터를 불러오지 못했습니다.' });
        return;
      }

      const hasKmaCurrent = isFiniteNum(kmaJson?.current?.temperature_2m);
      const hasKmaHourly =
        Array.isArray(kmaJson?.hourly?.temperature_2m) &&
        kmaJson.hourly.temperature_2m.some((v: unknown) => isFiniteNum(v));
      const hasJmaData = isFiniteNum(jmaJson?.current?.temperature_2m);

      let marineJson: any =
        marineSettled.status === 'fulfilled' && marineSettled.value.ok
          ? await marineSettled.value.json().catch(() => null)
          : null;

      let marineReferenceLabel = '현위치 해상·연안';
      if (
        !marineJson ||
        (!isFiniteNum(marineJson?.current?.wave_height) &&
          !isFiniteNum(marineJson?.current?.sea_surface_temperature))
      ) {
        let nearestStation = COASTAL_MARINE_STATIONS[0];
        let minKm = calculateDistanceKm({ lat, lng }, nearestStation);
        for (const st of COASTAL_MARINE_STATIONS.slice(1)) {
          const d = calculateDistanceKm({ lat, lng }, st);
          if (d < minKm) {
            minKm = d;
            nearestStation = st;
          }
        }
        try {
          const fallbackMarineRes = await fetch(
            buildMarineUrl(nearestStation.lat, nearestStation.lng),
            { signal: AbortSignal.timeout(4500) }
          );
          if (fallbackMarineRes.ok) {
            const fallbackMarineJson = await fallbackMarineRes.json().catch(() => null);
            if (
              fallbackMarineJson &&
              (isFiniteNum(fallbackMarineJson?.current?.wave_height) ||
                isFiniteNum(fallbackMarineJson?.current?.sea_surface_temperature))
            ) {
              marineJson = fallbackMarineJson;
              marineReferenceLabel = `가까운 ${nearestStation.name} (약 ${Math.round(minKm)}km)`;
            }
          }
        } catch {
          /* ignore coastal fallback failure */
        }
      }

      const fTimes: string[] = Array.isArray(primaryJson?.hourly?.time)
        ? primaryJson.hourly.time
        : [];
      const kmaIndexByTime = new Map<string, number>();
      if (Array.isArray(kmaJson?.hourly?.time)) {
        kmaJson.hourly.time.forEach((t: string, i: number) => kmaIndexByTime.set(t, i));
      }
      const jmaIndexByTime = new Map<string, number>();
      if (Array.isArray(jmaJson?.hourly?.time)) {
        jmaJson.hourly.time.forEach((t: string, i: number) => jmaIndexByTime.set(t, i));
      }
      const bestIndexByTime = new Map<string, number>();
      if (Array.isArray(bestJson?.hourly?.time)) {
        bestJson.hourly.time.forEach((t: string, i: number) => bestIndexByTime.set(t, i));
      }

      const marineHourly = marineJson?.hourly || {};
      const mTimes: string[] = Array.isArray(marineHourly.time) ? marineHourly.time : [];
      const marineByTime = new Map<
        string,
        {
          wave: number | null;
          period: number | null;
          dir: number | null;
          swell: number | null;
          sst: number | null;
        }
      >();
      for (let i = 0; i < mTimes.length; i++) {
        marineByTime.set(mTimes[i], {
          wave: isFiniteNum(marineHourly.wave_height?.[i]) ? marineHourly.wave_height[i] : null,
          period: isFiniteNum(marineHourly.wave_period?.[i]) ? marineHourly.wave_period[i] : null,
          dir: isFiniteNum(marineHourly.wave_direction?.[i]) ? marineHourly.wave_direction[i] : null,
          swell: isFiniteNum(marineHourly.swell_wave_height?.[i]) ? marineHourly.swell_wave_height[i] : null,
          sst: isFiniteNum(marineHourly.sea_surface_temperature?.[i])
            ? marineHourly.sea_surface_temperature[i]
            : null,
        });
      }

      // Anchor strictly to current Korea Standard Time (Asia/Seoul) hour first
      let startIdx = fTimes.findIndex(
        (t) => typeof t === 'string' && t.startsWith(kstClock.isoHourPrefix)
      );
      if (startIdx < 0) {
        const currentHourPrefix =
          typeof primaryCurrent.time === 'string' ? primaryCurrent.time.slice(0, 13) : '';
        startIdx = currentHourPrefix
          ? fTimes.findIndex((t) => typeof t === 'string' && t.startsWith(currentHourPrefix))
          : 0;
      }
      if (startIdx < 0) startIdx = 0;

      const hourlySeries = [];
      for (let i = startIdx; i < Math.min(fTimes.length, startIdx + 12); i++) {
        const isoTime = fTimes[i];
        const bIdx = bestIndexByTime.get(isoTime) ?? -1;
        const kIdx = kmaIndexByTime.get(isoTime) ?? -1;
        const jIdx = jmaIndexByTime.get(isoTime) ?? -1;
        const marineEntry = marineByTime.get(isoTime);
        const matchHour = typeof isoTime === 'string' ? isoTime.match(/T(\d{2}):/) : null;
        const hourLabel = matchHour ? `${Number(matchHour[1])}시` : '--시';

        const tempC =
          calibrateMetric(
            kIdx >= 0 ? kmaJson?.hourly?.temperature_2m?.[kIdx] : null,
            bIdx >= 0 ? bestJson?.hourly?.temperature_2m?.[bIdx] : primaryJson?.hourly?.temperature_2m?.[i],
            jIdx >= 0 ? jmaJson?.hourly?.temperature_2m?.[jIdx] : null,
            'blend'
          ) ??
          (isFiniteNum(primaryCurrent.temperature_2m) ? primaryCurrent.temperature_2m : 0);

        const apparentC = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.apparent_temperature?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.apparent_temperature?.[bIdx] : primaryJson?.hourly?.apparent_temperature?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.apparent_temperature?.[jIdx] : null,
          'blend'
        );

        const humidity = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.relative_humidity_2m?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.relative_humidity_2m?.[bIdx] : primaryJson?.hourly?.relative_humidity_2m?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.relative_humidity_2m?.[jIdx] : null,
          'blend'
        );

        const pressure = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.pressure_msl?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.pressure_msl?.[bIdx] : primaryJson?.hourly?.pressure_msl?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.pressure_msl?.[jIdx] : null,
          'blend'
        );

        const visibilityMeters = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.visibility?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.visibility?.[bIdx] : primaryJson?.hourly?.visibility?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.visibility?.[jIdx] : null,
          'blend'
        );

        const cloudCover = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.cloud_cover?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.cloud_cover?.[bIdx] : primaryJson?.hourly?.cloud_cover?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.cloud_cover?.[jIdx] : null,
          'blend'
        );

        const uvVal = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.uv_index?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.uv_index?.[bIdx] : primaryJson?.hourly?.uv_index?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.uv_index?.[jIdx] : null,
          'blend'
        );

        const wCode =
          calibrateMetric(
            kIdx >= 0 ? kmaJson?.hourly?.weather_code?.[kIdx] : null,
            bIdx >= 0 ? bestJson?.hourly?.weather_code?.[bIdx] : primaryJson?.hourly?.weather_code?.[i],
            jIdx >= 0 ? jmaJson?.hourly?.weather_code?.[jIdx] : null,
            'preferPrimary'
          ) ?? (primaryCurrent.weather_code ?? 0);

        const windMs =
          calibrateMetric(
            kIdx >= 0 ? kmaJson?.hourly?.wind_speed_10m?.[kIdx] : null,
            bIdx >= 0 ? bestJson?.hourly?.wind_speed_10m?.[bIdx] : primaryJson?.hourly?.wind_speed_10m?.[i],
            jIdx >= 0 ? jmaJson?.hourly?.wind_speed_10m?.[jIdx] : null,
            'blend'
          ) ?? (primaryCurrent.wind_speed_10m ?? 0);

        const gustsMs = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.wind_gusts_10m?.[kIdx] : null,
          bIdx >= 0 ? bestJson?.hourly?.wind_gusts_10m?.[bIdx] : primaryJson?.hourly?.wind_gusts_10m?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.wind_gusts_10m?.[jIdx] : null,
          'max'
        );

        const windDir =
          calibrateMetric(
            kIdx >= 0 ? kmaJson?.hourly?.wind_direction_10m?.[kIdx] : null,
            bIdx >= 0 ? bestJson?.hourly?.wind_direction_10m?.[bIdx] : primaryJson?.hourly?.wind_direction_10m?.[i],
            jIdx >= 0 ? jmaJson?.hourly?.wind_direction_10m?.[jIdx] : null,
            'preferPrimary'
          ) ?? (primaryCurrent.wind_direction_10m ?? 0);

        const precipProb = calibrateMetric(
          kIdx >= 0 ? kmaJson?.hourly?.precipitation_probability?.[kIdx] : null,
          bIdx >= 0
            ? bestJson?.hourly?.precipitation_probability?.[bIdx]
            : primaryJson?.hourly?.precipitation_probability?.[i],
          jIdx >= 0 ? jmaJson?.hourly?.precipitation_probability?.[jIdx] : null,
          'max'
        );

        hourlySeries.push({
          time: isoTime,
          hourLabel,
          temperatureC: tempC,
          apparentTempC: apparentC,
          humidityPct: humidity !== null ? Math.round(humidity) : null,
          pressureHpa: pressure,
          visibilityKm:
            visibilityMeters !== null ? Math.round((visibilityMeters / 1000) * 10) / 10 : null,
          cloudCoverPct: cloudCover !== null ? Math.round(cloudCover) : null,
          uvIndex: uvVal,
          weatherCode: Math.round(wCode),
          windSpeedMs: windMs,
          windGustsMs: gustsMs,
          windDirectionDeg: Math.round(windDir),
          precipitationProb: precipProb !== null ? Math.round(precipProb) : null,
          waveHeightM: marineEntry?.wave ?? null,
          swellHeightM: marineEntry?.swell ?? null,
          seaSurfaceTempC: marineEntry?.sst ?? null,
        });
      }

      const currentSlot = hourlySeries[0];
      const currentMarineSlot = currentSlot?.time ? marineByTime.get(currentSlot.time) : undefined;
      const isCurrentSameKstHour =
        typeof primaryCurrent.time === 'string' &&
        primaryCurrent.time.startsWith(kstClock.isoHourPrefix);

      const calTemp = calibrateMetric(
        kmaJson?.current?.temperature_2m,
        bestJson?.current?.temperature_2m,
        jmaJson?.current?.temperature_2m,
        'blend'
      );
      const calApparentTemp = calibrateMetric(
        kmaJson?.current?.apparent_temperature,
        bestJson?.current?.apparent_temperature,
        jmaJson?.current?.apparent_temperature,
        'blend'
      );
      const calHumidity = calibrateMetric(
        kmaJson?.current?.relative_humidity_2m,
        bestJson?.current?.relative_humidity_2m,
        jmaJson?.current?.relative_humidity_2m,
        'blend'
      );
      const calDewPoint = calibrateMetric(
        kmaJson?.current?.dew_point_2m,
        bestJson?.current?.dew_point_2m,
        jmaJson?.current?.dew_point_2m,
        'blend'
      );
      const calPressure = calibrateMetric(
        kmaJson?.current?.pressure_msl,
        bestJson?.current?.pressure_msl,
        jmaJson?.current?.pressure_msl,
        'blend'
      );
      const calCloudCover = calibrateMetric(
        kmaJson?.current?.cloud_cover,
        bestJson?.current?.cloud_cover,
        jmaJson?.current?.cloud_cover,
        'blend'
      );
      const calVisibility = calibrateMetric(
        kmaJson?.current?.visibility,
        bestJson?.current?.visibility,
        jmaJson?.current?.visibility,
        'blend'
      );
      const calUvIndex = calibrateMetric(
        kmaJson?.current?.uv_index,
        bestJson?.current?.uv_index,
        jmaJson?.current?.uv_index,
        'blend'
      );
      const calWeatherCode = calibrateMetric(
        kmaJson?.current?.weather_code,
        bestJson?.current?.weather_code,
        jmaJson?.current?.weather_code,
        'preferPrimary'
      );
      const calWindMs = calibrateMetric(
        kmaJson?.current?.wind_speed_10m,
        bestJson?.current?.wind_speed_10m,
        jmaJson?.current?.wind_speed_10m,
        'blend'
      );
      const calWindDir = calibrateMetric(
        kmaJson?.current?.wind_direction_10m,
        bestJson?.current?.wind_direction_10m,
        jmaJson?.current?.wind_direction_10m,
        'preferPrimary'
      );
      const calGustsMs = calibrateMetric(
        kmaJson?.current?.wind_gusts_10m,
        bestJson?.current?.wind_gusts_10m,
        jmaJson?.current?.wind_gusts_10m,
        'max'
      );
      const calPrecipMm = calibrateMetric(
        kmaJson?.current?.precipitation,
        bestJson?.current?.precipitation,
        jmaJson?.current?.precipitation,
        'max'
      );

      const finalTemperatureC =
        isCurrentSameKstHour && calTemp !== null ? calTemp : currentSlot?.temperatureC ?? calTemp ?? 0;
      const finalApparentTempC =
        isCurrentSameKstHour && calApparentTemp !== null
          ? calApparentTemp
          : currentSlot?.apparentTempC ?? calApparentTemp ?? null;
      const finalHumidityPct =
        isCurrentSameKstHour && calHumidity !== null
          ? Math.round(calHumidity)
          : currentSlot?.humidityPct ?? (calHumidity !== null ? Math.round(calHumidity) : null);
      const finalDewPointC = calDewPoint;
      const finalPressureHpa =
        isCurrentSameKstHour && calPressure !== null
          ? calPressure
          : currentSlot?.pressureHpa ?? calPressure ?? null;
      const finalCloudCoverPct =
        isCurrentSameKstHour && calCloudCover !== null
          ? Math.round(calCloudCover)
          : currentSlot?.cloudCoverPct ?? (calCloudCover !== null ? Math.round(calCloudCover) : null);
      const finalVisibilityKm =
        isCurrentSameKstHour && calVisibility !== null
          ? Math.round((calVisibility / 1000) * 10) / 10
          : currentSlot?.visibilityKm ?? (calVisibility !== null ? Math.round((calVisibility / 1000) * 10) / 10 : null);
      const finalUvIndex =
        isCurrentSameKstHour && calUvIndex !== null
          ? calUvIndex
          : currentSlot?.uvIndex ?? calUvIndex ?? null;

      // Compute 3-hour barometric pressure delta & trend using past_days=1 hourly data
      let pressureDelta3hHpa: number | null = null;
      let pressureTrend: '상승' | '안정' | '하강' | null = null;
      if (finalPressureHpa !== null && startIdx >= 3) {
        const prevTime = fTimes[startIdx - 3];
        const prevBIdx = prevTime ? bestIndexByTime.get(prevTime) ?? -1 : -1;
        const prevKIdx = prevTime ? kmaIndexByTime.get(prevTime) ?? -1 : -1;
        const prevJIdx = prevTime ? jmaIndexByTime.get(prevTime) ?? -1 : -1;
        const prevPressure = calibrateMetric(
          prevKIdx >= 0 ? kmaJson?.hourly?.pressure_msl?.[prevKIdx] : null,
          prevBIdx >= 0 ? bestJson?.hourly?.pressure_msl?.[prevBIdx] : primaryJson?.hourly?.pressure_msl?.[startIdx - 3],
          prevJIdx >= 0 ? jmaJson?.hourly?.pressure_msl?.[prevJIdx] : null,
          'blend'
        );
        if (prevPressure !== null) {
          pressureDelta3hHpa = Math.round((finalPressureHpa - prevPressure) * 10) / 10;
          pressureTrend =
            pressureDelta3hHpa >= 0.8 ? '상승' : pressureDelta3hHpa <= -0.8 ? '하강' : '안정';
        }
      }

      // Daily sunrise/sunset/min/max/UV max/precip max for today's KST date
      const dailySource = bestJson?.daily || primaryJson?.daily || kmaJson?.daily || jmaJson?.daily;
      const dailyTimes: string[] = Array.isArray(dailySource?.time) ? dailySource.time : [];
      const todayDailyIdx = Math.max(
        0,
        dailyTimes.findIndex((d) => d === kstClock.isoDatePrefix)
      );
      const rawSunrise = dailySource?.sunrise?.[todayDailyIdx];
      const rawSunset = dailySource?.sunset?.[todayDailyIdx];
      const sunriseKst =
        typeof rawSunrise === 'string' && rawSunrise.length >= 16 ? rawSunrise.slice(11, 16) : null;
      const sunsetKst =
        typeof rawSunset === 'string' && rawSunset.length >= 16 ? rawSunset.slice(11, 16) : null;

      const dailyMaxTempC = calibrateMetric(
        kmaJson?.daily?.temperature_2m_max?.[todayDailyIdx],
        bestJson?.daily?.temperature_2m_max?.[todayDailyIdx],
        jmaJson?.daily?.temperature_2m_max?.[todayDailyIdx],
        'blend'
      );
      const dailyMinTempC = calibrateMetric(
        kmaJson?.daily?.temperature_2m_min?.[todayDailyIdx],
        bestJson?.daily?.temperature_2m_min?.[todayDailyIdx],
        jmaJson?.daily?.temperature_2m_min?.[todayDailyIdx],
        'blend'
      );
      const uvIndexMax = calibrateMetric(
        kmaJson?.daily?.uv_index_max?.[todayDailyIdx],
        bestJson?.daily?.uv_index_max?.[todayDailyIdx],
        jmaJson?.daily?.uv_index_max?.[todayDailyIdx],
        'max'
      );
      const dailyPrecipProbMax = calibrateMetric(
        kmaJson?.daily?.precipitation_probability_max?.[todayDailyIdx],
        bestJson?.daily?.precipitation_probability_max?.[todayDailyIdx],
        jmaJson?.daily?.precipitation_probability_max?.[todayDailyIdx],
        'max'
      );

      const finalWeatherCode =
        isCurrentSameKstHour && calWeatherCode !== null
          ? Math.round(calWeatherCode)
          : currentSlot?.weatherCode ?? 0;
      const finalWindSpeedMs =
        isCurrentSameKstHour && calWindMs !== null
          ? calWindMs
          : currentSlot?.windSpeedMs ?? calWindMs ?? 0;
      const finalWindDirectionDeg =
        isCurrentSameKstHour && calWindDir !== null
          ? Math.round(calWindDir)
          : currentSlot?.windDirectionDeg ?? 0;
      const finalWindGustsMs =
        isCurrentSameKstHour && calGustsMs !== null
          ? calGustsMs
          : currentSlot?.windGustsMs ?? calGustsMs ?? null;
      const finalPrecipitationMm =
        isCurrentSameKstHour && calPrecipMm !== null
          ? calPrecipMm
          : isFiniteNum(primaryJson?.hourly?.precipitation?.[startIdx])
          ? primaryJson.hourly.precipitation[startIdx]
          : calPrecipMm ?? 0;

      const waveHeightCurrent = isFiniteNum(marineJson?.current?.wave_height)
        ? marineJson.current.wave_height
        : null;
      const wavePeriodCurrent = isFiniteNum(marineJson?.current?.wave_period)
        ? marineJson.current.wave_period
        : null;
      const waveDirCurrent = isFiniteNum(marineJson?.current?.wave_direction)
        ? marineJson.current.wave_direction
        : null;
      const windWaveHeightCurrent = isFiniteNum(marineJson?.current?.wind_wave_height)
        ? marineJson.current.wind_wave_height
        : null;
      const swellHeightCurrent = isFiniteNum(marineJson?.current?.swell_wave_height)
        ? marineJson.current.swell_wave_height
        : null;
      const swellPeriodCurrent = isFiniteNum(marineJson?.current?.swell_wave_period)
        ? marineJson.current.swell_wave_period
        : null;
      const swellDirCurrent = isFiniteNum(marineJson?.current?.swell_wave_direction)
        ? marineJson.current.swell_wave_direction
        : null;
      const currentSpeedMs = isFiniteNum(marineJson?.current?.ocean_current_velocity)
        ? Math.round(marineJson.current.ocean_current_velocity * 100) / 100
        : null;
      const currentDirDeg = isFiniteNum(marineJson?.current?.ocean_current_direction)
        ? Math.round(marineJson.current.ocean_current_direction)
        : null;
      const sstCurrent = isFiniteNum(marineJson?.current?.sea_surface_temperature)
        ? marineJson.current.sea_surface_temperature
        : null;

      const pm10 = isFiniteNum(airJson?.current?.pm10) ? Math.round(airJson.current.pm10) : null;
      const pm25 = isFiniteNum(airJson?.current?.pm2_5) ? Math.round(airJson.current.pm2_5) : null;
      const airQualityLabel = formatAirQualityLabel(pm10, pm25);

      const modelLabel =
        hasKmaCurrent || hasKmaHourly
          ? '기상청(KMA) 수치예보 보정 실황'
          : hasJmaData
          ? '동아시아 연안·기상 보정 모델'
          : '고해상도 실시간 기상 모델';

      res.json({
        temperatureC: finalTemperatureC,
        apparentTempC: finalApparentTempC,
        humidityPct: finalHumidityPct,
        dewPointC: finalDewPointC,
        pressureHpa: finalPressureHpa,
        pressureDelta3hHpa,
        pressureTrend,
        cloudCoverPct: finalCloudCoverPct,
        visibilityKm: finalVisibilityKm,
        uvIndex: finalUvIndex,
        uvIndexMax,
        sunriseKst,
        sunsetKst,
        dailyMinTempC,
        dailyMaxTempC,
        dailyPrecipProbMax: dailyPrecipProbMax !== null ? Math.round(dailyPrecipProbMax) : null,
        pm10,
        pm25,
        airQualityLabel,
        weatherCode: finalWeatherCode,
        windSpeedMs: finalWindSpeedMs,
        windDirectionDeg: finalWindDirectionDeg,
        windGustsMs: finalWindGustsMs,
        precipitationMm: finalPrecipitationMm,
        precipitationProb: currentSlot?.precipitationProb ?? null,
        waveHeightM:
          isCurrentSameKstHour && waveHeightCurrent !== null
            ? waveHeightCurrent
            : currentMarineSlot?.wave ?? waveHeightCurrent,
        wavePeriodSec:
          isCurrentSameKstHour && wavePeriodCurrent !== null
            ? wavePeriodCurrent
            : currentMarineSlot?.period ?? wavePeriodCurrent,
        waveDirectionDeg:
          isCurrentSameKstHour && waveDirCurrent !== null
            ? waveDirCurrent
            : currentMarineSlot?.dir ?? waveDirCurrent,
        windWaveHeightM: windWaveHeightCurrent,
        swellHeightM:
          isCurrentSameKstHour && swellHeightCurrent !== null
            ? swellHeightCurrent
            : currentMarineSlot?.swell ?? swellHeightCurrent,
        swellPeriodSec: swellPeriodCurrent,
        swellDirectionDeg: swellDirCurrent,
        oceanCurrentSpeedMs: currentSpeedMs,
        oceanCurrentDirDeg: currentDirDeg,
        seaSurfaceTempC:
          isCurrentSameKstHour && sstCurrent !== null
            ? sstCurrent
            : currentMarineSlot?.sst ?? sstCurrent,
        observedAt: currentSlot?.time || primaryCurrent.time || kstClock.isoHourPrefix,
        observedAtKst: kstClock.displayKst,
        kstHour: kstClock.hour,
        modelLabel,
        marineReferenceLabel,
        isLive: true,
        hourlySeries,
      });
    } catch (error: any) {
      console.error('Weather fishing proxy error:', error);
      res.status(500).json({ error: error.message || '기상 정보 조회 중 오류가 발생했습니다.' });
    }
  });

  // Device network/IP geolocation fallback
  app.get('/api/location/device', async (req, res) => {
    try {
      const forwardedHeader =
        req.headers['cf-connecting-ip'] ||
        req.headers['x-vercel-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.headers['x-forwarded-for'];
      const clientIp = extractClientIpFromHeader(forwardedHeader, req.socket?.remoteAddress);

      if (!clientIp) {
        res.json({
          available: false,
          reason: 'no-client-ip',
          message: '클라이언트 공인 IP 헤더가 없어 브라우저 위치 확인으로 전환합니다.',
        });
        return;
      }

      const ipwhoUrl = `https://ipwho.is/${encodeURIComponent(clientIp)}?lang=ko`;
      const ipApiUrl = `http://ip-api.com/json/${encodeURIComponent(
        clientIp
      )}?fields=status,country,countryCode,regionName,city,district,zip,lat,lon&lang=ko`;
      const ipapiCoUrl = `https://ipapi.co/${encodeURIComponent(clientIp)}/json/`;

      const [ipwhoSettled, ipApiSettled, ipapiCoSettled] = await Promise.allSettled([
        fetch(ipwhoUrl, { signal: AbortSignal.timeout(4000) }),
        fetch(ipApiUrl, { signal: AbortSignal.timeout(4000) }),
        fetch(ipapiCoUrl, { signal: AbortSignal.timeout(4000) }),
      ]);

      let resolved: {
        lat: number;
        lng: number;
        city: string;
        region: string;
        country: string;
        countryCode: string;
        district?: string;
        postcode?: string;
      } | null = null;

      if (ipApiSettled.status === 'fulfilled' && ipApiSettled.value.ok) {
        const d = await ipApiSettled.value.json().catch(() => null);
        if (d?.status === 'success' && typeof d.lat === 'number' && typeof d.lon === 'number') {
          resolved = {
            lat: d.lat,
            lng: d.lon,
            city: d.city || '',
            region: d.regionName || '',
            country: d.country || '',
            countryCode: d.countryCode || '',
            district: d.district || '',
            postcode: d.zip || '',
          };
        }
      }

      if (!resolved && ipwhoSettled.status === 'fulfilled' && ipwhoSettled.value.ok) {
        const data = await ipwhoSettled.value.json().catch(() => null);
        if (
          data?.success !== false &&
          typeof data?.latitude === 'number' &&
          typeof data?.longitude === 'number'
        ) {
          resolved = {
            lat: data.latitude,
            lng: data.longitude,
            city: data.city || '',
            region: data.region || '',
            country: data.country || '',
            countryCode: data.country_code || '',
          };
        }
      }

      if (!resolved && ipapiCoSettled.status === 'fulfilled' && ipapiCoSettled.value.ok) {
        const data = await ipapiCoSettled.value.json().catch(() => null);
        if (typeof data?.latitude === 'number' && typeof data?.longitude === 'number') {
          resolved = {
            lat: data.latitude,
            lng: data.longitude,
            city: data.city || '',
            region: data.region || '',
            country: data.country_name || '',
            countryCode: data.country_code || '',
            postcode: data.postal || '',
          };
        }
      }

      if (!resolved) {
        res.json({ available: false, reason: 'lookup-failed' });
        return;
      }

      const inKorea = isInKoreaBounds({ lat: resolved.lat, lng: resolved.lng });
      if (!inKorea && resolved.countryCode !== 'KR') {
        res.json({
          available: false,
          reason: 'proxy-outside-korea',
          detectedCountryCode: resolved.countryCode,
        });
        return;
      }

      let details = null;
      let formattedAddress = '';
      let shortLabel = '';
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
            resolved.lat
          )}&lon=${encodeURIComponent(resolved.lng)}&accept-language=ko&addressdetails=1&zoom=16`,
          {
            headers: { 'User-Agent': 'IltamanseonFishingApp/1.0', Accept: 'application/json' },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json().catch(() => null);
          if (nomData && !nomData.error) {
            details = buildDetailedKoreanAddress(
              nomData.address,
              nomData.display_name || '',
              nomData.name || ''
            );
            formattedAddress = details.formattedAddress;
            shortLabel = details.shortLabel;
          }
        }
      } catch {
        /* ignore optional enrichment failure */
      }

      res.json({
        available: true,
        ...resolved,
        formattedAddress,
        shortLabel,
        details,
        source: 'device-ip',
      });
    } catch (error: any) {
      console.error('Device IP location error:', error);
      res.status(500).json({ error: error.message || '기기 위치 확인 중 오류가 발생했습니다.' });
    }
  });

  return app;
}
