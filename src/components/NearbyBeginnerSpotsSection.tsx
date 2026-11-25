import React from 'react';
import {
  MapPin,
  Car,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Navigation,
  MessageSquare,
  Trees,
} from 'lucide-react';
import type { LocationSource } from '../utils/geo';
import { formatDistanceLabel, type RecommendedNearbySpot } from '../utils/nearbySpots';

interface NearbyBeginnerSpotsSectionProps {
  spots: RecommendedNearbySpot[];
  isLoading: boolean;
  error: string | null;
  locationLabel: string;
  locationSource: LocationSource;
  geoStatus: 'idle' | 'loading' | 'granted' | 'denied' | 'error';
  onRefresh: () => void;
  onSelectOnMap: (spot: RecommendedNearbySpot) => void;
  onOpenMap: () => void;
  onShareToChat: (spotName: string) => void;
  onRequestGps: () => void;
}

export const NearbyBeginnerSpotsSection: React.FC<NearbyBeginnerSpotsSectionProps> = ({
  spots,
  isLoading,
  locationLabel,
  onRefresh,
  onSelectOnMap,
  onOpenMap,
  onShareToChat,
  onRequestGps,
}) => {
  return (
    <section
      aria-label="차량 1시간 이내 추천 낚시터 및 주변 공원"
      className="glass-card rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4B9FE8]/20 pb-4">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#36D6E8]">
            <Car className="w-4 h-4" /> 현재 선택 위치({locationLabel}) 기준 차량 60분 이내 탐색
          </span>
          <h3 className="text-lg sm:text-xl font-bold text-[#F4FAFF]">
            차로 1시간 이내 추천 낚시 장소 · 인근 수변공원
          </h3>
          <p className="text-xs text-[#A7C2D8]">
            너무 먼 원거리 포인트는 제외하고, 차량 1시간 이내의 안전한 방파제·낚시터 또는 인근 수변·생활 공원을 우선 안내합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRequestGps}
            className="min-h-[38px] px-3 py-1.5 rounded-xl btn-aqua-gradient text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Navigation className="w-3.5 h-3.5 text-[#36D6E8]" /> 내 기기 기준
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="min-h-[38px] px-3 py-1.5 rounded-xl glass-subcard text-[#36D6E8] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> 새로고침
          </button>
        </div>
      </div>

      {isLoading && spots.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#A7C2D8] flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#36D6E8]" />
          차량 1시간 이내 낚시 포인트 및 수변 공원을 탐색 중입니다...
        </div>
      ) : spots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spots.map((spot) => (
            <div
              key={spot.id}
              className="glass-subcard rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-[#36D6E8]/45 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#36D6E8]">
                      {spot.isParkFallback ? (
                        <Trees className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {spot.categoryLabel}
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-[#F4FAFF] truncate mt-0.5">
                      {spot.name}
                    </h4>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                      spot.safetyLevel === '매우 안전'
                        ? 'bg-emerald-950/75 text-emerald-300 border border-emerald-500/40'
                        : spot.safetyLevel === '주의 필요'
                        ? 'bg-amber-950/75 text-amber-300 border border-amber-500/40'
                        : 'bg-[#0B2948] text-[#36D6E8] border border-[#36D6E8]/35'
                    }`}
                  >
                    {spot.safetyLevel}
                  </span>
                </div>

                <p className="text-[11px] text-[#A7C2D8] truncate">{spot.address || '인근 연안·수변 지역'}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#F4FAFF] bg-[#061B33]/75 rounded-lg px-2.5 py-1.5 border border-[#4B9FE8]/20">
                  <span className="text-[#36D6E8] font-bold">차량 약 {spot.drivingMinutes}분</span>
                  <span className="text-[#A7C2D8]/50">|</span>
                  <span>도로 {spot.drivingDistanceKm.toFixed(1)}km</span>
                  <span className="text-[#A7C2D8]/50">|</span>
                  <span className="text-[#A7C2D8]">직선 {formatDistanceLabel(spot.distanceKm)}</span>
                </div>

                <p className="text-[11px] text-[#A7C2D8] leading-relaxed flex items-start gap-1.5">
                  {spot.safetyLevel === '주의 필요' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-[#36D6E8] shrink-0 mt-0.5" />
                  )}
                  <span>{spot.safetyReason}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#4B9FE8]/20">
                <button
                  type="button"
                  onClick={() => onSelectOnMap(spot)}
                  className="flex-1 min-h-[36px] px-3 py-1.5 btn-cyan-gradient rounded-lg text-xs font-bold"
                >
                  지도·날씨 보기
                </button>
                <button
                  type="button"
                  onClick={() => onShareToChat(spot.name)}
                  className="min-h-[36px] px-3 py-1.5 btn-aqua-gradient rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                  title="메신저 채팅방에 포인트 이름 공유"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> 공유
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center space-y-3 bg-[#061B33]/60 rounded-xl border border-[#4B9FE8]/20 p-6">
          <p className="text-xs sm:text-sm text-[#A7C2D8]">
            현재 선택 위치 반경(차량 1시간 이내)에서 조건에 맞는 포인트를 불러오는 중이거나 검색 범위가 좁습니다.
          </p>
          <button
            type="button"
            onClick={onOpenMap}
            className="px-4 py-2 btn-cyan-gradient rounded-xl text-xs font-bold"
          >
            위성 지도에서 직접 해안 선택하기
          </button>
        </div>
      )}
    </section>
  );
};
