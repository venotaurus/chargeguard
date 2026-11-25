import React from 'react';
import {
  AlertTriangle,
  Flame,
  ShieldCheck,
  Snowflake,
  Thermometer,
  ZapOff,
} from 'lucide-react';

interface BatteryTemperatureCardProps {
  tempC: number;
  peakTempC: number;
  thresholdC: number;
  isCharging: boolean;
  alertsEnabled: boolean;
  onToggleAlerts: (enabled: boolean) => void;
  onManualTempChange: (nextTempC: number) => void;
  onTestOverheat: () => void;
  onCoolDown: () => void;
  onUnplugIfSimulator?: () => void;
}

export const BatteryTemperatureCard: React.FC<BatteryTemperatureCardProps> = ({
  tempC,
  peakTempC,
  thresholdC,
  isCharging,
  alertsEnabled,
  onToggleAlerts,
  onManualTempChange,
  onTestOverheat,
  onCoolDown,
  onUnplugIfSimulator,
}) => {
  const isOverheating = tempC > thresholdC;
  const isWarm = !isOverheating && tempC >= 35;
  const tempF = (tempC * 9) / 5 + 32;

  // Map 20°C - 50°C onto 0% - 100% progress bar
  const minScale = 20;
  const maxScale = 50;
  const fillPct = Math.max(
    0,
    Math.min(100, ((tempC - minScale) / (maxScale - minScale)) * 100)
  );
  const thresholdMarkerPct = ((thresholdC - minScale) / (maxScale - minScale)) * 100;

  const thermalStatus = isOverheating
    ? {
        label: 'Overheating · Safety Warning',
        tone: 'text-red-600 dark:text-red-400',
        barClass: 'bg-red-600 dark:bg-red-500',
      }
    : isWarm
    ? {
        label: 'Warm · Monitor while charging',
        tone: 'text-amber-700 dark:text-amber-400',
        barClass: 'bg-amber-500 dark:bg-amber-400',
      }
    : {
        label: 'Normal · Safe thermal range',
        tone: 'text-emerald-700 dark:text-emerald-400',
        barClass: 'bg-emerald-600 dark:bg-emerald-500',
      };

  return (
    <section
      aria-label="Battery Temperature Monitor and Safety Warning"
      className={`rounded-3xl border p-6 sm:p-7 space-y-5 transition-colors ${
        isOverheating
          ? 'bg-white dark:bg-[#131A18] border-red-300 dark:border-red-900/70'
          : 'bg-white dark:bg-[#131A18] border-[#DCE4E0] dark:border-[#212E29]'
      }`}
    >
      {/* Header + Current Temperature Readout */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Thermometer
              className={`w-4 h-4 shrink-0 ${
                isOverheating
                  ? 'text-red-600 dark:text-red-400'
                  : isWarm
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
              Battery Temperature Monitor
            </h2>
          </div>
          <p className={`mt-1 text-xs font-medium ${thermalStatus.tone}`}>
            {thermalStatus.label}
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1">
            <span
              className={`font-mono text-3xl font-bold tabular-nums ${
                isOverheating
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-[#111816] dark:text-[#F3F7F5]'
              }`}
            >
              {tempC.toFixed(1)}°C
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[#54665F] dark:text-[#93A8A0]">
            {tempF.toFixed(1)}°F · Peak {peakTempC.toFixed(1)}°C
          </p>
        </div>
      </div>

      {/* Thermal Gauge Bar with 40°C Safety Limit Notch */}
      <div>
        <div className="relative h-2.5 w-full rounded-full bg-[#E8EFEC] dark:bg-[#1E2A25]">
          <div
            className={`h-full rounded-full ${thermalStatus.barClass} transition-all duration-300`}
            style={{ width: `${fillPct}%` }}
          />
          <div
            title={`Safety warning threshold: ${thresholdC}°C`}
            className="absolute -top-1 bottom-[-4px] w-0.5 bg-[#111816] dark:bg-[#EEF3F1]"
            style={{ left: `${thresholdMarkerPct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-xs tabular-nums text-[#657770] dark:text-[#839890]">
          <span>20°C</span>
          <span>30°C</span>
          <span className="font-semibold text-[#111816] dark:text-[#EEF3F1]">
            {thresholdC}°C limit
          </span>
          <span>50°C</span>
        </div>
      </div>

      {/* Safety Warning Section */}
      <div
        role={isOverheating ? 'alert' : undefined}
        className={`rounded-2xl border p-4 sm:p-5 ${
          isOverheating
            ? 'border-red-300 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30'
            : 'border-[#E6ECE9] dark:border-[#1E2A25] bg-[#F8FAF9] dark:bg-[#0F1513]'
        }`}
      >
        <div className="flex items-start gap-3">
          {isOverheating ? (
            <AlertTriangle
              className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <ShieldCheck
              className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}

          <div className="min-w-0 flex-1">
            <h3
              className={`text-sm font-semibold ${
                isOverheating
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-[#111816] dark:text-[#F3F7F5]'
              }`}
            >
              {isOverheating
                ? `Safety Warning: Battery Exceeded ${thresholdC}°C`
                : 'Safety Warning: Thermal Guard Active'}
            </h3>
            <p
              className={`mt-1 text-xs leading-relaxed ${
                isOverheating
                  ? 'text-red-800/90 dark:text-red-200/90'
                  : 'text-[#54665F] dark:text-[#93A8A0]'
              }`}
            >
              {isOverheating
                ? `Current temperature is ${tempC.toFixed(
                    1
                  )}°C. Unplug your charger, remove heavy cases, and stop demanding apps until the battery cools below 35°C.`
                : `ChargeGuard continuously watches for temperatures above ${thresholdC}°C and triggers an alert${
                    isCharging ? ' while charging' : ''
                  } to prevent thermal degradation.`}
            </p>

            {isOverheating && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                {onUnplugIfSimulator && isCharging && (
                  <button
                    type="button"
                    onClick={onUnplugIfSimulator}
                    className="min-h-[40px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <ZapOff className="w-3.5 h-3.5" aria-hidden="true" />
                    Stop Charging
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCoolDown}
                  className="min-h-[40px] px-3.5 rounded-xl border border-red-300 dark:border-red-800 bg-white dark:bg-[#131A18] hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Snowflake className="w-3.5 h-3.5" aria-hidden="true" />
                  Cool Down to 30°C
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls: Alert Toggle + Thermal Test Slider */}
      <div className="pt-2 border-t border-[#E8EFEC] dark:border-[#1E2A25] grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#111816] dark:text-[#EEF3F1]">
              Overheat alert (&gt;{thresholdC}°C)
            </p>
            <p className="text-xs text-[#5E716A] dark:text-[#869B93]">
              Send notification and sound warning above {thresholdC}°C
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={alertsEnabled}
            aria-label="Enable overheat alert above 40 degrees Celsius"
            onClick={() => onToggleAlerts(!alertsEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              alertsEnabled ? 'bg-emerald-600' : 'bg-[#CBD5D1] dark:bg-[#2A3732]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                alertsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="md:col-span-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1">
              <label
                htmlFor="temp-sim-slider"
                className="font-medium text-[#54665F] dark:text-[#93A8A0]"
              >
                Test temperature
              </label>
              <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#EEF3F1]">
                {tempC.toFixed(1)}°C
              </span>
            </div>
            <input
              id="temp-sim-slider"
              type="range"
              min={20}
              max={50}
              step={0.5}
              value={tempC}
              onChange={(e) => onManualTempChange(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, ${
                  isOverheating ? '#DC2626' : '#059669'
                } 0%, ${isOverheating ? '#DC2626' : '#059669'} ${fillPct}%, rgba(148, 163, 184, 0.28) ${fillPct}%, rgba(148, 163, 184, 0.28) 100%)`,
                borderRadius: '9999px',
              }}
              className="charge-slider w-full h-3"
            />
          </div>

          <button
            type="button"
            onClick={isOverheating ? onCoolDown : onTestOverheat}
            className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              isOverheating
                ? 'border border-[#D4DDD9] dark:border-[#283631] text-[#111816] dark:text-[#EEF3F1] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522]'
                : 'border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
            }`}
          >
            {isOverheating ? (
              <>
                <Snowflake className="w-3.5 h-3.5" aria-hidden="true" />
                Reset 30°C
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                Test 42°C
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
