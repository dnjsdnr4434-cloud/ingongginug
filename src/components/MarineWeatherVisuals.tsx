import React, { useMemo, useState } from 'react';
import {
  Wind,
  Waves,
  Thermometer,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  Snowflake,
  RefreshCw,
} from 'lucide-react';
import {
  FishingWeatherData,
  MarineHourlyPoint,
  assessSeaTemperature,
  assessWaveLevel,
  assessWindLevel,
  buildChartPoints,
  createExampleHourlySeries,
  describeWeatherCode,
  describeWindDirection,
} from '../utils/fishingRating';
import { getKstParts } from '../utils/koreaTime';
import type { LocationSource } from '../utils/geo';

interface MarineWeatherVisualsProps {
  locationLabel: string;
  regionLabel: string;
  locationSource?: LocationSource;
  weather: FishingWeatherData | null;
  isLoading: boolean;
  onRefresh: () => void;
}

type ChartMetricTab = 'overview' | 'wind' | 'wave' | 'temp' | 'rain';

function WeatherConditionGlyph({ code, className }: { code: number; className?: string }) {
  if (code >= 95) return <CloudLightning className={className} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <Snowflake className={className} />;
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className={className} />;
  }
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if (code >= 2) return <Cloud className={className} />;
  return <Sun className={className} />;
}

function pointsToLinePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function pointsToAreaPath(pts: Array<{ x: number; y: number }>, baselineY: number): string {
  if (pts.length === 0) return '';
  const line = pointsToLinePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function levelTextColor(tone: string): string {
  switch (tone) {
    case 'calm':
    case 'optimal':
    case 'cool':
      return 'text-[#36D6E8]';
    case 'moderate':
    case 'warm':
      return 'text-amber-300';
    case 'caution':
      return 'text-orange-300';
    case 'danger':
      return 'text-rose-300';
    default:
      return 'text-[#A7C2D8]';
  }
}

export function MarineWeatherVisuals({
  locationLabel,
  regionLabel,
  locationSource = 'device-ip',
  weather,
  isLoading,
  onRefresh,
}: MarineWeatherVisualsProps) {
  const [chartTab, setChartTab] = useState<ChartMetricTab>('overview');
  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(0);

  const isMapSelected = locationSource === 'map-click' || locationSource === 'spot';

  const series: MarineHourlyPoint[] = useMemo(() => {
    if (!weather) return [];
    if (Array.isArray(weather.hourlySeries) && weather.hourlySeries.length > 0) {
      return weather.hourlySeries;
    }
    return createExampleHourlySeries(weather, Number(getKstParts().hour));
  }, [weather]);

  const activeIndex = Math.min(selectedHourIdx, Math.max(0, series.length - 1));
  const selectedPoint = series[activeIndex] ?? null;

  const windAssessment = weather
    ? assessWindLevel(weather.windSpeedMs, weather.windGustsMs)
    : assessWindLevel(0);
  const waveAssessment = assessWaveLevel(weather?.waveHeightM);
  const sstAssessment = assessSeaTemperature(weather?.seaSurfaceTempC);

  const weatherText = weather ? describeWeatherCode(weather.weatherCode) : '확인 중';
  const windDirText = weather ? describeWindDirection(weather.windDirectionDeg) : '--';
  const waveDirText =
    weather && typeof weather.waveDirectionDeg === 'number'
      ? describeWindDirection(weather.waveDirectionDeg)
      : null;

  const airTempPercent = weather
    ? Math.max(0, Math.min(100, ((weather.temperatureC - -5) / (35 - -5)) * 100))
    : 0;
  const rainProb =
    weather && typeof weather.precipitationProb === 'number' ? weather.precipitationProb : 0;

  const SVG_W = 760;
  const SVG_H = 220;
  const PAD = { top: 18, right: 20, bottom: 28, left: 40 };
  const BASELINE_Y = SVG_H - PAD.bottom;

  const chartData = useMemo(() => {
    if (series.length === 0) {
      return {
        minLabel: '0',
        midLabel: '5',
        maxLabel: '10',
        unit: '',
        primaryPoints: [] as ReturnType<typeof buildChartPoints>,
        secondaryPoints: [] as ReturnType<typeof buildChartPoints>,
        thresholdY: null as number | null,
        thresholdLabel: '',
        primaryLabel: '',
        secondaryLabel: '',
        primaryStroke: '#36D6E8',
        secondaryStroke: '#4B9FE8',
      };
    }

    if (chartTab === 'wind') {
      const winds = series.map((p) => p.windSpeedMs);
      const gusts = series.map((p) => p.windGustsMs);
      const maxRaw = Math.max(
        10,
        ...winds,
        ...gusts.filter((v): v is number => typeof v === 'number')
      );
      const maxVal = Math.ceil(maxRaw / 2) * 2;
      const primaryPoints = buildChartPoints(winds, SVG_W, SVG_H, 0, maxVal, PAD);
      const secondaryPoints = buildChartPoints(gusts, SVG_W, SVG_H, 0, maxVal, PAD);
      const refRatio = Math.min(1, 6 / maxVal);
      const thresholdY = Number(
        (PAD.top + (1 - refRatio) * (SVG_H - PAD.top - PAD.bottom)).toFixed(1)
      );
      return {
        minLabel: '0',
        midLabel: `${(maxVal / 2).toFixed(0)}`,
        maxLabel: `${maxVal}`,
        unit: 'm/s',
        primaryPoints,
        secondaryPoints,
        thresholdY,
        thresholdLabel: '초보 안전 바람 기준 6.0 m/s',
        primaryLabel: '평균 풍속 (m/s)',
        secondaryLabel: '순간 돌풍 (m/s)',
        primaryStroke: '#36D6E8',
        secondaryStroke: '#4B9FE8',
      };
    }

    if (chartTab === 'wave') {
      const waves = series.map((p) => p.waveHeightM);
      const validWaves = waves.filter((v): v is number => typeof v === 'number');
      const maxRaw = validWaves.length > 0 ? Math.max(1.5, ...validWaves) : 1.5;
      const maxVal = Number((Math.ceil(maxRaw * 2) / 2).toFixed(1));
      const primaryPoints = buildChartPoints(waves, SVG_W, SVG_H, 0, maxVal, PAD);
      const refRatio = Math.min(1, 1.0 / maxVal);
      const thresholdY = Number(
        (PAD.top + (1 - refRatio) * (SVG_H - PAD.top - PAD.bottom)).toFixed(1)
      );
      return {
        minLabel: '0.0',
        midLabel: (maxVal / 2).toFixed(1),
        maxLabel: maxVal.toFixed(1),
        unit: 'm',
        primaryPoints,
        secondaryPoints: [],
        thresholdY,
        thresholdLabel: '초보 방파제 안전 파고 기준 1.0 m',
        primaryLabel: '예상 파고 (m)',
        secondaryLabel: '',
        primaryStroke: '#36D6E8',
        secondaryStroke: '#4B9FE8',
      };
    }

    if (chartTab === 'temp') {
      const airTemps = series.map((p) => p.temperatureC);
      const seaTemps = series.map((p) => p.seaSurfaceTempC);
      const all = [...airTemps, ...seaTemps.filter((v): v is number => typeof v === 'number')];
      const minVal = Math.floor(Math.min(...all) - 2);
      const maxVal = Math.ceil(Math.max(...all) + 2);
      const primaryPoints = buildChartPoints(seaTemps, SVG_W, SVG_H, minVal, maxVal, PAD);
      const secondaryPoints = buildChartPoints(airTemps, SVG_W, SVG_H, minVal, maxVal, PAD);
      return {
        minLabel: `${minVal}`,
        midLabel: `${((minVal + maxVal) / 2).toFixed(0)}`,
        maxLabel: `${maxVal}`,
        unit: '°C',
        primaryPoints,
        secondaryPoints,
        thresholdY: null,
        thresholdLabel: '',
        primaryLabel: '표층 수온 (°C)',
        secondaryLabel: '기온 (°C)',
        primaryStroke: '#36D6E8',
        secondaryStroke: '#4B9FE8',
      };
    }

    if (chartTab === 'rain') {
      const probs = series.map((p) => p.precipitationProb ?? 0);
      const primaryPoints = buildChartPoints(probs, SVG_W, SVG_H, 0, 100, PAD);
      return {
        minLabel: '0',
        midLabel: '50',
        maxLabel: '100',
        unit: '%',
        primaryPoints,
        secondaryPoints: [],
        thresholdY: null,
        thresholdLabel: '',
        primaryLabel: '강수 확률 (%)',
        secondaryLabel: '',
        primaryStroke: '#4B9FE8',
        secondaryStroke: '#36D6E8',
      };
    }

    const winds = series.map((p) => p.windSpeedMs);
    const scaledWaves = series.map((p) =>
      typeof p.waveHeightM === 'number' ? Number((p.waveHeightM * 5).toFixed(2)) : null
    );
    const maxRaw = Math.max(
      12,
      ...winds,
      ...scaledWaves.filter((v): v is number => typeof v === 'number')
    );
    const maxVal = Math.ceil(maxRaw / 2) * 2;
    const primaryPoints = buildChartPoints(winds, SVG_W, SVG_H, 0, maxVal, PAD);
    const secondaryPoints = buildChartPoints(scaledWaves, SVG_W, SVG_H, 0, maxVal, PAD);
    const refRatio = Math.min(1, 6 / maxVal);
    const thresholdY = Number(
      (PAD.top + (1 - refRatio) * (SVG_H - PAD.top - PAD.bottom)).toFixed(1)
    );
    return {
      minLabel: '0',
      midLabel: `${(maxVal / 2).toFixed(0)}`,
      maxLabel: `${maxVal}`,
      unit: 'm/s',
      primaryPoints,
      secondaryPoints,
      thresholdY,
      thresholdLabel: '안전 풍속 6m/s · 파고(×5환산) 비교선',
      primaryLabel: '풍량·풍속 (m/s)',
      secondaryLabel: '파고 환산 (파고m × 5)',
      primaryStroke: '#36D6E8',
      secondaryStroke: '#4B9FE8',
    };
  }, [series, chartTab]);

  const waveAmplitude =
    weather && typeof weather.waveHeightM === 'number'
      ? Math.max(4, Math.min(26, weather.waveHeightM * 11))
      : 5;

  return (
    <section
      id="marine-weather-visuals"
      data-testid="marine-weather-visuals"
      aria-label="풍량·날씨·파고·수온 해황 시각화"
      className="glass-card rounded-2xl p-5 sm:p-6 space-y-6"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4B9FE8]/20 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#A7C2D8]">
            <span className="font-semibold text-[#36D6E8]">
              {isMapSelected ? '지도 선택 지역 기상 · 해황' : '내 기기 위치 기상 · 해황'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-[#F4FAFF] font-semibold">
              {locationLabel} ({regionLabel})
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {weather
                ? `${weather.modelLabel || '기상청(KMA) 보정 KST'}${
                    weather.observedAtKst ? ` · ${weather.observedAtKst}` : ''
                  }`
                : '대한민국(KST) 기상 연동 중'}
            </span>
            {weather?.marineReferenceLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#4B9FE8] font-medium">{weather.marineReferenceLabel}</span>
              </>
            )}
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-[#F4FAFF]">
            풍량 · 날씨 · 파고 · 수온 현황 및 12시간 해양 추이
          </h3>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="min-h-[40px] px-3.5 py-2 rounded-xl glass-subcard hover:border-[#36D6E8]/50 text-[#36D6E8] text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-center transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          해황 새로고침
        </button>
      </div>

      {/* 4 Visual Metric Cards */}
      {weather ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* 1. 풍량 & 풍향 */}
          <div className="glass-subcard rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#A7C2D8] flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-[#36D6E8]" /> 풍량 · 풍향
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold font-mono tabular-nums text-[#F4FAFF]">
                    {weather.windSpeedMs.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-[#A7C2D8]">m/s</span>
                </div>
                <p className={`text-xs font-semibold ${levelTextColor(windAssessment.tone)}`}>
                  {windAssessment.label} · {windDirText} ({Math.round(weather.windDirectionDeg)}°)
                </p>
              </div>

              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                aria-label={`풍향 나침반 ${windDirText} ${Math.round(weather.windDirectionDeg)}도`}
                className="shrink-0"
              >
                <circle
                  cx="32"
                  cy="32"
                  r="27"
                  fill="rgba(16, 54, 83, 0.55)"
                  stroke="rgba(75, 159, 232, 0.38)"
                  strokeWidth="1.5"
                />
                <text x="32" y="12" textAnchor="middle" fill="#A7C2D8" fontSize="8" fontWeight="700">
                  N
                </text>
                <text x="54" y="35" textAnchor="middle" fill="#6b8fad" fontSize="7">
                  E
                </text>
                <text x="32" y="57" textAnchor="middle" fill="#6b8fad" fontSize="7">
                  S
                </text>
                <text x="10" y="35" textAnchor="middle" fill="#6b8fad" fontSize="7">
                  W
                </text>
                <g transform={`rotate(${weather.windDirectionDeg} 32 32)`}>
                  <line x1="32" y1="45" x2="32" y2="17" stroke="#36D6E8" strokeWidth="2.5" strokeLinecap="round" />
                  <polygon points="32,12 27,21 37,21" fill="#36D6E8" />
                </g>
              </svg>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#A7C2D8] font-mono tabular-nums">
                <span>0 m/s</span>
                <span>
                  {typeof weather.windGustsMs === 'number'
                    ? `돌풍 ${weather.windGustsMs.toFixed(1)} m/s`
                    : '돌풍 정보 없음'}
                </span>
                <span>15+</span>
              </div>
              <div className="h-2 rounded-full bg-[#061B33] overflow-hidden border border-[#4B9FE8]/25">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#36D6E8] via-[#4B9FE8] to-amber-400 transition-all duration-300"
                  style={{ width: `${Math.max(4, windAssessment.percentScale)}%` }}
                />
              </div>
              <p className="text-[11px] text-[#A7C2D8] leading-snug">{windAssessment.advice}</p>
            </div>
          </div>

          {/* 2. 날씨 · 기온 */}
          <div className="glass-subcard rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#A7C2D8] flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-[#4B9FE8]" /> 날씨 · 기온
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold font-mono tabular-nums text-[#F4FAFF]">
                    {weather.temperatureC.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-[#A7C2D8]">°C</span>
                </div>
                <p className="text-xs font-semibold text-[#36D6E8]">
                  {weatherText} · 강수량 {weather.precipitationMm.toFixed(1)} mm
                </p>
              </div>

              <div className="w-14 h-14 rounded-xl bg-[#103653]/80 border border-[#4B9FE8]/30 flex items-center justify-center shrink-0">
                <WeatherConditionGlyph code={weather.weatherCode} className="w-8 h-8 text-[#36D6E8]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#A7C2D8] font-mono tabular-nums">
                <span>체감 기온 (-5°~35°C)</span>
                <span className="text-[#4B9FE8]">강수확률 {rainProb}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#061B33] overflow-hidden border border-[#4B9FE8]/25">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4B9FE8] via-[#36D6E8] to-amber-400 transition-all duration-300"
                  style={{ width: `${Math.max(6, airTempPercent)}%` }}
                />
              </div>
              <p className="text-[11px] text-[#A7C2D8] leading-snug">
                {rainProb >= 50
                  ? '비 예보가 있어 방수 방한복과 미끄럼 방지 신발을 챙기세요'
                  : weather.temperatureC <= 8
                  ? '해풍 체감온도가 낮으므로 보온 장갑·방풍 외투를 권장합니다'
                  : '야외 활동과 출조에 쾌적한 하늘과 기온 흐름입니다'}
              </p>
            </div>
          </div>

          {/* 3. 연안 파고 */}
          <div className="glass-subcard rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#A7C2D8] flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-[#36D6E8]" /> 연안 파고
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold font-mono tabular-nums text-[#F4FAFF]">
                    {weather.waveHeightM !== null ? weather.waveHeightM.toFixed(2) : '--'}
                  </span>
                  <span className="text-xs font-mono text-[#A7C2D8]">
                    {weather.waveHeightM !== null ? 'm' : '관측 없음'}
                  </span>
                </div>
                <p className={`text-xs font-semibold ${levelTextColor(waveAssessment.tone)}`}>
                  {waveAssessment.label}
                  {typeof weather.wavePeriodSec === 'number'
                    ? ` · 주기 ${weather.wavePeriodSec.toFixed(1)}s`
                    : ''}
                  {waveDirText ? ` · ${waveDirText}` : ''}
                </p>
              </div>

              <svg
                width="76"
                height="56"
                viewBox="0 0 76 56"
                aria-label="파고 파형 시각화"
                className="shrink-0 rounded-lg bg-[#061B33] border border-[#4B9FE8]/25"
              >
                <line
                  x1="0"
                  y1="28"
                  x2="76"
                  y2="28"
                  stroke="rgba(167,194,216,0.22)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <path
                  d={`M 0 32 Q 19 ${32 - waveAmplitude} 38 32 T 76 32 L 76 56 L 0 56 Z`}
                  fill="rgba(54, 214, 232, 0.25)"
                />
                <path
                  d={`M 0 32 Q 19 ${32 - waveAmplitude} 38 32 T 76 32`}
                  fill="none"
                  stroke="#36D6E8"
                  strokeWidth="2"
                />
              </svg>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#A7C2D8] font-mono tabular-nums">
                <span>0.0 m</span>
                <span className="text-[#36D6E8]">초보 적정 &lt; 1.0 m</span>
                <span>2.5+</span>
              </div>
              <div className="h-2 rounded-full bg-[#061B33] overflow-hidden border border-[#4B9FE8]/25">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#36D6E8] via-[#4B9FE8] to-rose-400 transition-all duration-300"
                  style={{
                    width:
                      weather.waveHeightM !== null
                        ? `${Math.max(4, waveAssessment.percentScale)}%`
                        : '0%',
                  }}
                />
              </div>
              <p className="text-[11px] text-[#A7C2D8] leading-snug">{waveAssessment.advice}</p>
            </div>
          </div>

          {/* 4. 표층 수온 */}
          <div className="glass-subcard rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#A7C2D8] flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-[#4B9FE8]" /> 표층 수온
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-2xl font-extrabold font-mono tabular-nums text-[#F4FAFF]"
                    data-testid="sea-surface-temp-value"
                  >
                    {typeof weather.seaSurfaceTempC === 'number'
                      ? weather.seaSurfaceTempC.toFixed(1)
                      : '--'}
                  </span>
                  <span className="text-xs font-mono text-[#A7C2D8]">
                    {typeof weather.seaSurfaceTempC === 'number' ? '°C' : '관측 없음'}
                  </span>
                </div>
                <p className={`text-xs font-semibold ${levelTextColor(sstAssessment.tone)}`}>
                  {sstAssessment.zoneLabel}
                </p>
              </div>

              <svg
                width="44"
                height="60"
                viewBox="0 0 44 60"
                aria-label="표층 수온 게이지"
                className="shrink-0"
              >
                <defs>
                  <linearGradient id="sstGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#4B9FE8" />
                    <stop offset="55%" stopColor="#36D6E8" />
                    <stop offset="85%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                <rect
                  x="16"
                  y="6"
                  width="12"
                  height="38"
                  rx="6"
                  fill="#061B33"
                  stroke="rgba(75,159,232,0.4)"
                  strokeWidth="1.2"
                />
                <rect
                  x="18.5"
                  y={
                    typeof weather.seaSurfaceTempC === 'number'
                      ? 41 - (sstAssessment.percentScale / 100) * 32
                      : 38
                  }
                  width="7"
                  height={
                    typeof weather.seaSurfaceTempC === 'number'
                      ? Math.max(4, (sstAssessment.percentScale / 100) * 32)
                      : 3
                  }
                  rx="3.5"
                  fill="url(#sstGrad)"
                />
                <circle
                  cx="22"
                  cy="47"
                  r="8"
                  fill={typeof weather.seaSurfaceTempC === 'number' ? '#36D6E8' : '#1e4a6d'}
                  stroke="#061B33"
                  strokeWidth="2"
                />
              </svg>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#A7C2D8] font-mono tabular-nums">
                <span>4°C</span>
                <span className="text-[#36D6E8]">적온 15~23°C</span>
                <span>30°C</span>
              </div>
              <div className="relative h-2 rounded-full bg-gradient-to-r from-[#4B9FE8] via-[#36D6E8] to-amber-400 border border-[#4B9FE8]/25">
                {typeof weather.seaSurfaceTempC === 'number' && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#F4FAFF] border-2 border-[#061B33] shadow"
                    style={{ left: `${sstAssessment.percentScale}%` }}
                  />
                )}
              </div>
              <p className="text-[11px] text-[#A7C2D8] leading-snug">
                {sstAssessment.targetSpeciesHint}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-6 text-xs text-[#A7C2D8]">
          해역 기상 및 해양 관측 데이터를 불러오는 중입니다...
        </div>
      )}

      {/* 12-Hour Interactive Marine Time-Series Visualization */}
      {series.length > 0 && (
        <div className="glass-subcard rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm sm:text-base font-bold text-[#F4FAFF]">
                앞으로 12시간 풍량 · 파고 · 수온 · 날씨 추이 (한국 시간 KST)
              </h4>
              <p className="text-xs text-[#A7C2D8] mt-0.5">
                시간대 버튼을 누르거나 그래프를 선택해 선택 지역 시간별 해양 변화를 확인하세요.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="해황 그래프 지표 선택"
              className="flex flex-wrap items-center gap-1 p-1 bg-[#061B33] border border-[#4B9FE8]/25 rounded-xl self-start"
            >
              {(
                [
                  { id: 'overview', label: '전체 추이' },
                  { id: 'wind', label: '풍량 (m/s)' },
                  { id: 'wave', label: '파고 (m)' },
                  { id: 'temp', label: '수온·기온 (°C)' },
                  { id: 'rain', label: '강수확률 (%)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={chartTab === tab.id}
                  onClick={() => setChartTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    chartTab === tab.id
                      ? 'btn-cyan-gradient'
                      : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {selectedPoint && (
            <div
              data-testid="hourly-inspection-hud"
              className="bg-[#061B33]/85 border border-[#4B9FE8]/25 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs"
            >
              <div className="flex items-center gap-2 font-bold text-[#F4FAFF]">
                <WeatherConditionGlyph code={selectedPoint.weatherCode} className="w-4 h-4 text-[#36D6E8]" />
                <span className="font-mono tabular-nums text-[#36D6E8]">{selectedPoint.hourLabel} KST</span>
                <span>{describeWeatherCode(selectedPoint.weatherCode)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[#F4FAFF]">
                <span>
                  풍량 <strong className="text-[#36D6E8]">{selectedPoint.windSpeedMs.toFixed(1)}m/s</strong>
                  {typeof selectedPoint.windGustsMs === 'number' && (
                    <span className="text-[#A7C2D8]"> (돌풍 {selectedPoint.windGustsMs.toFixed(1)})</span>
                  )}
                </span>
                <span>
                  파고{' '}
                  <strong className="text-[#36D6E8]">
                    {selectedPoint.waveHeightM !== null ? `${selectedPoint.waveHeightM.toFixed(2)}m` : '--'}
                  </strong>
                </span>
                <span>
                  수온{' '}
                  <strong className="text-[#4B9FE8]">
                    {selectedPoint.seaSurfaceTempC !== null ? `${selectedPoint.seaSurfaceTempC.toFixed(1)}°C` : '--'}
                  </strong>
                </span>
                <span>
                  기온 <strong className="text-amber-300">{selectedPoint.temperatureC.toFixed(1)}°C</strong>
                </span>
                <span>
                  강수{' '}
                  <strong className="text-[#4B9FE8]">
                    {selectedPoint.precipitationProb !== null ? `${selectedPoint.precipitationProb}%` : '--'}
                  </strong>
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A7C2D8]">
            <div className="flex flex-wrap items-center gap-4">
              {chartData.primaryLabel && (
                <span className="inline-flex items-center gap-1.5 text-[#F4FAFF]">
                  <span
                    className="w-3 h-0.5 rounded-full inline-block"
                    style={{ backgroundColor: chartData.primaryStroke }}
                  />
                  {chartData.primaryLabel}
                </span>
              )}
              {chartData.secondaryLabel && chartData.secondaryPoints.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[#A7C2D8]">
                  <span
                    className="w-3 h-0.5 rounded-full inline-block"
                    style={{ backgroundColor: chartData.secondaryStroke }}
                  />
                  {chartData.secondaryLabel}
                </span>
              )}
            </div>
            {chartData.thresholdLabel && (
              <span className="text-amber-300/90">--- {chartData.thresholdLabel}</span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full min-w-[540px] h-auto select-none"
              role="img"
              aria-label="12시간 풍량 파고 수온 날씨 그래프"
            >
              <defs>
                <linearGradient id="marinePrimaryArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartData.primaryStroke} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={chartData.primaryStroke} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[0, 0.5, 1].map((frac, i) => {
                const y = PAD.top + frac * (SVG_H - PAD.top - PAD.bottom);
                const label =
                  i === 0 ? chartData.maxLabel : i === 1 ? chartData.midLabel : chartData.minLabel;
                return (
                  <g key={i}>
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={SVG_W - PAD.right}
                      y2={y}
                      stroke="rgba(75,159,232,0.18)"
                      strokeWidth="1"
                    />
                    <text
                      x={PAD.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      fill="#A7C2D8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {chartData.thresholdY !== null && (
                <line
                  x1={PAD.left}
                  y1={chartData.thresholdY}
                  x2={SVG_W - PAD.right}
                  y2={chartData.thresholdY}
                  stroke="rgba(251, 191, 36, 0.55)"
                  strokeDasharray="5 4"
                  strokeWidth="1.2"
                />
              )}

              {chartData.primaryPoints.length > 0 && (
                <>
                  <path
                    d={pointsToAreaPath(chartData.primaryPoints, BASELINE_Y)}
                    fill="url(#marinePrimaryArea)"
                  />
                  <path
                    d={pointsToLinePath(chartData.primaryPoints)}
                    fill="none"
                    stroke={chartData.primaryStroke}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {chartData.secondaryPoints.length > 0 && (
                <path
                  d={pointsToLinePath(chartData.secondaryPoints)}
                  fill="none"
                  stroke={chartData.secondaryStroke}
                  strokeWidth="2"
                  strokeDasharray="5 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {series.map((pt, idx) => {
                const colX =
                  series.length === 1
                    ? PAD.left + (SVG_W - PAD.left - PAD.right) / 2
                    : PAD.left + (idx / (series.length - 1)) * (SVG_W - PAD.left - PAD.right);
                const p1 = chartData.primaryPoints.find((p) => p.index === idx);
                const p2 = chartData.secondaryPoints.find((p) => p.index === idx);
                const isSelected = idx === activeIndex;

                return (
                  <g
                    key={pt.time || idx}
                    className="cursor-pointer"
                    onMouseEnter={() => setSelectedHourIdx(idx)}
                    onClick={() => setSelectedHourIdx(idx)}
                  >
                    <rect
                      x={colX - 24}
                      y={PAD.top}
                      width={48}
                      height={SVG_H - PAD.top}
                      fill="transparent"
                    />
                    {isSelected && (
                      <line
                        x1={colX}
                        y1={PAD.top}
                        x2={colX}
                        y2={BASELINE_Y}
                        stroke="rgba(54,214,232,0.45)"
                        strokeWidth="1.2"
                      />
                    )}
                    {p1 && (
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={isSelected ? 5 : 3}
                        fill={chartData.primaryStroke}
                        stroke="#061B33"
                        strokeWidth="1.5"
                      />
                    )}
                    {p2 && (
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={isSelected ? 4.5 : 2.5}
                        fill={chartData.secondaryStroke}
                        stroke="#061B33"
                        strokeWidth="1.5"
                      />
                    )}
                    <text
                      x={colX}
                      y={SVG_H - 8}
                      textAnchor="middle"
                      fill={isSelected ? '#36D6E8' : '#A7C2D8'}
                      fontWeight={isSelected ? '700' : '400'}
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {pt.hourLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 pt-1">
            {series.map((pt, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={`btn-${pt.time}-${idx}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedHourIdx(idx)}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-mono tabular-nums transition-all border ${
                    active
                      ? 'btn-cyan-gradient border-[#36D6E8]'
                      : 'bg-[#061B33]/80 text-[#A7C2D8] border-[#4B9FE8]/20 hover:text-[#F4FAFF]'
                  }`}
                >
                  {pt.hourLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
