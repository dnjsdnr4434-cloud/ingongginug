import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Anchor,
  Camera,
  Search,
  MapPin,
  ShieldAlert,
  FileText,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  X,
  Compass,
  Waves,
  Sun,
  Wind,
  Thermometer,
  Calendar,
  Info,
  RefreshCw,
  Clock,
  Navigation,
  MessageSquare,
  LogIn,
  Star,
  Edit3,
  Utensils,
  Microscope,
  Download,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  OperationType,
  handleFirestoreError,
} from './firebase';
import {
  INITIAL_FISH_ENCYCLOPEDIA,
  INITIAL_FISHING_SPOTS,
  INITIAL_CATCH_LOGS,
  FishingSpot,
  CatchLog,
} from './data/fishingData';
import {
  formatKstDateTime,
  formatKstTimeShort,
  getKstFishingWindowLabel,
  getKstIsoDate,
  getKstParts,
} from './utils/koreaTime';
import {
  calculateDistanceKm,
  DEFAULT_KOREA_CENTER,
  DetailedAddressInfo,
  findNearestFishingSpot,
  formatAccuracyLabel,
  formatDeviceLocationLabel,
  formatSpeedKmh,
  getAccuracyQualityInfo,
  inferKoreaSeaRegion,
  isBrowserInKoreaTimezone,
  isInKoreaBounds,
  LatLng,
  LiveGpsMetrics,
  LocationSource,
  SeaRegion,
  shouldAcceptGpsReading,
  shouldApplyAutoDeviceLocation,
  shouldRefreshLocationData,
} from './utils/geo';
import {
  FishingMapSection,
  ActiveFishingLocation,
} from './components/FishingMapSection';
import { FeatureSearchSection } from './components/FeatureSearchSection';
import { NearbyBeginnerSpotsSection } from './components/NearbyBeginnerSpotsSection';
import { MessengerSection } from './components/MessengerSection';
import { BeginnerWeatherRatingCard } from './components/BeginnerWeatherRatingCard';
import { MarineWeatherVisuals } from './components/MarineWeatherVisuals';
import {
  DetailedFishFeatures,
  FeatureSearchResultItem,
  FishSearchResponse,
  createDefaultDetailedFeatures,
  findMatchingEncyclopediaFish,
  normalizeFishRecipes,
} from './utils/featureQuery';
import {
  MAX_DRIVING_MINUTES,
  MAX_DRIVING_STRAIGHT_KM,
  NearbyPlaceCandidate,
  RecommendedNearbySpot,
  filterAndRankNearbySpots,
} from './utils/nearbySpots';
import {
  MAX_DISPLAY_NAME_LEN,
  MAX_NICKNAME_LEN,
  MAX_PHOTO_URL_LEN,
  maskProfanity,
  truncateToLength,
  validateNicknameInput,
} from './utils/messenger';
import {
  FishingWeatherData,
  calculateBeginnerFishingRating,
  createExampleHourlySeries,
} from './utils/fishingRating';
import { calculateRegionalTideInfo } from './utils/koreaTide';
import { getCurrentSeasonalRegulations } from './utils/seasonalRegulations';

type AppTab = 'home' | 'identify' | 'spots' | 'guide' | 'diary' | 'messenger';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');

  // Korea Standard Time (Asia/Seoul) live clock
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Google Maps API key & Quota Warning state
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (!mapsApiKey) {
      fetch('/api/maps/config')
        .then((res) => res.json())
        .then((data) => {
          if (data?.apiKey) setMapsApiKey(data.apiKey);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }, [mapsApiKey]);

  // Real Geolocation, Detailed Address & Live Movement Tracking State
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'error'>('idle');
  const [geoPermissionState, setGeoPermissionState] = useState<
    'prompt' | 'granted' | 'denied' | 'unsupported'
  >('prompt');
  const [geoNotice, setGeoNotice] = useState<string>('');
  const [userCoords, setUserCoords] = useState<LatLng | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');
  const [userDetailedAddress, setUserDetailedAddress] = useState<DetailedAddressInfo | null>(null);
  const [liveGpsMetrics, setLiveGpsMetrics] = useState<LiveGpsMetrics | null>(null);
  const [liveTrackingEnabled, setLiveTrackingEnabled] = useState<boolean>(true);
  const [isCalibratingGps, setIsCalibratingGps] = useState<boolean>(false);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<'전체' | SeaRegion>('전체');

  const [activeLocation, setActiveLocation] = useState<ActiveFishingLocation>(() => {
    const nearest = findNearestFishingSpot(DEFAULT_KOREA_CENTER, INITIAL_FISHING_SPOTS);
    return {
      label: '접속 기기 위치 확인 중...',
      address: '접속 기기 위치를 확인하고 있습니다.',
      coords: DEFAULT_KOREA_CENTER,
      region: inferKoreaSeaRegion(DEFAULT_KOREA_CENTER),
      source: 'default',
      spot: nearest?.spot,
    };
  });

  const locationSourceRef = useRef<LocationSource>(activeLocation.source);
  const activeCoordsRef = useRef<LatLng>(activeLocation.coords);
  const hasGpsFixRef = useRef<boolean>(false);
  const lastAcceptedGpsRef = useRef<{ coords: LatLng | null; accuracyM: number | null; updatedAtMs: number }>({
    coords: null,
    accuracyM: null,
    updatedAtMs: 0,
  });
  const lastGeocodeCoordsRef = useRef<LatLng | null>(null);
  const lastGeocodeTimeRef = useRef<number>(0);
  const lastGeocodeAccuracyRef = useRef<number | null>(null);
  const lastDataCoordsRef = useRef<LatLng | null>(null);
  const lastDataTimeRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    locationSourceRef.current = activeLocation.source;
    activeCoordsRef.current = activeLocation.coords;
  }, [activeLocation.source, activeLocation.coords]);

  // Firebase Google Auth, Custom Nickname & Messenger State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [prefilledShareSpot, setPrefilledShareSpot] = useState<string | null>(null);
  const [userNickname, setUserNickname] = useState<string>('');
  const [nicknameSet, setNicknameSet] = useState<boolean>(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState<boolean>(false);
  const [nicknameDraft, setNicknameDraft] = useState<string>('');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [isSavingNickname, setIsSavingNickname] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      if (!user) {
        setUserNickname('');
        setNicknameSet(false);
        return;
      }

      const fallbackName = truncateToLength(user.displayName || '바다낚시인', MAX_DISPLAY_NAME_LEN);
      setUserNickname((prev) => prev || fallbackName);

      if (user.emailVerified) {
        const photoURL = truncateToLength(user.photoURL || '', MAX_PHOTO_URL_LEN);
        const profileRef = doc(db, 'public_profiles', user.uid);

        try {
          const existingSnap = await getDoc(profileRef);
          if (existingSnap.exists()) {
            const data = existingSnap.data();
            const savedName = truncateToLength(
              (typeof data?.displayName === 'string' && data.displayName) || fallbackName,
              MAX_DISPLAY_NAME_LEN
            );
            const hasNickname = Boolean(data?.nicknameSet);
            setUserNickname(savedName);
            setNicknameSet(hasNickname);
            if (!hasNickname) {
              setNicknameDraft(savedName);
            }
          } else {
            await setDoc(profileRef, {
              uid: user.uid,
              displayName: fallbackName,
              photoURL,
              favoriteRegion: inferKoreaSeaRegion(userCoords || DEFAULT_KOREA_CENTER),
              isDiscoverable: true,
              nicknameSet: false,
              updatedAt: serverTimestamp(),
            });
            setUserNickname(fallbackName);
            setNicknameSet(false);
            setNicknameDraft(fallbackName);
            setIsNicknameModalOpen(true);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `public_profiles/${user.uid}`);
        }

        if (user.email) {
          try {
            await setDoc(
              doc(db, 'user_secrets', user.uid),
              {
                uid: user.uid,
                email: user.email.slice(0, 254),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `user_secrets/${user.uid}`);
          }
        }
      }
    });
    return () => unsub();
  }, [userCoords]);

  const openNicknameModal = () => {
    if (!currentUser) return;
    setNicknameDraft(userNickname || currentUser.displayName || '바다낚시인');
    setNicknameError(null);
    setIsNicknameModalOpen(true);
  };

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const validation = validateNicknameInput(nicknameDraft);
    if (!validation.valid) {
      setNicknameError(validation.error || '닉네임을 확인해 주세요.');
      return;
    }
    if (maskProfanity(validation.cleanNickname).hasProfanity) {
      setNicknameError('비속어가 포함된 닉네임은 사용할 수 없습니다. 다른 닉네임을 입력해 주세요.');
      return;
    }

    setIsSavingNickname(true);
    setNicknameError(null);
    try {
      await setDoc(
        doc(db, 'public_profiles', currentUser.uid),
        {
          uid: currentUser.uid,
          displayName: validation.cleanNickname,
          photoURL: truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN),
          favoriteRegion: activeLocation.region,
          isDiscoverable: true,
          nicknameSet: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setUserNickname(validation.cleanNickname);
      setNicknameSet(true);
      setIsNicknameModalOpen(false);
      showToast(`닉네임이 '${validation.cleanNickname}'(으)로 저장되었습니다.`);
    } catch (err: any) {
      setNicknameError(err?.message || '닉네임 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profileSnap = await getDoc(doc(db, 'public_profiles', cred.user.uid));
      const existingData = profileSnap.exists() ? profileSnap.data() : null;
      if (!existingData || !existingData.nicknameSet) {
        setNicknameDraft(
          truncateToLength(
            (typeof existingData?.displayName === 'string' && existingData.displayName) ||
              cred.user.displayName ||
              '바다낚시인',
            MAX_NICKNAME_LEN
          )
        );
        setIsNicknameModalOpen(true);
      }
      showToast('Google 계정으로 로그인되었습니다.');
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked') {
        setAuthError('브라우저에서 로그인 팝업이 차단되었습니다. 팝업 차단을 해제 후 다시 시도해 주세요.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('로그인이 취소되었습니다.');
      } else {
        setAuthError(err?.message || 'Google 로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
      setIsNicknameModalOpen(false);
      showToast('로그아웃되었습니다.');
    } catch (err: any) {
      setAuthError(err?.message || '로그아웃 중 오류가 발생했습니다.');
    }
  };

  // Max 1-hour Car Driving Nearby Spot Recommendations
  const [nearbySpots, setNearbySpots] = useState<RecommendedNearbySpot[]>([]);
  const [drivingTimesBySpotId, setDrivingTimesBySpotId] = useState<
    Record<string, { drivingMinutes: number; drivingDistanceKm: number }>
  >({});
  const [isLoadingNearby, setIsLoadingNearby] = useState<boolean>(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  // Live Location Weather & Beginner Star Rating (KST synchronized)
  const [weatherData, setWeatherData] = useState<FishingWeatherData | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const lastWeatherKstHourRef = useRef<string>(getKstParts().hour);

  const fetchFishingWeather = useCallback(async (coords: LatLng) => {
    setIsLoadingWeather(true);
    setWeatherError(null);
    try {
      const res = await fetch(
        `/api/weather/fishing?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || typeof data.temperatureC !== 'number') {
        throw new Error(data?.error || '기상 정보를 불러오지 못했습니다.');
      }
      setWeatherData(data as FishingWeatherData);
    } catch (err: any) {
      setWeatherError(err?.message || '실시간 기상 연결이 원활하지 않아 현재 대한민국 시각 기준 예시를 표시합니다.');
      setWeatherData((prev) => {
        if (prev) return prev;
        const nowKst = new Date();
        const currentKstHour = Number(getKstParts(nowKst).hour);
        const fallbackBase = {
          temperatureC: 18,
          weatherCode: 0,
          windSpeedMs: 3.0,
          windDirectionDeg: 315,
          windGustsMs: 4.2,
          precipitationMm: 0,
          precipitationProb: 10,
          waveHeightM: 0.8,
          wavePeriodSec: 4.5,
          waveDirectionDeg: 180,
          seaSurfaceTempC: 16.0,
          isLive: false,
          observedAtKst: formatKstDateTime(nowKst),
          kstHour: currentKstHour,
        };
        return {
          ...fallbackBase,
          hourlySeries: createExampleHourlySeries(fallbackBase, currentKstHour),
        };
      });
    } finally {
      setIsLoadingWeather(false);
    }
  }, []);

  // Weather dynamically follows the active location (defaults to device location, updates on map click/search)
  const weatherTargetCoords = activeLocation.coords;
  const weatherTargetLabel = activeLocation.label;
  const weatherTargetRegion = activeLocation.region;

  useEffect(() => {
    void fetchFishingWeather(weatherTargetCoords);
  }, [weatherTargetCoords.lat, weatherTargetCoords.lng, fetchFishingWeather]);

  // Refresh weather automatically whenever Korea Standard Time (Asia/Seoul) hour rolls over
  const currentKstHour = getKstParts(now).hour;
  useEffect(() => {
    if (currentKstHour !== lastWeatherKstHourRef.current) {
      lastWeatherKstHourRef.current = currentKstHour;
      void fetchFishingWeather(weatherTargetCoords);
    }
  }, [currentKstHour, weatherTargetCoords, fetchFishingWeather]);

  const lastSpotsFetchedCoordsRef = useRef<LatLng | null>(null);

  const fetchNearbyBeginnerSpots = useCallback(async (coords: LatLng) => {
    setIsLoadingNearby(true);
    setNearbyError(null);

    const nearbyCurated = INITIAL_FISHING_SPOTS.filter(
      (spot) => calculateDistanceKm(coords, { lat: spot.lat, lng: spot.lng }) <= 75
    );

    const buildCuratedCandidates = (
      drivingMap: Record<string, { drivingMinutes: number; drivingDistanceKm: number }>
    ): NearbyPlaceCandidate[] =>
      INITIAL_FISHING_SPOTS.map((spot) => ({
        id: spot.id,
        name: spot.name,
        address: spot.location,
        lat: spot.lat,
        lng: spot.lng,
        source: 'curated',
        curatedSpot: spot,
        drivingMinutes: drivingMap[spot.id]?.drivingMinutes,
        drivingDistanceKm: drivingMap[spot.id]?.drivingDistanceKm,
      }));

    try {
      const [nearbyResult, drivingResult] = await Promise.allSettled([
        fetch('/api/maps/nearby-fishing-spots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: coords.lat,
            lng: coords.lng,
            radiusMeters: 35000,
            maxDrivingMinutes: MAX_DRIVING_MINUTES,
          }),
        }),
        nearbyCurated.length > 0
          ? fetch('/api/maps/driving-times', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                origin: coords,
                destinations: nearbyCurated.map((s) => ({
                  id: s.id,
                  lat: s.lat,
                  lng: s.lng,
                })),
              }),
            })
          : Promise.resolve(null),
      ]);

      let drivingMap: Record<string, { drivingMinutes: number; drivingDistanceKm: number }> = {};
      if (drivingResult.status === 'fulfilled' && drivingResult.value) {
        const dData = await drivingResult.value.json().catch(() => ({}));
        if (dData?.results && typeof dData.results === 'object') {
          drivingMap = dData.results;
        }
      }
      setDrivingTimesBySpotId(drivingMap);

      let apiCandidates: NearbyPlaceCandidate[] = [];
      let nearbyErrMsg: string | null = null;
      if (nearbyResult.status === 'fulfilled') {
        const res = nearbyResult.value;
        const data = await res.json().catch(() => ({}));
        apiCandidates = Array.isArray(data?.places) ? data.places : [];
        if (!res.ok && data?.error) {
          nearbyErrMsg = data.error;
        }
      } else {
        nearbyErrMsg = '주변 장소 조회 연결이 원활하지 않아 기본 등록 포인트 중 1시간 이내만 확인했습니다.';
      }

      const curatedCandidates = buildCuratedCandidates(drivingMap);
      const combined = filterAndRankNearbySpots(
        [...apiCandidates, ...curatedCandidates],
        coords,
        MAX_DRIVING_STRAIGHT_KM,
        false,
        MAX_DRIVING_MINUTES
      );
      setNearbySpots(combined);
      if (nearbyErrMsg) {
        setNearbyError(nearbyErrMsg);
      }
    } catch {
      const curatedCandidates = buildCuratedCandidates({});
      setNearbySpots(
        filterAndRankNearbySpots(
          curatedCandidates,
          coords,
          MAX_DRIVING_STRAIGHT_KM,
          false,
          MAX_DRIVING_MINUTES
        )
      );
      setNearbyError('주변 장소 조회 연결이 원활하지 않아 기본 등록 포인트 중 1시간 이내만 확인했습니다.');
    } finally {
      setIsLoadingNearby(false);
    }
  }, []);

  const reverseGeocodeCoords = useCallback(
    async (
      coords: LatLng
    ): Promise<{ formattedAddress: string; shortLabel: string; details: DetailedAddressInfo | null }> => {
      try {
        const res = await fetch(
          `/api/maps/reverse-geocode?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { formattedAddress: '', shortLabel: '', details: null };
        }
        return {
          formattedAddress: typeof data?.formattedAddress === 'string' ? data.formattedAddress : '',
          shortLabel: typeof data?.shortLabel === 'string' ? data.shortLabel : '',
          details: data?.details && typeof data.details === 'object' ? (data.details as DetailedAddressInfo) : null,
        };
      } catch {
        return { formattedAddress: '', shortLabel: '', details: null };
      }
    },
    []
  );

  const detectDeviceNetworkLocation = useCallback(
    async (force: boolean = false): Promise<boolean> => {
      try {
        const isValidNetworkPayload = (cand: any): boolean => {
          if (!cand || typeof cand.lat !== 'number' || typeof cand.lng !== 'number') {
            return false;
          }
          const coordsCandidate: LatLng = { lat: cand.lat, lng: cand.lng };
          const countryCode = String(cand.countryCode || '').toUpperCase();
          if (isBrowserInKoreaTimezone() && countryCode !== 'KR' && !isInKoreaBounds(coordsCandidate)) {
            return false;
          }
          return true;
        };

        let payload: any = null;

        // 1. Query browser-side IP geolocation FIRST so user's real browser IP is used instead of server datacenter IP
        const directIpwhoRes = await fetch('https://ipwho.is/?lang=ko', {
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
        if (directIpwhoRes && directIpwhoRes.ok) {
          const d = await directIpwhoRes.json().catch(() => null);
          if (d?.success !== false && typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
            const candidate = {
              lat: d.latitude,
              lng: d.longitude,
              city: d.city || '',
              region: d.region || '',
              country: d.country || '',
              countryCode: d.country_code || '',
            };
            if (isValidNetworkPayload(candidate)) {
              payload = candidate;
            }
          }
        }

        // 2. Fallback browser IP provider: ipapi.co
        if (!payload) {
          const directIpapiRes = await fetch('https://ipapi.co/json/', {
            signal: AbortSignal.timeout(4000),
          }).catch(() => null);
          if (directIpapiRes && directIpapiRes.ok) {
            const d = await directIpapiRes.json().catch(() => null);
            if (!d?.error && typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
              const candidate = {
                lat: d.latitude,
                lng: d.longitude,
                city: d.city || '',
                region: d.region || '',
                country: d.country_name || '',
                countryCode: d.country_code || '',
              };
              if (isValidNetworkPayload(candidate)) {
                payload = candidate;
              }
            }
          }
        }

        // 3. Server-side client IP fallback ONLY if server sees a verified public client IP (never server datacenter IP)
        if (!payload) {
          const res = await fetch('/api/location/device').catch(() => null);
          if (res && res.ok) {
            const srv = await res.json().catch(() => null);
            if (srv?.available !== false && isValidNetworkPayload(srv)) {
              payload = srv;
            }
          }
        }

        if (!payload) {
          return false;
        }

        if (
          (!force && hasGpsFixRef.current) ||
          !shouldApplyAutoDeviceLocation(locationSourceRef.current, 'device-ip', force)
        ) {
          return false;
        }

        const coords: LatLng = { lat: payload.lat, lng: payload.lng };
        const region = inferKoreaSeaRegion(coords);
        const formatted = formatDeviceLocationLabel(payload);

        locationSourceRef.current = 'device-ip';
        activeCoordsRef.current = coords;
        setUserCoords(coords);
        setUserAddress(formatted.address);
        setSelectedRegionFilter(region);
        setActiveLocation({
          label: formatted.label,
          address: formatted.address,
          coords,
          region,
          source: 'device-ip',
        });
        void fetchNearbyBeginnerSpots(coords);
        lastDataCoordsRef.current = coords;
        lastDataTimeRef.current = Date.now();

        const resolved = await reverseGeocodeCoords(coords);
        if (hasGpsFixRef.current || locationSourceRef.current !== 'device-ip') {
          return false;
        }
        if (resolved.formattedAddress || payload.formattedAddress) {
          const finalAddress = resolved.formattedAddress || payload.formattedAddress;
          const finalDetails = resolved.details || payload.details || null;
          const finalShortLabel = resolved.shortLabel || payload.shortLabel || '';
          setUserAddress(finalAddress);
          if (finalDetails) {
            setUserDetailedAddress(finalDetails);
          }
          lastGeocodeCoordsRef.current = coords;
          lastGeocodeTimeRef.current = Date.now();
          if (shouldApplyAutoDeviceLocation(locationSourceRef.current, 'device-ip', false)) {
            setActiveLocation((prev) =>
              prev.source === 'device-ip'
                ? {
                    ...prev,
                    label: finalShortLabel ? `${finalShortLabel} (접속 기기)` : prev.label,
                    address: finalAddress,
                  }
                : prev
            );
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    [fetchNearbyBeginnerSpots, reverseGeocodeCoords]
  );

  const applyGpsFix = useCallback(
    async (position: GeolocationPosition, force: boolean = false) => {
      const coords: LatLng = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const nowMs = Date.now();
      const accuracyM = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;

      if (
        !force &&
        !shouldAcceptGpsReading(
          lastAcceptedGpsRef.current.coords,
          lastAcceptedGpsRef.current.accuracyM,
          lastAcceptedGpsRef.current.updatedAtMs,
          coords,
          accuracyM,
          nowMs
        )
      ) {
        return;
      }

      hasGpsFixRef.current = true;
      lastAcceptedGpsRef.current = { coords, accuracyM, updatedAtMs: nowMs };

      const canApplyGps = shouldApplyAutoDeviceLocation(locationSourceRef.current, 'gps', force);
      if (canApplyGps) {
        locationSourceRef.current = 'gps';
        activeCoordsRef.current = coords;
      }

      setUserCoords(coords);
      setGeoStatus('granted');
      setGeoPermissionState('granted');
      setLiveGpsMetrics({
        accuracyM,
        speedMs: typeof position.coords.speed === 'number' ? position.coords.speed : null,
        headingDeg: typeof position.coords.heading === 'number' ? position.coords.heading : null,
        updatedAtMs: nowMs,
      });

      const prevGeoAcc = lastGeocodeAccuracyRef.current;
      const accuracyImprovedSignificantly =
        typeof accuracyM === 'number' &&
        (prevGeoAcc === null || (prevGeoAcc > 120 && accuracyM <= 80) || accuracyM <= prevGeoAcc * 0.5);

      const shouldRegeocode =
        force ||
        accuracyImprovedSignificantly ||
        shouldRefreshLocationData(
          lastGeocodeCoordsRef.current,
          coords,
          lastGeocodeTimeRef.current,
          nowMs,
          0.05,
          2500
        );

      let displayAddr = '';
      let shortLabel = '';
      if (shouldRegeocode) {
        lastGeocodeCoordsRef.current = coords;
        lastGeocodeTimeRef.current = nowMs;
        lastGeocodeAccuracyRef.current = accuracyM;
        const resolved = await reverseGeocodeCoords(coords);
        displayAddr =
          resolved.formattedAddress || `위도 ${coords.lat.toFixed(5)}, 경도 ${coords.lng.toFixed(5)}`;
        shortLabel = resolved.shortLabel;
        setUserAddress(displayAddr);
        setUserDetailedAddress(resolved.details);
      }

      if (!canApplyGps && !shouldApplyAutoDeviceLocation(locationSourceRef.current, 'gps', force)) {
        return;
      }

      if (
        force ||
        shouldRefreshLocationData(
          lastDataCoordsRef.current,
          coords,
          lastDataTimeRef.current,
          nowMs,
          0.25,
          12000
        )
      ) {
        lastDataCoordsRef.current = coords;
        lastDataTimeRef.current = nowMs;
        void fetchNearbyBeginnerSpots(coords);
      }

      const region = inferKoreaSeaRegion(coords);
      const accInfo = getAccuracyQualityInfo(accuracyM);
      setGeoNotice(
        `기기 GPS 정밀 위치가 확인되었습니다 (${accInfo.label} · 상세 주소 및 실시간 이동 추적 활성)`
      );
      setSelectedRegionFilter(region);

      setActiveLocation((prev) => {
        const nextAddr = displayAddr || prev.address || `위도 ${coords.lat.toFixed(5)}, 경도 ${coords.lng.toFixed(5)}`;
        const nextLabel = shortLabel
          ? `${shortLabel} (내 위치)`
          : displayAddr
          ? `${displayAddr.split(' ').slice(0, 3).join(' ')} (내 위치)`
          : prev.source === 'gps'
          ? prev.label
          : '내 현재 위치';
        return {
          label: nextLabel,
          address: nextAddr,
          coords,
          region,
          source: 'gps',
        };
      });
    },
    [fetchNearbyBeginnerSpots, reverseGeocodeCoords]
  );

  // High-accuracy multi-sample GPS calibration burst (collects lowest-error fix over up to 3.5s)
  const calibrateHighAccuracyGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('error');
      setGeoPermissionState('unsupported');
      return;
    }

    setIsCalibratingGps(true);
    setGeoStatus('loading');
    setGeoNotice('위성·Wi-Fi 신호를 다중 수집하여 기기의 가장 정확한 현재 위치를 보정 중입니다...');

    let bestPos: GeolocationPosition | null = null;
    let settled = false;
    let burstWatchId: number | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | null = null;

    const finalize = () => {
      if (settled) return;
      settled = true;
      if (burstWatchId !== null) {
        navigator.geolocation.clearWatch(burstWatchId);
      }
      if (finishTimer) {
        clearTimeout(finishTimer);
      }
      setIsCalibratingGps(false);
      if (bestPos) {
        void applyGpsFix(bestPos, true);
      }
    };

    burstWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 99999;
        const bestAcc =
          bestPos && Number.isFinite(bestPos.coords.accuracy) ? bestPos.coords.accuracy : 99999;
        if (!bestPos || acc < bestAcc) {
          bestPos = pos;
        }
        if (acc <= 20) {
          finalize();
        }
      },
      (err) => {
        if (!bestPos) {
          const isDenied = err.code === err.PERMISSION_DENIED;
          setGeoStatus(isDenied ? 'denied' : 'error');
          if (isDenied) setGeoPermissionState('denied');
          setIsCalibratingGps(false);
          if (burstWatchId !== null) navigator.geolocation.clearWatch(burstWatchId);
          if (finishTimer) clearTimeout(finishTimer);
          void detectDeviceNetworkLocation(true);
        } else {
          finalize();
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    finishTimer = setTimeout(finalize, 3500);
  }, [applyGpsFix, detectDeviceNetworkLocation]);

  const requestUserLocation = useCallback(
    (force: boolean = false) => {
      const networkLookupPromise = detectDeviceNetworkLocation(false);

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setGeoStatus('error');
        setGeoPermissionState('unsupported');
        void networkLookupPromise.then((resolved) => {
          if (resolved) {
            setGeoNotice('접속 기기 네트워크 정보를 기본 위치로 설정했습니다.');
          } else {
            if (shouldApplyAutoDeviceLocation(locationSourceRef.current, 'device-ip', force)) {
              const nearest = findNearestFishingSpot(DEFAULT_KOREA_CENTER, INITIAL_FISHING_SPOTS);
              setActiveLocation({
                label: '부산 해운대 연안 (기본 위치)',
                address: '부산광역시 해운대구 연안 (기본 위치)',
                coords: DEFAULT_KOREA_CENTER,
                region: inferKoreaSeaRegion(DEFAULT_KOREA_CENTER),
                source: 'default',
                spot: nearest?.spot,
              });
            }
            setGeoNotice('위치 정보를 확인할 수 없어 기본 연안 위치를 표시합니다.');
            void fetchNearbyBeginnerSpots(DEFAULT_KOREA_CENTER);
          }
        });
        return;
      }

      if (force) {
        calibrateHighAccuracyGps();
        return;
      }

      setGeoStatus('loading');
      setGeoNotice('접속하신 기기의 GPS 정밀 위치 및 상세 주소를 확인하고 있습니다...');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          void applyGpsFix(position, force);
        },
        (err) => {
          const isDenied = err.code === err.PERMISSION_DENIED;
          setGeoStatus(isDenied ? 'denied' : 'error');
          if (isDenied) {
            setGeoPermissionState('denied');
          }
          void networkLookupPromise.then(async (alreadyResolved) => {
            const resolved = alreadyResolved || (await detectDeviceNetworkLocation(force));
            if (resolved) {
              setGeoNotice(
                isDenied
                  ? '브라우저 위치 권한이 거부되어 네트워크 기반 기기 위치를 표시합니다. 상단 자물쇠 아이콘에서 위치 권한을 허용하면 실시간 GPS 추적과 상세 주소가 즉시 켜집니다.'
                  : 'GPS 응답이 지연되어 접속 기기 네트워크 위치를 기본 위치로 설정했습니다.'
              );
            } else {
              if (shouldApplyAutoDeviceLocation(locationSourceRef.current, 'device-ip', force)) {
                const nearest = findNearestFishingSpot(DEFAULT_KOREA_CENTER, INITIAL_FISHING_SPOTS);
                setActiveLocation({
                  label: '부산 해운대 연안 (기본 위치)',
                  address: '부산광역시 해운대구 연안 (기본 위치)',
                  coords: DEFAULT_KOREA_CENTER,
                  region: inferKoreaSeaRegion(DEFAULT_KOREA_CENTER),
                  source: 'default',
                  spot: nearest?.spot,
                });
              }
              setGeoNotice(
                '기기 위치 정보를 가져올 수 없어 기본 위치를 표시합니다. 지도에서 낚시 지역을 직접 선택해 주세요.'
              );
              void fetchNearbyBeginnerSpots(DEFAULT_KOREA_CENTER);
            }
          });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    },
    [applyGpsFix, calibrateHighAccuracyGps, detectDeviceNetworkLocation, fetchNearbyBeginnerSpots]
  );

  const handleForceRequestLocation = useCallback(() => {
    requestUserLocation(true);
  }, [requestUserLocation]);

  // Automatically detect connected device's location & load 5km recommendations when app opens
  useEffect(() => {
    requestUserLocation(false);
  }, [requestUserLocation]);

  // Listen to browser geolocation permission changes so granting permission updates immediately
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!navigator.geolocation) {
      setGeoPermissionState('unsupported');
      return;
    }
    const permissionsApi = (navigator as any).permissions;
    if (!permissionsApi || typeof permissionsApi.query !== 'function') {
      return;
    }

    let cancelled = false;
    let statusRef: PermissionStatus | null = null;

    permissionsApi
      .query({ name: 'geolocation' as PermissionName })
      .then((status: PermissionStatus) => {
        if (cancelled) return;
        statusRef = status;
        setGeoPermissionState(status.state as 'prompt' | 'granted' | 'denied');
        status.onchange = () => {
          const nextState = status.state as 'prompt' | 'granted' | 'denied';
          setGeoPermissionState(nextState);
          if (nextState === 'granted') {
            requestUserLocation(false);
          }
        };
      })
      .catch(() => {
        /* ignore browsers that reject geolocation permission query */
      });

    return () => {
      cancelled = true;
      if (statusRef) {
        statusRef.onchange = null;
      }
    };
  }, [requestUserLocation]);

  // Continuous real-time GPS movement tracking via watchPosition
  useEffect(() => {
    if (
      !liveTrackingEnabled ||
      geoPermissionState === 'denied' ||
      geoPermissionState === 'unsupported' ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        void applyGpsFix(position, false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus('denied');
          setGeoPermissionState('denied');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    watchIdRef.current = watchId;
    return () => {
      navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
    };
  }, [liveTrackingEnabled, geoPermissionState, applyGpsFix]);

  const handleSelectSpot = useCallback((spot: FishingSpot) => {
    setActiveLocation({
      label: spot.name,
      address: spot.location,
      coords: { lat: spot.lat, lng: spot.lng },
      region: spot.region,
      source: 'spot',
      spot,
    });
  }, []);

  const handleSelectCustomPoint = useCallback(
    async (coords: LatLng, customLabel?: string) => {
      const region = inferKoreaSeaRegion(coords);
      setActiveLocation({
        label: customLabel || `지도 선택 지점 (${region})`,
        address: `위도 ${coords.lat.toFixed(4)}, 경도 ${coords.lng.toFixed(4)} 주소 확인 중...`,
        coords,
        region,
        source: 'map-click',
      });

      const resolved = await reverseGeocodeCoords(coords);
      setActiveLocation((prev) => {
        if (
          prev.source !== 'map-click' ||
          prev.coords.lat !== coords.lat ||
          prev.coords.lng !== coords.lng
        ) {
          return prev;
        }
        const shortName =
          customLabel ||
          (resolved.shortLabel
            ? `${resolved.shortLabel} 포인트`
            : resolved.formattedAddress
            ? `${resolved.formattedAddress.split(' ').slice(0, 3).join(' ')} 포인트`
            : `선택한 연안 (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})`);
        return {
          ...prev,
          label: shortName,
          address: resolved.formattedAddress || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        };
      });
    },
    [reverseGeocodeCoords]
  );

  const handleSelectNearbySpotOnMap = useCallback(
    (spot: RecommendedNearbySpot) => {
      if (spot.curatedSpot) {
        handleSelectSpot(spot.curatedSpot);
      } else {
        setActiveLocation({
          label: spot.name,
          address: spot.address,
          coords: { lat: spot.lat, lng: spot.lng },
          region: inferKoreaSeaRegion({ lat: spot.lat, lng: spot.lng }),
          source: 'map-click',
        });
      }
      setActiveTab('spots');
    },
    [handleSelectSpot]
  );

  const handleReturnToDeviceLocation = useCallback(() => {
    if (userCoords) {
      const region = inferKoreaSeaRegion(userCoords);
      const deviceLabel = userDetailedAddress?.shortLabel
        ? `${userDetailedAddress.shortLabel} (${geoStatus === 'granted' ? '내 위치' : '접속 기기'})`
        : userAddress || '내 현재 위치';
      locationSourceRef.current = geoStatus === 'granted' ? 'gps' : 'device-ip';
      activeCoordsRef.current = userCoords;
      setSelectedRegionFilter(region);
      setActiveLocation({
        label: deviceLabel,
        address: userDetailedAddress?.formattedAddress || userAddress || `${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}`,
        coords: userCoords,
        region,
        source: geoStatus === 'granted' ? 'gps' : 'device-ip',
      });
    } else {
      requestUserLocation(true);
    }
  }, [geoStatus, requestUserLocation, userAddress, userCoords, userDetailedAddress]);

  // Dynamically refresh nearby 1h fishing spots / parks whenever the map-selected location shifts by >= 0.25 km
  useEffect(() => {
    const prev = lastSpotsFetchedCoordsRef.current;
    if (prev && calculateDistanceKm(prev, activeLocation.coords) < 0.25) {
      return;
    }
    lastSpotsFetchedCoordsRef.current = activeLocation.coords;
    void fetchNearbyBeginnerSpots(activeLocation.coords);
  }, [activeLocation.coords.lat, activeLocation.coords.lng, fetchNearbyBeginnerSpots]);

  // Toast / Inline Feedback Banner (avoids window.alert)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, []);

  // Direct AI Fish Search + Edibility + Recipe State
  const [fishSearchQuery, setFishSearchQuery] = useState<string>('');
  const [isSearchingFish, setIsSearchingFish] = useState<boolean>(false);
  const [fishSearchResult, setFishSearchResult] = useState<FishSearchResponse | null>(null);
  const [fishSearchError, setFishSearchError] = useState<string | null>(null);

  // AI Identification State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [userNotes, setUserNotes] = useState<string>('');
  const [isIdentifying, setIsIdentifying] = useState<boolean>(false);
  const [identifiedResult, setIdentifiedResult] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Feature Search State (Detailed)
  const [searchParams, setSearchParams] = useState<DetailedFishFeatures>(() =>
    createDefaultDetailedFeatures('남해')
  );
  const [isSearchingFeatures, setIsSearchingFeatures] = useState<boolean>(false);
  const [featureSearchResults, setFeatureSearchResults] = useState<FeatureSearchResultItem[]>([]);
  const [featureSearchError, setFeatureSearchError] = useState<string | null>(null);

  // Catch Diary State (with localStorage)
  const [catchLogs, setCatchLogs] = useState<CatchLog[]>(() => {
    const saved = localStorage.getItem('iltamanseon_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* ignore */
      }
    }
    return INITIAL_CATCH_LOGS;
  });
  const [isAddingLog, setIsAddingLog] = useState<boolean>(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newLogData, setNewLogData] = useState({
    speciesName: '참돔',
    date: getKstIsoDate(),
    location: activeLocation.label,
    size: 35,
    released: false,
    memo: '',
    photoUrl: '/images/red-seabream.jpg',
  });

  useEffect(() => {
    localStorage.setItem('iltamanseon_logs', JSON.stringify(catchLogs));
  }, [catchLogs]);

  // Handle Image File Upload for AI ID (with automatic canvas compression for large smartphone photos)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdentifiedResult(null);
    setAiError(null);

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const rawDataUrl = uploadEvent.target?.result as string;
      if (!rawDataUrl) return;

      if (file.size <= 450_000) {
        setMimeType(file.type || 'image/jpeg');
        setSelectedImage(rawDataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setMimeType(file.type || 'image/jpeg');
          setSelectedImage(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.82);
        setMimeType('image/jpeg');
        setSelectedImage(compressedUrl);
      };
      img.onerror = () => {
        setMimeType(file.type || 'image/jpeg');
        setSelectedImage(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Direct AI Fish Search -> Analysis -> Edible/Inedible Verdict -> Cooking Recipes
  const handleRunFishSearch = async (queryOverride?: string) => {
    const targetQuery = (typeof queryOverride === 'string' ? queryOverride : fishSearchQuery).trim();
    if (!targetQuery) {
      setFishSearchError('검색할 물고기 이름이나 특징을 입력해 주세요. (예: 우럭, 복어, 등에 가시 있는 붉은 물고기)');
      return;
    }
    if (typeof queryOverride === 'string') {
      setFishSearchQuery(queryOverride);
    }

    setIsSearchingFish(true);
    setFishSearchError(null);
    try {
      const res = await fetch('/api/gemini/search-fish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: targetQuery,
          region: activeLocation.region,
          locationLabel: activeLocation.label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.matchedFish) {
        throw new Error(data?.error || 'AI 물고기 검색 결과를 불러오지 못했습니다.');
      }
      setFishSearchResult(data as FishSearchResponse);
    } catch (err: any) {
      setFishSearchError(err?.message || 'AI 물고기 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearchingFish(false);
    }
  };

  // Trigger AI Identification (Photo + optional direct description)
  const handleRunAIIdentification = async () => {
    const trimmedNotes = userNotes.trim();
    if (!selectedImage && !trimmedNotes) {
      setAiError('물고기 사진을 업로드하거나 특징 설명을 직접 입력해주세요.');
      return;
    }

    setIsIdentifying(true);
    setAiError(null);

    const contextSummary = trimmedNotes
      ? `${trimmedNotes} / 현재 위치: ${activeLocation.label} (${activeLocation.region}) / 한국시간: ${formatKstTimeShort(now)}`
      : `현재 위치: ${activeLocation.label} (${activeLocation.region}) / 한국시간: ${formatKstTimeShort(now)}`;

    try {
      const res = await fetch('/api/gemini/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: selectedImage,
          mimeType: mimeType,
          userNotes: contextSummary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '어종 판별 실패');
      setIdentifiedResult(data);
    } catch (err: any) {
      setAiError(err.message || 'AI 어종 판별 중 서버 오류가 발생했습니다.');
    } finally {
      setIsIdentifying(false);
    }
  };

  // Trigger Feature Search (Single Direct Input Only)
  const handleRunFeatureSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const directText = (searchParams.extraDescription || '').trim();
    if (!directText) {
      setFeatureSearchError('물고기 생김새나 특징을 직접 입력해 주세요.');
      return;
    }
    setIsSearchingFeatures(true);
    setFeatureSearchError(null);
    try {
      const res = await fetch('/api/gemini/search-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directDescription: directText,
          query: directText,
          region: activeLocation.region,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '특징 검색 실패');
      setFeatureSearchResults(data);
    } catch (err: any) {
      setFeatureSearchError(err.message || '특징 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearchingFeatures(false);
    }
  };

  const openNewDiaryModal = (prefillLocation?: string, prefillSpeciesName?: string) => {
    setEditingLogId(null);
    setNewLogData({
      speciesName: prefillSpeciesName || '참돔',
      date: getKstIsoDate(now),
      location: prefillLocation || activeLocation.label,
      size: 35,
      released: false,
      memo: '',
      photoUrl: '/images/red-seabream.jpg',
    });
    setActiveTab('diary');
    setIsAddingLog(true);
  };

  const openEditDiaryModal = (log: CatchLog) => {
    setEditingLogId(log.id);
    setNewLogData({
      speciesName: log.userConfirmedName || log.speciesName,
      date: log.date,
      location: log.location,
      size: log.size,
      released: log.released,
      memo: log.memo,
      photoUrl: log.photoUrl || '',
    });
    setIsAddingLog(true);
  };

  const handleSaveDiaryForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLogId) {
      setCatchLogs((prev) =>
        prev.map((item) =>
          item.id === editingLogId
            ? {
                ...item,
                userConfirmedName: newLogData.speciesName,
                speciesName: item.aiConfidence ? item.speciesName : newLogData.speciesName,
                date: newLogData.date,
                location: newLogData.location,
                size: Number(newLogData.size),
                released: newLogData.released,
                memo: newLogData.memo,
              }
            : item
        )
      );
      showToast('조과 기록이 수정되었습니다.');
    } else {
      const log: CatchLog = {
        id: 'log_' + Date.now(),
        speciesName: newLogData.speciesName,
        userConfirmedName: newLogData.speciesName,
        date: newLogData.date,
        location: newLogData.location,
        size: Number(newLogData.size),
        released: newLogData.released,
        memo: newLogData.memo,
        photoUrl: newLogData.photoUrl || undefined,
      };
      setCatchLogs([log, ...catchLogs]);
      showToast('새로운 조과 기록이 저장되었습니다.');
    }
    setIsAddingLog(false);
    setEditingLogId(null);
  };

  const handleDeleteLog = (id: string) => {
    setCatchLogs((prev) => prev.filter((l) => l.id !== id));
    setConfirmDeleteId(null);
    showToast('조과 기록이 삭제되었습니다.');
  };

  const nearestSpotInfo = findNearestFishingSpot(
    activeLocation.coords,
    INITIAL_FISHING_SPOTS
  );

  const seasonalRegulations = getCurrentSeasonalRegulations(now);
  const regionalTide = calculateRegionalTideInfo(
    activeLocation.coords,
    activeLocation.region,
    now,
    weatherData
  );
  const isMapSelectedLocation =
    activeLocation.source === 'map-click' || activeLocation.source === 'spot';

  return (
    <div className="min-h-screen deep-blue-atmosphere text-[#F4FAFF] flex flex-col font-sans selection:bg-[#36D6E8] selection:text-[#041529]">
      {/* Demo Key Quota Banner (Case A) */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-[#061B33]/85 backdrop-blur-xl border-b border-[#4B9FE8]/20 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            className="flex items-center gap-2 sm:gap-3 text-left cursor-pointer shrink-0 min-w-0"
            onClick={() => setActiveTab('home')}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#36D6E8] to-[#4B9FE8] flex items-center justify-center shadow-lg shadow-[#36D6E8]/20 border border-[#F4FAFF]/30 shrink-0">
              <Anchor className="w-5 h-5 sm:w-6 sm:h-6 text-[#041529]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#F4FAFF] flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                일타만선 <span className="hidden sm:inline text-xs font-medium text-[#36D6E8]">一打滿船</span>
              </h1>
              <p className="text-xs text-[#A7C2D8] hidden sm:block">
                Deep Blue 해양 관측 · {formatKstTimeShort(now)}
              </p>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav
            aria-label="주 메뉴"
            className="hidden lg:flex items-center gap-1 bg-[#0B2948]/80 p-1 rounded-xl border border-[#4B9FE8]/25 text-sm"
          >
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'home' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <Star className="w-4 h-4" /> 홈·추천지수
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('identify')}
              className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'identify' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <Sparkles className="w-4 h-4" /> AI 판별·검색
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('spots')}
              className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'spots' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <MapPin className="w-4 h-4" /> 지도·포인트
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('messenger')}
              className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'messenger' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <MessageSquare className="w-4 h-4" /> 메신저
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'guide' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <ShieldAlert className="w-4 h-4" /> 보호·가이드
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('diary')}
              className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'diary' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <FileText className="w-4 h-4" /> 기록장 ({catchLogs.length})
            </button>
          </nav>

          {/* Right Action / ZIP Export / Google Account & Mobile Guide shortcut */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href="/iltamanseon-deepblue.zip"
              download="iltamanseon-deepblue.zip"
              title="프레임워크 없는 단일 HTML(.zip) 패키지 다운로드"
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#103653]/80 hover:bg-[#174a70] text-[#36D6E8] border border-[#36D6E8]/35 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">단일 HTML (.zip)</span>
              <span className="xl:hidden">.zip</span>
            </a>

            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className="lg:hidden min-h-[38px] sm:min-h-[40px] px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#103653]/85 text-[#36D6E8] border border-[#4B9FE8]/35 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">보호</span>
              <span className="hidden sm:inline">보호수칙</span>
            </button>

            {currentUser ? (
              <button
                type="button"
                onClick={openNicknameModal}
                title="닉네임 설정 및 변경"
                className="inline-flex items-center gap-1.5 sm:gap-2 min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#103653]/85 hover:bg-[#174a70] text-[#F4FAFF] border border-[#36D6E8]/35 text-xs font-semibold whitespace-nowrap transition-colors"
              >
                {currentUser.photoURL && (
                  <img
                    src={currentUser.photoURL}
                    alt={userNickname || currentUser.displayName || '사용자'}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                )}
                <span className="max-w-[76px] sm:max-w-[110px] truncate">
                  {userNickname || currentUser.displayName || '닉네임 설정'}
                </span>
                <Edit3 className="w-3 h-3 text-[#36D6E8] shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-lg btn-aqua-gradient text-xs font-bold whitespace-nowrap transition-all shadow"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Google 로그인</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* LIVE LOCATION & KST TIME BAR */}
      <div className="bg-[#0B2948]/85 backdrop-blur-md border-b border-[#4B9FE8]/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#36D6E8]">
              <Clock className="w-3.5 h-3.5" />
              한국 표준시:
            </span>
            <span className="font-mono tabular-nums text-[#F4FAFF] font-semibold" data-testid="kst-clock">
              {formatKstDateTime(now)}
            </span>
            <span className="text-[#A7C2D8] hidden sm:inline">· {getKstFishingWindowLabel(now)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[#A7C2D8]" data-testid="active-location-summary">
              <MapPin className="w-3.5 h-3.5 text-[#36D6E8]" />
              {isMapSelectedLocation ? '지도 선택 지역:' : '현재 기준 위치:'}{' '}
              <strong className="text-[#F4FAFF]">{activeLocation.label}</strong>
              <span className="text-[#4B9FE8]">({activeLocation.region})</span>
            </span>
            <button
              type="button"
              onClick={() => setLiveTrackingEnabled((prev) => !prev)}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition-colors border ${
                liveTrackingEnabled
                  ? 'bg-[#103653] text-[#36D6E8] border-[#36D6E8]/40'
                  : 'bg-[#061B33] text-[#A7C2D8] border-[#4B9FE8]/25'
              }`}
              title="기기 이동 시 실시간 GPS 위치 자동 추적 켜기/끄기"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  liveTrackingEnabled && geoStatus === 'granted'
                    ? 'bg-emerald-400 animate-pulse'
                    : liveTrackingEnabled
                    ? 'bg-[#36D6E8]'
                    : 'bg-[#A7C2D8]/50'
                }`}
              />
              {liveTrackingEnabled ? '실시간 추적 ON' : '추적 OFF'}
            </button>
            <button
              type="button"
              onClick={isMapSelectedLocation ? handleReturnToDeviceLocation : handleForceRequestLocation}
              disabled={geoStatus === 'loading'}
              className="px-2.5 py-1 rounded-md bg-[#103653] hover:bg-[#16426d] text-[#36D6E8] border border-[#4B9FE8]/25 font-medium inline-flex items-center gap-1 transition-colors"
            >
              <Navigation className="w-3 h-3" />
              {isMapSelectedLocation
                ? '내 기기 위치로'
                : geoStatus === 'loading'
                ? '위치 확인 중...'
                : geoPermissionState === 'denied'
                ? '위치 권한 재요청'
                : '내 위치 재탐색'}
            </button>
            {activeTab !== 'spots' && (
              <button
                type="button"
                onClick={() => setActiveTab('spots')}
                className="px-2.5 py-1 rounded-md btn-cyan-gradient font-bold transition-all"
              >
                위성 지도 열기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          className="max-w-7xl w-full mx-auto px-4 pt-4"
        >
          <div className="bg-[#103653]/95 backdrop-blur-md border border-[#36D6E8]/50 text-[#F4FAFF] px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-lg">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#36D6E8] shrink-0" />
              {toastMessage}
            </span>
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={() => setToastMessage(null)}
              className="text-[#A7C2D8] hover:text-[#F4FAFF] p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Custom Nickname Setup / Edit Modal */}
      {isNicknameModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 bg-[#04101f]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B2948] border border-[#4B9FE8]/35 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-fadeIn">
            <button
              type="button"
              aria-label="닉네임 창 닫기"
              onClick={() => setIsNicknameModalOpen(false)}
              className="absolute top-4 right-4 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#A7C2D8] hover:text-[#F4FAFF]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-[#36D6E8]">낚시인 프로필 설정</span>
              <h3 className="text-lg font-bold text-[#F4FAFF]">사용할 닉네임 설정</h3>
              <p className="text-xs text-[#A7C2D8]">
                오픈채팅·비공개 방·1:1 메시지에서 Google 실명 대신 표시할 닉네임(2~20자)을 입력해 주세요.
              </p>
            </div>

            <form onSubmit={handleSaveNickname} className="space-y-4">
              <div>
                <label htmlFor="user-nickname-input" className="block text-xs font-medium text-[#A7C2D8] mb-1.5">
                  낚시 닉네임 (2~20자)
                </label>
                <input
                  id="user-nickname-input"
                  type="text"
                  required
                  maxLength={MAX_NICKNAME_LEN}
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  placeholder="예: 해운대초보조사"
                  className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
                />
              </div>

              {nicknameError && (
                <div className="p-2.5 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-200">
                  {nicknameError}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsNicknameModalOpen(false)}
                  className="flex-1 min-h-[42px] bg-[#103653] hover:bg-[#174a70] text-[#A7C2D8] border border-[#4B9FE8]/25 rounded-xl text-xs font-semibold"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={isSavingNickname}
                  className="flex-1 min-h-[42px] btn-cyan-gradient rounded-xl text-xs font-bold shadow disabled:opacity-60"
                >
                  {isSavingNickname ? '저장 중...' : '닉네임 저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 lg:pb-12">
        {/* ================= TAB 1: HOME (MAP/DEVICE WEATHER STAR RATING + TIDE + RECOMMENDED TIMES + SPOTS) ================= */}
        {activeTab === 'home' && (
          <div className="space-y-6 animate-fadeIn">
            {/* PRIMARY START SCREEN: ACTIVE-LOCATION KMA CALIBRATED WEATHER, TIDE, RECOMMENDED HOURS & STAR RATING */}
            <BeginnerWeatherRatingCard
              locationLabel={weatherTargetLabel}
              regionLabel={weatherTargetRegion}
              locationSource={activeLocation.source}
              weather={weatherData}
              tideInfo={regionalTide}
              isLoading={isLoadingWeather}
              error={weatherError}
              onRefresh={() => fetchFishingWeather(weatherTargetCoords)}
              onReturnToDevice={handleReturnToDeviceLocation}
              onOpenMap={() => setActiveTab('spots')}
            />

            {/* BEGINNER QUICK ACTION SHORTCUTS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('identify')}
                className="min-h-[56px] px-4 py-2.5 btn-cyan-gradient rounded-xl shadow transition-all text-left flex items-center gap-2.5"
              >
                <Camera className="w-5 h-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm font-bold leading-tight">잡은 물고기 판별</span>
                  <span className="block text-[11px] opacity-85 truncate">사진·특징으로 독성·레시피 확인</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('spots')}
                className="min-h-[56px] px-4 py-2.5 bg-[#103653]/85 backdrop-blur-md hover:bg-[#154569] text-[#F4FAFF] rounded-xl border border-[#4B9FE8]/25 transition-all text-left flex items-center gap-2.5"
              >
                <MapPin className="w-5 h-5 text-[#36D6E8] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm font-bold leading-tight">지도 지역 선택</span>
                  <span className="block text-[11px] text-[#A7C2D8] truncate">선택 지역 기상·물때·공원 탐색</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('messenger')}
                className="min-h-[56px] px-4 py-2.5 bg-[#103653]/85 backdrop-blur-md hover:bg-[#154569] text-[#F4FAFF] rounded-xl border border-[#4B9FE8]/25 transition-all text-left flex items-center gap-2.5"
              >
                <MessageSquare className="w-5 h-5 text-[#4B9FE8] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm font-bold leading-tight">초보 질문 메신저</span>
                  <span className="block text-[11px] text-[#A7C2D8] truncate">오픈방·비공개방·1:1 정보 공유</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('diary')}
                className="min-h-[56px] px-4 py-2.5 bg-[#103653]/85 backdrop-blur-md hover:bg-[#154569] text-[#F4FAFF] rounded-xl border border-[#4B9FE8]/25 transition-all text-left flex items-center gap-2.5"
              >
                <FileText className="w-5 h-5 text-[#36D6E8] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm font-bold leading-tight">내 조과 기록하기</span>
                  <span className="block text-[11px] text-[#A7C2D8] truncate">어종·크기·방생 기록 저장</span>
                </span>
              </button>
            </div>

            {geoNotice &&
              (activeLocation.source === 'gps' ||
                activeLocation.source === 'device-ip' ||
                activeLocation.source === 'default') && (
              <div className="text-xs text-[#A7C2D8] bg-[#103653]/70 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#36D6E8] shrink-0" />
                  {geoNotice}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('spots')}
                  className="text-[#36D6E8] hover:underline font-semibold whitespace-nowrap"
                >
                  지도 열기 →
                </button>
              </div>
            )}

            {/* QUICK WIDGETS STRIP (DYNAMICALLY SYNCED TO ACTIVE LOCATION) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-[#A7C2D8] flex items-center gap-1.5">
                    <span>{isMapSelectedLocation ? '지도 선택 지역' : '내 위치 / 상세 주소'}</span>
                    {!isMapSelectedLocation && geoStatus === 'granted' && liveTrackingEnabled && (
                      <span className="text-[10px] text-[#36D6E8] font-semibold">● 실시간 이동</span>
                    )}
                  </p>
                  <h4 className="text-base font-bold text-[#F4FAFF] truncate mt-1">
                    {activeLocation.label}
                  </h4>
                  <p className="text-xs text-[#36D6E8] mt-0.5 truncate" title={activeLocation.address || userDetailedAddress?.formattedAddress}>
                    {isMapSelectedLocation
                      ? activeLocation.address || activeLocation.region
                      : userDetailedAddress?.formattedAddress ||
                        activeLocation.address ||
                        (activeLocation.spot
                          ? activeLocation.spot.location
                          : nearestSpotInfo && nearestSpotInfo.distanceKm <= MAX_DRIVING_STRAIGHT_KM
                          ? `가까운 포인트 ${nearestSpotInfo.distanceKm}km`
                          : activeLocation.region)}
                  </p>
                  {!isMapSelectedLocation && liveGpsMetrics && geoStatus === 'granted' && (
                    <p className="text-[11px] text-[#A7C2D8] mt-0.5 tabular-nums truncate">
                      {formatSpeedKmh(liveGpsMetrics.speedMs)} · 정확도 {formatAccuracyLabel(liveGpsMetrics.accuracyM)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('spots')}
                  className="min-h-[40px] text-xs btn-cyan-gradient px-3 py-1.5 rounded-lg font-bold shrink-0"
                >
                  지역 변경
                </button>
              </div>

              <div className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-[#A7C2D8] truncate">
                    {weatherTargetRegion} 기상 ({weatherData?.isLive ? weatherData.modelLabel || '실시간 기상' : '해황 기준'})
                  </p>
                  <h4 className="text-base font-bold text-[#F4FAFF] flex items-center gap-2 mt-1">
                    <Sun className="w-5 h-5 text-[#36D6E8] shrink-0" />{' '}
                    <span className="truncate">
                      {weatherData
                        ? `${calculateBeginnerFishingRating(weatherData).weatherText} (${weatherData.temperatureC.toFixed(1)}°C)`
                        : '불러오는 중...'}
                    </span>
                  </h4>
                  <p className="text-xs text-[#36D6E8] mt-1 truncate">
                    {weatherData
                      ? `${
                          weatherData.waveHeightM !== null
                            ? `파고 ${weatherData.waveHeightM.toFixed(1)}m · `
                            : ''
                        }${
                          typeof weatherData.seaSurfaceTempC === 'number'
                            ? `수온 ${weatherData.seaSurfaceTempC.toFixed(1)}°C · `
                            : ''
                        }${calculateBeginnerFishingRating(weatherData).windDirectionText} ${weatherData.windSpeedMs.toFixed(1)}m/s`
                      : '기상 데이터 조회 중'}
                  </p>
                </div>
                <Waves className="w-8 h-8 text-[#4B9FE8] shrink-0" />
              </div>

              <div
                data-testid="home-tide-widget"
                className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl p-4 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#A7C2D8] flex items-center justify-between gap-1">
                    <span>{regionalTide.region} 물때 ({regionalTide.tidalStrength})</span>
                    <span className="text-[#36D6E8] font-mono tabular-nums">{regionalTide.tidePercent}%</span>
                  </p>
                  <h4 className="text-base font-bold text-[#F4FAFF] flex items-center gap-2 mt-1 truncate">
                    <Calendar className="w-4 h-4 text-[#36D6E8] shrink-0" />
                    <span className="truncate">{regionalTide.multaeName.split(' (')[0]} ({regionalTide.currentPhaseText})</span>
                  </h4>
                  <p className="text-xs text-[#A7C2D8] mt-1 font-mono tabular-nums truncate">
                    만조 {regionalTide.highTides.map((h) => h.timeLabel).join('·') || '--'} / 간조{' '}
                    {regionalTide.lowTides.map((l) => l.timeLabel).join('·') || '--'}
                  </p>
                  <p className="text-[11px] text-[#36D6E8] mt-0.5 truncate">
                    추천 시간: {regionalTide.bestTimeSummary}
                  </p>
                </div>
                <Compass className="w-8 h-8 text-[#4B9FE8] shrink-0" />
              </div>

              <div className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl p-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-[#A7C2D8]">나의 조과 기록장</p>
                  <h4 className="text-base font-bold text-[#F4FAFF] flex items-center gap-2 mt-1">
                    <FileText className="w-5 h-5 text-[#36D6E8]" /> 총 {catchLogs.length}마리 기록
                  </h4>
                  <p className="text-xs text-[#A7C2D8] mt-1">
                    최근: {catchLogs[0]?.userConfirmedName || catchLogs[0]?.speciesName || '없음'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('diary')}
                  className="min-h-[40px] text-xs bg-[#0B2948] hover:bg-[#16426d] border border-[#4B9FE8]/30 px-3 py-1.5 rounded-lg text-[#F4FAFF] font-medium shrink-0"
                >
                  관리
                </button>
              </div>
            </div>

            {/* WIND, WEATHER, WAVE HEIGHT & SEA SURFACE TEMPERATURE VISUALIZATION */}
            <MarineWeatherVisuals
              locationLabel={weatherTargetLabel}
              regionLabel={weatherTargetRegion}
              locationSource={activeLocation.source}
              weather={weatherData}
              isLoading={isLoadingWeather}
              onRefresh={() => fetchFishingWeather(weatherTargetCoords)}
            />

            {/* CURRENT-SEASON ONLY: CLOSED SEASONS, MINIMUM SIZES & MARINE SAFETY RULES */}
            <section
              id="home-seasonal-regulations"
              data-testid="home-seasonal-regulations"
              aria-label="이번 시기 금어기·금지체장 및 해양 안전 수칙"
              className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4B9FE8]/20 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#36D6E8] font-bold">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      한국 표준시 {seasonalRegulations.kstMonth}월 {seasonalRegulations.kstDay}일 ({seasonalRegulations.seasonLabel}) 기준 자동 선별
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#F4FAFF]">
                    지금 시기 주의해야 할 금어기 · 금지체장 &amp; 해양 안전 수칙
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('guide')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0B2948] hover:bg-[#143d66] text-[#36D6E8] border border-[#36D6E8]/35 text-xs font-bold shrink-0 self-start sm:self-center transition-colors"
                >
                  전체 보호 가이드 보기 →
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. 지금 시기 진행 중인 금어기 어종 */}
                <div className="bg-[#061B33]/75 border border-red-500/30 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {seasonalRegulations.kstMonth}월 현재 금어기 어종 ({seasonalRegulations.activeFishingBans.length}종)
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {seasonalRegulations.activeFishingBans.map((ban) => (
                      <li
                        key={ban.id}
                        className="bg-red-950/35 border border-red-500/25 rounded-lg p-2.5 space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2 font-bold text-[#F4FAFF]">
                          <span>{ban.speciesName}</span>
                          <span className="text-[11px] text-red-300 font-mono">{ban.banPeriodLabel}</span>
                        </div>
                        <p className="text-[11px] text-[#A7C2D8] leading-relaxed">{ban.note}</p>
                        {ban.minLengthLabel && (
                          <p className="text-[11px] text-amber-300">병행 기준: {ban.minLengthLabel}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2 border-t border-[#4B9FE8]/20 space-y-1 text-[11px] text-[#A7C2D8]">
                    <strong className="text-[#36D6E8] block">연중 포획 금지 해양보호생물:</strong>
                    {seasonalRegulations.protectedSpecies.map((p) => (
                      <p key={p.name}>• {p.name}: {p.action}</p>
                    ))}
                  </div>
                </div>

                {/* 2. 지금 시기 주의해야 할 금지체장(cm) 어종 */}
                <div className="bg-[#061B33]/75 border border-amber-500/30 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {seasonalRegulations.kstMonth}월 주의 금지체장 ({seasonalRegulations.seasonalMinimumSizes.length}종)
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {seasonalRegulations.seasonalMinimumSizes.map((rule) => (
                      <li
                        key={rule.id}
                        className="bg-amber-950/30 border border-amber-500/25 rounded-lg p-2.5 space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2 font-bold text-[#F4FAFF]">
                          <span>{rule.speciesName}</span>
                          <span className="text-[11px] text-amber-300 font-bold tabular-nums">
                            {rule.minLengthCm}cm 이하 방생
                          </span>
                        </div>
                        <p className="text-[11px] text-[#A7C2D8] leading-relaxed">{rule.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. 필수 해양 안전 수칙 */}
                <div className="bg-[#061B33]/75 border border-[#36D6E8]/30 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-[#36D6E8] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    필수 해양 안전 수칙
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {seasonalRegulations.safetyRules.map((rule) => (
                      <li
                        key={rule.id}
                        className={`rounded-lg p-2.5 border space-y-0.5 ${
                          rule.priority === 'critical'
                            ? 'bg-red-950/30 border-red-500/30'
                            : 'bg-[#0B2948]/70 border-[#4B9FE8]/25'
                        }`}
                      >
                        <div className="font-bold text-[#F4FAFF]">{rule.title}</div>
                        <p className="text-[11px] text-[#A7C2D8] leading-relaxed">{rule.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* MAX 1-HOUR DRIVING SAFE & BEGINNER-FRIENDLY SPOTS RECOMMENDATION */}
            <NearbyBeginnerSpotsSection
              spots={nearbySpots}
              isLoading={isLoadingNearby}
              error={nearbyError}
              locationLabel={activeLocation.label}
              locationSource={activeLocation.source}
              geoStatus={geoStatus}
              onRefresh={() => fetchNearbyBeginnerSpots(activeLocation.coords)}
              onSelectOnMap={handleSelectNearbySpotOnMap}
              onOpenMap={() => setActiveTab('spots')}
              onShareToChat={(spotName) => {
                setPrefilledShareSpot(spotName);
                setActiveTab('messenger');
              }}
              onRequestGps={handleForceRequestLocation}
            />
          </div>
        )}

        {/* ================= TAB 2: AI FISH SEARCH + PHOTO ID + CONDITION SEARCH ================= */}
        {activeTab === 'identify' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="bg-[#103653]/85 backdrop-blur-md border border-[#36D6E8]/30 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#F4FAFF] flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-[#36D6E8]" /> AI 물고기 검색 · 식용 판별 · 추천 요리법
                </h2>
                <p className="text-xs sm:text-sm text-[#A7C2D8] mt-1">
                  이름·특징 검색, 사진 AI 판별, 직접 입력 조건 찾기로 물고기를 분석하고 식용 여부와 추천 요리법까지 한 번에 확인하세요.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById('ai-fish-search-section')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="px-3.5 py-2 rounded-xl btn-cyan-gradient text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" /> AI 물고기 검색
                </button>
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById('ai-scanner-section')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="px-3.5 py-2 rounded-xl bg-[#0B2948] hover:bg-[#143d66] text-[#36D6E8] border border-[#36D6E8]/35 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" /> 사진 판별
                </button>
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById('feature-search-section')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="px-3.5 py-2 rounded-xl bg-[#0B2948] hover:bg-[#143d66] text-[#36D6E8] border border-[#36D6E8]/35 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5" /> 조건 검색
                </button>
              </div>
            </div>

            {/* 0. DIRECT AI FISH SEARCH -> AI ANALYSIS -> EDIBILITY CHECK -> RECOMMENDED RECIPES */}
            <section
              id="ai-fish-search-section"
              data-testid="ai-fish-search-section"
              className="bg-[#103653]/85 backdrop-blur-md border border-[#36D6E8]/30 rounded-2xl p-5 sm:p-7 shadow-xl space-y-5"
            >
              <div className="border-b border-[#4B9FE8]/20 pb-4">
                <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
                  <Search className="w-6 h-6 text-[#36D6E8]" /> 1. AI 물고기 검색 · 식용 여부 &amp; 요리 추천
                </h3>
                <p className="text-xs sm:text-sm text-[#A7C2D8] mt-1">
                  궁금한 어종 이름(방언 포함)이나 생김새를 검색하면 AI가 어종을 분석해 식용 가능 여부와 추천 요리법을 알려드립니다.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleRunFishSearch();
                }}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#A7C2D8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fishSearchQuery}
                    onChange={(e) => setFishSearchQuery(e.target.value)}
                    placeholder="예: 우럭, 참돔, 감성돔, 황복, 독가시치, 몸에 세로줄무늬가 있는 은빛 물고기"
                    data-testid="ai-fish-search-input"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearchingFish}
                  data-testid="ai-fish-search-submit"
                  className="min-h-[46px] px-5 py-2.5 btn-cyan-gradient font-bold rounded-xl shadow-lg transition-all inline-flex items-center justify-center gap-2 text-sm shrink-0 disabled:opacity-50"
                >
                  {isSearchingFish ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> AI 분석 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> AI 검색·식용 판별
                    </>
                  )}
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#A7C2D8] mr-1">인기 검색:</span>
                {['참돔', '우럭', '고등어', '광어', '황복 (독성 확인)', '쏠배감펭'].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void handleRunFishSearch(sample.replace(' (독성 확인)', ''))}
                    className="px-2.5 py-1 rounded-lg bg-[#0B2948] hover:bg-[#16426d] text-[#F4FAFF] border border-[#4B9FE8]/25 text-xs transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {fishSearchError && (
                <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-200 text-xs">
                  {fishSearchError}
                </div>
              )}

              {fishSearchResult && (() => {
                const fish = fishSearchResult.matchedFish;
                const encycMatch = findMatchingEncyclopediaFish(fish.speciesName, INITIAL_FISH_ENCYCLOPEDIA);
                const mainPhoto = fish.imageUrl || encycMatch?.image || '';
                const recipes = normalizeFishRecipes(fish.edible, fish.recommendedRecipes);
                const similarList = Array.isArray(fish.similarSpecies) ? fish.similarSpecies : [];
                return (
                  <div
                    data-testid="ai-fish-search-result"
                    className="bg-[#061B33]/80 border border-[#4B9FE8]/25 rounded-2xl p-5 sm:p-6 space-y-5 animate-fadeIn"
                  >
                    {/* Header + Resolved Species Photo */}
                    <div className="flex flex-col md:flex-row gap-5 items-start justify-between border-b border-[#4B9FE8]/20 pb-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[#36D6E8]">
                            AI 검색 일치 신뢰도 {fish.matchConfidence}%
                          </span>
                          {(fish.isUncertain || fish.matchConfidence < 80) && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-500/40">
                              유사 어종 비교 권장
                            </span>
                          )}
                          {fish.aliases && fish.aliases.length > 0 && (
                            <span className="text-xs text-[#A7C2D8]">
                              · 별칭: {fish.aliases.join(', ')}
                            </span>
                          )}
                        </div>
                        <h4 className="text-2xl font-black text-[#F4FAFF]">{fish.speciesName}</h4>
                        <p className="text-xs text-[#A7C2D8] italic">{fish.scientificName}</p>
                        <p className="text-xs sm:text-sm text-[#F4FAFF]/90 leading-relaxed pt-1">
                          {fish.analysisSummary}
                        </p>
                      </div>

                      {mainPhoto && (
                        <img
                          src={mainPhoto}
                          alt={`${fish.speciesName} 참고 사진`}
                          referrerPolicy="no-referrer"
                          className="w-full md:w-52 h-36 object-cover rounded-xl border border-[#4B9FE8]/30 shrink-0 bg-[#061B33]"
                        />
                      )}
                    </div>

                    {/* Uncertainty Alert Banner when exact single-species lock isn't 100% certain */}
                    {(fish.isUncertain || fish.matchConfidence < 80) && (
                      <div
                        data-testid="ai-uncertainty-notice"
                        className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-100 text-xs flex items-start gap-2.5"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <strong className="text-amber-300 block">
                            입력 정보만으로 단일 어종 100% 확정이 어려워 가장 유사한 후보와 사진을 함께 안내합니다
                          </strong>
                          <p className="opacity-95 leading-relaxed">
                            {fish.uncertaintyReason ||
                              '외형이 비슷한 근연종이 많으므로 아래 해부학적 세부 특징과 유사 어종 이미지를 직접 비교해 보세요.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Prominent Edibility Verdict Banner */}
                    <div
                      data-testid="ai-edibility-verdict"
                      className={`p-4 rounded-xl border space-y-1.5 ${
                        fish.edible
                          ? 'bg-emerald-950/55 border-emerald-500/45 text-emerald-100'
                          : 'bg-red-950/70 border-red-500/55 text-red-100'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-base font-extrabold flex items-center gap-2">
                          {fish.edible ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                          )}
                          식용 판별 결과: {fish.edibilityStatus}
                        </strong>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#061B33]/80 border border-[#4B9FE8]/25">
                          독성: {fish.toxicity}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-95">{fish.edibilityReason}</p>
                    </div>

                    {/* Detailed Anatomical Breakdown */}
                    {fish.anatomicalDetails && (
                      <div className="bg-[#0B2948]/80 border border-[#36D6E8]/25 rounded-xl p-4 space-y-2.5">
                        <div className="text-xs font-bold text-[#36D6E8] flex items-center gap-1.5">
                          <Microscope className="w-4 h-4" /> AI 세밀 해부학적 식별 데이터
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          <div className="bg-[#061B33]/75 border border-[#4B9FE8]/20 rounded-lg p-3 space-y-1">
                            <span className="font-bold text-[#F4FAFF] block">체형 · 비늘 · 체색</span>
                            <p className="text-[#A7C2D8] leading-relaxed">{fish.anatomicalDetails.bodyAndColor}</p>
                          </div>
                          <div className="bg-[#061B33]/75 border border-[#4B9FE8]/20 rounded-lg p-3 space-y-1">
                            <span className="font-bold text-[#F4FAFF] block">지느러미 · 가시 · 독침</span>
                            <p className="text-[#A7C2D8] leading-relaxed">{fish.anatomicalDetails.finsAndSpines}</p>
                          </div>
                          <div className="bg-[#061B33]/75 border border-[#4B9FE8]/20 rounded-lg p-3 space-y-1">
                            <span className="font-bold text-[#F4FAFF] block">머리 · 입 · 핵심 무늬</span>
                            <p className="text-[#A7C2D8] leading-relaxed">{fish.anatomicalDetails.headMouthPattern}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Habitat, Features, Regulations */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="bg-[#0B2948]/75 border border-[#4B9FE8]/25 rounded-xl p-3.5 space-y-1">
                        <span className="font-bold text-[#36D6E8]">주요 서식지</span>
                        <p className="text-[#F4FAFF]/90 leading-relaxed">{fish.habitat}</p>
                      </div>
                      <div className="bg-[#0B2948]/75 border border-[#4B9FE8]/25 rounded-xl p-3.5 space-y-1">
                        <span className="font-bold text-[#36D6E8]">외형 특징 요약</span>
                        <p className="text-[#F4FAFF]/90 leading-relaxed">{fish.features}</p>
                      </div>
                      <div className="bg-amber-950/35 border border-amber-500/30 rounded-xl p-3.5 space-y-1">
                        <span className="font-bold text-amber-300">금어기 · 포획 규정</span>
                        <p className="text-amber-100 leading-relaxed">{fish.fishingBan}</p>
                        {fish.protected && (
                          <p className="text-red-300 font-bold pt-1">
                            ⚠️ 보호생물 주의: {fish.protectionNote || '즉시 방생 대상'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Recommended Recipes (ONLY when edible === true) */}
                    {fish.edible && recipes.length > 0 ? (
                      <div data-testid="ai-recommended-recipes" className="space-y-3">
                        <h5 className="text-sm font-bold text-[#36D6E8] flex items-center gap-2">
                          <Utensils className="w-4 h-4" /> 식용 가능 어종 추천 요리법 ({recipes.length}선)
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                          {recipes.map((rec, idx) => (
                            <div
                              key={idx}
                              className="bg-[#0B2948]/85 border border-[#4B9FE8]/25 rounded-xl p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-sm text-[#F4FAFF]">{rec.dishName}</span>
                                <span className="text-[11px] font-semibold text-[#36D6E8] shrink-0">
                                  {rec.difficulty}
                                </span>
                              </div>
                              <p className="text-xs text-[#A7C2D8] leading-relaxed">{rec.method}</p>
                              <p className="text-[11px] text-[#36D6E8] bg-[#061B33]/75 border border-[#36D6E8]/25 rounded-lg p-2">
                                <strong>손질·요리 팁:</strong> {rec.tips}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid="ai-inedible-warning"
                        className="p-4 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-start gap-2.5"
                      >
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span>
                          식용이 불가능하거나 위험한 어종으로 판별되어 요리법을 추천하지 않습니다. 독침·가시에 찔리지 않도록 집게를 사용해 즉시 바다로 방생하세요.
                        </span>
                      </div>
                    )}

                    {/* Closest Similar Species & Reference Images */}
                    {similarList.length > 0 && (
                      <div className="pt-3 border-t border-[#4B9FE8]/20 space-y-3" data-testid="ai-similar-species-grid">
                        <h5 className="text-sm font-bold text-[#36D6E8]">
                          가장 유사한 어종 · 이미지 및 구별 포인트 ({similarList.length}종)
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                          {similarList.map((sim) => {
                            const simEncyc = findMatchingEncyclopediaFish(sim.speciesName, INITIAL_FISH_ENCYCLOPEDIA);
                            const simPhoto = sim.imageUrl || simEncyc?.image || '';
                            return (
                              <div
                                key={sim.speciesName}
                                className="bg-[#0B2948]/80 border border-[#4B9FE8]/25 rounded-xl overflow-hidden flex flex-col justify-between"
                              >
                                {simPhoto && (
                                  <img
                                    src={simPhoto}
                                    alt={`${sim.speciesName} 유사 어종 사진`}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-32 object-cover bg-[#061B33] border-b border-[#4B9FE8]/20"
                                  />
                                )}
                                <div className="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <strong className="text-[#F4FAFF] text-sm">{sim.speciesName}</strong>
                                      <span className="text-[11px] text-[#36D6E8] font-bold tabular-nums">
                                        유사도 {sim.similarityPercent}%
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#A7C2D8] italic">{sim.scientificName}</p>
                                    <p className="text-[11px] text-[#A7C2D8] leading-relaxed">
                                      <strong className="text-amber-300">구별법:</strong> {sim.differentiatingPoints}
                                    </p>
                                  </div>
                                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#4B9FE8]/20">
                                    <span className={`text-[11px] font-bold ${sim.edible ? 'text-emerald-300' : 'text-red-300'}`}>
                                      {sim.edible ? '식용 가능' : `주의 (${sim.toxicity})`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleRunFishSearch(sim.speciesName)}
                                      className="px-2.5 py-1 rounded-lg btn-aqua-gradient text-[11px] font-bold transition-all"
                                    >
                                      이 어종 분석 →
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Related Species Quick Switch */}
                    {fishSearchResult.relatedCandidates.length > 0 && (
                      <div className="pt-2 border-t border-[#4B9FE8]/20 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-[#A7C2D8]">관련 후보 빠른 전환:</span>
                        {fishSearchResult.relatedCandidates.map((cand) => (
                          <button
                            key={cand.speciesName}
                            type="button"
                            onClick={() => void handleRunFishSearch(cand.speciesName)}
                            className="px-3 py-1.5 rounded-lg bg-[#0B2948] hover:bg-[#154569] text-[#F4FAFF] border border-[#4B9FE8]/25 text-xs font-medium transition-colors"
                            title={cand.reason}
                          >
                            {cand.speciesName} ({cand.edible ? '식용' : '주의/비식용'})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>

            {/* 2. AI PHOTO & FEATURE SCANNER */}
            <div
              id="ai-scanner-section"
              className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#4B9FE8]/20 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
                    <Camera className="w-6 h-6 text-[#36D6E8]" /> 2. AI 사진 어종 판별기
                  </h3>
                  <p className="text-sm text-[#A7C2D8] mt-1">
                    잡은 물고기 사진을 업로드하거나 촬영하면 AI가 외형·독성·금어기·조리법을 즉시 분석합니다.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Left: Upload & Notes */}
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-[#4B9FE8]/35 hover:border-[#36D6E8] rounded-xl p-6 text-center bg-[#061B33]/65 transition-all relative overflow-hidden group">
                    {selectedImage ? (
                      <div className="space-y-4">
                        <img
                          src={selectedImage}
                          alt="업로드된 물고기 사진"
                          className="max-h-64 mx-auto rounded-lg object-contain shadow-md"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedImage(null)}
                          className="min-h-[40px] text-xs bg-red-950 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-900 transition-colors"
                        >
                          사진 다시 선택하기
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center space-y-3 py-6">
                        <div className="w-16 h-16 rounded-full bg-[#36D6E8]/15 border border-[#36D6E8]/35 flex items-center justify-center text-[#36D6E8] group-hover:scale-110 transition-transform">
                          <Upload className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#F4FAFF]">물고기 사진을 업로드하세요</p>
                          <p className="text-xs text-[#A7C2D8] mt-1">JPG, PNG, WEBP (최대 15MB)</p>
                        </div>
                        <span className="px-4 py-2 btn-cyan-gradient text-xs font-bold rounded-lg shadow">
                          파일 선택 / 촬영
                        </span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>

                  <div className="bg-[#061B33]/75 border border-[#4B9FE8]/25 rounded-xl p-4 space-y-2">
                    <label htmlFor="ai-user-notes" className="block text-xs font-bold text-[#36D6E8]">
                      어종 특징 직접 입력 (선택사항 · 사진 없이 텍스트만으로도 판별 가능)
                    </label>
                    <textarea
                      id="ai-user-notes"
                      rows={3}
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      placeholder="예: 몸통은 어두운 갈색에 얼룩무늬가 있고 등지느러미 가시가 억셈 / 크기 약 25cm / 방파제 바닥에서 잡힘"
                      className="w-full bg-[#0B2948] border border-[#4B9FE8]/30 rounded-xl px-3.5 py-2.5 text-xs text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAIIdentification}
                    disabled={isIdentifying}
                    className="w-full min-h-[48px] py-3.5 btn-cyan-gradient font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isIdentifying ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" /> AI 어종 분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" /> AI 어종 정밀 판별 실행
                      </>
                    )}
                  </button>

                  {aiError && (
                    <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-200 text-xs">
                      {aiError}
                    </div>
                  )}
                </div>

                {/* Right: AI Results Display */}
                <div className="bg-[#061B33]/80 border border-[#4B9FE8]/25 rounded-xl p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-[#A7C2D8] flex items-center gap-2">
                    <Info className="w-4 h-4 text-[#36D6E8]" /> 판별 결과 · 해부학 분석 및 유사 어종 비교
                  </h4>

                  {identifiedResult ? (() => {
                    const encycMatch = findMatchingEncyclopediaFish(
                      identifiedResult.speciesName || '',
                      INITIAL_FISH_ENCYCLOPEDIA
                    );
                    const idPhoto = identifiedResult.imageUrl || encycMatch?.image || '';
                    const simSpecies: any[] = Array.isArray(identifiedResult.similarSpecies)
                      ? identifiedResult.similarSpecies
                      : [];
                    return (
                    <div className="space-y-4 animate-fadeIn">
                      {/* Beginner Safety First Summary Banner */}
                      <div
                        className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                          identifiedResult.edible && identifiedResult.toxicity === '독성 없음'
                            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-100'
                            : 'bg-red-950/70 border-red-500/50 text-red-100'
                        }`}
                      >
                        <strong className="block text-sm mb-0.5">
                          {identifiedResult.edible && identifiedResult.toxicity === '독성 없음'
                            ? '초보자 안내: 식용 가능 · 아래 금어기·금지체장만 확인하세요'
                            : '초보자 주의: 맨손 접촉·섭취에 주의하고 확인 후 즉시 방생하세요'}
                        </strong>
                        <span>
                          {identifiedResult.edible && identifiedResult.toxicity === '독성 없음'
                            ? '독성이 보고되지 않은 어종입니다. 포획 금지 체장보다 작은 치어라면 바다를 위해 살려주세요.'
                            : '독성이 있거나 식용이 권장되지 않는 어종일 수 있습니다. 가시를 만지지 말고 집게로 바늘을 빼 방생하세요.'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 border-b border-[#4B9FE8]/20 pb-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-[#36D6E8] font-bold tabular-nums">
                              정확도 {identifiedResult.confidence}%
                            </span>
                            {(identifiedResult.isUncertain || identifiedResult.confidence < 80) && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40">
                                유사 어종 비교 필요
                              </span>
                            )}
                          </div>
                          <h3 className="text-2xl font-black text-[#F4FAFF]">{identifiedResult.speciesName}</h3>
                          <p className="text-xs text-[#A7C2D8] italic">{identifiedResult.scientificName}</p>
                        </div>
                        {idPhoto && (
                          <img
                            src={idPhoto}
                            alt={`${identifiedResult.speciesName} 참고 사진`}
                            referrerPolicy="no-referrer"
                            className="w-full sm:w-36 h-24 object-cover rounded-xl border border-[#4B9FE8]/30 shrink-0 bg-[#061B33]"
                          />
                        )}
                      </div>

                      {(identifiedResult.isUncertain || identifiedResult.confidence < 80) && (
                        <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-100 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">
                            <strong className="text-amber-300">유사종 확인 안내: </strong>
                            {identifiedResult.uncertaintyReason ||
                              '사진 각도나 특징만으로 단일 어종 100% 확정이 어려워 하단에 가장 유사한 어종과 이미지를 함께 제공합니다.'}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div
                          className={`p-3 rounded-xl border ${
                            identifiedResult.edible
                              ? 'bg-emerald-950/40 border-emerald-500/35'
                              : 'bg-red-950/40 border-red-500/35'
                          }`}
                        >
                          <span className="text-xs font-semibold text-[#A7C2D8]">식용 가능 여부</span>
                          <p
                            className={`text-sm font-bold mt-0.5 ${
                              identifiedResult.edible ? 'text-emerald-300' : 'text-red-400'
                            }`}
                          >
                            {identifiedResult.edible ? '✅ 식용 가능' : '❌ 식용 부적합 / 섭취 금지'}
                          </p>
                        </div>

                        <div
                          className={`p-3 rounded-xl border ${
                            identifiedResult.toxicity !== '독성 없음'
                              ? 'bg-red-950/60 border-red-500/40'
                              : 'bg-[#0B2948] border-[#4B9FE8]/25'
                          }`}
                        >
                          <span className="text-xs font-semibold text-[#A7C2D8]">독성 정보</span>
                          <p
                            className={`text-xs font-bold mt-0.5 ${
                              identifiedResult.toxicity !== '독성 없음' ? 'text-red-300' : 'text-[#F4FAFF]'
                            }`}
                          >
                            {identifiedResult.toxicity}
                          </p>
                        </div>
                      </div>

                      {identifiedResult.anatomicalDetails && (
                        <div className="p-3 bg-[#0B2948]/80 border border-[#36D6E8]/25 rounded-xl space-y-1.5 text-[11px]">
                          <div className="font-bold text-[#36D6E8] flex items-center gap-1.5">
                            <Microscope className="w-3.5 h-3.5" /> 세밀 해부학적 식별 데이터
                          </div>
                          <p className="text-[#A7C2D8]">
                            <strong className="text-[#F4FAFF]">체형·체색:</strong>{' '}
                            {identifiedResult.anatomicalDetails.bodyAndColor}
                          </p>
                          <p className="text-[#A7C2D8]">
                            <strong className="text-[#F4FAFF]">지느러미·가시:</strong>{' '}
                            {identifiedResult.anatomicalDetails.finsAndSpines}
                          </p>
                          <p className="text-[#A7C2D8]">
                            <strong className="text-[#F4FAFF]">머리·입·무늬:</strong>{' '}
                            {identifiedResult.anatomicalDetails.headMouthPattern}
                          </p>
                        </div>
                      )}

                      <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl">
                        <span className="text-xs font-semibold text-amber-400">금어기 및 포획 규정</span>
                        <p className="text-xs text-amber-200 mt-0.5 font-medium">{identifiedResult.fishingBan}</p>
                      </div>

                      <div className="space-y-1 text-xs text-[#A7C2D8]">
                        {identifiedResult.analysisSummary && (
                          <p className="text-[#F4FAFF] leading-relaxed pb-1">
                            <strong className="text-[#36D6E8]">AI 분석 요약:</strong> {identifiedResult.analysisSummary}
                          </p>
                        )}
                        <p>
                          <strong className="text-[#F4FAFF]">주요 서식지:</strong> {identifiedResult.habitat}
                        </p>
                        <p>
                          <strong className="text-[#F4FAFF]">판별 근거:</strong> {identifiedResult.features}
                        </p>
                      </div>

                      {identifiedResult.edible ? (
                        <div className="p-3 bg-[#0B2948]/85 border border-[#36D6E8]/30 rounded-xl space-y-2">
                          <span className="text-xs font-bold text-[#36D6E8] flex items-center gap-1.5">
                            <Utensils className="w-3.5 h-3.5" /> 식용 가능 · 추천 조리법 및 손질 팁
                          </span>
                          {normalizeFishRecipes(
                            true,
                            identifiedResult.recommendedRecipes,
                            identifiedResult.recipe
                          ).map((rec, idx) => (
                            <div key={idx} className="bg-[#061B33]/75 border border-[#4B9FE8]/25 rounded-lg p-2.5 text-xs space-y-1">
                              <div className="font-bold text-[#F4FAFF] flex items-center justify-between">
                                <span>{rec.dishName}</span>
                                <span className="text-[10px] text-[#36D6E8]">{rec.difficulty}</span>
                              </div>
                              {rec.method && <p className="text-[#A7C2D8]">{rec.method}</p>}
                              {rec.tips && <p className="text-[#36D6E8] text-[11px]">팁: {rec.tips}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200">
                          식용 불가 또는 독성·주의 어종이므로 요리 추천을 제공하지 않습니다.
                        </div>
                      )}

                      {simSpecies.length > 0 && (
                        <div className="pt-2 border-t border-[#4B9FE8]/20 space-y-2">
                          <h5 className="text-xs font-bold text-[#36D6E8]">
                            가장 유사한 어종 · 이미지 비교 ({simSpecies.length}종)
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {simSpecies.map((sim) => {
                              const simEncyc = findMatchingEncyclopediaFish(
                                sim.speciesName || '',
                                INITIAL_FISH_ENCYCLOPEDIA
                              );
                              const simPhoto = sim.imageUrl || simEncyc?.image || '';
                              return (
                                <div
                                  key={sim.speciesName}
                                  className="bg-[#0B2948]/85 border border-[#4B9FE8]/25 rounded-xl overflow-hidden text-xs"
                                >
                                  {simPhoto && (
                                    <img
                                      src={simPhoto}
                                      alt={`${sim.speciesName} 유사 어종`}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-24 object-cover bg-[#061B33] border-b border-[#4B9FE8]/20"
                                    />
                                  )}
                                  <div className="p-2.5 space-y-1">
                                    <div className="flex items-center justify-between gap-1 font-bold text-[#F4FAFF]">
                                      <span>{sim.speciesName}</span>
                                      <span className="text-[11px] text-[#36D6E8] tabular-nums">
                                        {sim.similarityPercent}%
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#A7C2D8] leading-snug">
                                      {sim.differentiatingPoints}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleRunFishSearch(sim.speciesName);
                                        document
                                          .getElementById('ai-fish-search-section')
                                          ?.scrollIntoView({ behavior: 'smooth' });
                                      }}
                                      className="text-[11px] text-[#36D6E8] hover:underline font-bold pt-0.5"
                                    >
                                      자세히 분석 →
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })() : (
                    <div className="text-center py-16 text-[#A7C2D8] space-y-3">
                      <Compass className="w-12 h-12 mx-auto stroke-1 text-[#4B9FE8]/60" />
                      <p className="text-sm">
                        사진을 업로드하거나 특징을 직접 입력한 뒤
                        <br />
                        [AI 어종 정밀 판별 실행]을 눌러주세요.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. CONDITION SEARCH (MERGED INTO SAME SCREEN) */}
            <div id="feature-search-section">
              <FeatureSearchSection
                searchParams={searchParams}
                onChangeParams={setSearchParams}
                onResetParams={() => {
                  setSearchParams(createDefaultDetailedFeatures(activeLocation.region));
                  setFeatureSearchResults([]);
                  setFeatureSearchError(null);
                }}
                onSubmit={handleRunFeatureSearch}
                isSearching={isSearchingFeatures}
                error={featureSearchError}
                results={featureSearchResults}
                encyclopedia={INITIAL_FISH_ENCYCLOPEDIA}
                onSelectFishForAnalysis={(speciesName) => {
                  void handleRunFishSearch(speciesName);
                  document.getElementById('ai-fish-search-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>
          </div>
        )}

        {/* ================= TAB 3: MAP, SPOTS & ENVIRONMENT ================= */}
        {activeTab === 'spots' && (
          <div className="space-y-6 animate-fadeIn">
            <FishingMapSection
              apiKey={mapsApiKey}
              spots={INITIAL_FISHING_SPOTS}
              nearbySpots={nearbySpots}
              drivingTimesBySpotId={drivingTimesBySpotId}
              userCoords={userCoords}
              userAddress={userAddress}
              userDetailedAddress={userDetailedAddress}
              liveGpsMetrics={liveGpsMetrics}
              liveTrackingEnabled={liveTrackingEnabled}
              onToggleLiveTracking={() => setLiveTrackingEnabled((prev) => !prev)}
              geoStatus={geoStatus}
              geoPermissionState={geoPermissionState}
              activeLocation={activeLocation}
              selectedRegionFilter={selectedRegionFilter}
              onRegionFilterChange={setSelectedRegionFilter}
              onSelectSpot={handleSelectSpot}
              onSelectCustomPoint={handleSelectCustomPoint}
              onRequestUserLocation={handleForceRequestLocation}
              isCalibratingGps={isCalibratingGps}
              onCalibrateHighAccuracyGps={calibrateHighAccuracyGps}
            />

            <NearbyBeginnerSpotsSection
              spots={nearbySpots}
              isLoading={isLoadingNearby}
              error={nearbyError}
              locationLabel={activeLocation.label}
              locationSource={activeLocation.source}
              geoStatus={geoStatus}
              onRefresh={() => fetchNearbyBeginnerSpots(activeLocation.coords)}
              onSelectOnMap={handleSelectNearbySpotOnMap}
              onOpenMap={() => setActiveTab('spots')}
              onShareToChat={(spotName) => {
                setPrefilledShareSpot(spotName);
                setActiveTab('messenger');
              }}
              onRequestGps={handleForceRequestLocation}
            />

            {/* Live KST Weather, Tide, Recommended Times & Marine Environment Summary for Active Map Location */}
            <div className="bg-[#103653]/85 backdrop-blur-md border border-[#36D6E8]/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#36D6E8]">
                    <span>
                      {isMapSelectedLocation ? '지도 선택 지역 관측' : '현재 기기 위치 관측'} ·{' '}
                      {weatherData?.isLive
                        ? `${weatherData.modelLabel || '기상청(KMA) 보정 실시간 KST'}`
                        : '대한민국(KST) 기준 기상 안내'}{' '}
                      · {weatherData?.observedAtKst || formatKstDateTime(now)}
                    </span>
                    {isMapSelectedLocation && (
                      <button
                        type="button"
                        onClick={handleReturnToDeviceLocation}
                        className="px-2 py-0.5 rounded-md bg-[#0B2948] hover:bg-[#143d66] text-[#F4FAFF] border border-[#4B9FE8]/35 text-[11px]"
                      >
                        내 기기 위치로 복귀
                      </button>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-[#F4FAFF]">
                    {weatherTargetLabel} ({weatherTargetRegion}) 해양 기상 · 물때 &amp; 추천 시간
                  </h3>
                  <p className="text-xs text-[#A7C2D8]">
                    선택하신 지역을 기준으로 한국 기상청(KMA) 보정 기온·풍속·파고·수온과 물때({regionalTide.multaeName}, {regionalTide.currentPhaseText})를 계산합니다.
                    {weatherData?.marineReferenceLabel ? ` (${weatherData.marineReferenceLabel})` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  <div className="bg-[#061B33]/80 border border-[#4B9FE8]/25 p-3.5 rounded-xl text-center min-w-[92px]">
                    <Thermometer className="w-5 h-5 text-red-400 mx-auto mb-1" />
                    <span className="text-xs text-[#A7C2D8]">수온</span>
                    <p className="text-base font-bold text-[#F4FAFF] tabular-nums">
                      {typeof weatherData?.seaSurfaceTempC === 'number'
                        ? `${weatherData.seaSurfaceTempC.toFixed(1)}°C`
                        : weatherData
                        ? `${weatherData.temperatureC.toFixed(1)}°C(기온)`
                        : '--'}
                    </p>
                  </div>
                  <div className="bg-[#061B33]/80 border border-[#4B9FE8]/25 p-3.5 rounded-xl text-center min-w-[92px]">
                    <Wind className="w-5 h-5 text-[#36D6E8] mx-auto mb-1" />
                    <span className="text-xs text-[#A7C2D8]">풍속</span>
                    <p className="text-base font-bold text-[#F4FAFF] tabular-nums">
                      {weatherData ? `${weatherData.windSpeedMs.toFixed(1)} m/s` : '--'}
                    </p>
                  </div>
                  <div className="bg-[#061B33]/80 border border-[#4B9FE8]/25 p-3.5 rounded-xl text-center min-w-[92px]">
                    <Waves className="w-5 h-5 text-[#4B9FE8] mx-auto mb-1" />
                    <span className="text-xs text-[#A7C2D8]">파고</span>
                    <p className="text-base font-bold text-[#F4FAFF] tabular-nums">
                      {weatherData?.waveHeightM !== null && typeof weatherData?.waveHeightM === 'number'
                        ? `${weatherData.waveHeightM.toFixed(1)} m`
                        : '--'}
                    </p>
                  </div>
                  <div className="bg-[#061B33]/80 border border-[#36D6E8]/30 p-3.5 rounded-xl text-center min-w-[116px]">
                    <Compass className="w-5 h-5 text-[#36D6E8] mx-auto mb-1" />
                    <span className="text-xs text-[#A7C2D8]">물때</span>
                    <p className="text-base font-bold text-[#F4FAFF] tabular-nums">
                      {regionalTide.multaeName.split(' (')[0]} · {regionalTide.currentPhaseText}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tide high/low + Top 3 recommended fishing time windows for map selection */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-3 border-t border-[#4B9FE8]/20">
                {regionalTide.recommendedWindows.map((win, idx) => (
                  <div
                    key={win.timeRange}
                    className={`rounded-xl p-3.5 border ${
                      idx === 0
                        ? 'bg-[#0B2948]/95 border-[#36D6E8]/45'
                        : 'bg-[#061B33]/75 border-[#4B9FE8]/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#F4FAFF] font-mono tabular-nums">{win.timeRange}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          win.badgeTone === 'excellent'
                            ? 'bg-[#36D6E8]/20 text-[#36D6E8]'
                            : win.badgeTone === 'good'
                            ? 'bg-[#4B9FE8]/20 text-[#4B9FE8]'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {win.rating} ({win.score}점)
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[#36D6E8] mt-1">{win.title}</p>
                    <p className="text-[11px] text-[#A7C2D8] mt-0.5">{win.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}



        {/* ================= TAB 5: MARINE PROTECTION & GUIDE ================= */}
        {activeTab === 'guide' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-[#36D6E8]" /> 해양생물 보호 및 올바른 낚시 가이드
              </h3>
              <p className="text-sm text-[#A7C2D8]">
                지속 가능한 바다낚시 문화를 위해 해양보호생물(포획 전면 금지)과 수산자원관리법상 포획 제한 대상(금어기·금지체장)을 명확히 구분해 준수해 주세요.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#103653]/85 backdrop-blur-md border border-[#36D6E8]/30 rounded-xl p-6 space-y-4 shadow">
                <h4 className="text-lg font-bold text-[#36D6E8] flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> 1. 보호 대상 (해양보호생물) 및 올바른 방생
                </h4>
                <ul className="space-y-3 text-xs text-[#A7C2D8]">
                  <li>
                    <strong className="text-[#F4FAFF]">포획 전면 금지 대상:</strong> 해마, 남방해마, 점박이물범, 바다거북, 나팔고둥 등 해양생태계법상 해양보호생물로 지정된 종은 크기·시기와 무관하게 포획·채취가 엄격히 금지됩니다.
                  </li>
                  <li>
                    <strong className="text-[#F4FAFF]">우연한 포획 시 대처:</strong> 낚시 중 보호생물이 걸렸다면 물속에서 젖은 손이나 전용 포셉으로 바늘을 조심스레 제거한 뒤 즉시 바다로 돌려보내야 합니다.
                  </li>
                  <li>
                    <strong className="text-[#F4FAFF]">미확인 생물·치어 보호:</strong> 정체를 알 수 없는 희귀 생물이나 산란기 어미 고기, 어린 치어는 무리하게 보관하지 말고 즉시 방생해 주세요.
                  </li>
                </ul>
              </div>

              <div className="bg-[#103653]/85 backdrop-blur-md border border-amber-500/30 rounded-xl p-6 space-y-4 shadow">
                <h4 className="text-lg font-bold text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> 2. 포획 제한 대상 (금어기 · 금지체장)
                </h4>
                <ul className="space-y-3 text-xs text-[#A7C2D8]">
                  <li>
                    <strong className="text-[#F4FAFF]">넙치(광어):</strong> 금지체장 35cm 이하 포획 금지 (수산자원관리법 기준). 지자체·업종별 금어기는 최신 고시 확인 필요.
                  </li>
                  <li>
                    <strong className="text-[#F4FAFF]">참돔·감성돔:</strong> 감성돔 25cm 이하 금지체장 및 5월 산란기 금어기 규정 확인 필요.
                  </li>
                  <li>
                    <strong className="text-[#F4FAFF]">돌돔:</strong> 금지체장 24cm 이하 포획 금지, 5/1 ~ 6/30 금어기(일부 세부 규정은 공식 정보 확인 필요).
                  </li>
                  <li className="text-amber-300">
                    ※ 법적 세부 기준은 해양수산부 및 국가법령정보센터의 최신 고시·공식 정보를 반드시 확인하시기 바랍니다.
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-6 bg-[#0B2948]/90 border border-[#4B9FE8]/30 rounded-2xl space-y-3">
              <h4 className="text-base font-bold text-[#F4FAFF]">낚시터 환경 지키기 및 안전 실천 수칙</h4>
              <p className="text-xs text-[#A7C2D8] leading-relaxed">
                1. 낚시 중에 발생한 쓰레기(낚싯줄, 바늘, 밑밥 봉투, 플라스틱 병 등)는 반드시 되가져가 주세요.
                <br />
                2. 테트라포드 및 갯바위 안전사고 예방을 위해 구명조끼와 갯바위 전용 신발을 반드시 착용하세요.
                <br />
                3. 야간 낚시 시 안전등과 호각을 지참하고, 한국 시간(KST) 기준 만조·기상 특보 발효 시 즉시 철수하세요.
              </p>
            </div>
          </div>
        )}

        {/* ================= TAB 6: CATCH DIARY ================= */}
        {activeTab === 'diary' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
                  <FileText className="w-6 h-6 text-[#36D6E8]" /> 나만의 조과 기록장 (한국 시간 KST 기준)
                </h3>
                <p className="text-sm text-[#A7C2D8]">
                  내가 잡은 물고기와 방생 여부를 체계적으로 기록하고 수정·관리하세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() => openNewDiaryModal()}
                className="min-h-[44px] px-5 py-2.5 btn-cyan-gradient font-bold rounded-xl shadow transition-all flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> 새로운 조과 기록 추가
              </button>
            </div>

            {/* Add / Edit Log Modal */}
            {isAddingLog && (
              <div className="fixed inset-0 z-50 bg-[#04101f]/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#0B2948] border border-[#4B9FE8]/35 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative animate-fadeIn">
                  <button
                    type="button"
                    aria-label="조과 입력 창 닫기"
                    onClick={() => {
                      setIsAddingLog(false);
                      setEditingLogId(null);
                    }}
                    className="absolute top-4 right-4 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#A7C2D8] hover:text-[#F4FAFF]"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <h3 className="text-lg font-bold text-[#F4FAFF]">
                    {editingLogId ? '조과 기록 수정' : '새로운 조과 기록 등록'}
                  </h3>

                  <form onSubmit={handleSaveDiaryForm} className="space-y-4">
                    <div>
                      <label htmlFor="diary-species" className="block text-xs font-medium text-[#A7C2D8] mb-1">
                        어종명 (사용자 최종 확인)
                      </label>
                      <input
                        id="diary-species"
                        type="text"
                        required
                        value={newLogData.speciesName}
                        onChange={(e) => setNewLogData({ ...newLogData, speciesName: e.target.value })}
                        className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF]"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[11px] text-[#A7C2D8] self-center mr-1">자주 잡히는 어종:</span>
                        {['참돔', '우럭', '광어', '감성돔', '고등어', '전갱이', '볼락', '쭈꾸미'].map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => setNewLogData({ ...newLogData, speciesName: sp })}
                            className={`px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                              newLogData.speciesName === sp
                                ? 'btn-cyan-gradient border-[#36D6E8] font-bold'
                                : 'bg-[#061B33] text-[#A7C2D8] border-[#4B9FE8]/25 hover:text-[#F4FAFF]'
                            }`}
                          >
                            {sp}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="diary-date" className="block text-xs font-medium text-[#A7C2D8] mb-1">
                          포획 날짜 (KST)
                        </label>
                        <input
                          id="diary-date"
                          type="date"
                          required
                          value={newLogData.date}
                          onChange={(e) => setNewLogData({ ...newLogData, date: e.target.value })}
                          className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF]"
                        />
                      </div>
                      <div>
                        <label htmlFor="diary-size" className="block text-xs font-medium text-[#A7C2D8] mb-1">
                          크기 (cm)
                        </label>
                        <input
                          id="diary-size"
                          type="number"
                          min={1}
                          required
                          value={newLogData.size}
                          onChange={(e) => setNewLogData({ ...newLogData, size: Number(e.target.value) })}
                          className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="diary-location" className="block text-xs font-medium text-[#A7C2D8]">
                          낚시 장소
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setNewLogData({ ...newLogData, location: activeLocation.label })
                          }
                          className="text-[11px] text-[#36D6E8] hover:underline font-semibold"
                        >
                          현재 선택 위치 넣기
                        </button>
                      </div>
                      <input
                        id="diary-location"
                        type="text"
                        required
                        value={newLogData.location}
                        onChange={(e) => setNewLogData({ ...newLogData, location: e.target.value })}
                        className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF]"
                      />
                    </div>

                    <div className="flex items-center gap-3 bg-[#061B33]/80 p-3 rounded-xl border border-[#4B9FE8]/25">
                      <input
                        type="checkbox"
                        id="releasedCheck"
                        checked={newLogData.released}
                        onChange={(e) => setNewLogData({ ...newLogData, released: e.target.checked })}
                        className="w-4 h-4 accent-[#36D6E8]"
                      />
                      <label htmlFor="releasedCheck" className="text-xs font-medium text-[#36D6E8] cursor-pointer">
                        방생 여부 (Catch &amp; Release - 자원 보호를 위해 살려줌)
                      </label>
                    </div>

                    <div>
                      <label htmlFor="diary-memo" className="block text-xs font-medium text-[#A7C2D8] mb-1">
                        조과 메모 및 채비 팁
                      </label>
                      <textarea
                        id="diary-memo"
                        rows={3}
                        value={newLogData.memo}
                        onChange={(e) => setNewLogData({ ...newLogData, memo: e.target.value })}
                        placeholder="입질 시간, 수심, 미끼 종류 등을 기록하세요..."
                        className="w-full bg-[#061B33] border border-[#4B9FE8]/30 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF]"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingLog(false);
                          setEditingLogId(null);
                        }}
                        className="flex-1 min-h-[44px] py-2.5 bg-[#103653] hover:bg-[#174a70] text-[#A7C2D8] border border-[#4B9FE8]/25 rounded-xl text-xs font-bold"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        className="flex-1 min-h-[44px] py-2.5 btn-cyan-gradient rounded-xl text-xs font-bold shadow"
                      >
                        {editingLogId ? '수정 저장하기' : '기록 저장하기'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Logs List */}
            {catchLogs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {catchLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl overflow-hidden shadow-md flex flex-col justify-between"
                  >
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-xs text-[#A7C2D8]">
                            {log.date} · {log.location}
                          </span>
                          <h4 className="text-xl font-bold text-[#F4FAFF] mt-0.5">
                            {log.userConfirmedName || log.speciesName}
                          </h4>
                          {log.aiConfidence && log.speciesName !== log.userConfirmedName && (
                            <p className="text-[11px] text-[#36D6E8]">
                              AI 판별 원안: {log.speciesName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {log.released ? (
                            <span className="text-xs text-emerald-300 font-bold">
                              방생함 (C&amp;R)
                            </span>
                          ) : (
                            <span className="text-xs text-[#36D6E8] font-bold tabular-nums">
                              {log.size}cm 킵
                            </span>
                          )}
                        </div>
                      </div>

                      {log.photoUrl && (
                        <div className="h-40 rounded-lg overflow-hidden border border-[#4B9FE8]/25 bg-[#061B33]">
                          <img
                            src={log.photoUrl}
                            alt={log.userConfirmedName || log.speciesName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <p className="text-xs text-[#A7C2D8] bg-[#061B33]/65 border border-[#4B9FE8]/15 p-3 rounded-lg leading-relaxed">
                        {log.memo || '등록된 메모가 없습니다.'}
                      </p>
                    </div>

                    <div className="px-5 py-3 bg-[#061B33]/75 border-t border-[#4B9FE8]/20 flex items-center justify-between text-xs gap-2">
                      <span className="text-[#A7C2D8]">
                        {log.aiConfidence ? `AI 판별 (신뢰도 ${log.aiConfidence}%)` : '수동 등록 기록'}
                      </span>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditDiaryModal(log)}
                          className="text-[#36D6E8] hover:underline font-medium px-2 py-1"
                        >
                          수정
                        </button>

                        {confirmDeleteId === log.id ? (
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteLog(log.id)}
                              className="text-red-400 hover:text-red-300 font-bold px-2 py-1"
                            >
                              삭제 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[#A7C2D8] hover:text-[#F4FAFF] px-1 py-1"
                            >
                              취소
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(log.id)}
                            aria-label={`${log.userConfirmedName || log.speciesName} 기록 삭제`}
                            className="text-red-400 hover:text-red-300 flex items-center gap-1 font-medium px-2 py-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 삭제
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-[#103653]/50 border border-[#4B9FE8]/20 rounded-2xl text-[#A7C2D8] space-y-3">
                <FileText className="w-12 h-12 mx-auto stroke-1 text-[#4B9FE8]/60" />
                <p className="text-sm">
                  등록된 조과 기록이 없습니다.
                  <br />
                  [새로운 조과 기록 추가] 버튼을 눌러 기록을 시작하세요!
                </p>
              </div>
            )}
          </div>
        )}
        {/* ================= TAB 6: MESSENGER (OPEN, PRIVATE & 1:1 DM) ================= */}
        {activeTab === 'messenger' && (
          <MessengerSection
            currentUser={currentUser}
            userNickname={userNickname}
            nicknameSet={nicknameSet}
            onOpenNicknameModal={openNicknameModal}
            authLoading={authLoading}
            authError={authError}
            onGoogleLogin={handleGoogleLogin}
            onGoogleLogout={handleGoogleLogout}
            activeSpotLabel={activeLocation.label}
            activeRegion={activeLocation.region}
            prefilledShareSpot={prefilledShareSpot}
            onClearPrefilledShareSpot={() => setPrefilledShareSpot(null)}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="모바일 하단 메뉴"
        className="lg:hidden fixed bottom-0 left-0 right-0 nav-glass-bottom z-40 grid grid-cols-5 items-center h-16 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
            activeTab === 'home' ? 'text-[#36D6E8] font-bold' : 'text-[#A7C2D8]'
          }`}
        >
          <Star className="w-5 h-5" />
          <span>홈·추천</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('identify')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
            activeTab === 'identify' ? 'text-[#36D6E8] font-bold' : 'text-[#A7C2D8]'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span>AI·검색</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('spots')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
            activeTab === 'spots' ? 'text-[#36D6E8] font-bold' : 'text-[#A7C2D8]'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span>지도</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('messenger')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
            activeTab === 'messenger' ? 'text-[#36D6E8] font-bold' : 'text-[#A7C2D8]'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>메신저</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('diary')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
            activeTab === 'diary' ? 'text-[#36D6E8] font-bold' : 'text-[#A7C2D8]'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span>기록장</span>
        </button>
      </nav>
    </div>
  );
}
