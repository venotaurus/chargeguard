import React, { useMemo } from 'react';
import { CalendarClock, Check, Play, RotateCcw } from 'lucide-react';
import {
  BatteryHealthData,
  BatteryHistoryPoint,
  ChargeScheduleConfig,
  DrainLogEntry,
} from '../types/battery';

interface ChargeScheduleCardProps {
  schedule: ChargeScheduleConfig;
  history: BatteryHistoryPoint[];
  health: BatteryHealthData;
  drainEntries: DrainLogEntry[];
  isCharging: boolean;
  isArmed: boolean;
  nowMs: number;
  onUpdateSchedule: (patch: Partial<ChargeScheduleConfig>) => void;
  onSimulateOvernightPlugIn: (target: number) => void;
}

export interface SuggestedSchedule {
  startTime: string;
  endTime: string;
  target: number;
  reason: string;
  detectedSessions: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_TARGETS = [75, 80, 85, 90];

export function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 22 * 60 + 30;
  return ((h % 24) + 24) % 24 * 60 + Math.max(0, Math.min(59, m));
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeDisplay(hhmm: string): string {
  const mins = parseTimeToMinutes(hhmm);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function isNowInScheduleWindow(nowMs: number, startTime: string, endTime: string): boolean {
  const now = new Date(nowMs);
  const curMins = now.getHours() * 60 + now.getMinutes();
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);

  if (startMins === endMins) return true;
  if (startMins < endMins) {
    return curMins >= startMins && curMins < endMins;
  }
  // Overnight wrap-around (e.g., 22:30 -> 07:00)
  return curMins >= startMins || curMins < endMins;
}

export function computeSuggestedSchedule(
  history: BatteryHistoryPoint[],
  health: BatteryHealthData,
  drainEntries: DrainLogEntry[]
): SuggestedSchedule {
  const now = Date.now();
  const recentHistory = history
    .filter((p) => p.timestamp >= now - DAY_MS)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Detect plug-in start timestamps from 24h charging history
  const plugInMinutes: number[] = [];
  for (let i = 0; i < recentHistory.length; i++) {
    const pt = recentHistory[i];
    const prev = recentHistory[i - 1];
    if (pt.charging && (!prev || !prev.charging)) {
      const d = new Date(pt.timestamp);
      plugInMinutes.push(d.getHours() * 60 + d.getMinutes());
    }
  }

  // Also inspect evening/late-night completed sessions
  for (const session of health.sessions.slice(0, 8)) {
    const d = new Date(session.completedAt);
    if (!Number.isNaN(d.getTime())) {
      const mins = d.getHours() * 60 + d.getMinutes();
      // Approximate start ~45 mins prior to completion
      plugInMinutes.push(((mins - 45) + 1440) % 1440);
    }
  }

  // Prefer an evening/overnight plug-in time (19:00 - 02:00) if detected, else default 22:30
  const overnightCandidates = plugInMinutes.filter((m) => m >= 19 * 60 || m <= 2 * 60);
  let suggestedStartMins = 22 * 60 + 30; // 10:30 PM default
  let detectedFromPattern = false;

  if (overnightCandidates.length > 0) {
    // Shift early-morning minutes (00:00 - 02:00) by +1440 for circular averaging
    const unwrapped = overnightCandidates.map((m) => (m <= 2 * 60 ? m + 1440 : m));
    const avg = unwrapped.reduce((a, b) => a + b, 0) / unwrapped.length;
    // Snap cleanly to 15-minute increments, 15 minutes before typical plug-in
    suggestedStartMins = Math.round((avg - 15) / 15) * 15;
    detectedFromPattern = true;
  }

  // Typical 8.5 hour overnight window
  const suggestedEndMins = suggestedStartMins + 8 * 60 + 30;

  // Estimate daily unplugged drain to choose 80% vs 85% recommended target
  const dailyDrain = drainEntries
    .filter((e) => e.timestamp >= now - DAY_MS)
    .reduce((acc, e) => acc + e.percentDrained, 0);

  const recommendedTarget = dailyDrain >= 72 ? 85 : 80;

  const startTime = formatMinutesToHHMM(suggestedStartMins);
  const endTime = formatMinutesToHHMM(suggestedEndMins);

  const reason = detectedFromPattern
    ? `Detected from your recent evening plug-in timing and ${Math.round(dailyDrain)}% daily unplugged drain.`
    : dailyDrain > 0
    ? `Tailored for ${Math.round(dailyDrain)}% daily unplugged drain — protects battery health overnight.`
    : 'Recommended overnight window to catch bedtime charging and stop at 80%.';

  return {
    startTime,
    endTime,
    target: recommendedTarget,
    reason,
    detectedSessions: plugInMinutes.length,
  };
}

export const ChargeScheduleCard: React.FC<ChargeScheduleCardProps> = ({
  schedule,
  history,
  health,
  drainEntries,
  isCharging,
  isArmed,
  nowMs,
  onUpdateSchedule,
  onSimulateOvernightPlugIn,
}) => {
  const suggested = useMemo(
    () => computeSuggestedSchedule(history, health, drainEntries),
    [history, health, drainEntries]
  );

  const inWindow = isNowInScheduleWindow(nowMs, schedule.startTime, schedule.endTime);

  const matchesSuggested =
    schedule.startTime === suggested.startTime &&
    schedule.endTime === suggested.endTime &&
    schedule.scheduledTarget === suggested.target;

  const lastAutoArmedLabel = schedule.lastAutoArmedAt
    ? new Date(schedule.lastAutoArmedAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const statusText = !schedule.enabled
    ? 'Schedule paused · Enable to auto-arm when plugged in overnight'
    : inWindow
    ? isCharging && isArmed
      ? `In window · Alarm armed for ${schedule.scheduledTarget}%`
      : `In window now · Will auto-arm at ${schedule.scheduledTarget}% when plugged in`
    : `Next window starts at ${formatTimeDisplay(schedule.startTime)} · Auto-arms on plug-in`;

  return (
    <section
      aria-label="Daily Charge-Up Schedule"
      className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7 space-y-5"
    >
      {/* Header + Auto-Arm Switch */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
            Daily Charge-Up Schedule
          </h2>
          <p className="mt-1 text-xs text-[#54665F] dark:text-[#93A8A0] tabular-nums">
            {statusText}
            {lastAutoArmedLabel ? ` · Last auto-armed ${lastAutoArmedLabel}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-[#4F615A] dark:text-[#96ABA3]">
            Auto-arm overnight
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={schedule.enabled}
            aria-label="Auto-arm alarm during overnight charge schedule"
            onClick={() => onUpdateSchedule({ enabled: !schedule.enabled })}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              schedule.enabled ? 'bg-emerald-600' : 'bg-[#CBD5D1] dark:bg-[#2A3732]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                schedule.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Suggested Pattern Strip */}
      <div className="pt-4 border-t border-[#E8EFEC] dark:border-[#1E2A25] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
            <CalendarClock className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-[#111816] dark:text-[#F3F7F5]">
              <span>Suggested window:</span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatTimeDisplay(suggested.startTime)} – {formatTimeDisplay(suggested.endTime)}
              </span>
              <span aria-hidden="true" className="text-[#889B94]">
                ·
              </span>
              <span className="font-mono tabular-nums">{suggested.target}% cap</span>
            </div>
            <p className="mt-0.5 text-xs text-[#54665F] dark:text-[#93A8A0]">{suggested.reason}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {matchesSuggested ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-2 py-2 whitespace-nowrap">
              <Check className="w-4 h-4" aria-hidden="true" />
              Suggested applied
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                onUpdateSchedule({
                  startTime: suggested.startTime,
                  endTime: suggested.endTime,
                  scheduledTarget: suggested.target,
                  enabled: true,
                })
              }
              className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Apply Suggested
            </button>
          )}
        </div>
      </div>

      {/* Editable Schedule Window & Overnight Target */}
      <div className="pt-4 border-t border-[#E8EFEC] dark:border-[#1E2A25] grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
        <div className="sm:col-span-3">
          <label
            htmlFor="schedule-start"
            className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1.5"
          >
            Window starts
          </label>
          <input
            id="schedule-start"
            type="time"
            value={schedule.startTime}
            onChange={(e) => onUpdateSchedule({ startTime: e.target.value })}
            className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3 font-mono text-sm tabular-nums text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="schedule-end"
            className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1.5"
          >
            Window ends
          </label>
          <input
            id="schedule-end"
            type="time"
            value={schedule.endTime}
            onChange={(e) => onUpdateSchedule({ endTime: e.target.value })}
            className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3 font-mono text-sm tabular-nums text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="sm:col-span-4">
          <span className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1.5">
            Scheduled alarm target
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {SCHEDULE_TARGETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => onUpdateSchedule({ scheduledTarget: pct })}
                className={`min-h-[44px] rounded-xl font-mono text-xs font-semibold tabular-nums transition-colors whitespace-nowrap ${
                  schedule.scheduledTarget === pct
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#F2F6F4] dark:bg-[#192320] text-[#374842] dark:text-[#B4C5BE] hover:bg-[#E5ECE9] dark:hover:bg-[#22302B]'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => onSimulateOvernightPlugIn(schedule.scheduledTarget)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-xs font-semibold text-[#111816] dark:text-[#EEF3F1] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            Test Now
          </button>
        </div>
      </div>
    </section>
  );
};
