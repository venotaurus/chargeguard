import { useCallback, useEffect, useRef, useState } from 'react';
import { BatterySourceMode } from '../types/battery';

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

export interface LiveBatteryData {
  supported: boolean;
  ready: boolean;
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

export function useBatteryMonitor() {
  const [sourceMode, setSourceMode] = useState<BatterySourceMode>('live');

  const [liveBattery, setLiveBattery] = useState<LiveBatteryData>({
    supported: false,
    ready: false,
    level: 20,
    charging: false,
    chargingTime: Infinity,
    dischargingTime: Infinity,
  });

  // Simulator defaults to 20% for instant testing of the 20% -> 80% scenario
  const [simLevel, setSimLevel] = useState<number>(20);
  const [simCharging, setSimCharging] = useState<boolean>(false);
  const [simRatePerSecond, setSimRatePerSecond] = useState<number>(6);

  const batteryManagerRef = useRef<BatteryManager | null>(null);

  const syncFromManager = useCallback((manager: BatteryManager) => {
    const pct = Math.round(manager.level * 100);
    setLiveBattery({
      supported: true,
      ready: true,
      level: pct,
      charging: manager.charging,
      chargingTime: manager.chargingTime,
      dischargingTime: manager.dischargingTime,
    });
  }, []);

  // Poll function callable from Web Worker heartbeat when tab is in the background
  const pollBatteryNow = useCallback(async () => {
    if (batteryManagerRef.current) {
      syncFromManager(batteryManagerRef.current);
      return;
    }
    const nav = navigator as NavigatorWithBattery;
    if (nav.getBattery) {
      try {
        const manager = await nav.getBattery();
        batteryManagerRef.current = manager;
        syncFromManager(manager);
      } catch {
        // Ignore polling errors
      }
    }
  }, [syncFromManager]);

  useEffect(() => {
    let mounted = true;
    let manager: BatteryManager | null = null;

    const nav = navigator as NavigatorWithBattery;
    if (!nav.getBattery) {
      setLiveBattery((prev) => ({ ...prev, supported: false, ready: true }));
      setSourceMode('simulator');
      return;
    }

    const handleChange = () => {
      if (mounted && manager) {
        syncFromManager(manager);
      }
    };

    nav
      .getBattery()
      .then((m) => {
        if (!mounted) return;
        manager = m;
        batteryManagerRef.current = m;
        syncFromManager(m);
        m.addEventListener('levelchange', handleChange);
        m.addEventListener('chargingchange', handleChange);
        m.addEventListener('chargingtimechange', handleChange);
        m.addEventListener('dischargingtimechange', handleChange);
      })
      .catch(() => {
        if (!mounted) return;
        setLiveBattery((prev) => ({ ...prev, supported: false, ready: true }));
        setSourceMode('simulator');
      });

    return () => {
      mounted = false;
      if (manager) {
        manager.removeEventListener('levelchange', handleChange);
        manager.removeEventListener('chargingchange', handleChange);
        manager.removeEventListener('chargingtimechange', handleChange);
        manager.removeEventListener('dischargingtimechange', handleChange);
      }
    };
  }, [syncFromManager]);

  // Simulator charge timer
  useEffect(() => {
    if (sourceMode !== 'simulator' || !simCharging) return;

    const tickMs = 500;
    const step = simRatePerSecond * (tickMs / 1000);

    const timer = window.setInterval(() => {
      setSimLevel((prev) => {
        const next = Math.min(100, prev + step);
        return Number(next.toFixed(1));
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [sourceMode, simCharging, simRatePerSecond]);

  const startDemoFromTwenty = useCallback(() => {
    setSourceMode('simulator');
    setSimLevel(20);
    setSimRatePerSecond(6);
    setSimCharging(true);
  }, []);

  const currentLevel =
    sourceMode === 'live' && liveBattery.supported
      ? liveBattery.level
      : Math.round(simLevel);

  const isCharging =
    sourceMode === 'live' && liveBattery.supported
      ? liveBattery.charging
      : simCharging;

  const chargingTimeSeconds =
    sourceMode === 'live' && liveBattery.supported
      ? liveBattery.chargingTime
      : simCharging && simRatePerSecond > 0
      ? Math.max(0, Math.round((100 - simLevel) / simRatePerSecond))
      : Infinity;

  return {
    sourceMode,
    setSourceMode,
    liveBattery,
    currentLevel,
    rawSimLevel: simLevel,
    setSimLevel,
    isCharging,
    simCharging,
    setSimCharging,
    simRatePerSecond,
    setSimRatePerSecond,
    chargingTimeSeconds,
    startDemoFromTwenty,
    pollBatteryNow,
  };
}

export function useWakeLock(enabled: boolean) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      if (!enabled || document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
      } catch {
        setActive(false);
      }
    };

    const release = async () => {
      if (sentinelRef.current && !sentinelRef.current.released) {
        try {
          await sentinelRef.current.release();
        } catch {
          // Ignore
        }
      }
      sentinelRef.current = null;
      setActive(false);
    };

    if (enabled) {
      void acquire();
    } else {
      void release();
    }

    const handleVisibility = () => {
      if (enabled && document.visibilityState === 'visible') {
        void acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      void release();
    };
  }, [enabled]);

  return { wakeLockSupported: supported, wakeLockActive: active };
}
