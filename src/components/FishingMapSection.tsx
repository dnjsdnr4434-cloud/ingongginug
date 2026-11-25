import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Search,
  Navigation,
  Compass,
  Layers,
  Crosshair,
  RefreshCw,
  CheckCircle2,
  MousePointerClick,
  Lock,
  Unlock,
} from 'lucide-react';
import type { FishingSpot } from '../data/fishingData';
import type {
  DetailedAddressInfo,
  LatLng,
  LiveGpsMetrics,
  LocationSource,
  SeaRegion,
} from '../utils/geo';
import { formatAccuracyLabel, formatSpeedKmh, getAccuracyQualityInfo } from '../utils/geo';
import type { RecommendedNearbySpot } from '../utils/nearbySpots';

export interface ActiveFishingLocation {
  label: string;
  address: string;
  coords: LatLng;
  region: SeaRegion;
  source: LocationSource;
  spot?: FishingSpot;
}

interface FishingMapSectionProps {
  apiKey?: string;
  spots: FishingSpot[];
  nearbySpots: RecommendedNearbySpot[];
  drivingTimesBySpotId: Record<string, { drivingMinutes: number; drivingDistanceKm: number }>;
  userCoords: LatLng | null;
  userAddress: string;
  userDetailedAddress: DetailedAddressInfo | null;
  liveGpsMetrics: LiveGpsMetrics | null;
  liveTrackingEnabled: boolean;
  onToggleLiveTracking: () => void;
  geoStatus: 'idle' | 'loading' | 'granted' | 'denied' | 'error';
  geoPermissionState: 'prompt' | 'granted' | 'denied' | 'unsupported';
  activeLocation: ActiveFishingLocation;
  selectedRegionFilter: '전체' | SeaRegion;
  onRegionFilterChange: (region: '전체' | SeaRegion) => void;
  onSelectSpot: (spot: FishingSpot) => void;
  onSelectCustomPoint: (coords: LatLng, customLabel?: string) => void;
  onRequestUserLocation: () => void;
  isCalibratingGps: boolean;
  onCalibrateHighAccuracyGps: () => void;
}

interface SearchPlaceItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categoryLabel?: string;
}

export const FishingMapSection: React.FC<FishingMapSectionProps> = ({
  spots,
  nearbySpots,
  drivingTimesBySpotId,
  userCoords,
  userAddress,
  userDetailedAddress,
  liveGpsMetrics,
  liveTrackingEnabled,
  onToggleLiveTracking,
  geoStatus,
  activeLocation,
  selectedRegionFilter,
  onRegionFilterChange,
  onSelectSpot,
  onSelectCustomPoint,
  onRequestUserLocation,
  isCalibratingGps,
  onCalibrateHighAccuracyGps,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const labelLayerRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectCustomPointRef = useRef(onSelectCustomPoint);

  useEffect(() => {
    onSelectCustomPointRef.current = onSelectCustomPoint;
  }, [onSelectCustomPoint]);

  const [mapMode, setMapMode] = useState<'satellite' | 'street'>('satellite');
  const [scrollZoomEnabled, setScrollZoomEnabled] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPlaceItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const filteredSpots = useMemo(() => {
    if (selectedRegionFilter === '전체') return spots;
    return spots.filter((s) => s.region === selectedRegionFilter);
  }, [spots, selectedRegionFilter]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [activeLocation.coords.lat, activeLocation.coords.lng],
      zoom: 12,
      scrollWheelZoom: false,
      zoomControl: true,
    });

    const markersGroup = L.layerGroup().addTo(map);
    markerLayerRef.current = markersGroup;

    map.on('click', (e: L.LeafletMouseEvent) => {
      onSelectCustomPointRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      labelLayerRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  // Toggle wheel zoom without interfering with normal page scroll
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (scrollZoomEnabled) {
      map.scrollWheelZoom.enable();
    } else {
      map.scrollWheelZoom.disable();
    }
  }, [scrollZoomEnabled]);

  // Switch satellite / street layers cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current);
      labelLayerRef.current = null;
    }

    if (mapMode === 'satellite') {
      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri Satellite Imagery',
          maxZoom: 18,
          crossOrigin: true,
        }
      ).addTo(map);
      const labels = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
          opacity: 0.85,
        }
      ).addTo(map);
      tileLayerRef.current = sat;
      labelLayerRef.current = labels;
    } else {
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      tileLayerRef.current = osm;
    }
  }, [mapMode]);

  // Pan map smoothly whenever activeLocation updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([activeLocation.coords.lat, activeLocation.coords.lng], Math.max(map.getZoom(), 11), {
      animate: true,
    });
  }, [activeLocation.coords.lat, activeLocation.coords.lng]);

  // Render markers cleanly
  useEffect(() => {
    const group = markerLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (userCoords) {
      const gpsCircle = L.circleMarker([userCoords.lat, userCoords.lng], {
        radius: 9,
        color: '#36D6E8',
        weight: 3,
        fillColor: '#10b981',
        fillOpacity: 0.9,
      });
      gpsCircle.bindTooltip(`내 기기 위치 (${userDetailedAddress?.shortLabel || userAddress || '현재 위치'})`);
      gpsCircle.addTo(group);
    }

    const activeMarker = L.circleMarker(
      [activeLocation.coords.lat, activeLocation.coords.lng],
      {
        radius: 11,
        color: '#F4FAFF',
        weight: 3,
        fillColor: '#36D6E8',
        fillOpacity: 0.85,
      }
    );
    activeMarker.bindTooltip(`선택 지역: ${activeLocation.label} (${activeLocation.region})`, {
      permanent: false,
      direction: 'top',
    });
    activeMarker.addTo(group);

    for (const spot of filteredSpots) {
      const m = L.circleMarker([spot.lat, spot.lng], {
        radius: 7,
        color: '#F4FAFF',
        weight: 2,
        fillColor: '#4B9FE8',
        fillOpacity: 0.9,
      });
      const driveInfo = drivingTimesBySpotId[spot.id];
      const tip = driveInfo
        ? `${spot.name} (${spot.region} · 차량 ${driveInfo.drivingMinutes}분)`
        : `${spot.name} (${spot.region})`;
      m.bindTooltip(tip);
      m.on('click', () => onSelectSpot(spot));
      m.addTo(group);
    }

    for (const ns of nearbySpots) {
      if (ns.curatedSpot) continue;
      const nm = L.circleMarker([ns.lat, ns.lng], {
        radius: 6,
        color: '#041529',
        weight: 1.5,
        fillColor: ns.isParkFallback ? '#38bdf8' : '#22d3ee',
        fillOpacity: 0.85,
      });
      nm.bindTooltip(`${ns.name} · 약 ${ns.drivingMinutes}분 (${ns.categoryLabel})`);
      nm.on('click', () => onSelectCustomPointRef.current({ lat: ns.lat, lng: ns.lng }, ns.name));
      nm.addTo(group);
    }
  }, [
    activeLocation.coords.lat,
    activeLocation.coords.lng,
    activeLocation.label,
    activeLocation.region,
    drivingTimesBySpotId,
    filteredSpots,
    nearbySpots,
    onSelectSpot,
    userAddress,
    userCoords,
    userDetailedAddress?.shortLabel,
  ]);

  const handlePlaceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/maps/search?q=${encodeURIComponent(q)}&lat=${encodeURIComponent(
          activeLocation.coords.lat
        )}&lng=${encodeURIComponent(activeLocation.coords.lng)}`
      );
      const data = await res.json().catch(() => ({}));
      setSearchResults(Array.isArray(data?.results) ? data.results : []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const accInfo = getAccuracyQualityInfo(liveGpsMetrics?.accuracyM);

  return (
    <section
      aria-label="실시간 위성 지도 및 포인트 선택"
      className="glass-card rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#4B9FE8]/20 pb-4">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#36D6E8]">
            <MousePointerClick className="w-4 h-4" /> 무제한 지역 검색 · 지도 클릭 시 기상·물때·공원 자동 연동
          </span>
          <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#36D6E8]" />
            실시간 위성 지도 &amp; 전국 해역 선택
          </h3>
          <p className="text-xs text-[#A7C2D8]">
            지도의 원하는 해안·공원·방파제를 클릭하면 해당 지역의 KMA 보정 날씨·물때·추천 시간과 차량 1시간 이내 장소가 즉시 업데이트됩니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMapMode((prev) => (prev === 'satellite' ? 'street' : 'satellite'))}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0B2948] hover:bg-[#143d66] text-[#F4FAFF] border border-[#4B9FE8]/30 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-[#36D6E8]" />
            {mapMode === 'satellite' ? '위성 지도 ON' : '일반 지도 ON'}
          </button>

          <button
            type="button"
            onClick={() => setScrollZoomEnabled((prev) => !prev)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border ${
              scrollZoomEnabled
                ? 'bg-[#36D6E8]/20 text-[#36D6E8] border-[#36D6E8]/50'
                : 'bg-[#0B2948] text-[#A7C2D8] border-[#4B9FE8]/25'
            }`}
            title="페이지 스크롤 방해를 막기 위해 휠 줌이 기본 잠금되어 있습니다"
          >
            {scrollZoomEnabled ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {scrollZoomEnabled ? '휠 줌 잠금해제' : '스크롤 보호(휠잠금)'}
          </button>

          <button
            type="button"
            onClick={onCalibrateHighAccuracyGps}
            disabled={isCalibratingGps}
            className="min-h-[38px] px-3 py-1.5 rounded-xl btn-cyan-gradient text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {isCalibratingGps ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 정밀 보정 중...
              </>
            ) : (
              <>
                <Crosshair className="w-3.5 h-3.5" /> 정밀 GPS 보정
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Device Telemetry & Address Bar */}
      <div className="glass-subcard rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[#36D6E8] font-bold">
            <Navigation className="w-3.5 h-3.5" />
            <span>
              기기 위치 상태:{' '}
              {geoStatus === 'granted' ? accInfo.label : geoStatus === 'loading' ? 'GPS 확인 중' : '네트워크 위치/선택 대기'}
            </span>
            {liveGpsMetrics && (
              <span className="text-[#A7C2D8] font-mono tabular-nums font-normal">
                ({formatSpeedKmh(liveGpsMetrics.speedMs)} · {formatAccuracyLabel(liveGpsMetrics.accuracyM)})
              </span>
            )}
          </div>
          <p className="text-[#A7C2D8]">
            현재 기기 상세 주소:{' '}
            <strong className="text-[#F4FAFF]">
              {userDetailedAddress?.formattedAddress || userAddress || '위치 확인 대기 중'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLiveTracking}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              liveTrackingEnabled
                ? 'bg-emerald-950/60 border-emerald-400/40 text-emerald-200'
                : 'bg-[#061B33] border-[#4B9FE8]/25 text-[#A7C2D8]'
            }`}
          >
            실시간 이동 추적 {liveTrackingEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={onRequestUserLocation}
            className="px-3 py-1.5 rounded-lg btn-aqua-gradient text-xs font-semibold inline-flex items-center gap-1"
          >
            <Compass className="w-3.5 h-3.5 text-[#36D6E8]" /> 내 기기 위치로 이동
          </button>
        </div>
      </div>

      {/* Unlimited Map Search + Region Tabs */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <form onSubmit={handlePlaceSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#A7C2D8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="지역·항구·방파제·수변공원 검색 (일일 한도 없음, 예: 태안 신진도, 여수 돌산)"
              className="w-full min-h-[42px] bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/60 focus:outline-none focus:border-[#36D6E8]"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="min-h-[42px] px-4 py-2 btn-cyan-gradient rounded-xl text-xs font-bold shrink-0 disabled:opacity-60"
          >
            {isSearching ? '검색 중...' : '지역 검색'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['전체', '동해', '서해', '남해', '제주'] as const).map((reg) => (
            <button
              key={reg}
              type="button"
              onClick={() => onRegionFilterChange(reg)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                selectedRegionFilter === reg
                  ? 'btn-cyan-gradient border-transparent'
                  : 'bg-[#061B33]/75 text-[#A7C2D8] border-[#4B9FE8]/25 hover:text-[#F4FAFF]'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {searchResults.length > 0 && (
        <div className="bg-[#061B33]/85 border border-[#36D6E8]/35 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#36D6E8] font-bold">
            <span>검색 결과 ({searchResults.length}건 · 클릭 시 지도·날씨·물때 즉시 전환)</span>
            <button
              type="button"
              onClick={() => setSearchResults([])}
              className="text-[#A7C2D8] hover:text-[#F4FAFF]"
            >
              닫기
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {searchResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectCustomPoint({ lat: item.lat, lng: item.lng }, item.name);
                  setSearchResults([]);
                }}
                className="text-left p-2.5 rounded-lg bg-[#0B2948] hover:bg-[#143d66] border border-[#4B9FE8]/25 transition-colors space-y-0.5"
              >
                <div className="text-xs font-bold text-[#F4FAFF] truncate">{item.name}</div>
                <div className="text-[11px] text-[#A7C2D8] truncate">{item.address}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map Canvas (touch-panning & scroll-safe wrapper) */}
      <div className="relative rounded-2xl overflow-hidden border border-[#4B9FE8]/35 shadow-2xl bg-[#041529]">
        <div
          ref={mapContainerRef}
          className="w-full h-[360px] sm:h-[440px] z-10"
        />
        <div className="px-4 py-2.5 bg-[#061B33]/90 border-t border-[#4B9FE8]/20 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A7C2D8]">
          <span className="inline-flex items-center gap-1.5 text-[#36D6E8] font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            현재 선택: {activeLocation.label} ({activeLocation.coords.lat.toFixed(4)},{' '}
            {activeLocation.coords.lng.toFixed(4)})
          </span>
          <span>지도 위 아무 곳이나 클릭하면 해당 지점으로 날씨·물때가 즉시 변경됩니다.</span>
        </div>
      </div>

      {/* Curated Region Spots Quick Chips */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-[#A7C2D8]">
          주요 해역별 대표 안전 포인트 ({filteredSpots.length}곳)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {filteredSpots.map((spot) => {
            const drive = drivingTimesBySpotId[spot.id];
            const isSelected = activeLocation.spot?.id === spot.id;
            return (
              <button
                key={spot.id}
                type="button"
                onClick={() => onSelectSpot(spot)}
                className={`text-left rounded-xl p-3 border transition-all space-y-1 ${
                  isSelected
                    ? 'bg-[#124870] border-[#36D6E8] shadow-lg'
                    : 'bg-[#061B33]/75 hover:bg-[#0B2948] border-[#4B9FE8]/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#F4FAFF] truncate">{spot.name}</span>
                  <span className="text-[10px] font-bold text-[#36D6E8] shrink-0">
                    {spot.region}
                  </span>
                </div>
                <p className="text-[11px] text-[#A7C2D8] truncate">{spot.location}</p>
                <div className="text-[10px] text-[#36D6E8] flex items-center justify-between pt-0.5">
                  <span>{spot.targetFish.slice(0, 3).join('·')}</span>
                  {drive && <span>차량 약 {drive.drivingMinutes}분</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
