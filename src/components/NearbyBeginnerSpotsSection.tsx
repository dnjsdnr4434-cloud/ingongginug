import React, { useState } from 'react';
import {
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Navigation,
  ExternalLink,
  RefreshCw,
  Compass,
  MessageSquare,
  Star,
  LifeBuoy,
  Car,
  Trees,
} from 'lucide-react';
import type { LocationSource } from '../utils/geo';
import type { RecommendedNearbySpot } from '../utils/nearbySpots';

interface NearbyBeginnerSpotsSectionProps {
  spots: RecommendedNearbySpot[];
  isLoading: boolean;
  error: string | null;
  locationLabel: string;
  locationSource: LocationSource;
  geoStatus: 'idle' | 'loading' | 'granted' | 'denied' | 'error';
  onRefresh: () => void;
  onSelectOnMap: (spot: RecommendedNearbySpot) => void;
  onOpenMap?: () => void;
  onShareToChat: (spotName: string) => void;
  onRequestGps: () => void;
}

export function NearbyBeginnerSpotsSection({
  spots,
  isLoading,
  error,
  locationLabel,
  locationSource,
  geoStatus,
  onRefresh,
  onSelectOnMap,
  onOpenMap,
  onShareToChat,
  onRequestGps,
}: NearbyBeginnerSpotsSectionProps) {
  const [onlyBeginnerSafe, setOnlyBeginnerSafe] = useState(true);
  const [maxMinutesFilter, setMaxMinutesFilter] = useState<30 | 60>(60);

  const withinDrivingLimit = spots.filter((s) => s.drivingMinutes <= maxMinutesFilter);
  const visibleSpots = onlyBeginnerSafe
    ? withinDrivingLimit.filter((s) => s.isBeginnerFriendly)
    : withinDrivingLimit;

  const beginnerCount = withinDrivingLimit.filter((s) => s.isBeginnerFriendly).length;
  const hasParkFallback = visibleSpots.some(
    (s) => s.categoryLabel.includes('주변 공원') || s.categoryLabel.includes('주변 수변 공원')
  );
  const hasFormalFishingSpot = visibleSpots.some(
    (s) => !s.categoryLabel.includes('주변 공원') && !s.categoryLabel.includes('주변 수변 공원')
  );

  const showDeviceButton =
    geoStatus !== 'granted' || (locationSource !== 'gps' && locationSource !== 'device-ip');

  return (
    <section
      id="nearby-5km-section"
      aria-labelledby="nearby-5km-heading"
      className="glass-card rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#4B9FE8]/20 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-[#36D6E8]">
              <Car className="w-4 h-4" /> 선택 지역 기준 차로 1시간 이내 추천 장소
            </span>
            <span className="text-[#4B9FE8]/50">·</span>
            <span className="text-[#F4FAFF] font-medium">기준 위치: {locationLabel}</span>
          </div>
          <h3 id="nearby-5km-heading" className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-[#36D6E8]" />
            주변 추천 낚시터 · 수변 공원 (차로 1시간 이내)
          </h3>
          <p className="text-xs sm:text-sm text-[#A7C2D8]">
            선택한 위치에서 차로 60분 이내의 방파제·항구·낚시공원을 우선 추천하며, 인근 낚시터가 적은 지역은 수변·근린 공원까지 자동으로 찾아 안내합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="차량 이동 시간 제한"
            className="inline-flex rounded-xl bg-[#061B33] border border-[#4B9FE8]/25 p-0.5"
          >
            <button
              type="button"
              onClick={() => setMaxMinutesFilter(30)}
              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                maxMinutesFilter === 30
                  ? 'btn-cyan-gradient'
                  : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              차로 30분 이내
            </button>
            <button
              type="button"
              onClick={() => setMaxMinutesFilter(60)}
              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                maxMinutesFilter === 60
                  ? 'btn-cyan-gradient'
                  : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              차로 1시간 이내
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOnlyBeginnerSafe((v) => !v)}
            aria-pressed={onlyBeginnerSafe}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
              onlyBeginnerSafe
                ? 'bg-[#0B2948] text-[#36D6E8] border-[#36D6E8]/45'
                : 'bg-[#061B33] text-[#A7C2D8] border-[#4B9FE8]/25 hover:text-[#F4FAFF]'
            }`}
          >
            {onlyBeginnerSafe
              ? `✓ 안전한 곳만 (${beginnerCount})`
              : `1시간 이내 전체 (${withinDrivingLimit.length})`}
          </button>

          {showDeviceButton && (
            <button
              type="button"
              onClick={onRequestGps}
              disabled={geoStatus === 'loading'}
              className="min-h-[40px] px-3.5 py-2 btn-aqua-gradient rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-60"
            >
              <Navigation className="w-3.5 h-3.5" />
              {geoStatus === 'loading'
                ? '기기 위치 확인 중...'
                : locationSource !== 'gps' && locationSource !== 'device-ip'
                ? '내 기기 위치로 복귀'
                : '내 GPS 위치 켜기'}
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="min-h-[40px] px-3.5 py-2 btn-cyan-gradient rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            주변 재탐색
          </button>
        </div>
      </div>

      {hasParkFallback && !hasFormalFishingSpot && !isLoading && (
        <div className="p-3.5 rounded-xl text-xs glass-subcard border border-[#36D6E8]/30 text-[#F4FAFF] flex items-start sm:items-center gap-2.5">
          <Trees className="w-4 h-4 text-[#36D6E8] shrink-0 mt-0.5 sm:mt-0" />
          <span>
            선택하신 <strong>{locationLabel}</strong> 반경에 전문 바다 낚시터가 없어, 가까운 <strong>수변 공원·근린 공원</strong>을 대체 야외 장소로 찾아 추천했습니다. (현장 표지판에서 낚시 허용 여부 확인 권장)
          </span>
        </div>
      )}

      {(error || locationSource === 'device-ip') && (
        <div
          data-testid="nearby-5km-status-banner"
          className={`p-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
            error
              ? 'bg-amber-950/60 border-amber-400/40 text-amber-200'
              : 'glass-subcard border-[#4B9FE8]/30 text-[#A7C2D8]'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2">
            {error ? (
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <Navigation className="w-4 h-4 text-[#36D6E8] shrink-0 mt-0.5 sm:mt-0" />
            )}
            <span>
              {error
                ? locationSource === 'device-ip'
                  ? `접속 기기 네트워크 위치(${locationLabel}) 기준으로 검색했습니다. (${error})`
                  : error
                : `접속 기기 네트워크 정보(${locationLabel})를 기본 위치로 적용했습니다. 더 정밀한 위치가 필요하면 [내 GPS 위치 켜기]를 눌러주세요.`}
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="nearby-5km-loading">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-52 rounded-xl glass-subcard animate-pulse p-5 space-y-3"
            >
              <div className="h-4 w-24 bg-[#103653] rounded" />
              <div className="h-5 w-48 bg-[#103653] rounded" />
              <div className="h-16 bg-[#103653] rounded" />
            </div>
          ))}
        </div>
      ) : visibleSpots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="nearby-5km-list">
          {visibleSpots.map((spot) => {
            const isPark =
              spot.categoryLabel.includes('주변 공원') || spot.categoryLabel.includes('주변 수변 공원');
            const safetyColor =
              spot.safetyLevel === '매우 안전'
                ? 'bg-[#061B33]/85 text-[#36D6E8] border-[#36D6E8]/45'
                : spot.safetyLevel === '양호'
                ? 'bg-[#061B33]/85 text-[#4B9FE8] border-[#4B9FE8]/45'
                : 'bg-rose-950/75 text-rose-300 border-rose-400/45';

            return (
              <article
                key={spot.id}
                data-testid={`nearby-spot-card-${spot.id}`}
                className="glass-subcard hover:border-[#36D6E8]/55 rounded-xl p-4 flex flex-col justify-between gap-3 transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${safetyColor}`}
                    >
                      {spot.safetyLevel === '주의 필요' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : isPark ? (
                        <Trees className="w-3 h-3" />
                      ) : (
                        <ShieldCheck className="w-3 h-3" />
                      )}
                      {spot.safetyLevel}
                      {isPark ? ' · 공원 추천' : spot.isBeginnerFriendly ? ' · 초보 추천' : ' · 안전 유의'}
                    </span>
                    <span className="text-xs font-bold text-[#36D6E8] font-mono tabular-nums shrink-0 inline-flex items-center gap-1">
                      <Car className="w-3.5 h-3.5" />
                      {spot.drivingLabel} · {spot.drivingDistanceKm}km
                    </span>
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-[#F4FAFF] leading-snug">{spot.name}</h4>
                    <p className="text-[11px] text-[#A7C2D8] mt-0.5 truncate" title={spot.address}>
                      {spot.categoryLabel}
                      {spot.address ? ` · ${spot.address}` : ''}
                    </p>
                  </div>

                  {typeof spot.rating === 'number' && (
                    <div className="flex items-center gap-1 text-xs text-amber-300">
                      <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                      <span className="font-bold font-mono">{spot.rating.toFixed(1)}</span>
                      {typeof spot.userRatingCount === 'number' && (
                        <span className="text-[#A7C2D8]">({spot.userRatingCount})</span>
                      )}
                    </div>
                  )}

                  <div className="bg-[#0B2948]/70 border border-[#4B9FE8]/20 rounded-lg p-2.5 space-y-1.5 text-xs">
                    <p className="text-[#F4FAFF]/90 leading-relaxed">
                      <strong className="text-[#36D6E8]">이용 안내:</strong> {spot.safetyNote}
                    </p>
                    <p className="text-[#A7C2D8] leading-relaxed">
                      <strong className="text-[#4B9FE8]">추천 활동:</strong> {spot.beginnerRigTip}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#4B9FE8]/15">
                  <button
                    type="button"
                    onClick={() => onSelectOnMap(spot)}
                    className="flex-1 min-h-[40px] px-2.5 py-1.5 btn-cyan-gradient rounded-lg text-xs inline-flex items-center justify-center gap-1 transition-all"
                  >
                    <MapPin className="w-3.5 h-3.5" /> 지도 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareToChat(spot.name)}
                    className="min-h-[40px] px-2.5 py-1.5 bg-[#103653] hover:bg-[#16476d] text-[#F4FAFF] border border-[#4B9FE8]/30 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                    title="오픈채팅에 이 장소 공유"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#36D6E8]" /> 공유
                  </button>
                  <a
                    href={spot.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-2.5 py-1.5 bg-[#103653] hover:bg-[#16476d] text-[#A7C2D8] hover:text-[#F4FAFF] border border-[#4B9FE8]/30 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                  >
                    길찾기 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className="text-center py-10 glass-subcard rounded-xl space-y-3 px-4"
          data-testid="nearby-5km-empty"
        >
          <Compass className="w-9 h-9 mx-auto text-[#4B9FE8]" />
          <p className="text-sm font-semibold text-[#F4FAFF]">
            현재 기준 위치({locationLabel})에서 차로 {maxMinutesFilter === 30 ? '30분' : '1시간'} 이내 장소를 불러오지 못했습니다.
          </p>
          <p className="text-xs text-[#A7C2D8]">
            [주변 재탐색]을 누르거나 위성 지도에서 원하는 지역·공원을 직접 클릭해 확인해 보세요.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {maxMinutesFilter === 30 && (
              <button
                type="button"
                onClick={() => setMaxMinutesFilter(60)}
                className="min-h-[40px] px-4 py-2 rounded-xl btn-cyan-gradient text-xs inline-flex items-center gap-1.5 transition-all"
              >
                <Car className="w-3.5 h-3.5" /> 차로 1시간 이내로 보기
              </button>
            )}
            {onOpenMap && (
              <button
                type="button"
                onClick={onOpenMap}
                className="min-h-[40px] px-4 py-2 rounded-xl btn-aqua-gradient text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
              >
                위성 지도에서 직접 찾기 →
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
