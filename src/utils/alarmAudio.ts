import { AlarmDirection, AlarmSoundId, BuiltInSoundId } from '../types/battery';
import { getCustomToneBlob } from './customToneStore';

export interface SoundOption {
  id: BuiltInSoundId;
  name: string;
  description: string;
}

export const ALARM_SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'chime',
    name: 'Android Digital Chime',
    description: 'Clear ascending dual-tone notification pulse',
  },
  {
    id: 'radar',
    name: 'Urgent Radar Alarm',
    description: 'High-penetration repeating alert to catch attention',
  },
  {
    id: 'harmonic',
    name: 'Harmonic Bell',
    description: 'Warm resonant chime suitable for desks and bedrooms',
  },
  {
    id: 'beep',
    name: 'Precision Beep',
    description: 'Sharp piezo-style triple beep like a hardware charger',
  },
  {
    id: 'voice',
    name: 'Voice Alert',
    description: 'Spoken percentage readout paired with a soft chime',
  },
];

class AlarmAudioEngine {
  private ctx: AudioContext | null = null;
  private loopTimer: number | null = null;
  private vibrateTimer: number | null = null;
  private activeOscillators: Set<OscillatorNode> = new Set();
  private customAudioEl: HTMLAudioElement | null = null;
  private customObjectUrl: string | null = null;
  private isPlaying = false;

  public unlock(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    startOffset: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    endFreq?: number
  ) {
    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.02, volume * 0.45), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    this.activeOscillators.add(osc);
    osc.onended = () => {
      this.activeOscillators.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playBuiltInPattern(
    soundId: BuiltInSoundId,
    volume: number,
    voiceText?: string
  ) {
    const ctx = this.unlock();
    if (!ctx) return;

    const clampedVol = Math.max(0.1, Math.min(1, volume));

    switch (soundId) {
      case 'chime': {
        this.playTone(ctx, 587.33, 0.0, 0.16, clampedVol, 'triangle');
        this.playTone(ctx, 880.0, 0.16, 0.22, clampedVol, 'triangle');
        this.playTone(ctx, 1174.66, 0.38, 0.34, clampedVol, 'sine');
        break;
      }
      case 'radar': {
        for (let i = 0; i < 4; i++) {
          this.playTone(ctx, 980, i * 0.22, 0.14, clampedVol, 'sawtooth', 1240);
        }
        break;
      }
      case 'harmonic': {
        this.playTone(ctx, 523.25, 0.0, 0.75, clampedVol * 0.85, 'sine');
        this.playTone(ctx, 659.25, 0.08, 0.7, clampedVol * 0.75, 'sine');
        this.playTone(ctx, 783.99, 0.16, 0.75, clampedVol * 0.75, 'sine');
        this.playTone(ctx, 1046.5, 0.28, 0.85, clampedVol * 0.65, 'triangle');
        break;
      }
      case 'beep': {
        this.playTone(ctx, 1760, 0.0, 0.11, clampedVol, 'square');
        this.playTone(ctx, 1760, 0.16, 0.11, clampedVol, 'square');
        this.playTone(ctx, 2093, 0.32, 0.22, clampedVol, 'square');
        break;
      }
      case 'voice': {
        this.playTone(ctx, 659.25, 0.0, 0.18, clampedVol * 0.8, 'sine');
        this.playTone(ctx, 987.77, 0.18, 0.26, clampedVol * 0.8, 'sine');
        if (voiceText) {
          this.speak(voiceText, clampedVol);
        }
        break;
      }
    }
  }

  private async playCustomFile(
    customId: string,
    volume: number,
    loop: boolean,
    fallbackText?: string
  ) {
    this.stopCustomAudio();
    const blob = await getCustomToneBlob(customId);
    if (!blob) {
      // Fallback safely to chime if custom tone was removed
      this.playBuiltInPattern('chime', volume, fallbackText);
      return;
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = Math.max(0.1, Math.min(1, volume));
    audio.loop = loop;

    this.customObjectUrl = url;
    this.customAudioEl = audio;

    if (!loop) {
      audio.onended = () => {
        this.stopCustomAudio();
      };
    }

    try {
      await audio.play();
    } catch {
      // Fallback to Web Audio chime if HTMLAudio playback is blocked
      this.stopCustomAudio();
      this.playBuiltInPattern('chime', volume, fallbackText);
    }
  }

  private stopCustomAudio() {
    if (this.customAudioEl) {
      try {
        this.customAudioEl.pause();
        this.customAudioEl.src = '';
      } catch {
        // Ignore
      }
      this.customAudioEl = null;
    }
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
  }

  public async playPatternOnce(
    soundId: AlarmSoundId,
    volume: number,
    voiceText?: string
  ) {
    this.stopCustomAudio();
    if (soundId.startsWith('custom:')) {
      const customId = soundId.slice('custom:'.length);
      await this.playCustomFile(customId, volume, false, voiceText);
      return;
    }
    this.playBuiltInPattern(soundId as BuiltInSoundId, volume, voiceText);
  }

  public speak(text: string, volume: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = Math.max(0.1, Math.min(1, volume));
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis may be unavailable
    }
  }

  public startAlarm(options: {
    soundId: AlarmSoundId;
    volume: number;
    vibrate: boolean;
    repeat: boolean;
    voiceAnnounce: boolean;
    threshold: number;
    direction: AlarmDirection;
  }) {
    this.stop();
    this.isPlaying = true;

    const spokenMessage =
      options.direction === 'charge_up'
        ? `Battery reached ${options.threshold} percent. Please unplug your charger.`
        : `Battery dropped to ${options.threshold} percent. Please plug in your charger.`;

    if (options.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([450, 200, 450, 200, 700]);
      } catch {
        // Ignore
      }
      if (options.repeat) {
        this.vibrateTimer = window.setInterval(() => {
          if (!this.isPlaying) return;
          try {
            navigator.vibrate([450, 200, 450, 200, 700]);
          } catch {
            // Ignore
          }
        }, 2400);
      }
    }

    // Custom tone from device storage
    if (options.soundId.startsWith('custom:')) {
      const customId = options.soundId.slice('custom:'.length);
      void this.playCustomFile(customId, options.volume, options.repeat, spokenMessage);
      return;
    }

    const builtInId = options.soundId as BuiltInSoundId;
    const triggerCycle = () => {
      if (!this.isPlaying) return;
      this.playBuiltInPattern(
        builtInId,
        options.volume,
        builtInId === 'voice' || options.voiceAnnounce ? spokenMessage : undefined
      );
      if (builtInId !== 'voice' && options.voiceAnnounce) {
        window.setTimeout(() => {
          if (this.isPlaying) {
            this.speak(spokenMessage, options.volume);
          }
        }, 700);
      }
    };

    triggerCycle();

    if (options.repeat) {
      const intervalMs = builtInId === 'voice' || options.voiceAnnounce ? 3800 : 1800;
      this.loopTimer = window.setInterval(triggerCycle, intervalMs);
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.vibrateTimer !== null) {
      window.clearInterval(this.vibrateTimer);
      this.vibrateTimer = null;
    }
    this.stopCustomAudio();
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // Ignore
      }
    });
    this.activeOscillators.clear();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
  }
}

export const alarmAudio = new AlarmAudioEngine();

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function sendBatteryNotification(threshold: number, direction: AlarmDirection) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title =
    direction === 'charge_up'
      ? `Charge Target Reached (${threshold}%)`
      : `Low Battery Alert (${threshold}%)`;
  const body =
    direction === 'charge_up'
      ? `Your battery reached ${threshold}%. Unplug your charger to protect battery health.`
      : `Your battery dropped to ${threshold}%. Connect your charger soon.`;

  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `chargeguard-${threshold}`,
    requireInteraction: true,
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => {
        try {
          new Notification(title, options);
        } catch {
          // Ignore
        }
      });
    return;
  }

  try {
    new Notification(title, options);
  } catch {
    // Ignore
  }
}

export function sendTemperatureWarningNotification(tempC: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `Battery Safety Warning (${tempC.toFixed(1)}°C)`;
  const body =
    'Battery temperature exceeded 40°C. Unplug your charger and allow the phone to cool down.';

  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'chargeguard-temp-warning',
    requireInteraction: true,
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => {
        try {
          new Notification(title, options);
        } catch {
          // Ignore
        }
      });
    return;
  }

  try {
    new Notification(title, options);
  } catch {
    // Ignore
  }
}

