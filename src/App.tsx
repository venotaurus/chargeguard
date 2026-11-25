import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronRight,
  Code2,
  FolderOpen,
  HeartPulse,
  Minus,
  Moon,
  Play,
  Plug,
  PlugZap,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { AlarmRingingOverlay } from './components/AlarmRingingOverlay';
import { AndroidCodePanel } from './components/AndroidCodePanel';
import {
  BatteryDrainPanel,
  createInitialDrainHistory,
} from './components/BatteryDrainPanel';
import { BatteryGauge } from './components/BatteryGauge';
import {
  BatteryHealthPanel,
  computeBatteryHealthScore,
} from './components/BatteryHealthPanel';
import { BatteryTemperatureCard } from './components/BatteryTemperatureCard';
import {
  ChargeScheduleCard,
  isNowInScheduleWindow,
} from './components/ChargeScheduleCard';
import { ChargingWisdom } from './components/ChargingWisdom';
import {
  ChargingHistoryChart,
  createSample24hHistory,
} from './components/ChargingHistoryChart';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { useBatteryMonitor, useWakeLock } from './hooks/useBatteryMonitor';
import {
  AlarmSettings,
  AlarmSoundId,
  BatteryHealthData,
  BatteryHistoryPoint,
  ChargeScheduleConfig,
  ChargeSession,
  CustomToneMeta,
  DrainLogEntry,
  MainView,
  TriggeredAlarmState,
} from './types/battery';
import {
  ALARM_SOUND_OPTIONS,
  alarmAudio,
  getNotificationPermission,
  requestNotificationPermission,
  sendBatteryNotification,
  sendTemperatureWarningNotification,
} from './utils/alarmAudio';
import { backgroundKeepAlive } from './utils/backgroundKeepAlive';
import { deleteCustomTone, listCustomTones, saveCustomTone } from './utils/customToneStore';

const STORAGE_KEY_TARGET = 'chargeguard_target_v1';
const STORAGE_KEY_SETTINGS = 'chargeguard_settings_v1';
const STORAGE_KEY_THEME = 'chargeguard_theme_v1';
const STORAGE_KEY_HEALTH = 'chargeguard_health_v1';
const STORAGE_KEY_ARMED = 'chargeguard_armed_v1';
const STORAGE_KEY_HISTORY_24H = 'chargeguard_history_24h_v1';
const STORAGE_KEY_DRAIN_LOG = 'chargeguard_drain_log_v1';
const STORAGE_KEY_SCHEDULE = 'chargeguard_schedule_v1';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const OVERHEAT_THRESHOLD_C = 40;
const PRESET_TARGETS = [75, 80, 85, 90, 100];

const DEFAULT_SCHEDULE: ChargeScheduleConfig = {
  enabled: true,
  startTime: '22:30',
  endTime: '07:00',
  scheduledTarget: 80,
  lastAutoArmedAt: null,
};

const DEFAULT_SETTINGS: AlarmSettings = {
  soundId: 'chime',
  volume: 0.85,
  vibrate: true,
  repeatUntilStopped: true,
  voiceAnnounce: false,
  keepScreenAwake: true,
  backgroundKeepAlive: true,
  browserNotifications: true,
};

const DEFAULT_HEALTH: BatteryHealthData = {
  equivalentCycles: 0,
  totalPercentCharged: 0,
  highVoltageCharges: 0,
  optimalCharges: 0,
  deepDischarges: 0,
  deviceAgeMonths: 6,
  sessions: [],
};

function loadTarget(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TARGET);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 100) {
        return Math.round(parsed);
      }
    }
  } catch {
    // Ignore
  }
  return 80;
}

function loadSettings(): AlarmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AlarmSettings>) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_SETTINGS;
}

function loadHealth(): BatteryHealthData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HEALTH);
    if (raw) {
      return { ...DEFAULT_HEALTH, ...(JSON.parse(raw) as Partial<BatteryHealthData>) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_HEALTH;
}

function loadHistory24h(initialTarget: number): BatteryHistoryPoint[] {
  const cutoff = Date.now() - DAY_MS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY_24H);
    if (raw) {
      const parsed = JSON.parse(raw) as BatteryHistoryPoint[];
      if (Array.isArray(parsed)) {
        const recent = parsed.filter(
          (p) =>
            typeof p.timestamp === 'number' &&
            typeof p.level === 'number' &&
            typeof p.charging === 'boolean' &&
            p.timestamp >= cutoff
        );
        if (recent.length > 0) return recent;
      }
    }
  } catch {
    // Ignore
  }
  return createSample24hHistory(initialTarget, 20);
}

function loadDrainLog(): DrainLogEntry[] {
  const cutoff = Date.now() - WEEK_MS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DRAIN_LOG);
    if (raw) {
      const parsed = JSON.parse(raw) as DrainLogEntry[];
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (e) =>
            typeof e.id === 'string' &&
            typeof e.name === 'string' &&
            typeof e.percentDrained === 'number' &&
            typeof e.timestamp === 'number' &&
            e.timestamp >= cutoff
        );
      }
    }
  } catch {
    // Ignore
  }
  return createInitialDrainHistory();
}

function loadDarkTheme(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    // Ignore
  }
  return false;
}

function loadArmed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_ARMED) === 'true';
  } catch {
    return false;
  }
}

function loadSchedule(): ChargeScheduleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCHEDULE);
    if (raw) {
      return { ...DEFAULT_SCHEDULE, ...(JSON.parse(raw) as Partial<ChargeScheduleConfig>) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_SCHEDULE;
}

export default function App() {
  const [activeView, setActiveView] = useState<MainView>('alarm');
  const [targetPercent, setTargetPercent] = useState<number>(loadTarget);
  const [isArmed, setIsArmed] = useState<boolean>(loadArmed);
  const [settings, setSettings] = useState<AlarmSettings>(loadSettings);
  const [health, setHealth] = useState<BatteryHealthData>(loadHealth);
  const [history24h, setHistory24h] = useState<BatteryHistoryPoint[]>(() =>
    loadHistory24h(loadTarget())
  );
  const [drainEntries, setDrainEntries] = useState<DrainLogEntry[]>(loadDrainLog);
  const [schedule, setSchedule] = useState<ChargeScheduleConfig>(loadSchedule);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [batteryTempC, setBatteryTempC] = useState<number>(30.5);
  const [peakTempC, setPeakTempC] = useState<number>(33.2);
  const [tempAlertsEnabled, setTempAlertsEnabled] = useState<boolean>(true);
  const [tempBannerDismissed, setTempBannerDismissed] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(loadDarkTheme);
  const [customTones, setCustomTones] = useState<CustomToneMeta[]>([]);
  const [toneUploadError, setToneUploadError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermission
  );
  const [backgroundRunning, setBackgroundRunning] = useState<boolean>(false);
  const [triggeredAlarm, setTriggeredAlarm] = useState<TriggeredAlarmState | null>(null);
  const [showKotlinModal, setShowKotlinModal] = useState<boolean>(false);

  const hasTriggeredRef = useRef<boolean>(false);
  const manualDisarmWhilePluggedRef = useRef<boolean>(false);
  const manualTempOverrideRef = useRef<boolean>(false);
  const overheatNotifiedRef = useRef<boolean>(false);
  const chargeStartRef = useRef<{ level: number; startedAt: number } | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  const lastUnpluggedTickRef = useRef<number>(Date.now());
  const prevHistorySampleRef = useRef<{ level: number; charging: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    sourceMode,
    setSourceMode,
    liveBattery,
    currentLevel,
    rawSimLevel,
    setSimLevel,
    isCharging,
    simCharging,
    setSimCharging,
    setSimRatePerSecond,
    chargingTimeSeconds,
    startDemoFromTwenty,
    pollBatteryNow,
  } = useBatteryMonitor();

  const { wakeLockSupported, wakeLockActive } = useWakeLock(
    isArmed && settings.keepScreenAwake
  );

  // Load saved custom tones from IndexedDB on startup
  useEffect(() => {
    void listCustomTones().then(setCustomTones);
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(STORAGE_KEY_THEME, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  }, [darkMode]);

  // Persist user state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TARGET, String(targetPercent));
    } catch {
      // Ignore
    }
  }, [targetPercent]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HEALTH, JSON.stringify(health));
    } catch {
      // Ignore
    }
  }, [health]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ARMED, String(isArmed));
    } catch {
      // Ignore
    }
  }, [isArmed]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY_24H, JSON.stringify(history24h));
    } catch {
      // Ignore
    }
  }, [history24h]);

  // Background monitoring keep-alive (Web Worker unthrottled polling + silent audio session)
  useEffect(() => {
    if (isArmed && settings.backgroundKeepAlive) {
      backgroundKeepAlive.start(() => {
        void pollBatteryNow();
      }, 3000);
      setBackgroundRunning(true);
    } else {
      backgroundKeepAlive.stop();
      setBackgroundRunning(false);
    }
    return () => {
      backgroundKeepAlive.stop();
      setBackgroundRunning(false);
    };
  }, [isArmed, settings.backgroundKeepAlive, pollBatteryNow]);

  // Append battery points to 24-hour charging history whenever level or power state changes
  useEffect(() => {
    const prev = prevHistorySampleRef.current;
    if (prev && prev.level === currentLevel && prev.charging === isCharging) {
      return;
    }
    prevHistorySampleRef.current = { level: currentLevel, charging: isCharging };

    const now = Date.now();
    const cutoff = now - DAY_MS;

    setHistory24h((existing) => {
      const pruned = existing.filter((p) => p.timestamp >= cutoff);
      const last = pruned[pruned.length - 1];
      // Avoid duplicate timestamps while keeping rapid simulator or live updates smooth
      const nextTs = last && now <= last.timestamp ? last.timestamp + 1000 : now;
      return [...pruned, { timestamp: nextTs, level: currentLevel, charging: isCharging }].slice(-240);
    });
  }, [currentLevel, isCharging]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DRAIN_LOG, JSON.stringify(drainEntries));
    } catch {
      // Ignore
    }
  }, [drainEntries]);

  // Track battery charge increments for Battery Health & unplugged discharge drops for Drain Monitor
  useEffect(() => {
    if (isCharging && !chargeStartRef.current) {
      chargeStartRef.current = { level: currentLevel, startedAt: Date.now() };
    } else if (!isCharging) {
      chargeStartRef.current = null;
    }

    const prev = prevLevelRef.current;
    prevLevelRef.current = currentLevel;
    if (prev === null || prev === currentLevel) return;

    const delta = currentLevel - prev;
    if (isCharging && delta > 0 && delta <= 25) {
      setHealth((h) => {
        const nextTotal = h.totalPercentCharged + delta;
        return {
          ...h,
          totalPercentCharged: nextTotal,
          equivalentCycles: Number((nextTotal / 100).toFixed(2)),
        };
      });
    } else if (!isCharging && delta < 0 && Math.abs(delta) <= 25) {
      const now = Date.now();
      const elapsedMins = Math.max(
        1,
        Math.round((now - lastUnpluggedTickRef.current) / 60_000)
      );
      lastUnpluggedTickRef.current = now;

      const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const entry: DrainLogEntry = {
        id: `auto-${now}-${Math.random().toString(36).slice(2, 6)}`,
        name: isVisible ? 'Screen & Display' : 'Background Sync & Cloud',
        category: 'system',
        percentDrained: Math.abs(delta),
        durationMinutes: elapsedMins,
        backgroundMinutes: isVisible ? 0 : elapsedMins,
        timestamp: now,
        tip: isVisible
          ? 'Enable adaptive brightness and use dark mode or a 60Hz refresh rate to cut display drain by up to 30%.'
          : 'Schedule photo backups and app updates for Wi-Fi + charging only in Android settings.',
      };

      setDrainEntries((existing) => {
        const cutoff = now - WEEK_MS;
        return [entry, ...existing.filter((e) => e.timestamp >= cutoff)].slice(0, 120);
      });

      if (prev >= 15 && currentLevel < 15) {
        setHealth((h) => ({ ...h, deepDischarges: h.deepDischarges + 1 }));
      }
    }
  }, [currentLevel, isCharging]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      alarmAudio.stop();
      backgroundKeepAlive.stop();
    };
  }, []);

  const stopActiveAlarm = useCallback(() => {
    alarmAudio.stop();
    setTriggeredAlarm(null);
  }, []);

  const recordChargeSession = useCallback(
    (outcome: 'reached_target' | 'snoozed') => {
      const startInfo = chargeStartRef.current;
      const startLevel = startInfo ? startInfo.level : Math.max(0, currentLevel - 20);
      const durationSeconds = startInfo
        ? Math.max(1, Math.round((Date.now() - startInfo.startedAt) / 1000))
        : 10;

      const session: ChargeSession = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        completedAt: new Date().toISOString(),
        startLevel,
        targetLevel: targetPercent,
        endLevel: currentLevel,
        durationSeconds,
        mode: sourceMode,
        outcome,
      };

      setHealth((h) => ({
        ...h,
        optimalCharges: currentLevel <= 85 ? h.optimalCharges + 1 : h.optimalCharges,
        highVoltageCharges: currentLevel >= 95 ? h.highVoltageCharges + 1 : h.highVoltageCharges,
        sessions: [session, ...h.sessions].slice(0, 20),
      }));
    },
    [currentLevel, targetPercent, sourceMode]
  );

  // Core alarm trigger watcher (runs in foreground & background)
  useEffect(() => {
    if (!isCharging) {
      if (triggeredAlarm) {
        stopActiveAlarm();
      }
      hasTriggeredRef.current = false;
      return;
    }

    if (currentLevel < targetPercent) {
      hasTriggeredRef.current = false;
      return;
    }

    if (isArmed && isCharging && currentLevel >= targetPercent && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      recordChargeSession('reached_target');

      setTriggeredAlarm({
        ruleId: 'primary-charge',
        label: `Charge Target ${targetPercent}%`,
        threshold: targetPercent,
        currentLevel,
        direction: 'charge_up',
        triggeredAt: Date.now(),
      });

      alarmAudio.startAlarm({
        soundId: settings.soundId,
        volume: settings.volume,
        vibrate: settings.vibrate,
        repeat: settings.repeatUntilStopped,
        voiceAnnounce: settings.voiceAnnounce,
        threshold: targetPercent,
        direction: 'charge_up',
      });

      if (settings.browserNotifications) {
        sendBatteryNotification(targetPercent, 'charge_up');
      }

      if (sourceMode === 'simulator') {
        setSimCharging(false);
      }
    }
  }, [
    isArmed,
    isCharging,
    currentLevel,
    targetPercent,
    settings,
    sourceMode,
    setSimCharging,
    triggeredAlarm,
    stopActiveAlarm,
    recordChargeSession,
  ]);

  // Persist schedule config & tick wall-clock every 30s for overnight schedule window detection
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(schedule));
    } catch {
      // Ignore
    }
  }, [schedule]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Automatically arm alarm when device is plugged in during the scheduled overnight window
  useEffect(() => {
    if (!isCharging) {
      manualDisarmWhilePluggedRef.current = false;
      return;
    }

    if (
      schedule.enabled &&
      !isArmed &&
      !manualDisarmWhilePluggedRef.current &&
      isNowInScheduleWindow(nowMs, schedule.startTime, schedule.endTime)
    ) {
      setTargetPercent(schedule.scheduledTarget);
      hasTriggeredRef.current = false;
      setIsArmed(true);
      setSchedule((prev) => ({ ...prev, lastAutoArmedAt: Date.now() }));
    }
  }, [
    isCharging,
    isArmed,
    nowMs,
    schedule.enabled,
    schedule.startTime,
    schedule.endTime,
    schedule.scheduledTarget,
  ]);

  const handleToggleArm = async () => {
    alarmAudio.unlock();
    if (isArmed) {
      if (isCharging) {
        manualDisarmWhilePluggedRef.current = true;
      }
      setIsArmed(false);
      stopActiveAlarm();
      hasTriggeredRef.current = false;
      return;
    }

    manualDisarmWhilePluggedRef.current = false;
    hasTriggeredRef.current = false;
    setIsArmed(true);

    if (settings.browserNotifications) {
      const perm = await requestNotificationPermission();
      setNotifPermission(perm);
    }
  };

  const handleUpdateSchedule = (patch: Partial<ChargeScheduleConfig>) => {
    setSchedule((prev) => ({ ...prev, ...patch }));
  };

  const handleSimulateOvernightPlugIn = (scheduledTarget: number) => {
    alarmAudio.unlock();
    stopActiveAlarm();
    manualDisarmWhilePluggedRef.current = false;
    hasTriggeredRef.current = false;
    setTargetPercent(scheduledTarget);
    setSchedule((prev) => ({ ...prev, enabled: true, lastAutoArmedAt: Date.now() }));
    setIsArmed(true);
    setSimRatePerSecond(6);
    startDemoFromTwenty();
  };

  // Smooth dynamic battery temperature model (unless manually adjusted via thermal test slider)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (manualTempOverrideRef.current) return;
      setBatteryTempC((prev) => {
        const targetTemp = isCharging ? (currentLevel >= 75 ? 36.2 : 34.5) : 29.5;
        const diff = targetTemp - prev;
        if (Math.abs(diff) < 0.15) return Number(targetTemp.toFixed(1));
        const next = prev + diff * 0.18;
        return Number(next.toFixed(1));
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isCharging, currentLevel]);

  // Track peak temperature and trigger safety alert & notification above 40°C
  useEffect(() => {
    setPeakTempC((prev) => (batteryTempC > prev ? batteryTempC : prev));

    if (batteryTempC <= OVERHEAT_THRESHOLD_C - 1.5) {
      overheatNotifiedRef.current = false;
      setTempBannerDismissed(false);
      return;
    }

    if (batteryTempC > OVERHEAT_THRESHOLD_C && !overheatNotifiedRef.current) {
      overheatNotifiedRef.current = true;
      setTempBannerDismissed(false);

      if (tempAlertsEnabled) {
        sendTemperatureWarningNotification(batteryTempC);
        if (!triggeredAlarm) {
          alarmAudio.unlock();
          void alarmAudio.playPatternOnce('beep', Math.min(0.85, settings.volume));
        }
        if (settings.vibrate && 'vibrate' in navigator) {
          try {
            navigator.vibrate([300, 150, 300]);
          } catch {
            // Ignore
          }
        }
      }
    }
  }, [batteryTempC, tempAlertsEnabled, triggeredAlarm, settings.volume, settings.vibrate]);

  const handleManualTempChange = (nextTemp: number) => {
    manualTempOverrideRef.current = true;
    const clamped = Math.max(20, Math.min(50, Number(nextTemp.toFixed(1))));
    setBatteryTempC(clamped);
    if (clamped <= OVERHEAT_THRESHOLD_C) {
      overheatNotifiedRef.current = false;
      setTempBannerDismissed(false);
    }
  };

  const handleTestOverheat = async () => {
    alarmAudio.unlock();
    if (tempAlertsEnabled) {
      const perm = await requestNotificationPermission();
      setNotifPermission(perm);
    }
    manualTempOverrideRef.current = true;
    overheatNotifiedRef.current = false;
    setTempBannerDismissed(false);
    setBatteryTempC(42.5);
  };

  const handleCoolDownTemp = () => {
    manualTempOverrideRef.current = false;
    overheatNotifiedRef.current = false;
    setTempBannerDismissed(false);
    setBatteryTempC(30.0);
  };

  const handleTargetChange = (next: number) => {
    const clamped = Math.max(10, Math.min(100, Math.round(next)));
    setTargetPercent(clamped);
    if (currentLevel < clamped) {
      hasTriggeredRef.current = false;
    }
  };

  const handleSnoozePlusFive = () => {
    stopActiveAlarm();
    const nextTarget = Math.min(100, targetPercent + 5);
    setTargetPercent(nextTarget);
    hasTriggeredRef.current = false;
    if (sourceMode === 'simulator') {
      setSimCharging(true);
    }
  };

  const handleTestSound = () => {
    alarmAudio.unlock();
    void alarmAudio.playPatternOnce(
      settings.soundId,
      settings.volume,
      `Battery reached ${targetPercent} percent. Please unplug your charger.`
    );
    if (settings.vibrate && 'vibrate' in navigator) {
      try {
        navigator.vibrate([220, 120, 220]);
      } catch {
        // Ignore
      }
    }
  };

  const handleCustomFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setToneUploadError(null);
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) {
      setToneUploadError('Please pick an audio file (MP3, WAV, M4A, or OGG).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setToneUploadError('Audio file must be under 15 MB.');
      return;
    }

    try {
      const saved = await saveCustomTone(file);
      setCustomTones((prev) => [saved, ...prev]);
      const customId: AlarmSoundId = `custom:${saved.id}`;
      updateSetting('soundId', customId);
      alarmAudio.unlock();
      void alarmAudio.playPatternOnce(customId, settings.volume);
    } catch {
      setToneUploadError('Could not save audio file on this device.');
    }
  };

  const handleDeleteCustomTone = async (id: string) => {
    await deleteCustomTone(id);
    setCustomTones((prev) => prev.filter((t) => t.id !== id));
    if (settings.soundId === `custom:${id}`) {
      updateSetting('soundId', 'chime');
    }
  };

  const handleRunDemo = () => {
    alarmAudio.unlock();
    stopActiveAlarm();
    hasTriggeredRef.current = false;
    setIsArmed(true);
    setSimRatePerSecond(6);
    startDemoFromTwenty();
  };

  const handleResetHistory24h = () => {
    setHistory24h([{ timestamp: Date.now(), level: currentLevel, charging: isCharging }]);
  };

  const handleLoadSampleHistory24h = () => {
    setHistory24h(createSample24hHistory(targetPercent, currentLevel));
  };

  const handleAddDrainEntry = (entry: Omit<DrainLogEntry, 'id' | 'timestamp'>) => {
    const now = Date.now();
    const record: DrainLogEntry = {
      ...entry,
      id: `manual-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
    };
    setDrainEntries((prev) => [record, ...prev].slice(0, 120));
  };

  const handleResetDrainEntries = () => {
    setDrainEntries([]);
  };

  const handleLoadSampleDrainEntries = () => {
    setDrainEntries(createInitialDrainHistory());
  };

  const updateSetting = <K extends keyof AlarmSettings>(key: K, value: AlarmSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const selectedCustomTone = settings.soundId.startsWith('custom:')
    ? customTones.find((t) => `custom:${t.id}` === settings.soundId)
    : undefined;

  const healthScore = computeBatteryHealthScore({
    health,
    currentLevel,
    targetPercent,
    batteryTempC,
    peakTempC,
  });

  const healthScoreColorClass =
    healthScore.score >= 88
      ? 'text-emerald-700 dark:text-emerald-400'
      : healthScore.score >= 75
      ? 'text-sky-700 dark:text-sky-400'
      : healthScore.score >= 60
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-red-700 dark:text-red-400';

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F8F7] dark:bg-[#0B0F0E] text-[#111816] dark:text-[#EEF3F1]">
      {/* Simple Sticky Top Bar */}
      <header className="sticky top-0 z-30 h-14 bg-[#F6F8F7]/90 dark:bg-[#0B0F0E]/90 backdrop-blur-md border-b border-[#E2E9E6] dark:border-[#1B2521]">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('alarm');
            }}
            className="text-lg font-bold tracking-tight text-[#111816] dark:text-[#F3F7F5] whitespace-nowrap shrink-0"
          >
            ChargeGuard
          </a>

          <nav aria-label="Main sections" className="flex items-center gap-4 sm:gap-5 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveView('alarm')}
              className={`min-h-[40px] px-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'alarm'
                  ? 'border-emerald-600 text-[#111816] dark:text-white font-semibold'
                  : 'border-transparent text-[#54665F] dark:text-[#93A8A0] hover:text-[#111816] dark:hover:text-white'
              }`}
            >
              Alarm
            </button>
            <button
              type="button"
              onClick={() => setActiveView('drain')}
              className={`min-h-[40px] px-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'drain'
                  ? 'border-emerald-600 text-[#111816] dark:text-white font-semibold'
                  : 'border-transparent text-[#54665F] dark:text-[#93A8A0] hover:text-[#111816] dark:hover:text-white'
              }`}
            >
              Drain
            </button>
            <button
              type="button"
              onClick={() => setActiveView('health')}
              className={`min-h-[40px] px-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'health'
                  ? 'border-emerald-600 text-[#111816] dark:text-white font-semibold'
                  : 'border-transparent text-[#54665F] dark:text-[#93A8A0] hover:text-[#111816] dark:hover:text-white'
              }`}
            >
              Health
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#4F615A] hover:text-[#111816] hover:bg-[#E7EEEC] dark:text-[#93A8A0] dark:hover:text-white dark:hover:bg-[#192320] transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <PWAInstallButton compact />
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main id="top" className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {activeView === 'alarm' ? (
          <div className="space-y-6 lg:space-y-8">
            {/* Active Overheat UI Alert Banner (>40°C) */}
            {batteryTempC > OVERHEAT_THRESHOLD_C && !tempBannerDismissed && (
              <div
                role="alert"
                className="rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle
                    className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200 tabular-nums">
                      Safety Warning · Battery temperature reached {batteryTempC.toFixed(1)}°C
                    </p>
                    <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                      Exceeds the {OVERHEAT_THRESHOLD_C}°C safe limit. Unplug your charger and let the device cool down.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCoolDownTemp}
                    className="min-h-[40px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Cool Down
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempBannerDismissed(true)}
                    aria-label="Dismiss overheat warning banner"
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
              {/* Left Column: Battery Gauge + Primary Arm CTA */}
              <section className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7 flex flex-col items-center">
                <BatteryGauge
                  currentLevel={currentLevel}
                  targetLevel={targetPercent}
                  isCharging={isCharging}
                  isArmed={isArmed}
                  isRinging={Boolean(triggeredAlarm)}
                  sourceMode={sourceMode}
                  chargingTimeSeconds={chargingTimeSeconds}
                />

                {/* Primary Action */}
                <button
                  type="button"
                  onClick={handleToggleArm}
                  className={`mt-6 w-full min-h-[52px] px-5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2.5 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                    isArmed
                      ? 'bg-[#111816] hover:bg-[#222E2A] dark:bg-[#EEF3F1] dark:hover:bg-white text-white dark:text-[#111816]'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isArmed ? (
                    <>
                      <BellOff className="w-5 h-5 shrink-0" aria-hidden="true" />
                      Disarm Alarm ({targetPercent}%)
                    </>
                  ) : (
                    <>
                      <Bell className="w-5 h-5 shrink-0" aria-hidden="true" />
                      Arm Alarm at {targetPercent}%
                    </>
                  )}
                </button>

                {/* Quiet Background Protection Summary */}
                {isArmed && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 text-center">
                    <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {backgroundRunning
                        ? 'Background monitoring active'
                        : 'Foreground monitoring active'}
                      {notifPermission === 'granted' ? ' · Alerts allowed' : ''}
                    </span>
                  </div>
                )}

                {/* Battery Health Score Quick Readout */}
                <button
                  type="button"
                  onClick={() => setActiveView('health')}
                  aria-label={`Battery health score ${healthScore.score} out of 100, ${healthScore.grade}. Open Health view.`}
                  className="mt-5 w-full pt-4 border-t border-[#E8EFEC] dark:border-[#1E2A25] flex items-center justify-between gap-3 text-left group min-h-[44px]"
                >
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-[#54665F] dark:text-[#93A8A0] group-hover:text-[#111816] dark:group-hover:text-white transition-colors">
                    <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                    Battery health score
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                    <span className={`font-mono tabular-nums ${healthScoreColorClass}`}>
                      {healthScore.score}/100
                    </span>
                    <span className="text-[#9AAEA6] dark:text-[#4F635B]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[#111816] dark:text-[#EEF3F1]">{healthScore.grade}</span>
                    <ChevronRight
                      className="w-3.5 h-3.5 text-[#7A8F87] group-hover:translate-x-0.5 transition-transform"
                      aria-hidden="true"
                    />
                  </span>
                </button>

                {/* Simple Source Switch */}
                <div className="mt-3 w-full pt-4 border-t border-[#E8EFEC] dark:border-[#1E2A25] flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-[#54665F] dark:text-[#93A8A0]">
                    Battery source
                  </span>
                  <div className="inline-flex p-1 rounded-xl bg-[#EEF3F1] dark:bg-[#1A2420]">
                    <button
                      type="button"
                      disabled={!liveBattery.supported}
                      onClick={() => setSourceMode('live')}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        sourceMode === 'live'
                          ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                          : 'text-[#54665F] dark:text-[#8EA39B] disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceMode('simulator')}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        sourceMode === 'simulator'
                          ? 'bg-white dark:bg-[#273530] text-[#111816] dark:text-white shadow-xs'
                          : 'text-[#54665F] dark:text-[#8EA39B]'
                      }`}
                    >
                      Simulator
                    </button>
                  </div>
                </div>

                {/* Inline Simulator Controls */}
                {sourceMode === 'simulator' ? (
                  <div className="mt-4 w-full space-y-3.5 pt-4 border-t border-[#E8EFEC] dark:border-[#1E2A25]">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="sim-slider"
                        className="font-medium text-[#4F615A] dark:text-[#96ABA3]"
                      >
                        Simulated battery
                      </label>
                      <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#F3F7F5]">
                        {Math.round(rawSimLevel)}%
                      </span>
                    </div>
                    <input
                      id="sim-slider"
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      value={Math.round(rawSimLevel)}
                      onChange={(e) => setSimLevel(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #059669 0%, #059669 ${Math.round(
                          rawSimLevel
                        )}%, rgba(148, 163, 184, 0.28) ${Math.round(
                          rawSimLevel
                        )}%, rgba(148, 163, 184, 0.28) 100%)`,
                        borderRadius: '9999px',
                      }}
                      className="charge-slider w-full h-3"
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSimCharging((c) => !c)}
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                          simCharging
                            ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-600/35'
                            : 'border border-[#D4DDD9] dark:border-[#283631] text-[#111816] dark:text-[#EEF3F1] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522]'
                        }`}
                      >
                        {simCharging ? (
                          <>
                            <PlugZap className="w-4 h-4 shrink-0" aria-hidden="true" />
                            Unplug
                          </>
                        ) : (
                          <>
                            <Plug className="w-4 h-4 shrink-0" aria-hidden="true" />
                            Plug In
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleRunDemo}
                        className="min-h-[44px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5 fill-current shrink-0" aria-hidden="true" />
                        Demo 20% → {targetPercent}%
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunDemo}
                    className="mt-4 w-full min-h-[44px] px-4 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-xs font-semibold text-[#374842] dark:text-[#B9CAC3] flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    Try 20% → {targetPercent}% Simulator Demo
                  </button>
                )}
              </section>

              {/* Right Column: Target % + Sound & Background */}
              <section className="lg:col-span-7 space-y-6">
                {/* Target Percentage */}
                <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h1 className="text-lg font-semibold text-[#111816] dark:text-[#F3F7F5]">
                        Alarm Percentage
                      </h1>
                      <p className="mt-0.5 text-sm text-[#54665F] dark:text-[#93A8A0]">
                        Sound the alarm when charging reaches this level
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTargetChange(targetPercent - 1)}
                        aria-label="Decrease target percentage"
                        className="min-h-[44px] min-w-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="min-w-[68px] text-center font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {targetPercent}%
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTargetChange(targetPercent + 1)}
                        aria-label="Increase target percentage"
                        className="min-h-[44px] min-w-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-6">
                    <input
                      aria-label="Target charge percentage"
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={targetPercent}
                      onChange={(e) => handleTargetChange(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #059669 0%, #059669 ${
                          ((targetPercent - 10) / 90) * 100
                        }%, rgba(148, 163, 184, 0.28) ${
                          ((targetPercent - 10) / 90) * 100
                        }%, rgba(148, 163, 184, 0.28) 100%)`,
                        borderRadius: '9999px',
                      }}
                      className="charge-slider w-full h-3"
                    />
                    <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-[#657770] dark:text-[#839890]">
                      <span>10%</span>
                      <span>50%</span>
                      <span>80%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-5 gap-2">
                    {PRESET_TARGETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleTargetChange(preset)}
                        className={`min-h-[44px] rounded-xl font-mono text-sm font-semibold tabular-nums transition-colors whitespace-nowrap ${
                          targetPercent === preset
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#F2F6F4] dark:bg-[#192320] text-[#374842] dark:text-[#B4C5BE] hover:bg-[#E5ECE9] dark:hover:bg-[#22302B]'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alarm Tone (Default + Device Storage) & Background Monitoring */}
                <div className="rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#212E29] p-6 sm:p-7 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]">
                      Alarm Sound & Background
                    </h2>
                    <button
                      type="button"
                      onClick={handleTestSound}
                      className="min-h-[44px] px-4 rounded-xl border border-[#D4DDD9] dark:border-[#283631] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] text-sm font-medium text-[#111816] dark:text-[#EEF3F1] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      Test Sound
                    </button>
                  </div>

                  {/* Tone Selector + Pick From Device Storage */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="alarm-tone-select"
                        className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1.5"
                      >
                        Ringtone
                      </label>
                      <select
                        id="alarm-tone-select"
                        value={settings.soundId}
                        onChange={(e) => updateSetting('soundId', e.target.value as AlarmSoundId)}
                        className="w-full min-h-[44px] rounded-xl border border-[#D4DDD9] dark:border-[#283631] bg-[#FAFDFC] dark:bg-[#0F1513] px-3.5 text-sm font-medium text-[#111816] dark:text-[#EEF3F1] focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        <optgroup label="Default Tones">
                          {ALARM_SOUND_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </optgroup>
                        {customTones.length > 0 && (
                          <optgroup label="From Device Storage">
                            {customTones.map((tone) => (
                              <option key={tone.id} value={`custom:${tone.id}`}>
                                {tone.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-[#54665F] dark:text-[#93A8A0] mb-1.5">
                        Custom Audio File
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.ogg,.m4a"
                        onChange={handleCustomFilePick}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-dashed border-[#B8C7C1] dark:border-[#2F403A] hover:border-emerald-600 dark:hover:border-emerald-500 text-sm font-medium text-[#111816] dark:text-[#EEF3F1] inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                      >
                        <FolderOpen
                          className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                          aria-hidden="true"
                        />
                        Pick from Device
                      </button>
                    </div>
                  </div>

                  {/* Selected Custom Tone Quick Remove Row */}
                  {selectedCustomTone && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#F2F6F4] dark:bg-[#192320] text-xs">
                      <span className="truncate text-[#31413B] dark:text-[#C5D5CF]">
                        Using custom sound: <strong>{selectedCustomTone.name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCustomTone(selectedCustomTone.id)}
                        aria-label={`Remove ${selectedCustomTone.name}`}
                        className="min-h-[36px] px-2.5 rounded-lg text-[#54665F] hover:text-red-600 dark:text-[#93A8A0] dark:hover:text-red-400 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  )}

                  {toneUploadError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {toneUploadError}
                    </p>
                  )}

                  {/* Volume Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <label
                        htmlFor="volume-slider"
                        className="font-medium text-[#54665F] dark:text-[#93A8A0]"
                      >
                        Alarm Volume
                      </label>
                      <span className="font-mono font-semibold tabular-nums text-[#111816] dark:text-[#EEF3F1]">
                        {Math.round(settings.volume * 100)}%
                      </span>
                    </div>
                    <input
                      id="volume-slider"
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={Math.round(settings.volume * 100)}
                      onChange={(e) => updateSetting('volume', Number(e.target.value) / 100)}
                      style={{
                        background: `linear-gradient(to right, #059669 0%, #059669 ${Math.round(
                          settings.volume * 100
                        )}%, rgba(148, 163, 184, 0.28) ${Math.round(
                          settings.volume * 100
                        )}%, rgba(148, 163, 184, 0.28) 100%)`,
                        borderRadius: '9999px',
                      }}
                      className="charge-slider w-full h-3"
                    />
                  </div>

                  {/* Essential Toggles */}
                  <div className="divide-y divide-[#E8EFEC] dark:divide-[#1E2A25] pt-1">
                    <ToggleRow
                      label="Run in background"
                      description={
                        backgroundRunning
                          ? 'Active · Monitoring battery even when app is minimized'
                          : 'Keep monitoring & send notification when app is in background'
                      }
                      checked={settings.backgroundKeepAlive}
                      onChange={async (v) => {
                        updateSetting('backgroundKeepAlive', v);
                        updateSetting('keepScreenAwake', v);
                        if (v) {
                          const perm = await requestNotificationPermission();
                          setNotifPermission(perm);
                        }
                      }}
                    />
                    <ToggleRow
                      label="Vibrate phone"
                      description="Pulse Android vibration when target is reached"
                      checked={settings.vibrate}
                      onChange={(v) => updateSetting('vibrate', v)}
                    />
                    <ToggleRow
                      label="Repeat until stopped"
                      description={
                        wakeLockSupported && wakeLockActive
                          ? 'Keep ringing until dismissed · Screen wake lock active'
                          : 'Keep ringing until you dismiss or unplug'
                      }
                      checked={settings.repeatUntilStopped}
                      onChange={(v) => updateSetting('repeatUntilStopped', v)}
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Battery Temperature Monitor & Safety Warning Section */}
            <BatteryTemperatureCard
              tempC={batteryTempC}
              peakTempC={peakTempC}
              thresholdC={OVERHEAT_THRESHOLD_C}
              isCharging={isCharging}
              alertsEnabled={tempAlertsEnabled}
              onToggleAlerts={async (enabled) => {
                setTempAlertsEnabled(enabled);
                if (enabled) {
                  const perm = await requestNotificationPermission();
                  setNotifPermission(perm);
                }
              }}
              onManualTempChange={handleManualTempChange}
              onTestOverheat={() => {
                void handleTestOverheat();
              }}
              onCoolDown={handleCoolDownTemp}
              onUnplugIfSimulator={
                sourceMode === 'simulator' ? () => setSimCharging(false) : undefined
              }
            />

            {/* Daily Charge-Up Schedule with Automatic Overnight Arming */}
            <ChargeScheduleCard
              schedule={schedule}
              history={history24h}
              health={health}
              drainEntries={drainEntries}
              isCharging={isCharging}
              isArmed={isArmed}
              nowMs={nowMs}
              onUpdateSchedule={handleUpdateSchedule}
              onSimulateOvernightPlugIn={handleSimulateOvernightPlugIn}
            />

            {/* Dynamic Charging Wisdom Section */}
            <ChargingWisdom
              currentLevel={currentLevel}
              targetPercent={targetPercent}
              isCharging={isCharging}
              isArmed={isArmed}
              history={history24h}
              health={health}
              onSetTarget={handleTargetChange}
              onArmAlarm={() => {
                if (!isArmed) {
                  void handleToggleArm();
                }
              }}
            />

            {/* 24-Hour Battery Charging History Recharts Visualization */}
            <ChargingHistoryChart
              history={history24h}
              targetPercent={targetPercent}
              darkMode={darkMode}
              onResetHistory={handleResetHistory24h}
              onLoadSampleHistory={handleLoadSampleHistory24h}
            />
          </div>
        ) : activeView === 'drain' ? (
          <BatteryDrainPanel
            entries={drainEntries}
            isCharging={isCharging}
            currentLevel={currentLevel}
            onAddEntry={handleAddDrainEntry}
            onResetEntries={handleResetDrainEntries}
            onLoadSampleEntries={handleLoadSampleDrainEntries}
            onOpenAndroidCode={() => setShowKotlinModal(true)}
          />
        ) : (
          <div className="space-y-6">
            <BatteryHealthPanel
              health={health}
              currentLevel={currentLevel}
              targetPercent={targetPercent}
              isCharging={isCharging}
              batteryTempC={batteryTempC}
              peakTempC={peakTempC}
              onChangeDeviceAgeMonths={(months) =>
                setHealth((h) => ({ ...h, deviceAgeMonths: months }))
              }
              onResetStats={() =>
                setHealth((h) => ({
                  ...DEFAULT_HEALTH,
                  deviceAgeMonths: h.deviceAgeMonths,
                }))
              }
            />
            <ChargingHistoryChart
              history={history24h}
              targetPercent={targetPercent}
              darkMode={darkMode}
              onResetHistory={handleResetHistory24h}
              onLoadSampleHistory={handleLoadSampleHistory24h}
            />
          </div>
        )}
      </main>

      {/* Quiet Footer with Native Android Studio Kotlin Export */}
      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5E716A] dark:text-[#869B93]">
        <span>Stopping daily charges around 80% helps extend battery lifespan.</span>
        <button
          type="button"
          onClick={() => setShowKotlinModal(true)}
          className="min-h-[40px] inline-flex items-center gap-1.5 font-semibold text-[#111816] dark:text-[#EEF3F1] hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors whitespace-nowrap"
        >
          <Code2 className="w-4 h-4" aria-hidden="true" />
          Android Studio Kotlin Code
        </button>
      </footer>

      {/* Triggered Alarm Full-Screen Overlay */}
      <AlarmRingingOverlay
        alarm={triggeredAlarm}
        onStop={stopActiveAlarm}
        onSnoozePlusFive={handleSnoozePlusFive}
      />

      {/* Native Android Studio Kotlin Modal */}
      {showKotlinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Native Android Studio Kotlin Source Code"
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#F6F8F7] dark:bg-[#0B0F0E] border border-[#DCE4E0] dark:border-[#24312C] p-6 shadow-2xl">
            <div className="flex items-center justify-end mb-2">
              <button
                type="button"
                onClick={() => setShowKotlinModal(false)}
                aria-label="Close Android Studio code"
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-[#54665F] hover:text-[#111816] dark:text-[#8EA39B] dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AndroidCodePanel targetPercent={targetPercent} />
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange }) => {
  return (
    <div className="py-3.5 first:pt-2 last:pb-0 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#111816] dark:text-[#EEF3F1]">{label}</p>
        <p className="text-xs text-[#5E716A] dark:text-[#869B93]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          checked ? 'bg-emerald-600' : 'bg-[#CBD5D1] dark:bg-[#2A3732]'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};
