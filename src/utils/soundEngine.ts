import { SoundType } from '../types';

class AlarmAudioEngine {
  private ctx: AudioContext | null = null;
  private intervalId: number | null = null;
  private isPlaying = false;
  private currentGain = 0.1;
  private fadeTimerId: number | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playPreview(sound: SoundType) {
    this.stop();
    this.initContext();
    this.currentGain = 0.35;
    this.triggerNotePattern(sound);
  }

  public startAlarmLoop(sound: SoundType, gradualFadeSeconds: number = 30) {
    this.stop();
    this.initContext();
    this.isPlaying = true;

    const startVolume = gradualFadeSeconds > 0 ? 0.05 : 0.5;
    const targetVolume = 0.65;
    this.currentGain = startVolume;

    if (gradualFadeSeconds > 0) {
      const steps = 20;
      const stepTime = (gradualFadeSeconds * 1000) / steps;
      const volumeIncrement = (targetVolume - startVolume) / steps;

      this.fadeTimerId = window.setInterval(() => {
        if (this.currentGain < targetVolume) {
          this.currentGain = Math.min(targetVolume, this.currentGain + volumeIncrement);
        }
      }, stepTime);
    }

    this.triggerNotePattern(sound);
    this.intervalId = window.setInterval(() => {
      if (this.isPlaying) {
        this.triggerNotePattern(sound);
      }
    }, 2400);
  }

  public startRestExpiredLoop(
    sound: SoundType = 'classic_pulse',
    volume: number = 0.85,
    enableVibration: boolean = true,
    ttsText?: string
  ) {
    this.stop();
    this.initContext();
    this.isPlaying = true;
    this.currentGain = Math.max(0.1, Math.min(1, volume));

    const triggerCycle = () => {
      if (!this.isPlaying) return;
      this.triggerNotePattern(sound);
      if (enableVibration && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([400, 200, 400]);
        } catch {
          // Ignore vibration permission issues
        }
      }
      if (ttsText && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(ttsText);
          utterance.lang = 'ar-SA';
          utterance.rate = 1.0;
          utterance.volume = Math.min(1, volume);
          window.speechSynthesis.speak(utterance);
        } catch {
          // Ignore TTS errors
        }
      }
    };

    triggerCycle();
    this.intervalId = window.setInterval(triggerCycle, 2800);
  }

  public playStepCompleteChime() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(528, now, 0.35, 0.2, 'sine');
    this.playTone(660, now + 0.15, 0.45, 0.25, 'sine');
  }

  public stop() {
    this.isPlaying = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.fadeTimerId !== null) {
      clearInterval(this.fadeTimerId);
      this.fadeTimerId = null;
    }
  }

  private triggerNotePattern(sound: SoundType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (sound === 'fajr_adhan_tone') {
      // Reverent Maqam Hijaz / Rast melodic progression
      const notes = [293.66, 329.63, 370.0, 440.0, 370.0, 329.63, 293.66];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.32, 0.75, this.currentGain * 0.85, 'sine');
      });
    } else if (sound === 'makkah_tone') {
      // Warm harmonic spiritual progression
      const notes = [329.63, 392.0, 440.0, 493.88, 440.0, 392.0];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.34, 0.85, this.currentGain * 0.85, 'triangle');
      });
    } else if (sound === 'calm_piano') {
      // Soft acoustic piano chord arpeggio
      const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.26, 0.9, this.currentGain * 0.75, 'sine');
      });
    } else if (sound === 'dawn_chimes') {
      // Warm harmonic major pentatonic progression
      const notes = [440, 493.88, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.28, 0.9, this.currentGain * 0.8, 'sine');
      });
    } else if (sound === 'nature_birds') {
      // High gentle melodic chirps
      const chirps = [1200, 1450, 1320, 1680, 1500];
      chirps.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.18, 0.22, this.currentGain * 0.6, 'triangle');
      });
    } else if (sound === 'zen_bowl') {
      // Deep resonant singing bowl harmonic
      this.playTone(256, now, 2.1, this.currentGain, 'sine');
      this.playTone(512, now + 0.05, 1.8, this.currentGain * 0.45, 'sine');
      this.playTone(768, now + 0.1, 1.4, this.currentGain * 0.2, 'sine');
    } else {
      // Classic gentle rhythmic pulse
      for (let i = 0; i < 4; i++) {
        this.playTone(800, now + i * 0.22, 0.12, this.currentGain, 'square');
      }
    }
  }

  private playTone(
    freq: number,
    startTime: number,
    duration: number,
    volume: number,
    type: OscillatorType
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, volume), startTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundEngine = new AlarmAudioEngine();
