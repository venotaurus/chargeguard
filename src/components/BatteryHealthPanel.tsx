import React from 'react';
import { BatteryCharging, CheckCircle2, Clock, HeartPulse, Info, RotateCcw } from 'lucide-react';
import { BatteryHealthData } from '../types/battery';

interface BatteryHealthPanelProps {
  health: BatteryHealthData;
  currentLevel: number;
  targetPercent: number;
  isCharging: boolean;
  batteryTempC: number;
  peakTempC: number;
  onChangeDeviceAgeMonths: (months: number) => void;
  onResetStats: () => void;
}

export interface HealthScoreFactor {
  id: string;
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface BatteryHealthScoreResult {
  score: number; // 0 - 100
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Care';
  estimatedCapacityPct: number;
  totalEstimatedCycles: number;
  factors: HealthScoreFactor[];
}

const STANDARD_FULL_CYCLES = 800;

export function computeBatteryHealthScore(params: {
  health: BatteryHealthData;
  currentLevel: number;
  targetPercent: number;
  batteryTempC: number;
  peakTempC: number;
}): BatteryHealthScoreResult {
  const { health, currentLevel, targetPercent, batteryTempC, peakTempC } = params;

  const baselineAgeCycles = Math.round(health.deviceAgeMonths * 22);
  const totalEstimatedCycles = Math.round((baselineAgeCycles + health.equivalentCycles) * 10) / 10;

  const capacityLossFromCycles = (totalEstimatedCycles / STANDARD_FULL_CYCLES) * 20;
  const highVoltagePenalty = Math.min(3, health.highVoltageCharges * 0.15);
  const deepDischargePenalty = Math.min(3, health.deepDischarges * 0.2);
  const estimatedCapacityPct = Math.max(
    65,
    Math.min(100, Math.round(100 - capacityLossFromCycles - highVoltagePenalty - deepDischargePenalty))
  );

  // 1. Capacity & Cycle Wear (0 - 40 pts)
  const capacityRatio = Math.max(0, Math.min(1, (estimatedCapacityPct - 65) / 35));
  const capacityPoints = Math.round(capacityRatio * 40);

  // 2. Charge Limit Habit (0 - 25 pts)
  const targetBase =
    targetPercent <= 80
      ? 25
      : targetPercent <= 85
      ? 23
      : targetPercent <= 90
      ? 19
      : targetPercent <= 95
      ? 15
      : 12;
  const habitPenalty = Math.min(6, health.highVoltageCharges * 2);
  const habitBonus = Math.min(2, health.optimalCharges);
  const chargeHabitPoints = Math.max(8, Math.min(25, targetBase - habitPenalty + habitBonus));

  // 3. Thermal Safety (0 - 20 pts)
  const effectiveTemp = Math.max(batteryTempC, peakTempC * 0.92);
  const thermalPoints =
    batteryTempC > 40
      ? 6
      : effectiveTemp > 40
      ? 11
      : batteryTempC >= 36
      ? 15
      : batteryTempC >= 34
      ? 18
      : 20;

  // 4. Discharge Care (0 - 15 pts)
  const deepPenalty = Math.min(8, health.deepDischarges * 3);
  const lowNowPenalty = currentLevel < 15 ? 3 : currentLevel < 20 ? 1 : 0;
  const dischargePoints = Math.max(4, Math.min(15, 15 - deepPenalty - lowNowPenalty));

  const score = Math.max(
    0,
    Math.min(100, capacityPoints + chargeHabitPoints + thermalPoints + dischargePoints)
  );

  const grade: BatteryHealthScoreResult['grade'] =
    score >= 88 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Needs Care';

  const factors: HealthScoreFactor[] = [
    {
      id: 'capacity',
      label: 'Capacity & Cycles',
      points: capacityPoints,
      maxPoints: 40,
      detail: `~${estimatedCapacityPct}% capacity · ${Math.round(totalEstimatedCycles)} cycles`,
    },
    {
      id: 'habit',
      label: 'Charge Limit Habit',
      points: chargeHabitPoints,
      maxPoints: 25,
      detail: `${targetPercent}% alarm cap · ${health.optimalCharges} optimal stops`,
    },
    {
      id: 'thermal',
      label: 'Thermal Safety',
      points: thermalPoints,
      maxPoints: 20,
      detail: `${batteryTempC.toFixed(1)}°C now · ${peakTempC.toFixed(1)}°C peak`,
    },
    {
      id: 'discharge',
      label: 'Discharge Care',
      points: dischargePoints,
      maxPoints: 15,
      detail:
        health.deepDischarges === 0
          ? 'No deep discharges (<15%)'
          : `${health.deepDischarges} deep ${health.deepDischarges === 1 ? 'discharge' : 'discharges'}`,
    },
  ];

  return {
    score,
    grade,
    estimatedCapacityPct,
    totalEstimatedCycles,
    factors,
  };
}

function getStressMultiplier(targetPercent: number): number {
  if (targetPercent <= 75) return 0.35;
  if (targetPercent <= 80) return 0.45;
  if (targetPercent <= 85) return 0.6;
  if (targetPercent <= 90) return 0.78;
  return 1.0;
}

function formatSessionDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const BatteryHealthPanel: React.FC<BatteryHealthPanelProps> = ({
  health,
  currentLevel,
  targetPercent,
  isCharging,
  batteryTempC,
  peakTempC,
  onChangeDeviceAgeMonths,
  onResetStats,
}) => {
  const scoreResult = computeBatteryHealthScore({
    health,
    currentLevel,
    targetPercent,
    batteryTempC,
    peakTempC,
  });

  const { score, grade, estimatedCapacityPct, totalEstimatedCycles, factors } = scoreResult;

  const scoreTone =
    score >= 88
      ? {
          text: 'text-emerald-700 dark:text-emerald-400',
          stroke: 'stroke-emerald-600 dark:stroke-emerald-500',
          bar: 'bg-emerald-600 dark:bg-emerald-500',
        }
      : score >= 75
      ? {
          text: 'text-emerald-700 dark:text-emerald-400',
          stroke: 'stroke-emerald-600 dark:stroke-emerald-500',
          bar: 'bg-emerald-600 dark:bg-emerald-500',
        }
      : score >= 60
      ? {
          text: 'text-amber-700 dark:text-amber-400',
          stroke: 'stroke-amber-500 dark:stroke-amber-400',
          bar: 'bg-amber-500 dark:bg-amber-400',
        }
      : {
          text: 'text-red-600 dark:text-red-400',
          stroke: 'stroke-red-600 dark:stroke-red-500',
          bar: 'bg-red-600 dark:bg-red-500',
        };

  const healthStatus =
    estimatedCapacityPct >= 90
      ? { label: 'Optimal', note: 'Peak capacity and low wear', tone: 'text-emerald-700 dark:text-emerald-400' }
      : estimatedCapacityPct >= 82
      ? { label: 'Good', note: 'Normal everyday battery health', tone: 'text-emerald-700 dark:text-emerald-400' }
      : estimatedCapacityPct >= 75
      ? { label: 'Fair', note: 'Noticeable aging; 80% limit advised', tone: 'text-amber-700 dark:text-amber-400' }
      : { label: 'Degraded', note: 'Reduced capacity; avoid heat and 100% charges', tone: 'text-red-600 dark:text-red-400' };

  const remainingBaselineCycles = Math.max(0, STANDARD_FULL_CYCLES - totalEstimatedCycles);
  const stressMultiplier = getStressMultiplier(targetPercent);
  const projectedRemainingCycles = Math.round(remainingBaselineCycles / stressMultiplier);
  const projectedYears = Math.max(0.3, Math.round((projectedRemainingCycles / 300) * 10) / 10);
  const fullChargeYears = Math.max(0.2, Math.round((remainingBaselineCycles / 300) * 10) / 10);
  const lifespanGainYears = Math.max(0, Math.round((projectedYears - fullChargeYears) * 10) / 10);

  // Score ring SVG math
  const ringSize = 152;
  const ringCenter = ringSize / 2;
  const ringRadius = 60;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (score / 100) * ringCircumference;

  const tips: { title: string; detail: string }[] = [
    {
      title:
        targetPercent <= 85
          ? `Your ${targetPercent}% limit is ideal`
          : `Lower your alarm from ${targetPercent}% to 80%`,
      detail:
        targetPercent <= 85
          ? 'Stopping charges at or below 85% reduces high-voltage cell stress by more than half.'
          : 'Charging from 80% to 100% causes the majority of lithium-ion cathode wear.',
    },
    {
      title: 'Avoid draining below 20%',
      detail: 'Frequent deep discharges accelerate chemical aging. Plug in when battery nears 20–25%.',
    },
    {
      title: 'Keep your phone cool while charging',
      detail: 'Heat above 35°C damages battery cells faster than charge cycles. Remove thick cases during fast charging.',
    },
    {
      title: 'Avoid overnight trickle charging at 100%',
      detail: 'Charge before bed with ChargeGuard armed instead of holding 100% for hours overnight.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Battery Health Score Out of 100 Card */}
      <section
        aria-label="Battery Health Score"
        className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Score Ring */}
          <div className="md:col-span-4 flex flex-col items-center text-center">
            <div className="relative flex items-center justify-center">
              <svg
                width={ringSize}
                height={ringSize}
                viewBox={`0 0 ${ringSize} ${ringSize}`}
                role="img"
                aria-label={`Battery health score ${score} out of 100 points, rated ${grade}`}
              >
                <circle
                  cx={ringCenter}
                  cy={ringCenter}
                  r={ringRadius}
                  fill="none"
                  strokeWidth={12}
                  className="stroke-[#E3EAE6] dark:stroke-[#1E2925]"
                />
                <circle
                  cx={ringCenter}
                  cy={ringCenter}
                  r={ringRadius}
                  fill="none"
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform={`rotate(-90 ${ringCenter} ${ringCenter})`}
                  className={`${scoreTone.stroke} transition-[stroke-dashoffset] duration-300 ease-out`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-4xl font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                  {score}
                </span>
                <span className="font-mono text-xs tabular-nums text-[#54665F] dark:text-[#93A8A0]">
                  / 100 pts
                </span>
              </div>
            </div>
            <p className={`mt-2.5 text-sm font-semibold ${scoreTone.text}`}>
              {grade} Battery Health
            </p>
            <p className="mt-0.5 text-xs text-[#54665F] dark:text-[#93A8A0]">
              Composite score from cycles, charge cap & temperature
            </p>
          </div>

          {/* 4-Factor Transparent Point Breakdown */}
          <div className="md:col-span-8 md:pl-6 md:border-l md:border-[#E8EFEC] dark:md:border-[#1E2A25] space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
                Score Breakdown
              </h1>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#54665F] dark:text-[#93A8A0]">
                {score} / 100 points
              </span>
            </div>

            <div className="space-y-3.5">
              {factors.map((factor) => {
                const ratioPct = Math.round((factor.points / factor.maxPoints) * 100);
                return (
                  <div key={factor.id}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-medium text-[#111816] dark:text-[#EEF3F1]">
                          {factor.label}
                        </span>
                        <span className="mx-1.5 text-[#889B94]" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-[#54665F] dark:text-[#93A8A0] tabular-nums">
                          {factor.detail}
                        </span>
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#F3F7F5] shrink-0">
                        {factor.points}/{factor.maxPoints}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E8EFEC] dark:bg-[#1E2A25] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          ratioPct >= 75
                            ? 'bg-emerald-600 dark:bg-emerald-500'
                            : ratioPct >= 50
                            ? 'bg-amber-500 dark:bg-amber-400'
                            : 'bg-red-600 dark:bg-red-500'
                        } transition-all duration-300`}
                        style={{ width: `${ratioPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Top 3 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
              Health Status
            </span>
            <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${healthStatus.tone}`}>{healthStatus.label}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-[#54665F] dark:text-[#93A8A0]">
              ~{estimatedCapacityPct}%
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5E716A] dark:text-[#869B93]">{healthStatus.note}</p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
              Estimated Lifespan
            </span>
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
              {projectedYears} yrs
            </span>
            <span className="text-xs text-[#54665F] dark:text-[#93A8A0] tabular-nums">
              at {targetPercent}% cap
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5E716A] dark:text-[#869B93] tabular-nums">
            {lifespanGainYears > 0
              ? `+${lifespanGainYears} yrs longer vs charging to 100%`
              : 'Set target to 80% to extend battery life'}
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
              Charge Cycles
            </span>
            <BatteryCharging className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
              {Math.round(totalEstimatedCycles)}
            </span>
            <span className="font-mono text-xs tabular-nums text-[#54665F] dark:text-[#93A8A0]">
              / {STANDARD_FULL_CYCLES} rated
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5E716A] dark:text-[#869B93] tabular-nums">
            {health.equivalentCycles.toFixed(2)} cycles tracked · {currentLevel}%{' '}
            {isCharging ? 'charging' : 'idle'}
          </p>
        </div>
      </div>

      {/* Cycle Details & Tips */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
                Charging Cycle Details
              </h2>
              <p className="text-xs text-[#54665F] dark:text-[#93A8A0]">
                Tracked automatically as your battery charges
              </p>
            </div>
            {(health.sessions.length > 0 || health.equivalentCycles > 0) && (
              <button
                type="button"
                onClick={onResetStats}
                className="min-h-[40px] px-3 rounded-xl border border-[#D4DDD9] dark:border-[#283631] text-xs font-medium text-[#54665F] dark:text-[#93A8A0] hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>

          <div className="pt-1">
            <div className="flex items-center justify-between text-xs mb-2">
              <label
                htmlFor="device-age-slider"
                className="font-medium text-[#4F615A] dark:text-[#96ABA3]"
              >
                Phone age (for lifespan estimate)
              </label>
              <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                {health.deviceAgeMonths === 0
                  ? 'New phone'
                  : `${health.deviceAgeMonths} ${health.deviceAgeMonths === 1 ? 'month' : 'months'}`}
              </span>
            </div>
            <input
              id="device-age-slider"
              type="range"
              min={0}
              max={48}
              step={1}
              value={health.deviceAgeMonths}
              onChange={(e) => onChangeDeviceAgeMonths(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #059669 0%, #059669 ${
                  (health.deviceAgeMonths / 48) * 100
                }%, rgba(148, 163, 184, 0.28) ${
                  (health.deviceAgeMonths / 48) * 100
                }%, rgba(148, 163, 184, 0.28) 100%)`,
                borderRadius: '9999px',
              }}
              className="charge-slider w-full h-3"
            />
          </div>

          <div className="divide-y divide-[#E8EFEC] dark:divide-[#1E2A25] text-sm">
            <div className="py-3 flex items-center justify-between">
              <span className="text-[#4F615A] dark:text-[#96ABA3]">Optimal stops (≤85%)</span>
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {health.optimalCharges}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-[#4F615A] dark:text-[#96ABA3]">High-voltage charges (≥95%)</span>
              <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                {health.highVoltageCharges}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-[#4F615A] dark:text-[#96ABA3]">Total charge tracked</span>
              <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                {Math.round(health.totalPercentCharged)}%
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E8EFEC] dark:border-[#1E2A25]">
            <p className="text-xs font-semibold text-[#54665F] dark:text-[#93A8A0] mb-3">
              Recent Alarm Sessions
            </p>
            {health.sessions.length === 0 ? (
              <p className="text-xs text-[#647770] dark:text-[#869B93]">
                No completed charge alarms yet. Run a charge or simulator demo to record your first cycle.
              </p>
            ) : (
              <ul className="divide-y divide-[#E8EFEC] dark:divide-[#1E2A25]">
                {health.sessions.slice(0, 5).map((s) => (
                  <li key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                        {s.startLevel}% → {s.endLevel}%
                      </span>
                      <span className="mx-1.5 text-[#889B94]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[#54665F] dark:text-[#93A8A0]">
                        {formatDate(s.completedAt)}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[#54665F] dark:text-[#93A8A0]">
                      {formatSessionDuration(s.durationSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
              Tips to Protect Battery Health
            </h2>
            <p className="text-xs text-[#54665F] dark:text-[#93A8A0]">
              Simple habits that slow down lithium-ion wear
            </p>
          </div>

          <ul className="divide-y divide-[#E8EFEC] dark:divide-[#1E2A25]">
            {tips.map((tip) => (
              <li key={tip.title} className="py-3.5 first:pt-1 last:pb-0 flex gap-3">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-[#111816] dark:text-[#F3F7F5]">
                    {tip.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#54665F] dark:text-[#93A8A0]">
                    {tip.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-3 border-t border-[#E8EFEC] dark:border-[#1E2A25] flex items-start gap-2 text-xs text-[#5E716A] dark:text-[#869B93]">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Web browsers restrict direct hardware temperature and voltage sensors for privacy. For direct Android hardware health telemetry, compile the included Kotlin code in Android Studio.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
