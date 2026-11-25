/**
 * Background keep-alive manager for Android Chrome / PWA tabs.
 *
 * 1. Spawns an inline Web Worker interval so battery polling is not throttled
 *    when the browser tab moves into the background.
 * 2. Maintains a near-silent Web Audio keep-alive oscillator (gain = 0.00001)
 *    when armed so Android OS keeps the audio session active and allows the
 *    alarm tone to fire without foreground interaction.
 */
class BackgroundKeepAliveEngine {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private keepAliveCtx: AudioContext | null = null;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private running = false;

  public start(onTick: () => void, intervalMs = 4000) {
    this.stop();
    this.running = true;

    // 1. Unthrottled Web Worker timer
    try {
      const workerCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data && e.data.cmd === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(function() { self.postMessage('tick'); }, e.data.intervalMs || 4000);
          } else if (e.data && e.data.cmd === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerUrl);
      this.worker.onmessage = () => {
        if (this.running) {
          onTick();
        }
      };
      this.worker.postMessage({ cmd: 'start', intervalMs });
    } catch {
      // Fallback if CSP blocks blob workers
    }

    // 2. Silent Web Audio keep-alive session (must be started inside a user gesture or unlocked AudioContext)
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1, ctx.currentTime);
        // Virtually silent, keeps browser media/audio thread alive on Android
        gain.gain.setValueAtTime(0.00001, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        this.keepAliveCtx = ctx;
        this.keepAliveOsc = osc;
        this.keepAliveGain = gain;
      }
    } catch {
      // Ignore if AudioContext is blocked
    }
  }

  public stop() {
    this.running = false;

    if (this.worker) {
      try {
        this.worker.postMessage({ cmd: 'stop' });
        this.worker.terminate();
      } catch {
        // Ignore
      }
      this.worker = null;
    }

    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }

    if (this.keepAliveOsc) {
      try {
        this.keepAliveOsc.stop();
        this.keepAliveOsc.disconnect();
      } catch {
        // Ignore
      }
      this.keepAliveOsc = null;
    }

    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch {
        // Ignore
      }
      this.keepAliveGain = null;
    }

    if (this.keepAliveCtx) {
      try {
        void this.keepAliveCtx.close();
      } catch {
        // Ignore
      }
      this.keepAliveCtx = null;
    }
  }

  public isActive(): boolean {
    return this.running;
  }
}

export const backgroundKeepAlive = new BackgroundKeepAliveEngine();
