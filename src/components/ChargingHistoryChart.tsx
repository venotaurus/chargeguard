import React, { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw, Zap } from 'lucide-react';
import { BatteryHistoryPoint } from '../types/battery';

interface ChargingHistoryChartProps {
  history: BatteryHistoryPoint[];
  targetPercent: number;
  darkMode: boolean;
  onResetHistory: () => void;
  onLoadSampleHistory: () => void;
}

interface ChartDatum {
  timestamp: number;
  level: number;
  charging: boolean;
  chargingLevel: number | null;
}

interface ChargingSpan {
  start: number;
  end: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatAxisTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: date.getMinutes() === 0 ? undefined : '2-digit',
  });
}

function formatTooltipTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDurationMs(ms: number): string {
  const totalMins = Math.round(ms / 60000);
  if (totalMins < 1) return '<1m';
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function createSample24hHistory(targetPercent: number, currentLevel: number): BatteryHistoryPoint[] {
  const now = Date.now();
  const cap = Math.max(50, Math.min(100, targetPercent));

  // Realistic 24-hour battery profile with two power-connected charging sessions
  const offsets: Array<{ hoursAgo: number; level: number; charging: boolean }> = [
    { hoursAgo: 24.0, level: 54, charging: false },
    { hoursAgo: 22.0, level: 43, charging: false },
    { hoursAgo: 20.0, level: 32, charging: false },
    { hoursAgo: 18.5, level: 24, charging: false },
    // Session 1: Night / morning charge connected to power
    { hoursAgo: 18.0, level: 22, charging: true },
    { hoursAgo: 17.6, level: Math.round(22 + (cap - 22) * 0.35), charging: true },
    { hoursAgo: 17.2, level: Math.round(22 + (cap - 22) * 0.72), charging: true },
    { hoursAgo: 16.8, level: cap, charging: true },
    // Unplugged daytime drain
    { hoursAgo: 16.5, level: Math.max(10, cap - 2), charging: false },
    { hoursAgo: 14.0, level: Math.max(10, cap - 15), charging: false },
    { hoursAgo: 11.5, level: Math.max(10, cap - 29), charging: false },
    { hoursAgo: 9.0, level: Math.max(10, cap - 42), charging: false },
    { hoursAgo: 7.0, level: Math.max(10, cap - 51), charging: false },
    // Session 2: Afternoon top-up connected to power
    { hoursAgo: 6.5, level: 28, charging: true },
    { hoursAgo: 6.1, level: Math.round(28 + (cap - 28) * 0.45), charging: true },
    { hoursAgo: 5.7, level: Math.round(28 + (cap - 28) * 0.82), charging: true },
    { hoursAgo: 5.4, level: cap, charging: true },
    // Evening drain down to current level
    { hoursAgo: 5.0, level: Math.max(currentLevel, Math.round(cap - (cap - currentLevel) * 0.15)), charging: false },
    { hoursAgo: 3.0, level: Math.max(currentLevel, Math.round(cap - (cap - currentLevel) * 0.55)), charging: false },
    { hoursAgo: 1.2, level: Math.max(currentLevel, Math.round(cap - (cap - currentLevel) * 0.85)), charging: false },
    { hoursAgo: 0.0, level: currentLevel, charging: false },
  ];

  return offsets.map((o) => ({
    timestamp: Math.round(now - o.hoursAgo * HOUR_MS),
    level: Math.max(0, Math.min(100, o.level)),
    charging: o.charging,
  }));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartDatum }>;
}

const CustomChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-[#D4DDD9] dark:border-[#2A3732] bg-white dark:bg-[#131A18] px-3.5 py-2.5 shadow-lg text-xs">
      <p className="text-[#54665F] dark:text-[#93A8A0] font-medium">
        {formatTooltipTime(point.timestamp)}
      </p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="font-mono text-base font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
          {point.level}%
        </span>
        <span
          className={`inline-flex items-center gap-1 font-medium ${
            point.charging
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-[#5E716A] dark:text-[#8DA29A]'
          }`}
        >
          {point.charging && <Zap className="w-3.5 h-3.5 fill-current" aria-hidden="true" />}
          {point.charging ? 'Connected to power' : 'On battery'}
        </span>
      </div>
    </div>
  );
};

export const ChargingHistoryChart: React.FC<ChargingHistoryChartProps> = ({
  history,
  targetPercent,
  darkMode,
  onResetHistory,
  onLoadSampleHistory,
}) => {
  const [viewMode, setViewMode] = useState<'charging_only' | 'full_24h'>('charging_only');

  const { chartData, chargingSpans, totalPowerMs, peakChargingPct, domain, ticks } = useMemo(() => {
    const now = Date.now();
    const cutoff = now - DAY_MS;
    const recent = history
      .filter((pt) => pt.timestamp >= cutoff && pt.timestamp <= now + 60_000)
      .sort((a, b) => a.timestamp - b.timestamp);

    const data: ChartDatum[] = recent.map((pt) => ({
      timestamp: pt.timestamp,
      level: pt.level,
      charging: pt.charging,
      chargingLevel: pt.charging ? pt.level : null,
    }));

    // Build contiguous power-connected spans
    const spans: ChargingSpan[] = [];
    let spanStart: number | null = null;
    let lastChargingTs: number | null = null;
    let peak = 0;

    for (const pt of recent) {
      if (pt.charging) {
        if (pt.level > peak) peak = pt.level;
        if (spanStart === null) {
          spanStart = pt.timestamp;
        }
        lastChargingTs = pt.timestamp;
      } else if (spanStart !== null && lastChargingTs !== null) {
        spans.push({
          start: spanStart,
          end: Math.max(lastChargingTs, spanStart + 60_000),
        });
        spanStart = null;
        lastChargingTs = null;
      }
    }
    if (spanStart !== null && lastChargingTs !== null) {
      spans.push({
        start: spanStart,
        end: Math.max(lastChargingTs, spanStart + 60_000),
      });
    }

    const powerMs = spans.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);

    // 5 clean ticks across the 24-hour window (every 6 hours)
    const tickValues = [
      cutoff,
      cutoff + 6 * HOUR_MS,
      cutoff + 12 * HOUR_MS,
      cutoff + 18 * HOUR_MS,
      now,
    ];

    return {
      chartData: data,
      chargingSpans: spans,
      totalPowerMs: powerMs,
      peakChargingPct: peak,
      domain: [cutoff, now] as [number, number],
      ticks: tickValues,
    };
  }, [history]);

  const hasChargingPoints = chargingSpans.length > 0;

  const gridStroke = darkMode ? '#1F2C27' : '#E6ECE9';
  const axisColor = darkMode ? '#8DA29A' : '#5E716A';
  const unpluggedStroke = darkMode ? '#4A5E56' : '#A4B4AE';
  const refLineStroke = darkMode ? '#34D399' : '#059669';
  const refAreaFill = darkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.08)';

  return (
    <section
      aria-label="24-hour battery charging history"
      className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
            24-Hour Charging History
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#54665F] dark:text-[#93A8A0]">
            <span className="tabular-nums">
              {chargingSpans.length}{' '}
              {chargingSpans.length === 1 ? 'charging session' : 'charging sessions'}
            </span>
            {hasChargingPoints && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatDurationMs(totalPowerMs)} on power</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Peak {peakChargingPct}%</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex p-1 rounded-xl bg-[#EEF3F1] dark:bg-[#1A2420]">
            <button
              type="button"
              onClick={() => setViewMode('charging_only')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'charging_only'
                  ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                  : 'text-[#54665F] dark:text-[#8EA39B] hover:text-[#111816] dark:hover:text-white'
              }`}
            >
              Connected Only
            </button>
            <button
              type="button"
              onClick={() => setViewMode('full_24h')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'full_24h'
                  ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                  : 'text-[#54665F] dark:text-[#8EA39B] hover:text-[#111816] dark:hover:text-white'
              }`}
            >
              Full 24h
            </button>
          </div>

          <button
            type="button"
            onClick={hasChargingPoints ? onResetHistory : onLoadSampleHistory}
            aria-label={hasChargingPoints ? 'Clear 24-hour history' : 'Load sample 24-hour history'}
            className="min-h-[40px] px-3 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-xs font-medium text-[#54665F] dark:text-[#93A8A0] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{hasChargingPoints ? 'Clear' : 'Sample 24h'}</span>
          </button>
        </div>
      </div>

      {/* Recharts Container */}
      <div className="mt-5 h-[250px] sm:h-[270px] w-full">
        {!hasChargingPoints && viewMode === 'charging_only' ? (
          <div className="h-full flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[#D4DDD9] dark:border-[#26342F] px-4">
            <Zap className="w-6 h-6 text-[#8A9C95] dark:text-[#5B6F67]" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-medium text-[#111816] dark:text-[#EEF3F1]">
              No charging periods recorded in the last 24 hours
            </p>
            <p className="mt-1 text-xs text-[#54665F] dark:text-[#93A8A0] max-w-sm">
              Connect your charger or run the simulator demo above to plot real-time charge percentage over time.
            </p>
            <button
              type="button"
              onClick={onLoadSampleHistory}
              className="mt-4 min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Load Sample 24h History
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: -14, bottom: 4 }}>
              <defs>
                <linearGradient id="chargeAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={darkMode ? 0.42 : 0.32} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />

              {/* Highlight power-connected time windows */}
              {chargingSpans.map((span) => (
                <ReferenceArea
                  key={`${span.start}-${span.end}`}
                  x1={span.start}
                  x2={span.end}
                  y1={0}
                  y2={100}
                  fill={refAreaFill}
                  ifOverflow="extendDomain"
                />
              ))}

              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={domain}
                ticks={ticks}
                tickFormatter={formatAxisTime}
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={{ stroke: gridStroke }}
                tickLine={false}
              />

              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip content={<CustomChartTooltip />} />

              {/* Target Alarm Threshold Line */}
              <ReferenceLine
                y={targetPercent}
                stroke={refLineStroke}
                strokeDasharray="4 4"
                strokeOpacity={0.75}
                label={{
                  value: `Target ${targetPercent}%`,
                  position: 'insideTopRight',
                  fill: refLineStroke,
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />

              {/* Full 24h Battery Context Line (shown only when Full 24h selected) */}
              {viewMode === 'full_24h' && (
                <Line
                  type="monotone"
                  dataKey="level"
                  stroke={unpluggedStroke}
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: unpluggedStroke, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}

              {/* Primary Power-Connected Charging Percentage Area */}
              <Area
                type="monotone"
                dataKey="chargingLevel"
                stroke="#059669"
                strokeWidth={2.5}
                fill="url(#chargeAreaFill)"
                connectNulls={false}
                dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Minimal Legend Strip */}
      <div className="mt-4 pt-3 border-t border-[#E8EFEC] dark:border-[#1E2A25] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#54665F] dark:text-[#93A8A0]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-2.5 rounded-xs bg-emerald-600" aria-hidden="true" />
          <span>Connected to power</span>
        </div>
        {viewMode === 'full_24h' && (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 border-t-2 border-dashed border-[#8EA19A]"
              aria-hidden="true"
            />
            <span>On battery</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-4 border-t-2 border-dashed border-emerald-600 dark:border-emerald-400"
            aria-hidden="true"
          />
          <span className="tabular-nums">Alarm threshold ({targetPercent}%)</span>
        </div>
      </div>
    </section>
  );
};
