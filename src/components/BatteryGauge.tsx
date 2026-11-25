import React from 'react';
import { Bell, BellOff, Zap } from 'lucide-react';
import { BatterySourceMode } from '../types/battery';

interface BatteryGaugeProps {
  currentLevel: number;
  targetLevel: number;
  isCharging: boolean;
  isArmed: boolean;
  isRinging: boolean;
  sourceMode: BatterySourceMode;
  chargingTimeSeconds: number;
}

function formatEta(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins} min remaining`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m remaining` : `${hrs}h remaining`;
}

export const BatteryGauge: React.FC<BatteryGaugeProps> = ({
  currentLevel,
  targetLevel,
  isCharging,
  isArmed,
  isRinging,
  sourceMode,
  chargingTimeSeconds,
}) => {
  const size = 276;
  const center = size / 2;
  const radius = 112;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;

  const clampedLevel = Math.max(0, Math.min(100, currentLevel));
  const clampedTarget = Math.max(10, Math.min(100, targetLevel));
  const strokeDashoffset = circumference - (clampedLevel / 100) * circumference;

  // Target marker coordinates along the circle (starting from 12 o'clock / -90 deg)
  const targetAngleRad = ((clampedTarget / 100) * 360 - 90) * (Math.PI / 180);
  const markerInnerR = radius - 14;
  const markerOuterR = radius + 14;
  const markerX1 = center + markerInnerR * Math.cos(targetAngleRad);
  const markerY1 = center + markerInnerR * Math.sin(targetAngleRad);
  const markerX2 = center + markerOuterR * Math.cos(targetAngleRad);
  const markerY2 = center + markerOuterR * Math.sin(targetAngleRad);

  const reachedTarget = clampedLevel >= clampedTarget;
  const remainingPct = Math.max(0, clampedTarget - clampedLevel);

  // Estimate seconds specifically to target rather than 100%
  const etaToTargetSeconds =
    isCharging && !reachedTarget && Number.isFinite(chargingTimeSeconds) && clampedLevel < 100
      ? Math.round(chargingTimeSeconds * (remainingPct / Math.max(1, 100 - clampedLevel)))
      : Infinity;

  const etaText = formatEta(etaToTargetSeconds);

  const arcColorClass = isRinging
    ? 'stroke-red-600 dark:stroke-red-500'
    : clampedLevel <= 20 && !isCharging
    ? 'stroke-amber-600 dark:stroke-amber-500'
    : 'stroke-emerald-600 dark:stroke-emerald-500';

  const statusText = isRinging
    ? 'Alarm ringing'
    : isCharging
    ? reachedTarget
      ? 'Target reached'
      : 'Charging'
    : 'Not plugged in';

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
          role="img"
          aria-label={`Battery at ${clampedLevel} percent, alarm target ${clampedTarget} percent, ${statusText}`}
        >
          {/* Base track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-[#E3EAE6] dark:stroke-[#1E2925]"
          />

          {/* Active battery level arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
            className={`${arcColorClass} transition-[stroke-dashoffset] duration-300 ease-out`}
          />

          {/* Target percentage notch on the ring */}
          <line
            x1={markerX1}
            y1={markerY1}
            x2={markerX2}
            y2={markerY2}
            strokeWidth={3.5}
            strokeLinecap="round"
            className="stroke-[#111816] dark:stroke-[#EEF3F1]"
          />
        </svg>

        {/* Center readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#4F615A] dark:text-[#96ABA3]">
            {isCharging && (
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 fill-current" aria-hidden="true" />
            )}
            <span>{statusText}</span>
          </div>

          <div className="mt-1 flex items-baseline justify-center">
            <span className="font-mono text-6xl font-bold tracking-tight tabular-nums text-[#111816] dark:text-[#F3F7F5]">
              {clampedLevel}
            </span>
            <span className="font-mono text-2xl font-semibold text-[#5A6D66] dark:text-[#8DA29A] ml-0.5">
              %
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-[#374842] dark:text-[#B4C5BE]">
            {isArmed ? (
              <Bell className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <BellOff className="w-3.5 h-3.5 text-[#6D7E78] dark:text-[#7F938B]" aria-hidden="true" />
            )}
            <span className="tabular-nums">
              {isArmed ? `Alarm at ${clampedTarget}%` : `Target ${clampedTarget}% (Paused)`}
            </span>
          </div>
        </div>
      </div>

      {/* Clean unboxed metadata strip below gauge */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-[#54665F] dark:text-[#93A8A0]">
        <span className="tabular-nums">
          {reachedTarget
            ? `At or above ${clampedTarget}% target`
            : `${remainingPct}% left to reach ${clampedTarget}%`}
        </span>
        {etaText && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{etaText}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{sourceMode === 'live' ? 'Live device sensor' : 'Simulator mode'}</span>
      </div>
    </div>
  );
};
