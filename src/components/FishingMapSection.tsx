import React, { useState, useEffect, useCallback, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useApiIsLoaded,
  useApiLoadingStatus,
  APILoadingStatus,
  useAdvancedMarkerRef,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Compass,
  Fish,
  Waves,
  Loader2,
  AlertCircle,
  Satellite,
  Layers,
  Search,
  Radio,
  Anchor,
  Car,
  Lock,
  Move,
} from 'lucide-react';
import type { FishingSpot } from '../data/fishingData';
import type {
  DetailedAddressInfo,
  LatLng,
  LiveGpsMetrics,
  LocationSource,
  SeaRegion,
} from '../utils/geo';
import {
  calculateDistanceKm,
  formatAccuracyLabel,
  formatSpeedKmh,
  getAccuracyQualityInfo,
} from '../utils/geo';
import {
  MAX_DRIVING_MINUTES,
  estimateDrivingMinutes,
  formatDrivingTimeLabel,
  type RecommendedNearbySpot,
} from '../utils/nearbySpots';

export interface ActiveFishingLocation {
  label: string;
  address: string;
  coords: LatLng;
  region: SeaRegion;
  source: LocationSource;
  spot?: FishingSpot;
}

type MapLayerMode = 'satellite-hybrid' | 'satellite' | 'roadmap' | 'google';

interface MapSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categoryLabel: string;
}

interface FishingMapSectionProps {
  apiKey: string;
  spots: FishingSpot[];
  nearbySpots?: RecommendedNearbySpot[];
  drivingTimesBySpotId?: Record<string, { drivingMinutes: number; drivingDistanceKm: number }>;
  userCoords: LatLng | null;
  userAddress: string;
  userDetailedAddress?: DetailedAddressInfo | null;
  liveGpsMetrics?: LiveGpsMetrics | null;
  liveTrackingEnabled: boolean;
  onToggleLiveTracking: () => void;
  geoStatus: 'idle' | 'loading' | 'granted' | 'denied' | 'error';
  geoPermissionState?: 'prompt' | 'granted' | 'denied' | 'unsupported';
  activeLocation: ActiveFishingLocation;
  selectedRegionFilter: '전체' | SeaRegion;
  onRegionFilterChange: (region: '전체' | SeaRegion) => void;
  onSelectSpot: (spot: FishingSpot) => void;
  onSelectCustomPoint: (coords: LatLng, customLabel?: string) => void;
  onRequestUserLocation: () => void;
  isCalibratingGps?: boolean;
  onCalibrateHighAccuracyGps?: () => void;
}

const REGION_CENTERS: Record<'전체' | SeaRegion, { center: LatLng; zoom: number }> = {
  전체: { center: { lat: 35.95, lng: 127.7 }, zoom: 7 },
  동해: { center: { lat: 37.85, lng: 128.8 }, zoom: 9 },
  서해: { center: { lat: 36.8, lng: 126.45 }, zoom: 9 },
  남해: { center: { lat: 34.65, lng: 128.1 }, zoom: 8 },
  제주: { center: { lat: 33.35, lng: 126.55 }, zoom: 10 },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface LeafletSatelliteMapProps {
  layerMode: 'satellite-hybrid' | 'satellite' | 'roadmap';
  showNauticalLayer: boolean;
  interactive: boolean;
  cameraTarget: { center: LatLng; zoom: number };
  spots: FishingSpot[];
  nearbySpots: RecommendedNearbySpot[];
  userCoords: LatLng | null;
  userAddress: string;
  accuracyM?: number | null;
  activeLocation: ActiveFishingLocation;
  onSelectSpot: (spot: FishingSpot) => void;
  onSelectCustomPoint: (coords: LatLng, customLabel?: string) => void;
}

function LeafletSatelliteMap({
  layerMode,
  showNauticalLayer,
  interactive,
  cameraTarget,
  spots,
  nearbySpots,
  userCoords,
  userAddress,
  accuracyM,
  activeLocation,
  onSelectSpot,
  onSelectCustomPoint,
}: LeafletSatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<L.TileLayer[]>([]);
  const seamarkLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);

  const onSelectSpotRef = useRef(onSelectSpot);
  onSelectSpotRef.current = onSelectSpot;
  const onSelectCustomRef = useRef(onSelectCustomPoint);
  onSelectCustomRef.current = onSelectCustomPoint;

  // Initialize Leaflet map once (scroll-safe by default so page wheel/touch scroll is never blocked)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [cameraTarget.center.lat, cameraTarget.center.lng],
      zoom: cameraTarget.zoom,
      zoomControl: true,
      preferCanvas: true,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: true,
      boxZoom: false,
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      onSelectCustomRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    markersLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      baseLayersRef.current = [];
      seamarkLayerRef.current = null;
      markersLayerRef.current = null;
      userLayerRef.current = null;
    };
  }, []);

  // Toggle Leaflet map pan/wheel/touch zoom only when user explicitly unlocks map manipulation
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactive) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.touchZoom.enable();
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.touchZoom.disable();
    }
  }, [interactive]);

  // Switch tile layers cleanly without re-creating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    baseLayersRef.current.forEach((layer) => map.removeLayer(layer));
    baseLayersRef.current = [];

    if (layerMode === 'satellite-hybrid' || layerMode === 'satellite') {
      const imagery = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles © Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
          maxNativeZoom: 18,
          maxZoom: 19,
          keepBuffer: 4,
          updateWhenIdle: false,
          crossOrigin: 'anonymous',
        }
      ).addTo(map);
      baseLayersRef.current.push(imagery);

      if (layerMode === 'satellite-hybrid') {
        const labels = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          {
            attribution: 'Labels © Esri',
            maxNativeZoom: 18,
            maxZoom: 19,
            keepBuffer: 4,
            pane: 'overlayPane',
            crossOrigin: 'anonymous',
          }
        ).addTo(map);
        baseLayersRef.current.push(labels);
      }
    } else {
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxNativeZoom: 19,
        maxZoom: 19,
        keepBuffer: 4,
      }).addTo(map);
      baseLayersRef.current.push(osm);
    }

    if (seamarkLayerRef.current) {
      map.removeLayer(seamarkLayerRef.current);
      seamarkLayerRef.current = null;
    }

    if (showNauticalLayer) {
      const seamark = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: '© OpenSeaMap contributors',
        maxNativeZoom: 18,
        maxZoom: 19,
        opacity: 0.9,
        crossOrigin: 'anonymous',
      }).addTo(map);
      seamarkLayerRef.current = seamark;
    }
  }, [layerMode, showNauticalLayer]);

  // Smooth camera updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([cameraTarget.center.lat, cameraTarget.center.lng], cameraTarget.zoom, {
      animate: true,
    });
  }, [cameraTarget.center.lat, cameraTarget.center.lng, cameraTarget.zoom]);

  // Render live device GPS marker + accuracy radius circle
  useEffect(() => {
    const group = userLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (!userCoords) return;

    if (typeof accuracyM === 'number' && accuracyM > 0 && accuracyM < 5000) {
      L.circle([userCoords.lat, userCoords.lng], {
        radius: accuracyM,
        color: '#38bdf8',
        weight: 1.5,
        fillColor: '#0ea5e9',
        fillOpacity: 0.16,
      }).addTo(group);
    }

    const userMarker = L.circleMarker([userCoords.lat, userCoords.lng], {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#0ea5e9',
      fillOpacity: 1,
    }).addTo(group);

    userMarker.bindTooltip(
      `내 기기 위치: ${escapeHtml(userAddress || '실시간 추적 중')}`,
      { direction: 'top', offset: [0, -8] }
    );
  }, [userCoords, userAddress, accuracyM]);

  // Render fishing spot pins, nearby OSM spots, and custom map-click marker
  useEffect(() => {
    const group = markersLayerRef.current;
    if (!group) return;
    group.clearLayers();

    spots.forEach((spot) => {
      const isSelected = activeLocation.source === 'spot' && activeLocation.spot?.id === spot.id;
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: isSelected ? 10 : 7.5,
        color: isSelected ? '#ffffff' : '#0f172a',
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? '#e63946' : '#2b7a78',
        fillOpacity: 0.95,
      }).addTo(group);

      marker.bindTooltip(`${escapeHtml(spot.name)} (${escapeHtml(spot.region)})`, {
        direction: 'top',
        offset: [0, -6],
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectSpotRef.current(spot);
      });
    });

    nearbySpots
      .filter((ns) => ns.source !== 'curated')
      .forEach((ns) => {
        const marker = L.circleMarker([ns.lat, ns.lng], {
          radius: 7,
          color: '#064e3b',
          weight: 2,
          fillColor: ns.isBeginnerFriendly ? '#10b981' : '#f59e0b',
          fillOpacity: 0.92,
        }).addTo(group);

        marker.bindTooltip(
          `${escapeHtml(ns.name)} · ${escapeHtml(ns.distanceLabel)} (${escapeHtml(ns.safetyLevel)})`,
          { direction: 'top', offset: [0, -6] }
        );
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectCustomRef.current({ lat: ns.lat, lng: ns.lng }, ns.name);
        });
      });

    if (activeLocation.source === 'map-click') {
      const customMarker = L.circleMarker(
        [activeLocation.coords.lat, activeLocation.coords.lng],
        {
          radius: 10,
          color: '#ffffff',
          weight: 3,
          fillColor: '#e63946',
          fillOpacity: 1,
        }
      ).addTo(group);
      customMarker.bindTooltip(`선택한 지점: ${escapeHtml(activeLocation.label)}`, {
        direction: 'top',
        offset: [0, -8],
      });
    }
  }, [spots, nearbySpots, activeLocation]);

  return (
    <div
      ref={containerRef}
      data-testid="satellite-leaflet-map"
      className="w-full h-full bg-slate-950"
      style={{
        minHeight: '420px',
        touchAction: interactive ? 'none' : 'pan-y',
      }}
    />
  );
}

interface SpotMarkerProps {
  spot: FishingSpot;
  isSelected: boolean;
  isInfoOpen: boolean;
  onSelect: (spot: FishingSpot) => void;
  onCloseInfo: () => void;
}

function SpotMarker({
  spot,
  isSelected,
  isInfoOpen,
  onSelect,
  onCloseInfo,
}: SpotMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: spot.lat, lng: spot.lng }}
        onClick={() => onSelect(spot)}
        title={`${spot.name} (${spot.region})`}
        zIndex={isSelected ? 30 : 10}
      >
        <Pin
          background={isSelected ? '#E63946' : '#2B7A78'}
          borderColor={isSelected ? '#991b1b' : '#0F2C59'}
          glyphColor="#FFFFFF"
          scale={isSelected ? 1.25 : 1.0}
        />
      </AdvancedMarker>

      {isSelected && isInfoOpen && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onCloseInfo}>
          <div className="p-1 text-slate-900 space-y-1.5">
            <div className="text-[11px] font-bold text-[#2B7A78]">
              {spot.region} · {spot.location}
            </div>
            <h4 className="text-sm font-extrabold text-[#0F2C59] leading-snug">{spot.name}</h4>
            <p className="text-xs text-slate-600">
              수심 {spot.depth} · {spot.targetFish.slice(0, 3).join(', ')}
            </p>
            <p className="text-[11px] text-[#2B7A78] font-semibold">
              ✓ 현재 낚시 지역으로 선택됨
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapCameraController({
  targetCenter,
  targetZoom,
}: {
  targetCenter: LatLng;
  targetZoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(targetCenter);
    map.setZoom(targetZoom);
  }, [map, targetCenter.lat, targetCenter.lng, targetZoom]);

  return null;
}

function GoogleMapStatusWatcher({ onFailure }: { onFailure: () => void }) {
  const isLoaded = useApiIsLoaded();
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onFailure();
    }
  }, [status, onFailure]);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="absolute inset-0 z-10 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-amber-400" />
        <p className="text-sm font-semibold text-white">
          Google 지도 할당량 또는 인증 문제로 무제한 위성 지도로 전환합니다.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="absolute inset-0 z-10 bg-slate-900/75 flex items-center justify-center gap-2 text-sm text-slate-200">
        <Loader2 className="w-5 h-5 animate-spin text-[#2B7A78]" />
        <span>Google 지도를 불러오는 중...</span>
      </div>
    );
  }

  return null;
}

export function FishingMapSection({
  apiKey,
  spots,
  nearbySpots = [],
  drivingTimesBySpotId,
  userCoords,
  userAddress,
  userDetailedAddress,
  liveGpsMetrics,
  liveTrackingEnabled,
  onToggleLiveTracking,
  geoStatus,
  geoPermissionState,
  activeLocation,
  selectedRegionFilter,
  onRegionFilterChange,
  onSelectSpot,
  onSelectCustomPoint,
  onRequestUserLocation,
  isCalibratingGps = false,
  onCalibrateHighAccuracyGps,
}: FishingMapSectionProps) {
  const [layerMode, setLayerMode] = useState<MapLayerMode>('satellite-hybrid');
  const [showNauticalLayer, setShowNauticalLayer] = useState<boolean>(true);
  const [followDevice, setFollowDevice] = useState<boolean>(true);
  const [googleMapUnavailable, setGoogleMapUnavailable] = useState<boolean>(false);
  const [mapInteractive, setMapInteractive] = useState<boolean>(false);

  const [cameraTarget, setCameraTarget] = useState<{ center: LatLng; zoom: number }>({
    center: activeLocation.coords,
    zoom: activeLocation.source === 'gps' ? 14 : activeLocation.source === 'map-click' ? 13 : 10,
  });

  // Unlimited Place/Region Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  const [customMarkerRef, customMarker] = useAdvancedMarkerRef();
  const [showCustomInfo, setShowCustomInfo] = useState(false);
  const [openSpotInfoId, setOpenSpotInfoId] = useState<string | null>(
    activeLocation.source === 'spot' ? activeLocation.spot?.id ?? null : null
  );

  // Auto-fallback to high-res satellite hybrid if Google Maps triggers quota error
  useEffect(() => {
    const onQuotaExceeded = () => {
      setGoogleMapUnavailable(true);
      setLayerMode((prev) => (prev === 'google' ? 'satellite-hybrid' : prev));
    };
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Follow device movement smoothly when GPS updates & user hasn't manually detached camera
  useEffect(() => {
    if (!followDevice || !userCoords) return;
    if (activeLocation.source === 'gps' || activeLocation.source === 'device-ip') {
      setCameraTarget((prev) => ({
        center: userCoords,
        zoom: activeLocation.source === 'gps' ? Math.max(prev.zoom, 14) : prev.zoom,
      }));
    }
  }, [followDevice, userCoords?.lat, userCoords?.lng, activeLocation.source]);

  const visibleSpots =
    selectedRegionFilter === '전체'
      ? spots
      : spots.filter((s) => s.region === selectedRegionFilter);

  const originForDriving = activeLocation.coords || userCoords || { lat: 35.1587, lng: 129.1604 };
  const recommendedWithinOneHourSpots = visibleSpots
    .map((spot) => {
      const straightKm =
        Math.round(
          calculateDistanceKm(originForDriving, { lat: spot.lat, lng: spot.lng }) * 10
        ) / 10;
      const osrmInfo = drivingTimesBySpotId?.[spot.id];
      const drivingMinutes = osrmInfo?.drivingMinutes ?? estimateDrivingMinutes(straightKm);
      const drivingDistanceKm =
        osrmInfo?.drivingDistanceKm ?? Math.round(straightKm * 1.25 * 10) / 10;
      return {
        spot,
        straightKm,
        drivingMinutes,
        drivingDistanceKm,
      };
    })
    .filter((entry) => entry.drivingMinutes <= MAX_DRIVING_MINUTES)
    .sort((a, b) => a.drivingMinutes - b.drivingMinutes);

  const handleRegionClick = (reg: '전체' | SeaRegion) => {
    setFollowDevice(false);
    onRegionFilterChange(reg);
    setCameraTarget(REGION_CENTERS[reg]);
  };

  const handleFocusUserLocation = () => {
    setFollowDevice(true);
    onRequestUserLocation();
    if (userCoords) {
      setCameraTarget({
        center: userCoords,
        zoom: geoStatus === 'granted' ? 15 : 11,
      });
    }
  };

  const handleSpotSelect = useCallback(
    (spot: FishingSpot) => {
      setFollowDevice(false);
      onSelectSpot(spot);
      setOpenSpotInfoId(spot.id);
      setShowCustomInfo(false);
      setCameraTarget({ center: { lat: spot.lat, lng: spot.lng }, zoom: 13 });
    },
    [onSelectSpot]
  );

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const latLng = ev.detail.latLng;
      if (!latLng) return;
      setFollowDevice(false);
      const clicked = { lat: latLng.lat, lng: latLng.lng };
      onSelectCustomPoint(clicked);
      setOpenSpotInfoId(null);
      setShowCustomInfo(true);
      setCameraTarget((prev) => ({ center: clicked, zoom: Math.max(prev.zoom, 12) }));
    },
    [onSelectCustomPoint]
  );

  const handleLeafletCustomClick = useCallback(
    (coords: LatLng, customLabel?: string) => {
      setFollowDevice(false);
      onSelectCustomPoint(coords, customLabel);
      setOpenSpotInfoId(null);
      setCameraTarget((prev) => ({ center: coords, zoom: Math.max(prev.zoom, 13) }));
    },
    [onSelectCustomPoint]
  );

  const handlePlaceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearchingPlace(true);
    setSearchMessage(null);
    try {
      const bias = userCoords || activeLocation.coords;
      const res = await fetch(
        `/api/maps/search?q=${encodeURIComponent(q)}&lat=${encodeURIComponent(
          bias.lat
        )}&lng=${encodeURIComponent(bias.lng)}`
      );
      const data = await res.json().catch(() => ({}));
      const list: MapSearchResult[] = Array.isArray(data?.results) ? data.results : [];
      setSearchResults(list);
      if (list.length === 0) {
        setSearchMessage(`'${q}'에 대한 지도 검색 결과가 없습니다. 다른 항구·방파제·해수욕장 이름을 입력해 보세요.`);
      }
    } catch {
      setSearchMessage('지도 검색 요청 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSearchingPlace(false);
    }
  };

  const handleSelectSearchResult = (item: MapSearchResult) => {
    setFollowDevice(false);
    const coords = { lat: item.lat, lng: item.lng };
    onSelectCustomPoint(coords, item.name);
    setCameraTarget({ center: coords, zoom: 14 });
    setSearchResults([]);
    setSearchMessage(null);
  };

  const handleGoogleFailure = useCallback(() => {
    setGoogleMapUnavailable(true);
    setLayerMode('satellite-hybrid');
  }, []);

  const updatedTimeText =
    liveGpsMetrics?.updatedAtMs
      ? new Date(liveGpsMetrics.updatedAtMs).toLocaleTimeString('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      : '';

  return (
    <div className="space-y-5">
      {/* Map Controls & Detailed Real-Time Device Telemetry */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#36D6E8] font-semibold">
              <Compass className="w-4 h-4 shrink-0" />
              <span>위성 지도에서 원하는 지역·공원·방파제를 클릭하면 해당 지역의 날씨·물때·추천 시간·주변 장소를 즉시 업데이트합니다</span>
            </div>
            <h3 className="text-lg font-bold text-[#F4FAFF] flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#36D6E8] shrink-0" />
              선택된 관측 지역: {activeLocation.label}
            </h3>
            <p className="text-xs text-[#A7C2D8] break-words">
              {activeLocation.address ||
                `${activeLocation.coords.lat.toFixed(5)}, ${activeLocation.coords.lng.toFixed(5)}`}
              {' · '}
              <span className="text-[#36D6E8] font-semibold">{activeLocation.region} 권역</span>
              <span className="text-[#A7C2D8]/80 font-mono ml-2">
                ({activeLocation.coords.lat.toFixed(5)}, {activeLocation.coords.lng.toFixed(5)})
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLiveTracking}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                liveTrackingEnabled
                  ? 'bg-[#061B33] text-[#36D6E8] border-[#36D6E8]/45'
                  : 'glass-subcard text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${liveTrackingEnabled && geoStatus === 'granted' ? 'animate-pulse text-[#36D6E8]' : ''}`} />
              {liveTrackingEnabled ? '실시간 이동 추적 ON' : '실시간 추적 OFF'}
            </button>

            <button
              type="button"
              onClick={handleFocusUserLocation}
              disabled={geoStatus === 'loading'}
              className="min-h-[42px] px-4 py-2 btn-aqua-gradient rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap"
            >
              {geoStatus === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-[#36D6E8]" />
              )}
              {geoStatus === 'granted' ? '내 실시간 위치로 이동' : '기기 위치 사용 허용·찾기'}
            </button>
          </div>
        </div>

        {/* Detailed Current Device Location Info Box */}
        <div
          data-testid="detailed-device-location-panel"
          className="glass-subcard rounded-xl p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-[#36D6E8] flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" />
              현재 기기 상세 위치 정보
            </div>
            <p className="text-[#F4FAFF] font-medium break-words">
              {userDetailedAddress?.formattedAddress ||
                userAddress ||
                '현재 기기 상세 주소를 확인하는 중입니다...'}
            </p>
            {userDetailedAddress && (userDetailedAddress.sido || userDetailedAddress.sigungu || userDetailedAddress.dong) && (
              <p className="text-[11px] text-[#A7C2D8]">
                행정구역: {[userDetailedAddress.sido, userDetailedAddress.sigungu, userDetailedAddress.dong, userDetailedAddress.postcode ? `우편 ${userDetailedAddress.postcode}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-[#4B9FE8] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                실시간 GPS 수신·정밀도 상태
              </div>
              {geoStatus === 'granted' && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    getAccuracyQualityInfo(liveGpsMetrics?.accuracyM).tier === 'high'
                      ? 'bg-[#061B33] text-[#36D6E8] border-[#36D6E8]/45'
                      : getAccuracyQualityInfo(liveGpsMetrics?.accuracyM).tier === 'medium'
                      ? 'bg-[#061B33] text-[#4B9FE8] border-[#4B9FE8]/45'
                      : 'bg-amber-950/70 text-amber-300 border-amber-400/40'
                  }`}
                >
                  {getAccuracyQualityInfo(liveGpsMetrics?.accuracyM).label}
                </span>
              )}
            </div>
            <p className="text-[#F4FAFF] font-mono tabular-nums">
              {userCoords
                ? `${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}`
                : '좌표 확인 중'}
            </p>
            <p className="text-[11px] text-[#A7C2D8]">
              {geoStatus === 'granted'
                ? `정밀도 ${formatAccuracyLabel(liveGpsMetrics?.accuracyM)} · ${formatSpeedKmh(
                    liveGpsMetrics?.speedMs
                  )}${updatedTimeText ? ` · ${updatedTimeText} KST` : ''}`
                : geoPermissionState === 'denied' || geoStatus === 'denied'
                ? '브라우저 위치 권한이 차단됨 (주소창 자물쇠 → 위치 허용 시 실시간 GPS 추적 시작)'
                : '접속 기기 네트워크 위치 기준 (GPS 허용 시 초정밀 추적)'}
            </p>
            {onCalibrateHighAccuracyGps && (
              <button
                type="button"
                onClick={() => {
                  setFollowDevice(true);
                  onCalibrateHighAccuracyGps();
                }}
                disabled={isCalibratingGps}
                data-testid="calibrate-gps-btn"
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#103653] hover:bg-[#16476d] text-[#36D6E8] border border-[#36D6E8]/30 text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {isCalibratingGps ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> 초정밀 위치 재보정 중...
                  </>
                ) : (
                  <>
                    <Navigation className="w-3 h-3" /> 초정밀 GPS 재보정
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-1.5 flex flex-col justify-between">
            <div className="text-[11px] font-bold text-[#36D6E8] flex items-center gap-1.5">
              <Satellite className="w-3.5 h-3.5" />
              위성 · 해상 지도 레이어 (일일 한도 없음)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'satellite-hybrid', label: '위성+지명' },
                { id: 'satellite', label: '순수 위성' },
                { id: 'roadmap', label: '일반 지도' },
                ...(!googleMapUnavailable && apiKey
                  ? [{ id: 'google', label: 'Google 위성' }]
                  : []),
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLayerMode(m.id as MapLayerMode)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    layerMode === m.id
                      ? 'btn-cyan-gradient border-[#36D6E8]'
                      : 'bg-[#103653] text-[#A7C2D8] border-[#4B9FE8]/25 hover:text-[#F4FAFF]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              {layerMode !== 'google' && (
                <button
                  type="button"
                  onClick={() => setShowNauticalLayer((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 transition-colors ${
                    showNauticalLayer
                      ? 'btn-aqua-gradient'
                      : 'bg-[#103653] text-[#A7C2D8] border-[#4B9FE8]/25'
                  }`}
                >
                  <Anchor className="w-3 h-3" /> 해상부표
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Unlimited Map Place Search Bar */}
        <form onSubmit={handlePlaceSearch} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#A7C2D8] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="해변, 방파제, 항구, 공원, 지역명 무제한 검색 (예: 부산 미포, 여의도 한강공원, 제주 모슬포)"
                data-testid="unlimited-map-search-input"
                className="w-full min-h-[42px] pl-10 pr-3 py-2 bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl text-xs sm:text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
              />
            </div>
            <button
              type="submit"
              disabled={isSearchingPlace || !searchQuery.trim()}
              data-testid="unlimited-map-search-btn"
              className="min-h-[42px] px-4 py-2 btn-cyan-gradient rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
            >
              {isSearchingPlace ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              무제한 지도 검색
            </button>
          </div>

          {searchMessage && (
            <p className="text-xs text-amber-300 px-1">{searchMessage}</p>
          )}

          {searchResults.length > 0 && (
            <div
              data-testid="unlimited-map-search-results"
              className="bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl divide-y divide-[#4B9FE8]/15 max-h-52 overflow-y-auto"
            >
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-[#103653] transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#F4FAFF] truncate">{item.name}</div>
                    <div className="text-[11px] text-[#A7C2D8] truncate">{item.address}</div>
                  </div>
                  <span className="text-[11px] text-[#36D6E8] font-semibold shrink-0">
                    이동 →
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Region Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#4B9FE8]/20">
          <span className="text-xs text-[#A7C2D8] mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-[#36D6E8]" /> 해역 선택:
          </span>
          {(['전체', '동해', '서해', '남해', '제주'] as const).map((reg) => (
            <button
              key={reg}
              type="button"
              onClick={() => handleRegionClick(reg)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedRegionFilter === reg
                  ? 'btn-cyan-gradient'
                  : 'bg-[#061B33]/80 text-[#A7C2D8] border border-[#4B9FE8]/20 hover:text-[#F4FAFF]'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Satellite & Coastal Map Container */}
      <div className="relative h-[440px] md:h-[520px] w-full rounded-2xl overflow-hidden border border-[#4B9FE8]/30 shadow-2xl bg-[#061B33]">
        {layerMode !== 'google' && (
          <div className="absolute top-3 right-3 z-[450] flex items-center gap-2">
            <button
              type="button"
              data-testid="toggle-map-interaction-btn"
              onClick={() => setMapInteractive((prev) => !prev)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold border shadow-lg backdrop-blur-md inline-flex items-center gap-1.5 transition-all ${
                mapInteractive
                  ? 'btn-cyan-gradient border-[#36D6E8]'
                  : 'bg-[#061B33]/90 hover:bg-[#0B2948] text-[#36D6E8] border-[#4B9FE8]/40'
              }`}
            >
              {mapInteractive ? (
                <>
                  <Move className="w-3.5 h-3.5" /> 지도 이동·확대 ON (스크롤 잠금)
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> 페이지 스크롤 보호 중 (지도 드래그 켜기)
                </>
              )}
            </button>
          </div>
        )}
        {layerMode === 'google' && apiKey && !googleMapUnavailable ? (
          <APIProvider apiKey={apiKey} language="ko" region="KR" libraries={['marker']}>
            <GoogleMapStatusWatcher onFailure={handleGoogleFailure} />
            <GoogleMap
              mapId="DEMO_MAP_ID"
              mapTypeId="hybrid"
              mapTypeControl={true}
              defaultCenter={cameraTarget.center}
              defaultZoom={cameraTarget.zoom}
              gestureHandling="cooperative"
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapCameraController
                targetCenter={cameraTarget.center}
                targetZoom={cameraTarget.zoom}
              />

              {userCoords && (
                <AdvancedMarker
                  position={userCoords}
                  title={`내 현재 위치: ${userAddress || '실시간 위치'}`}
                  zIndex={40}
                >
                  <Pin
                    background="#0ea5e9"
                    borderColor="#0F2C59"
                    glyphColor="#FFFFFF"
                    scale={1.15}
                  />
                </AdvancedMarker>
              )}

              {visibleSpots.map((spot) => {
                const isSelected =
                  activeLocation.source === 'spot' && activeLocation.spot?.id === spot.id;
                return (
                  <SpotMarker
                    key={spot.id}
                    spot={spot}
                    isSelected={isSelected}
                    isInfoOpen={openSpotInfoId === spot.id}
                    onSelect={handleSpotSelect}
                    onCloseInfo={() => setOpenSpotInfoId(null)}
                  />
                );
              })}

              {nearbySpots
                .filter((ns) => ns.source !== 'curated')
                .map((ns) => (
                  <AdvancedMarker
                    key={`nearby_${ns.id}`}
                    position={{ lat: ns.lat, lng: ns.lng }}
                    onClick={() => handleLeafletCustomClick({ lat: ns.lat, lng: ns.lng }, ns.name)}
                    title={`${ns.name} (${ns.distanceLabel} · ${ns.safetyLevel})`}
                    zIndex={22}
                  >
                    <Pin
                      background={ns.isBeginnerFriendly ? '#10b981' : '#f59e0b'}
                      borderColor="#064e3b"
                      glyphColor="#FFFFFF"
                      scale={1.05}
                    />
                  </AdvancedMarker>
                ))}

              {activeLocation.source === 'map-click' && (
                <>
                  <AdvancedMarker
                    ref={customMarkerRef}
                    position={activeLocation.coords}
                    onClick={() => setShowCustomInfo(true)}
                    title={`선택한 지점: ${activeLocation.label}`}
                    zIndex={35}
                  >
                    <Pin
                      background="#E63946"
                      borderColor="#7f1d1d"
                      glyphColor="#FFFFFF"
                      scale={1.25}
                    />
                  </AdvancedMarker>
                  {showCustomInfo && customMarker && (
                    <InfoWindow
                      anchor={customMarker}
                      maxWidth={250}
                      onCloseClick={() => setShowCustomInfo(false)}
                    >
                      <div className="p-1 text-slate-900 space-y-1.5">
                        <div className="text-[11px] font-bold text-[#E63946]">
                          사용자 지정 낚시 지역 ({activeLocation.region})
                        </div>
                        <div className="text-sm font-bold text-[#0F2C59]">
                          {activeLocation.label}
                        </div>
                        <p className="text-xs text-slate-600">{activeLocation.address}</p>
                        <p className="text-[11px] text-[#2B7A78] font-semibold">
                          ✓ 현재 낚시 지역으로 선택됨
                        </p>
                      </div>
                    </InfoWindow>
                  )}
                </>
              )}
            </GoogleMap>
          </APIProvider>
        ) : (
          <LeafletSatelliteMap
            layerMode={layerMode === 'google' ? 'satellite-hybrid' : layerMode}
            showNauticalLayer={showNauticalLayer}
            interactive={mapInteractive}
            cameraTarget={cameraTarget}
            spots={visibleSpots}
            nearbySpots={nearbySpots}
            userCoords={userCoords}
            userAddress={userAddress}
            accuracyM={liveGpsMetrics?.accuracyM}
            activeLocation={activeLocation}
            onSelectSpot={handleSpotSelect}
            onSelectCustomPoint={handleLeafletCustomClick}
          />
        )}
      </div>

      {/* Spot Cards Grid synced with Map — Strictly max 1 hour by car */}
      <div className="space-y-3" data-testid="map-one-hour-recommendations">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#F4FAFF]">
            <Car className="w-4 h-4 text-[#36D6E8] shrink-0" />
            <span>
              선택 지역({activeLocation.label}) 기준 차로 1시간 이내 주요 포인트 ({recommendedWithinOneHourSpots.length}곳)
            </span>
          </div>
          <span className="text-[11px] text-[#A7C2D8]">
            전문 포인트가 없는 경우 아래 [주변 추천 낚시터·수변 공원]에서 공원을 자동 추천합니다
          </span>
        </div>

        {recommendedWithinOneHourSpots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {recommendedWithinOneHourSpots.map(
              ({ spot, drivingMinutes, drivingDistanceKm }) => {
                const isSelected =
                  activeLocation.source === 'spot' && activeLocation.spot?.id === spot.id;

                return (
                  <div
                    key={spot.id}
                    className={`glass-card rounded-xl p-5 space-y-3 transition-all ${
                      isSelected
                        ? 'border-[#36D6E8] ring-1 ring-[#36D6E8]/50'
                        : 'hover:border-[#36D6E8]/45'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-[#36D6E8]">
                          {spot.region} · {spot.location}
                          <span className="text-[#4B9FE8] font-mono font-semibold">
                            {' '}
                            · {formatDrivingTimeLabel(drivingMinutes)} ({drivingDistanceKm}km)
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-[#F4FAFF] mt-0.5">{spot.name}</h4>
                      </div>
                      <span className="text-xs bg-[#061B33] border border-[#4B9FE8]/30 px-2.5 py-1 rounded-lg text-[#A7C2D8] font-mono whitespace-nowrap shrink-0">
                        수심 {spot.depth}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-[#36D6E8]">
                      <span className="inline-flex items-center gap-1 font-medium text-[#A7C2D8]">
                        <Fish className="w-3.5 h-3.5 text-[#36D6E8]" /> 주요 어종:
                      </span>
                      <span>{spot.targetFish.join(' · ')}</span>
                    </div>

                    <div className="space-y-1 text-xs text-[#A7C2D8] glass-subcard p-3 rounded-lg">
                      <p>
                        <strong className="text-[#F4FAFF]">추천 시즌:</strong> {spot.bestSeason}
                      </p>
                      <p>
                        <strong className="text-[#F4FAFF]">채비 및 공략 팁:</strong> {spot.tips}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSpotSelect(spot)}
                        className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'btn-aqua-gradient'
                            : 'btn-cyan-gradient'
                        }`}
                      >
                        <Waves className="w-4 h-4" />
                        {isSelected ? '지도에서 선택됨' : '지도에서 보기 · 선택'}
                      </button>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-5 text-center space-y-2.5">
            <p className="text-sm font-bold text-[#F4FAFF]">
              {selectedRegionFilter === '전체'
                ? '선택 지역에서 차로 1시간 이내에 등록된 주요 바다 낚시터는 없지만, 아래에서 주변 공원·수변 공간을 추천해 드립니다.'
                : `${selectedRegionFilter} 권역에는 선택한 지점에서 차로 1시간 이내 등록 바다 낚시터가 없습니다.`}
            </p>
            <p className="text-xs text-[#A7C2D8]">
              위성 지도에서 다른 지점을 클릭하거나 아래 [주변 추천 낚시터·수변 공원] 목록을 확인하세요.
            </p>
            {selectedRegionFilter !== '전체' && (
              <button
                type="button"
                onClick={() => handleRegionClick('전체')}
                className="min-h-[40px] px-4 py-2 btn-cyan-gradient text-xs rounded-xl transition-all"
              >
                전체 해역에서 1시간 이내 포인트 다시 찾기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
