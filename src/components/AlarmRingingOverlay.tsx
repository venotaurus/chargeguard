import React, { useEffect } from 'react';
import { BellRing, Plus, VolumeX, ZapOff } from 'lucide-react';
import { TriggeredAlarmState } from '../types/battery';

interface AlarmRingingOverlayProps {
  alarm: TriggeredAlarmState | null;
  onStop: () => void;
  onSnoozePlusFive: () => void;
}

export const AlarmRingingOverlay: React.FC<AlarmRingingOverlayProps> = ({
  alarm,
  onStop,
  onSnoozePlusFive,
}) => {
  useEffect(() => {
    if (!alarm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onStop();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [alarm, onStop]);

  if (!alarm) return null;

  const isChargeUp = alarm.direction === 'charge_up';
  const canSnooze = isChargeUp && alarm.threshold <= 95;
  const nextSnoozeTarget = Math.min(100, alarm.threshold + 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alarm-ringing-title"
      aria-describedby="alarm-ringing-desc"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#131A18] border border-red-200 dark:border-red-900/60 p-7 shadow-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-white">
          <BellRing className="h-8 w-8 animate-bounce" aria-hidden="true" />
        </div>

        <p className="mt-5 text-xs font-semibold text-red-700 dark:text-red-400">
          {isChargeUp ? 'Charge Target Reached' : 'Low Battery Threshold Reached'}
        </p>

        <h2
          id="alarm-ringing-title"
          className="mt-1.5 font-mono text-5xl font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]"
        >
          {alarm.currentLevel}%
        </h2>

        <p
          id="alarm-ringing-desc"
          className="mt-3 text-sm leading-relaxed text-[#4A5C55] dark:text-[#9CB0A8]"
        >
          {isChargeUp
            ? `Your battery hit the ${alarm.threshold}% charging alarm. Unplug your charger now to preserve long-term battery health.`
            : `Your battery reached the ${alarm.threshold}% low-level alert. Connect your charger soon.`}
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={onStop}
            className="w-full min-h-[52px] rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            <VolumeX className="w-5 h-5" aria-hidden="true" />
            Stop Alarm
          </button>

          {canSnooze && (
            <button
              type="button"
              onClick={onSnoozePlusFive}
              className="w-full min-h-[48px] rounded-2xl border border-[#D4DDD9] dark:border-[#2A3732] bg-transparent hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-[#111816] dark:text-[#EEF3F1] font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Raise Target to {nextSnoozeTarget}%
            </button>
          )}
        </div>

        {isChargeUp && (
          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[#5E716A] dark:text-[#869B93]">
            <ZapOff className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Unplugging the cable also silences the alert automatically</span>
          </div>
        )}
      </div>
    </div>
  );
};
