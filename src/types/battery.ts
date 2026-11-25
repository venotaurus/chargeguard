export type BuiltInSoundId = 'chime' | 'radar' | 'harmonic' | 'beep' | 'voice';
export type AlarmSoundId = BuiltInSoundId | `custom:${string}`;

export type AlarmDirection = 'charge_up' | 'discharge_down';

export type BatterySourceMode = 'live' | 'simulator';

export type MainView = 'alarm' | 'drain' | 'health';

export type DrainCategory = 'app' | 'system';

export interface CustomToneMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  addedAt: string;
}

export interface AlarmSettings {
  soundId: AlarmSoundId;
  volume: number; // 0.1 - 1.0
  vibrate: boolean;
  repeatUntilStopped: boolean;
  voiceAnnounce: boolean;
  keepScreenAwake: boolean;
  backgroundKeepAlive: boolean;
  browserNotifications: boolean;
}

export interface BatteryHistoryPoint {
  timestamp: number; // Unix ms
  level: number; // 0 - 100
  charging: boolean;
}

export interface DrainLogEntry {
  id: string;
  name: string;
  category: DrainCategory;
  percentDrained: number; // Battery percentage consumed while unplugged
  durationMinutes: number;
  backgroundMinutes: number;
  timestamp: number; // Unix ms
  tip: string;
}

export interface ChargeSession {
  id: string;
  completedAt: string;
  startLevel: number;
  targetLevel: number;
  endLevel: number;
  durationSeconds: number;
  mode: BatterySourceMode;
  outcome: 'reached_target' | 'snoozed';
}

export interface BatteryHealthData {
  equivalentCycles: number; // Accumulated percentage charged / 100
  totalPercentCharged: number;
  highVoltageCharges: number; // Charges that hit >= 95%
  optimalCharges: number; // Charges stopped <= 85%
  deepDischarges: number; // Drops below 15%
  deviceAgeMonths: number; // User-adjustable phone age for accurate lifespan estimate
  sessions: ChargeSession[];
}

export interface TriggeredAlarmState {
  ruleId: string;
  label: string;
  threshold: number;
  currentLevel: number;
  direction: AlarmDirection;
  triggeredAt: number;
}

export interface ChargeScheduleConfig {
  enabled: boolean;
  startTime: string; // HH:mm 24-hour format
  endTime: string; // HH:mm 24-hour format
  scheduledTarget: number; // 70 - 100
  lastAutoArmedAt: number | null;
}

