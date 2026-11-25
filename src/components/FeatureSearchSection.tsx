import React from 'react';
import {
  Search,
  Sparkles,
  RefreshCw,
  Compass,
  RotateCcw,
  Eye,
  Utensils,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Microscope,
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
  onSelectFishForAnalysis?: (speciesName: string) => void;
}

export function FeatureSearchSection({
  searchParams,
  onChangeParams,
  onResetParams,
  onSubmit,
  isSearching,
  error,
  results,
  encyclopedia,
  onSelectFishForAnalysis,
}: FeatureSearchSectionProps) {
  const directText = searchParams.extraDescription || '';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4B9FE8]/20 pb-4">
          <div>
            <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
              <Search className="w-6 h-6 text-[#36D6E8]" /> 3. 물고기 특징 직접 입력 어종 찾기
            </h3>
            <p className="text-sm text-[#A7C2D8] mt-1">
              잡은 물고기의 생김새, 색깔, 무늬, 가시 유무, 잡힌 장소 등을 자유롭게 한 번에 직접 입력하면 AI가 가장 유사한 어종과 사진·구별법을 찾아드립니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetParams}
            className="min-h-[40px] px-3.5 py-2 glass-subcard hover:border-[#36D6E8]/45 text-[#F4FAFF] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 self-start shrink-0 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#36D6E8]" /> 입력 초기화
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="direct-feature-input" className="block text-xs font-bold text-[#36D6E8]">
              물고기 생김새·특징 직접 입력
            </label>
            <textarea
              id="direct-feature-input"
              data-testid="direct-feature-input"
              rows={3}
              value={directText}
              onChange={(e) =>
                onChangeParams({ ...searchParams, extraDescription: e.target.value })
              }
              placeholder="예: 크기는 25cm 정도이고 몸통은 어두운 갈색에 얼룩무늬가 있어요. 등지느러미 가시가 억세고 부산 방파제 바닥층에서 갯지렁이로 잡았습니다."
              className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-3 text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-[#A7C2D8]">
              불필요한 선택 칸 없이 관찰한 특징만 적어주시면 정확한 판별 또는 가장 비슷한 유사 어종·이미지를 함께 제시합니다.
            </p>
            <button
              type="submit"
              disabled={isSearching || !directText.trim()}
              data-testid="direct-feature-submit"
              className="min-h-[48px] px-6 py-3 btn-cyan-gradient rounded-xl transition-all flex items-center justify-center gap-2 text-sm shrink-0 disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> AI 세밀 분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> AI 직접 특징 분석하기
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 bg-rose-950/75 border border-rose-400/40 rounded-xl text-rose-200 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Results Grid */}
      <div className="space-y-4">
        <h4 className="text-lg font-bold text-[#F4FAFF] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#36D6E8]" /> 유사 어종 후보 · 해부학 비교 및 이미지
        </h4>

        {results.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="feature-search-results">
            {results.map((fish, idx) => {
              const matchedEncyc = findMatchingEncyclopediaFish(fish.speciesName, encyclopedia);
              const displayImage = fish.imageUrl || matchedEncyc?.image || '';
              return (
                <div
                  key={idx}
                  className="glass-card rounded-xl overflow-hidden flex flex-col justify-between hover:border-[#36D6E8]/55 transition-all"
                >
                  <div className="p-5 space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h5 className="text-lg font-bold text-[#F4FAFF]">{fish.speciesName}</h5>
                        {fish.scientificName && (
                          <p className="text-xs text-[#A7C2D8] italic">{fish.scientificName}</p>
                        )}
                      </div>
                      <span className="text-xs text-[#36D6E8] font-bold font-mono tabular-nums shrink-0">
                        일치율 {fish.matchScore}%
                      </span>
                    </div>

                    {fish.isUncertain && (
                      <div className="p-2.5 rounded-lg bg-amber-950/45 border border-amber-400/40 text-amber-200 text-[11px] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        <span>입력하신 특징이 여러 근연종과 겹쳐 가장 유사한 후보로 비교해 드립니다.</span>
                      </div>
                    )}

                    {displayImage && (
                      <div className="h-44 rounded-lg overflow-hidden border border-[#4B9FE8]/25 bg-[#061B33]">
                        <img
                          src={displayImage}
                          alt={`${fish.speciesName} 어종 참고 사진`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <p className="text-xs text-[#F4FAFF]/90 leading-relaxed">{fish.description}</p>

                    {fish.anatomicalDetails && (
                      <div className="p-3 glass-subcard rounded-lg space-y-1.5 text-[11px]">
                        <div className="font-bold text-[#36D6E8] flex items-center gap-1">
                          <Microscope className="w-3.5 h-3.5" /> AI 세밀 해부학 특징 비교
                        </div>
                        <p className="text-[#A7C2D8]">
                          <strong className="text-[#F4FAFF]">체형·체색:</strong> {fish.anatomicalDetails.bodyAndColor}
                        </p>
                        <p className="text-[#A7C2D8]">
                          <strong className="text-[#F4FAFF]">지느러미·가시:</strong> {fish.anatomicalDetails.finsAndSpines}
                        </p>
                        <p className="text-[#A7C2D8]">
                          <strong className="text-[#F4FAFF]">머리·입·무늬:</strong> {fish.anatomicalDetails.headMouthPattern}
                        </p>
                      </div>
                    )}

                    {fish.visualDescription && (
                      <div className="p-3 glass-subcard rounded-lg space-y-1">
                        <div className="text-[11px] font-bold text-[#4B9FE8] flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> 외형 비교 묘사
                        </div>
                        <p className="text-xs text-[#A7C2D8] leading-relaxed">
                          {fish.visualDescription}
                        </p>
                      </div>
                    )}

                    {fish.differentiatingPoints && (
                      <div className="p-2.5 bg-[#061B33]/80 border border-amber-400/25 rounded-lg text-[11px] text-amber-200">
                        <strong className="text-amber-300">유사종 구별 포인트:</strong> {fish.differentiatingPoints}
                      </div>
                    )}

                    {fish.matchingTraits && fish.matchingTraits.length > 0 && (
                      <div className="text-xs text-[#36D6E8]">
                        <strong>일치 포인트:</strong> {fish.matchingTraits.join(' · ')}
                      </div>
                    )}

                    <div
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        fish.edible
                          ? 'bg-[#061B33]/75 border-[#36D6E8]/40 text-[#F4FAFF]'
                          : 'bg-rose-950/60 border-rose-400/45 text-rose-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          {fish.edible ? (
                            <CheckCircle2 className="w-4 h-4 text-[#36D6E8] shrink-0" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          {fish.edibilityStatus || (fish.edible ? '식용 가능' : '식용 불가 / 섭취 주의')}
                        </span>
                        <span className="text-[11px] font-medium text-[#A7C2D8]">{fish.toxicity}</span>
                      </div>
                      {fish.edibilityReason && (
                        <p className="text-[11px] leading-relaxed text-[#A7C2D8]">{fish.edibilityReason}</p>
                      )}
                      <p className="text-[11px] text-amber-300 font-medium">금어기·체장: {fish.fishingBan}</p>
                    </div>

                    {fish.edible ? (
                      <div className="glass-subcard rounded-xl p-3 space-y-2">
                        <div className="text-xs font-bold text-[#36D6E8] flex items-center gap-1.5">
                          <Utensils className="w-3.5 h-3.5" /> 추천 요리법 &amp; 손질
                        </div>
                        <div className="space-y-1.5">
                          {normalizeFishRecipes(fish.edible, fish.recommendedRecipes, fish.recipe).map(
                            (rec, rIdx) => (
                              <div key={rIdx} className="text-xs text-[#F4FAFF] bg-[#0B2948]/80 rounded-lg p-2 border border-[#4B9FE8]/15">
                                <div className="font-bold flex items-center justify-between gap-2">
                                  <span>{rec.dishName}</span>
                                  <span className="text-[10px] text-[#36D6E8]">{rec.difficulty}</span>
                                </div>
                                {rec.method && <p className="text-[11px] text-[#A7C2D8] mt-0.5">{rec.method}</p>}
                                {rec.tips && <p className="text-[11px] text-[#4B9FE8] mt-0.5">팁: {rec.tips}</p>}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-rose-950/45 border border-rose-400/35 rounded-xl p-3 text-xs text-rose-200">
                        식용 불가 또는 섭취 주의 어종이므로 요리를 추천하지 않습니다. 바늘 제거 후 즉시 방생하세요.
                      </div>
                    )}

                    {onSelectFishForAnalysis && (
                      <button
                        type="button"
                        onClick={() => onSelectFishForAnalysis(fish.speciesName)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl btn-aqua-gradient text-xs font-bold transition-all"
                      >
                        이 어종 AI 정밀 분석 · 유사종 이미지 보기 →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-14 glass-card rounded-2xl text-[#A7C2D8] space-y-2">
            <Compass className="w-10 h-10 mx-auto text-[#4B9FE8]" />
            <p className="text-sm">
              위 입력칸에 잡은 물고기 특징을 직접 적어 [AI 직접 특징 분석하기]를 눌러주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
