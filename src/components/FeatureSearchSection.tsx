import React from 'react';
import {
  Search,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Utensils,
  Microscope,
  RotateCcw,
} from 'lucide-react';
import type { FishSpecies } from '../data/fishingData';
import {
  DetailedFishFeatures,
  FeatureSearchResultItem,
  findMatchingEncyclopediaFish,
  normalizeFishRecipes,
} from '../utils/featureQuery';

interface FeatureSearchSectionProps {
  searchParams: DetailedFishFeatures;
  onChangeParams: (next: DetailedFishFeatures) => void;
  onResetParams: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSearching: boolean;
  error: string | null;
  results: FeatureSearchResultItem[];
  encyclopedia: FishSpecies[];
  onSelectFishForAnalysis: (speciesName: string) => void;
}

export const FeatureSearchSection: React.FC<FeatureSearchSectionProps> = ({
  searchParams,
  onChangeParams,
  onResetParams,
  onSubmit,
  isSearching,
  error,
  results,
  encyclopedia,
  onSelectFishForAnalysis,
}) => {
  return (
    <section
      aria-label="특징 직접 입력 어종 검색"
      className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4B9FE8]/20 pb-4">
        <div>
          <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
            <Search className="w-6 h-6 text-[#36D6E8]" /> 3. 물고기 생김새·특징 직접 입력 AI 추론
          </h3>
          <p className="text-sm text-[#A7C2D8] mt-1">
            이름을 모를 때 색상, 무늬, 크기, 지느러미, 잡힌 곳 등 기억나는 특징을 자유롭게 한 칸에 직접 입력해 보세요.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetParams}
          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0B2948] hover:bg-[#143d66] text-[#A7C2D8] hover:text-[#F4FAFF] border border-[#4B9FE8]/25 text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-center"
        >
          <RotateCcw className="w-3.5 h-3.5" /> 초기화
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="direct-feature-description"
            className="block text-xs font-bold text-[#36D6E8] mb-2"
          >
            물고기 특징 직접 입력 (해역 기준: {searchParams.region})
          </label>
          <textarea
            id="direct-feature-description"
            rows={3}
            value={searchParams.directDescription}
            onChange={(e) =>
              onChangeParams({
                ...searchParams,
                directDescription: e.target.value,
                extraDescription: e.target.value,
              })
            }
            placeholder="예: 몸이 붉은빛을 띠고 등에 파란 점무늬가 있어요 / 꼬리지느러미 끝이 검고 방파제 바닥에서 크릴로 잡았어요"
            className="w-full bg-[#061B33] border border-[#4B9FE8]/35 rounded-xl px-4 py-3 text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
          />
          <p className="text-[11px] text-amber-200/90 mt-2 flex items-start gap-1.5 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              AI는 언제나 정확한 정답만 말하지 않으며 정확한 정답에 가깝게 하기 위해 특징을 자세히 입력해 주세요.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#A7C2D8]">빠른 예시:</span>
          {[
            '몸통에 검은 세로 줄무늬가 7개 있고 입이 작은 편이에요',
            '화려한 붉은 줄무늬에 지느러미가 부채처럼 길게 퍼져 있어요',
            '어두운 갈색에 등지느러미 가시가 많고 눈 아래 어두운 띠가 있어요',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                onChangeParams({
                  ...searchParams,
                  directDescription: preset,
                  extraDescription: preset,
                })
              }
              className="px-2.5 py-1 rounded-lg bg-[#0B2948] hover:bg-[#143d66] text-[#F4FAFF] border border-[#4B9FE8]/25 text-xs transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={isSearching}
          className="w-full sm:w-auto min-h-[46px] px-6 py-3 btn-cyan-gradient rounded-xl text-sm font-bold shadow-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSearching ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> AI 유사 어종 분석 중...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> 입력 특징으로 유사 어종 찾기
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-200">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
          {results.map((item) => {
            const encyc = findMatchingEncyclopediaFish(item.speciesName, encyclopedia);
            const photo = item.imageUrl || encyc?.image || '';
            const recipes = normalizeFishRecipes(item.edible, item.recommendedRecipes, item.recipe);

            return (
              <div
                key={`${item.speciesName}_${item.scientificName}`}
                className="bg-[#061B33]/85 border border-[#4B9FE8]/30 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg"
              >
                {photo && (
                  <img
                    src={photo}
                    alt={`${item.speciesName} 참고 이미지`}
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover bg-[#041529] border-b border-[#4B9FE8]/20"
                  />
                )}
                <div className="p-4 space-y-3 text-xs flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#36D6E8] tabular-nums">
                        일치도 {item.matchScore}%
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          item.edible
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-950/80 text-red-300 border border-red-500/40'
                        }`}
                      >
                        {item.edible ? '식용 가능' : '섭취 주의/불가'}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-extrabold text-[#F4FAFF]">{item.speciesName}</h4>
                      <p className="text-[11px] text-[#A7C2D8] italic">{item.scientificName}</p>
                    </div>

                    <p className="text-[#F4FAFF]/90 leading-relaxed">{item.description}</p>

                    {item.anatomicalDetails && (
                      <div className="bg-[#0B2948]/80 border border-[#4B9FE8]/20 rounded-xl p-2.5 space-y-1 text-[11px]">
                        <div className="font-bold text-[#36D6E8] flex items-center gap-1">
                          <Microscope className="w-3.5 h-3.5" /> 해부학 구별 포인트
                        </div>
                        <p className="text-[#A7C2D8]">{item.anatomicalDetails.bodyAndColor}</p>
                        <p className="text-[#A7C2D8]">{item.anatomicalDetails.finsAndSpines}</p>
                      </div>
                    )}

                    {item.differentiatingPoints && (
                      <div className="bg-amber-950/35 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-100">
                        <strong className="text-amber-300">구별 팁:</strong> {item.differentiatingPoints}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px]">
                      {item.edible ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      <span className="text-[#A7C2D8]">
                        독성: <strong className="text-[#F4FAFF]">{item.toxicity}</strong>
                      </span>
                    </div>

                    {item.edible && recipes.length > 0 && (
                      <div className="bg-[#0B2948]/70 border border-[#36D6E8]/25 rounded-lg p-2.5 space-y-1">
                        <span className="text-[11px] font-bold text-[#36D6E8] flex items-center gap-1">
                          <Utensils className="w-3 h-3" /> 추천 요리: {recipes[0].dishName}
                        </span>
                        <p className="text-[11px] text-[#A7C2D8] line-clamp-2">{recipes[0].method}</p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectFishForAnalysis(item.speciesName)}
                    className="w-full min-h-[38px] px-3 py-2 btn-aqua-gradient rounded-xl text-xs font-bold mt-2"
                  >
                    이 어종 정밀 분석 보기 →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
