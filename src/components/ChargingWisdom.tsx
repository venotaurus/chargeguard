import React, { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { BatteryHealthData, BatteryHistoryPoint } from '../types/battery';

interface ChargingWisdomProps {
  currentLevel: number;
  targetPercent: number;
  isCharging: boolean;
  isArmed: boolean;
  history: BatteryHistoryPoint[];
  health: BatteryHealthData;
  onSetTarget: (next: number) => void;
  onArmAlarm: () => void;
}

interface WisdomTip {
  id: string;
  context: string;
  headline: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function analyze24hTrends(history: BatteryHistoryPoint[]) {
  const cutoff = Date.now() - DAY_MS;
  const recent = history
    .filter((p) => p.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);

  let sessions = 0;
  let inSession = false;
  let sessionStartTs = 0;
  let totalPowerMs = 0;
  let peakChargingPct = 0;
  let minLevelPct = 100;

  for (let i = 0; i < recent.length; i++) {
    const pt = recent[i];
    if (pt.level < minLevelPct) minLevelPct = pt.level;

    if (pt.charging) {
      if (pt.level > peakChargingPct) peakChargingPct = pt.level;
      if (!inSession) {
        inSession = true;
        sessions += 1;
        sessionStartTs = pt.timestamp;
      }
    } else if (inSession) {
      const prevTs = recent[i - 1]?.timestamp ?? sessionStartTs;
      totalPowerMs += Math.max(0, prevTs - sessionStartTs);
      inSession = false;
    }
  }

  if (inSession && recent.length > 0) {
    totalPowerMs += Math.max(0, recent[recent.length - 1].timestamp - sessionStartTs);
  }

  return {
    sessions,
    totalPowerMinutes: Math.round(totalPowerMs / 60_000),
    peakChargingPct,
    minLevelPct: recent.length > 0 ? minLevelPct : null,
  };
}

export const ChargingWisdom: React.FC<ChargingWisdomProps> = ({
  currentLevel,
  targetPercent,
  isCharging,
  isArmed,
  history,
  health,
  onSetTarget,
  onArmAlarm,
}) => {
  const [rotationOffset, setRotationOffset] = useState<number>(0);

  const { tips, summaryLine } = useMemo(() => {
    const trends = analyze24hTrends(history);
    const list: WisdomTip[] = [];

    // 1. Live charging / battery level guidance
    if (isCharging && !isArmed) {
      list.push({
        id: 'arm-while-charging',
        context: 'Live battery state',
        headline: `Arm your ${targetPercent}% alarm while plugged in`,
        detail: `Your device is charging at ${currentLevel}%. Arming ChargeGuard ensures you get alerted the moment it hits ${targetPercent}%.`,
        actionLabel: `Arm at ${targetPercent}%`,
        onAction: onArmAlarm,
      });
    }

    if (isCharging && currentLevel >= targetPercent) {
      list.push({
        id: 'ready-to-unplug',
        context: 'Live battery state',
        headline: 'Target reached — unplug to avoid trickle heat',
        detail: `Battery is at ${currentLevel}%. Leaving a phone plugged in after reaching your goal keeps cell voltage elevated and adds unnecessary warmth.`,
      });
    } else if (isCharging) {
      list.push({
        id: 'cooler-temp-charging',
        context: 'Thermal care',
        headline: 'Cooler temperatures help battery health',
        detail: `While charging from ${currentLevel}% toward ${targetPercent}%, keep your phone on a hard, cool surface and avoid heavy gaming or thick insulating cases.`,
      });
    } else if (currentLevel <= 20) {
      list.push({
        id: 'plug-in-before-deep-drain',
        context: 'Live battery state',
        headline: 'Plug in soon to prevent deep-discharge wear',
        detail: `Battery is at ${currentLevel}%. Lithium-ion cells last significantly longer when recharged before dropping into single digits.`,
      });
    }

    // 2. Target threshold optimization
    if (targetPercent >= 95) {
      list.push({
        id: 'lower-target-80',
        context: 'Alarm target',
        headline: 'Stop daily charges at 80% for longer lifespan',
        detail: `Your alarm is set to ${targetPercent}%. The last 15–20% creates the steepest chemical wear — lowering to 80% can double usable battery cycles.`,
        actionLabel: 'Set target to 80%',
        onAction: () => onSetTarget(80),
      });
    }

    // 3. Historical 24-hour & cycle trend tips
    if (trends.peakChargingPct >= 95 || health.highVoltageCharges >= 1) {
      list.push({
        id: 'trend-high-voltage',
        context: '24-hour trend',
        headline: `Recent charges peaked at ${Math.max(trends.peakChargingPct, 95)}%`,
        detail: 'Frequent charges near 100% accelerate capacity fade. Keeping routine top-ups around 80–85% protects cathode longevity.',
      });
    }

    if (trends.totalPowerMinutes >= 150) {
      const hrs = (trends.totalPowerMinutes / 60).toFixed(1);
      list.push({
        id: 'trend-long-power',
        context: '24-hour trend',
        headline: `${hrs} hours on power in the last 24 hours`,
        detail: 'Long stretches connected to a charger can raise internal battery temperature. Unplug promptly once your target alarm sounds.',
      });
    } else if (trends.sessions >= 2) {
      list.push({
        id: 'trend-partial-cycles',
        context: '24-hour trend',
        headline: 'Short partial top-ups are gentle on your battery',
        detail: `You logged ${trends.sessions} charging sessions in the last 24 hours. Smaller top-ups between 20% and 80% cause less wear than one deep 0–100% cycle.`,
      });
    }

    if (trends.minLevelPct !== null && trends.minLevelPct <= 18) {
      list.push({
        id: 'trend-low-dip',
        context: '24-hour trend',
        headline: `Battery dipped to ${trends.minLevelPct}% in the last 24h`,
        detail: 'Recharging earlier — around 25–30% — keeps voltage stable and reduces long-term capacity loss.',
      });
    }

    if (health.optimalCharges >= 2) {
      list.push({
        id: 'trend-optimal-streak',
        context: 'Cycle history',
        headline: `${health.optimalCharges} healthy charge stops recorded`,
        detail: 'Consistently unplugging at or below 85% reduces lithium-ion aging and keeps peak battery capacity higher over time.',
      });
    }

    // 4. Always ensure foundational thermal & charging wisdom is available
    if (!list.some((t) => t.id === 'cooler-temp-charging')) {
      list.push({
        id: 'cooler-temp-general',
        context: 'Thermal care',
        headline: 'Cooler temperatures help battery health',
        detail: 'Heat above 35°C ages battery cells faster than normal charging cycles. Avoid charging in direct sunlight or under pillows.',
      });
    }

    if (list.length < 3) {
      list.push({
        id: 'ideal-20-80-window',
        context: 'Daily habit',
        headline: 'Stay in the 20% to 80% sweet spot',
        detail: `Your current target is ${targetPercent}%. Keeping everyday battery levels in the middle range minimizes chemical stress on every cycle.`,
      });
    }

    if (list.length < 3) {
      list.push({
        id: 'standard-charger-overnight',
        context: 'Charger care',
        headline: 'Use slower charging when you are not in a rush',
        detail: 'Standard 10–18W chargers generate less heat than ultra-fast chargers, helping preserve battery capacity over years of daily use.',
      });
    }

    const stateLabel = isCharging ? `Charging at ${currentLevel}%` : `${currentLevel}% on battery`;
    const trendLabel =
      trends.sessions > 0
        ? `${trends.sessions} ${trends.sessions === 1 ? 'session' : 'sessions'} in 24h`
        : `Target ${targetPercent}%`;

    return {
      tips: list,
      summaryLine: `${stateLabel} · ${trendLabel}`,
    };
  }, [
    currentLevel,
    targetPercent,
    isCharging,
    isArmed,
    history,
    health.highVoltageCharges,
    health.optimalCharges,
    onSetTarget,
    onArmAlarm,
  ]);

  const visibleCount = Math.min(3, tips.length);
  const canRotate = tips.length > visibleCount;
  const visibleTips: WisdomTip[] = [];
  for (let i = 0; i < visibleCount; i++) {
    visibleTips.push(tips[(rotationOffset + i) % tips.length]);
  }

  const handleCycleTips = () => {
    setRotationOffset((prev) => (prev + 1) % tips.length);
  };

  return (
    <section
      aria-label="Charging Wisdom"
      className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
            Charging Wisdom
          </h2>
          <p className="mt-1 text-xs text-[#54665F] dark:text-[#93A8A0] tabular-nums">
            {summaryLine}
          </p>
        </div>

        {canRotate && (
          <button
            type="button"
            onClick={handleCycleTips}
            className="min-h-[40px] px-3.5 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-xs font-medium text-[#374842] dark:text-[#B9CAC3] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            More tips
          </button>
        )}
      </div>

      {/* Dynamic 3-Column Hairline Grid (zero nested cards, zero pills) */}
      <div className="mt-5 pt-5 border-t border-[#E8EFEC] dark:border-[#1E2A25] grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-[#E8EFEC] dark:md:divide-[#1E2A25]">
        {visibleTips.map((tip, index) => (
          <div
            key={tip.id}
            className={`flex flex-col justify-between ${
              index === 0
                ? 'md:pr-6'
                : index === visibleTips.length - 1
                ? 'md:pl-6'
                : 'md:px-6'
            }`}
          >
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {tip.context}
              </p>
              <h3 className="mt-1.5 text-sm font-semibold text-[#111816] dark:text-[#F3F7F5] leading-snug">
                {tip.headline}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#54665F] dark:text-[#93A8A0]">
                {tip.detail}
              </p>
            </div>

            {tip.actionLabel && tip.onAction && (
              <div className="mt-3.5">
                <button
                  type="button"
                  onClick={tip.onAction}
                  className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors whitespace-nowrap"
                >
                  <span>{tip.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
