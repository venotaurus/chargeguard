import React, { useMemo, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Code2,
  Cpu,
  Flame,
  Info,
  Plus,
  RotateCcw,
  Smartphone,
  Zap,
} from 'lucide-react';
import { DrainCategory, DrainLogEntry } from '../types/battery';

interface BatteryDrainPanelProps {
  entries: DrainLogEntry[];
  isCharging: boolean;
  currentLevel: number;
  onAddEntry: (entry: Omit<DrainLogEntry, 'id' | 'timestamp'>) => void;
  onResetEntries: () => void;
  onLoadSampleEntries: () => void;
  onOpenAndroidCode: () => void;
}

interface AggregatedDrainItem {
  key: string;
  name: string;
  category: DrainCategory;
  totalPercent: number;
  sharePercent: number;
  totalMinutes: number;
  backgroundMinutes: number;
  ratePerHour: number;
  sessionsCount: number;
  tip: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatMinutes(mins: number): string {
  const rounded = Math.max(1, Math.round(mins));
  if (rounded < 60) return `${rounded}m`;
  const hrs = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function createInitialDrainHistory(): DrainLogEntry[] {
  const now = Date.now();
  return [
    {
      id: 'seed-1',
      name: 'Screen & Display',
      category: 'system',
      percentDrained: 16.4,
      durationMinutes: 145,
      backgroundMinutes: 0,
      timestamp: now - 2 * HOUR_MS,
      tip: 'Enable adaptive brightness and use dark mode or a 60Hz refresh rate to cut display drain by up to 30%.',
    },
    {
      id: 'seed-2',
      name: 'Video Streaming',
      category: 'app',
      percentDrained: 13.8,
      durationMinutes: 68,
      backgroundMinutes: 6,
      timestamp: now - 4 * HOUR_MS,
      tip: 'Lowering playback resolution from 4K/1440p to 1080p and downloading videos on Wi-Fi reduces decoder and radio power draw.',
    },
    {
      id: 'seed-3',
      name: 'Mobile Network & 5G',
      category: 'system',
      percentDrained: 9.6,
      durationMinutes: 210,
      backgroundMinutes: 210,
      timestamp: now - 6 * HOUR_MS,
      tip: 'Weak 5G signal forces the modem to boost transmit power. Switch to 4G/LTE indoors or use Wi-Fi calling when available.',
    },
    {
      id: 'seed-4',
      name: 'Social Feeds',
      category: 'app',
      percentDrained: 8.5,
      durationMinutes: 54,
      backgroundMinutes: 32,
      timestamp: now - 9 * HOUR_MS,
      tip: 'Restrict background data and disable autoplay videos to stop silent background wakeups.',
    },
    {
      id: 'seed-5',
      name: 'Maps & GPS Navigation',
      category: 'app',
      percentDrained: 7.2,
      durationMinutes: 35,
      backgroundMinutes: 14,
      timestamp: now - 13 * HOUR_MS,
      tip: 'Set location access to "Only while using the app" and download offline maps for frequent routes.',
    },
    {
      id: 'seed-6',
      name: 'Background Sync & Cloud',
      category: 'system',
      percentDrained: 4.9,
      durationMinutes: 95,
      backgroundMinutes: 95,
      timestamp: now - 17 * HOUR_MS,
      tip: 'Schedule photo backups and app updates for Wi-Fi + charging only in Android settings.',
    },
    // Additional 7-day historical records
    {
      id: 'seed-7',
      name: 'Screen & Display',
      category: 'system',
      percentDrained: 28.0,
      durationMinutes: 260,
      backgroundMinutes: 0,
      timestamp: now - 2.2 * DAY_MS,
      tip: 'Enable adaptive brightness and use dark mode or a 60Hz refresh rate to cut display drain by up to 30%.',
    },
    {
      id: 'seed-8',
      name: 'Video Streaming',
      category: 'app',
      percentDrained: 21.5,
      durationMinutes: 112,
      backgroundMinutes: 10,
      timestamp: now - 3.1 * DAY_MS,
      tip: 'Lowering playback resolution from 4K/1440p to 1080p and downloading videos on Wi-Fi reduces decoder and radio power draw.',
    },
    {
      id: 'seed-9',
      name: 'Mobile Gaming',
      category: 'app',
      percentDrained: 18.4,
      durationMinutes: 46,
      backgroundMinutes: 2,
      timestamp: now - 4.0 * DAY_MS,
      tip: 'Cap frame rate to 60fps and reduce screen brightness during long gaming sessions to limit GPU heat and drain.',
    },
    {
      id: 'seed-10',
      name: 'Mobile Network & 5G',
      category: 'system',
      percentDrained: 15.2,
      durationMinutes: 360,
      backgroundMinutes: 360,
      timestamp: now - 5.0 * DAY_MS,
      tip: 'Weak 5G signal forces the modem to boost transmit power. Switch to 4G/LTE indoors or use Wi-Fi calling when available.',
    },
  ];
}

export const BatteryDrainPanel: React.FC<BatteryDrainPanelProps> = ({
  entries,
  isCharging,
  currentLevel,
  onAddEntry,
  onResetEntries,
  onLoadSampleEntries,
  onOpenAndroidCode,
}) => {
  const [timeframe, setTimeframe] = useState<'24h' | '7d'>('24h');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DrainCategory>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Manual unplugged observation form state
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<DrainCategory>('app');
  const [newPercent, setNewPercent] = useState<string>('5');
  const [newMinutes, setNewMinutes] = useState<string>('30');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    filteredItems,
    totalUnpluggedDrain,
    avgDrainRatePerHour,
    topDrainer,
    appSharePct,
    systemSharePct,
  } = useMemo(() => {
    const now = Date.now();
    const cutoff = now - (timeframe === '24h' ? DAY_MS : 7 * DAY_MS);
    const inWindow = entries.filter((e) => e.timestamp >= cutoff);

    const grouped = new Map<
      string,
      {
        name: string;
        category: DrainCategory;
        totalPercent: number;
        totalMinutes: number;
        backgroundMinutes: number;
        sessionsCount: number;
        tip: string;
      }
    >();

    let totalDrainAll = 0;
    let totalDurationAll = 0;
    let appTotal = 0;
    let systemTotal = 0;

    for (const e of inWindow) {
      totalDrainAll += e.percentDrained;
      totalDurationAll += e.durationMinutes;
      if (e.category === 'app') appTotal += e.percentDrained;
      else systemTotal += e.percentDrained;

      const key = `${e.category}:${e.name.toLowerCase()}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalPercent += e.percentDrained;
        existing.totalMinutes += e.durationMinutes;
        existing.backgroundMinutes += e.backgroundMinutes;
        existing.sessionsCount += 1;
      } else {
        grouped.set(key, {
          name: e.name,
          category: e.category,
          totalPercent: e.percentDrained,
          totalMinutes: e.durationMinutes,
          backgroundMinutes: e.backgroundMinutes,
          sessionsCount: 1,
          tip: e.tip,
        });
      }
    }

    const allAggregated: AggregatedDrainItem[] = Array.from(grouped.entries())
      .map(([key, item]) => {
        const hours = Math.max(0.1, item.totalMinutes / 60);
        return {
          key,
          name: item.name,
          category: item.category,
          totalPercent: Number(item.totalPercent.toFixed(1)),
          sharePercent:
            totalDrainAll > 0 ? Math.round((item.totalPercent / totalDrainAll) * 100) : 0,
          totalMinutes: item.totalMinutes,
          backgroundMinutes: item.backgroundMinutes,
          ratePerHour: Number((item.totalPercent / hours).toFixed(1)),
          sessionsCount: item.sessionsCount,
          tip: item.tip,
        };
      })
      .sort((a, b) => b.totalPercent - a.totalPercent);

    const visible =
      categoryFilter === 'all'
        ? allAggregated
        : allAggregated.filter((i) => i.category === categoryFilter);

    const avgRate =
      totalDurationAll > 0
        ? Number((totalDrainAll / Math.max(0.25, totalDurationAll / 60)).toFixed(1))
        : 0;

    const appPct = totalDrainAll > 0 ? Math.round((appTotal / totalDrainAll) * 100) : 0;
    const sysPct = totalDrainAll > 0 ? Math.max(0, 100 - appPct) : 0;

    return {
      filteredItems: visible,
      totalUnpluggedDrain: Number(totalDrainAll.toFixed(1)),
      avgDrainRatePerHour: avgRate,
      topDrainer: allAggregated[0] ?? null,
      appSharePct: appPct,
      systemSharePct: sysPct,
    };
  }, [entries, timeframe, categoryFilter]);

  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    const pct = Number(newPercent);
    const mins = Number(newMinutes);

    if (!trimmed) {
      setFormError('Enter an app or system process name.');
      return;
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setFormError('Battery drained must be between 0.5% and 100%.');
      return;
    }
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
      setFormError('Duration must be between 1 and 1440 minutes.');
      return;
    }

    setFormError(null);
    onAddEntry({
      name: trimmed.slice(0, 40),
      category: newCategory,
      percentDrained: Number(pct.toFixed(1)),
      durationMinutes: Math.round(mins),
      backgroundMinutes: newCategory === 'system' ? Math.round(mins) : Math.round(mins * 0.25),
      tip:
        newCategory === 'system'
          ? `Review Android system settings for ${trimmed} and limit always-on scanning when unplugged.`
          : `Set ${trimmed} to "Restricted" background battery usage in Android App Info to curb idle drain.`,
    });

    setNewName('');
    setNewPercent('5');
    setNewMinutes('30');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Top 3 Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
              Unplugged Drain ({timeframe})
            </span>
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
              -{totalUnpluggedDrain}%
            </span>
            <span className="font-mono text-xs tabular-nums text-[#54665F] dark:text-[#93A8A0]">
              {avgDrainRatePerHour}%/hr avg
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5E716A] dark:text-[#869B93]">
            {isCharging
              ? `Paused while charging (${currentLevel}%)`
              : `Tracking unplugged discharge (${currentLevel}%)`}
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
              Highest Battery Drain
            </span>
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-[#111816] dark:text-[#F3F7F5] truncate">
              {topDrainer ? topDrainer.name : 'No data'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5E716A] dark:text-[#869B93] tabular-nums">
            {topDrainer
              ? `${topDrainer.sharePercent}% of unplugged drain (-${topDrainer.totalPercent}%)`
              : 'Discharge battery to identify top consumers'}
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
              Apps vs System Split
            </span>
            <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-bold text-[#111816] dark:text-[#F3F7F5]">
              {appSharePct}%
            </span>
            <span className="text-xs text-[#54665F] dark:text-[#93A8A0]">
              Apps · {systemSharePct}% System
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5E716A] dark:text-[#869B93]">
            Measured only while disconnected from power
          </p>
        </div>
      </div>

      {/* Main Ranked Drain Breakdown Card */}
      <section
        aria-label="Apps and system processes causing battery drain"
        className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[#111816] dark:text-[#F3F7F5]">
              Unplugged Battery Drain by App & Process
            </h1>
            <p className="mt-0.5 text-xs text-[#54665F] dark:text-[#93A8A0] tabular-nums">
              {filteredItems.length} tracked{' '}
              {filteredItems.length === 1 ? 'contributor' : 'contributors'} · Tap any row for power-saving advice
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Timeframe Filter */}
            <div className="inline-flex p-1 rounded-xl bg-[#EEF3F1] dark:bg-[#1A2420]">
              <button
                type="button"
                onClick={() => setTimeframe('24h')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  timeframe === '24h'
                    ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                    : 'text-[#54665F] dark:text-[#8EA39B]'
                }`}
              >
                24h
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('7d')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  timeframe === '7d'
                    ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                    : 'text-[#54665F] dark:text-[#8EA39B]'
                }`}
              >
                7 Days
              </button>
            </div>

            {/* Category Filter */}
            <div className="inline-flex p-1 rounded-xl bg-[#EEF3F1] dark:bg-[#1A2420]">
              {(['all', 'app', 'system'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                      : 'text-[#54665F] dark:text-[#8EA39B]'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat === 'app' ? 'Apps' : 'System'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Log Usage
            </button>

            <button
              type="button"
              onClick={entries.length > 0 ? onResetEntries : onLoadSampleEntries}
              className="min-h-[40px] px-3 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-xs font-medium text-[#54665F] dark:text-[#93A8A0] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              {entries.length > 0 ? 'Clear' : 'Sample Data'}
            </button>
          </div>
        </div>

        {/* Optional Collapsible Log Usage Form */}
        {showAddForm && (
          <form
            onSubmit={handleSubmitEntry}
            className="mt-5 pt-5 border-t border-[#E8EFEC] dark:border-[#1E2A25] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-4">
              <label
                htmlFor="drain-name"
                className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1"
              >
                App or process name
              </label>
              <input
                id="drain-name"
                type="text"
                placeholder="e.g., Camera, Bluetooth, Chrome"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3 text-sm text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="drain-cat"
                className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1"
              >
                Type
              </label>
              <select
                id="drain-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as DrainCategory)}
                className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3 text-sm text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="app">App</option>
                <option value="system">System</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="drain-pct"
                className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1"
              >
                Drain (%)
              </label>
              <input
                id="drain-pct"
                type="number"
                min={0.5}
                max={100}
                step={0.5}
                value={newPercent}
                onChange={(e) => setNewPercent(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3 font-mono text-sm tabular-nums text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="drain-mins"
                className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1"
              >
                Duration (min)
              </label>
              <input
                id="drain-mins"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={newMinutes}
                onChange={(e) => setNewMinutes(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3 font-mono text-sm tabular-nums text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-[#111816] dark:bg-[#EEF3F1] text-white dark:text-[#111816] text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Save
              </button>
            </div>

            {formError && (
              <p role="alert" className="sm:col-span-12 text-xs text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
          </form>
        )}

        {/* Ranked List */}
        <div className="mt-5 pt-2 border-t border-[#E8EFEC] dark:border-[#1E2A25]">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <Zap className="w-7 h-7 mx-auto text-[#8A9C95] dark:text-[#5B6F67]" aria-hidden="true" />
              <p className="mt-2.5 text-sm font-medium text-[#111816] dark:text-[#EEF3F1]">
                No unplugged drain records in this range
              </p>
              <p className="mt-1 text-xs text-[#54665F] dark:text-[#93A8A0] max-w-sm mx-auto">
                ChargeGuard logs battery drops automatically while unplugged, or you can load sample data or add an entry manually.
              </p>
              <button
                type="button"
                onClick={onLoadSampleEntries}
                className="mt-4 min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Load Historical Sample
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#E8EFEC] dark:divide-[#1E2A25]">
              {filteredItems.map((item, idx) => {
                const isExpanded = expandedKey === item.key;
                const impact =
                  item.sharePercent >= 25
                    ? {
                        label: 'High impact',
                        barClass: 'bg-red-500 dark:bg-red-400',
                        textClass: 'text-red-600 dark:text-red-400',
                      }
                    : item.sharePercent >= 14
                    ? {
                        label: 'Moderate',
                        barClass: 'bg-amber-500 dark:bg-amber-400',
                        textClass: 'text-amber-700 dark:text-amber-400',
                      }
                    : {
                        label: 'Low',
                        barClass: 'bg-emerald-600 dark:bg-emerald-500',
                        textClass: 'text-emerald-700 dark:text-emerald-400',
                      };

                const maxShare = filteredItems[0]?.sharePercent || 1;
                const barWidthPct = Math.max(6, Math.round((item.sharePercent / maxShare) * 100));

                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : item.key)}
                      aria-expanded={isExpanded}
                      className="w-full py-4 text-left flex flex-col gap-2.5 hover:bg-[#F8FAF9] dark:hover:bg-[#17211E] -mx-3 px-3 rounded-2xl transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF3F1] dark:bg-[#1B2622] text-[#374842] dark:text-[#B4C5BE]">
                            {item.category === 'system' ? (
                              <Cpu className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <Smartphone className="w-4 h-4" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-[#6B7E77] dark:text-[#7F948C] tabular-nums">
                                0{idx + 1}
                              </span>
                              <p className="text-sm font-semibold text-[#111816] dark:text-[#F3F7F5] truncate">
                                {item.name}
                              </p>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#54665F] dark:text-[#93A8A0]">
                              <span>{item.category === 'system' ? 'System process' : 'App'}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{formatMinutes(item.totalMinutes)} total</span>
                              {item.backgroundMinutes > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">
                                    {formatMinutes(item.backgroundMinutes)} background
                                  </span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{item.ratePerHour}%/hr</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                              -{item.totalPercent}%
                            </p>
                            <p className={`text-xs font-medium tabular-nums ${impact.textClass}`}>
                              {item.sharePercent}% · {impact.label}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[#6B7E77]" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[#6B7E77]" aria-hidden="true" />
                          )}
                        </div>
                      </div>

                      {/* Proportional drain bar */}
                      <div className="pl-12">
                        <div className="h-1.5 w-full rounded-full bg-[#E8EFEC] dark:bg-[#1E2A25] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${impact.barClass} transition-all duration-300`}
                            style={{ width: `${barWidthPct}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="pb-4 pl-12 pr-3 text-xs leading-relaxed text-[#4A5C55] dark:text-[#A4B7B0]">
                        <strong className="text-[#111816] dark:text-[#EEF3F1]">How to reduce drain: </strong>
                        {item.tip}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Native Android OS Telemetry Note */}
        <div className="mt-5 pt-4 border-t border-[#E8EFEC] dark:border-[#1E2A25] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#5E716A] dark:text-[#869B93]">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Web browsers automatically track overall unplugged discharge drops; for direct OS-level per-app Android UsageStats telemetry, use the included <code className="font-mono text-[#111816] dark:text-[#EEF3F1]">BatteryDrainMonitor.kt</code>.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenAndroidCode}
            className="min-h-[40px] px-3 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-xs font-semibold text-[#111816] dark:text-[#EEF3F1] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap self-start sm:self-auto shrink-0"
          >
            <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
            View Kotlin Monitor
          </button>
        </div>
      </section>
    </div>
  );
};
