import React from 'react';
import {
  Star,
  Wind,
  Waves,
  ThermometerSun,
  RefreshCw,
  MapPin,
  ShieldCheck,
  Compass,
  Clock,
  Navigation,
} from 'lucide-react';
import {
  BeginnerFishingRating,
  FishingWeatherData,
  calculateBeginnerFishingRating,
} from '../utils/fishingRating';
import type { LocationSource } from '../utils/geo';
import type { RegionalTideSummary } from '../utils/koreaTide';

interface BeginnerWeatherRatingCardProps {
  locationLabel: string;
  regionLabel: string;
  locationSource?: LocationSource;
  weather: FishingWeatherData | null;
  tideInfo?: RegionalTideSummary | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onReturnToDevice?: () => void;
  onOpenMap?: () => void;
}

function getBeginnerTipByTone(tone: BeginnerFishingRating['tone']): {
  spotAdvice: string;
  rigAdvice: string;
} {
  switch (tone) {
    case 'excellent':
      return {
        spotAdvice: '방파제 내항·낚시공원·수변 워터프론트 모두 쾌적해요',
        rigAdvice: '초보 추천 채비: 원투낚시(갯지렁이) 또는 민장대 찌낚시(크릴)',
      };
    case 'good':
      return {
        spotAdvice: '난간이 있는 방파제·낚시공원 위주로 추천해요',
        rigAdvice: '초보 추천 채비: 2~3호 원투대 묶음추 채비 또는 가벼운 지그헤드',
      };
    case 'moderate':
      return {
        spotAdvice: '바람을 등지는 항구 안쪽(내항)이나 공원 쉼터를 고르세요',
        rigAdvice: '초보 추천 채비: 바람 영향이 적은 무거운 원투 추(15~20호) 채비',
      };
    case 'caution':
      return {
        spotAdvice: '테트라포드·갯바위는 피하고 안전한 방파제 내항·공원만 이용하세요',
        rigAdvice: '구명조끼 필수 착용 · 무리한 캐스팅은 자제하세요',
      };
    case 'danger':
    default:
      return {
        spotAdvice: '오늘은 기상이 거칠어 초보자 연안 출조를 쉬는 것이 안전해요',
        rigAdvice: '방파제·갯바위 접근 금지 · 실내 낚시터나 다음 물때를 권장합니다',
      };
  }
}

function StarRatingDisplay({ stars }: { stars: number }) {
  return (
    <div
      className="inline-flex items-center gap-1"
      aria-label={`선택 지역 낚시 추천도 5점 만점에 ${stars}점`}
      data-testid="fishing-star-rating"
    >
      {[1, 2, 3, 4, 5].map((index) => {
        const isFull = stars >= index;
        const isHalf = !isFull && stars >= index - 0.5;
        return (
          <span key={index} className="relative inline-flex w-5 h-5 sm:w-6 sm:h-6 items-center justify-center">
            <Star className="w-5 h-5 sm:w-6 sm:h-6 text-[#1e4a6d]" />
            {(isFull || isHalf) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: isFull ? '100%' : '50%' }}
              >
                <Star className="w-5 h-5 sm:w-6 sm:h-6 text-[#36D6E8] fill-[#36D6E8]" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function BeginnerWeatherRatingCard({
  locationLabel,
  regionLabel,
  locationSource = 'device-ip',
  weather,
  tideInfo,
  isLoading,
  error,
  onRefresh,
  onReturnToDevice,
  onOpenMap,
}: BeginnerWeatherRatingCardProps) {
  const rating = weather ? calculateBeginnerFishingRating(weather) : null;
  const beginnerTip = rating ? getBeginnerTipByTone(rating.tone) : null;
  const isMapSelected = locationSource === 'map-click' || locationSource === 'spot';

  const toneColors = {
    excellent: 'border-[#36D6E8]/45 bg-[#061B33]/75 text-[#36D6E8]',
    good: 'border-[#4B9FE8]/45 bg-[#061B33]/75 text-[#4B9FE8]',
    moderate: 'border-amber-400/40 bg-amber-950/35 text-amber-300',
    caution: 'border-orange-400/45 bg-orange-950/40 text-orange-300',
    danger: 'border-rose-400/50 bg-rose-950/45 text-rose-300',
  };

  return (
    <section
      id="weather-star-rating-section"
      aria-label="선택 지역 해양 기상 · 물때 및 추천 출조 지수"
      className="relative overflow-hidden glass-card rounded-2xl p-5 sm:p-6 space-y-5"
    >
      {/* Subtle Deep Ocean Photographic Backdrop + Scrim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/deep-ocean-hero.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#061B33]/92 via-[#0B2948]/86 to-[#103653]/88"
      />

      {/* Subtle wave line ornament */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 left-0 right-0 w-full h-14 opacity-20"
        preserveAspectRatio="none"
        viewBox="0 0 1200 100"
      >
        <path
          d="M0,45 C220,90 420,10 640,48 C860,86 1040,18 1200,52 L1200,100 L0,100 Z"
          fill="url(#heroWaveGrad)"
        />
        <defs>
          <linearGradient id="heroWaveGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#36D6E8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#4B9FE8" stopOpacity="0.15" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#36D6E8]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {isMapSelected ? '지도 선택 지역 실시간 관측' : '현재 기기 위치 실시간 관측'}
              </span>
              <span className="text-[#4B9FE8]/60">·</span>
              <span
                className="inline-flex items-center gap-1 text-[#F4FAFF] font-semibold"
                data-testid="weather-device-location-label"
              >
                <MapPin className="w-3.5 h-3.5 text-[#36D6E8] shrink-0" />
                {locationLabel} ({regionLabel})
              </span>
              {weather?.observedAtKst && (
                <>
                  <span className="hidden sm:inline text-[#4B9FE8]/50">·</span>
                  <span className="text-[#A7C2D8] font-mono tabular-nums">
                    {weather.observedAtKst}
                  </span>
                </>
              )}
              {weather?.modelLabel && (
                <>
                  <span className="hidden sm:inline text-[#4B9FE8]/50">·</span>
                  <span className="text-[#4B9FE8] font-semibold" data-testid="weather-model-label">
                    {weather.modelLabel}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#F4FAFF]">
              {isMapSelected ? `${locationLabel} 해양·낚시 관측 브리핑` : '오늘 내 위치 낚시·해황 추천 지수'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {rating && (
              <div className="flex items-center gap-3 glass-subcard rounded-xl px-4 py-2.5">
                <StarRatingDisplay stars={rating.stars} />
                <div className="text-right">
                  <span className="text-lg font-extrabold font-mono text-[#36D6E8] tabular-nums">
                    {rating.stars.toFixed(1)}
                  </span>
                  <span className="text-xs text-[#A7C2D8]"> / 5.0</span>
                </div>
              </div>
            )}
            {isMapSelected && onReturnToDevice && (
              <button
                type="button"
                onClick={onReturnToDevice}
                className="min-h-[42px] px-3.5 py-2 btn-aqua-gradient rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap"
              >
                <Navigation className="w-3.5 h-3.5" /> 내 기기 위치로
              </button>
            )}
            {onOpenMap && (
              <button
                type="button"
                onClick={onOpenMap}
                className="min-h-[42px] px-3.5 py-2 btn-cyan-gradient rounded-xl text-xs inline-flex items-center gap-1.5 transition-all whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5" /> 지도에서 지역 변경
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="기상 추천도 새로고침"
              className="min-h-[42px] px-3.5 py-2 glass-subcard hover:border-[#36D6E8]/50 text-[#36D6E8] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">기상 갱신</span>
            </button>
          </div>
        </div>

        {isLoading && !weather ? (
          <div className="py-5 text-xs text-[#A7C2D8] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#36D6E8]" />
            선택한 지역의 바람·파고·수온·물때 데이터를 분석하고 있습니다...
          </div>
        ) : weather && rating ? (
          <div className="space-y-4">
            {/* Primary 3-column Telemetry Readout */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="glass-subcard rounded-xl p-3.5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-[#103653] border border-[#36D6E8]/25 flex items-center justify-center shrink-0">
                  <ThermometerSun className="w-5 h-5 text-[#36D6E8]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#A7C2D8] truncate">
                    지역 날씨 {weather.isLive ? `(${weather.modelLabel || 'KMA 보정 KST'})` : '(예시)'}
                  </p>
                  <p className="text-base sm:text-lg font-extrabold text-[#F4FAFF] font-mono tabular-nums mt-0.5">
                    {rating.weatherText} · {weather.temperatureC.toFixed(1)}°C
                  </p>
                </div>
              </div>

              <div className="glass-subcard rounded-xl p-3.5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-[#103653] border border-[#4B9FE8]/25 flex items-center justify-center shrink-0">
                  <Wind className="w-5 h-5 text-[#4B9FE8]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#A7C2D8] truncate">풍향 · 풍속 (체감)</p>
                  <p className="text-base sm:text-lg font-extrabold text-[#F4FAFF] font-mono tabular-nums mt-0.5">
                    {rating.windDirectionText} {weather.windSpeedMs.toFixed(1)} m/s
                  </p>
                </div>
              </div>

              <div className="glass-subcard rounded-xl p-3.5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-[#103653] border border-[#36D6E8]/25 flex items-center justify-center shrink-0">
                  <Waves className="w-5 h-5 text-[#36D6E8]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#A7C2D8] truncate">
                    {weather.marineReferenceLabel ? `연안 파고 (${weather.marineReferenceLabel})` : '인근 연안 파고'}
                  </p>
                  <p className="text-base sm:text-lg font-extrabold text-[#F4FAFF] font-mono tabular-nums mt-0.5">
                    {weather.waveHeightM !== null ? `${weather.waveHeightM.toFixed(2)} m` : '연안 관측 없음'}
                  </p>
                </div>
              </div>
            </div>

            {/* Rating Status & Advice */}
            <div
              className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${toneColors[rating.tone]}`}
            >
              <span className="font-bold text-sm">{rating.label}</span>
              <span className="text-[#F4FAFF]/90 leading-relaxed">{rating.summary}</span>
            </div>

            {/* Recommended Fishing Times + Regional Tide Strip */}
            {tideInfo && (
              <div
                data-testid="recommended-fishing-times-panel"
                className="glass-subcard rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#4B9FE8]/20 pb-2.5">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#36D6E8]">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>
                      {regionLabel} 해역 기상·물때 기반 추천 낚시 시간
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-[#A7C2D8]">
                    <span className="text-[#F4FAFF] font-semibold">
                      {tideInfo.multaeName} · {tideInfo.currentPhaseText}
                    </span>
                    <span className="text-[#4B9FE8]/60">|</span>
                    <span>
                      만조 {tideInfo.highTides.map((t) => t.timeLabel).join(', ') || '--'} / 간조{' '}
                      {tideInfo.lowTides.map((t) => t.timeLabel).join(', ') || '--'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {tideInfo.recommendedWindows.map((win, idx) => {
                    const toneBorder =
                      win.badgeTone === 'excellent'
                        ? 'border-[#36D6E8]/45 bg-[#103653]/70'
                        : win.badgeTone === 'good'
                        ? 'border-[#4B9FE8]/40 bg-[#103653]/55'
                        : 'border-amber-400/35 bg-amber-950/25';
                    const badgeText =
                      win.badgeTone === 'excellent'
                        ? 'text-[#36D6E8]'
                        : win.badgeTone === 'good'
                        ? 'text-[#4B9FE8]'
                        : 'text-amber-300';
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border px-3.5 py-2.5 space-y-1 ${toneBorder}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold font-mono tabular-nums text-[#F4FAFF]">
                            {win.timeRange}
                          </span>
                          <span className={`text-[11px] font-extrabold ${badgeText}`}>
                            {win.rating} ({win.score}점)
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[#F4FAFF]/95">{win.title}</div>
                        <p className="text-[11px] text-[#A7C2D8] leading-snug">{win.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {beginnerTip && (
              <div className="glass-subcard rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-[#36D6E8] font-semibold">
                  <Compass className="w-4 h-4 shrink-0" />
                  출조 가이드: {beginnerTip.spotAdvice}
                </span>
                <span className="text-[#A7C2D8]">{beginnerTip.rigAdvice}</span>
              </div>
            )}

            {error && <p className="text-[11px] text-amber-300">※ {error}</p>}
          </div>
        ) : (
          <div className="text-xs text-[#A7C2D8] py-2">
            기상 정보를 확인할 수 없습니다. {error || '잠시 후 다시 시도해 주세요.'}
          </div>
        )}
      </div>
    </section>
  );
}
