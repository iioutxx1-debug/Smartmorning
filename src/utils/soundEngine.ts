import { AlarmItem, SoundType, SoundSourceType } from '../types';
import {
  getImportedSongs,
  getBlobFromIndexedDB,
} from './audioLibraryStore';
import { nativeAlarmBridge } from './nativeAlarmBridge';

class AlarmAudioEngine {
  private ctx: AudioContext | null = null;
  private intervalId: number | null = null;
  private isPlaying = false;
  private currentGain = 0.1;
  private fadeTimerId: number | null = null;
  private maxDurationTimeoutId: number | null = null;
  private htmlAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Plays a preview of an built-in app tone.
   */
  public playPreview(sound: SoundType) {
    this.stop();
    this.initContext();
    this.currentGain = 0.35;
    this.triggerNotePattern(sound);
  }

  /**
   * Plays a preview of an imported song or phone ringtone.
   * Returns an error message if the URI or file is inaccessible.
   */
  public async playCustomSourcePreview(options: {
    soundSource: SoundSourceType;
    sound: SoundType;
    customSoundUri?: string;
    customSongId?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    this.stop();

    if (options.soundSource === 'app_tone') {
      this.playPreview(options.sound);
      return { ok: true };
    }

    if (options.soundSource === 'phone_ringtone') {
      if (!options.customSoundUri) {
        return { ok: false, error: 'لم يتم اختيار نغمة هاتف بعد.' };
      }
      if (nativeAlarmBridge.isNativeAndroid()) {
        const res = await nativeAlarmBridge.playNativeUriAudio({
          uri: options.customSoundUri,
          loop: false,
          gradualFadeSeconds: 0,
          maxDurationSeconds: 15,
        });
        if (!res.playing) {
          return {
            ok: false,
            error: 'تعذر الوصول إلى نغمة الهاتف المحفوظة. يرجى اختيار نغمة أخرى.',
          };
        }
        return { ok: true };
      }
      return {
        ok: false,
        error: 'تشغيل نغمات نظام أندرويد (content://) يتطلب تشغيل التطبيق على هاتف أندرويد.',
      };
    }

    if (options.soundSource === 'my_song') {
      const songs = getImportedSongs();
      const song = songs.find((s) => s.id === options.customSongId) ||
        songs.find((s) => s.uri === options.customSoundUri);

      if (!song) {
        return {
          ok: false,
          error: 'الأغنية المحددة غير موجودة في مكتبة «أغنياتي».',
        };
      }

      return await this.playSongItemInternal(song.id, song.uri, false, 0, 30);
    }

    return { ok: true };
  }

  private async playSongItemInternal(
    songId: string,
    uri: string,
    loop: boolean,
    gradualFadeSeconds: number,
    maxDurationSeconds: number
  ): Promise<{ ok: boolean; error?: string }> {
    if (uri.startsWith('idb://')) {
      const blob = await getBlobFromIndexedDB(songId);
      if (!blob || blob.size === 0) {
        return {
          ok: false,
          error: 'تعذر العثور على بيانات الملف الصوتي المحفوظة محلياً.',
        };
      }

      try {
        const objUrl = URL.createObjectURL(blob);
        this.currentObjectUrl = objUrl;
        const audio = new Audio(objUrl);
        audio.loop = loop;

        const startVol = gradualFadeSeconds > 0 ? 0.08 : 0.9;
        const targetVol = 0.95;
        audio.volume = startVol;
        this.htmlAudio = audio;
        this.isPlaying = true;

        await audio.play();

        if (gradualFadeSeconds > 0) {
          const steps = 20;
          const stepTime = (gradualFadeSeconds * 1000) / steps;
          const inc = (targetVol - startVol) / steps;
          this.fadeTimerId = window.setInterval(() => {
            if (this.htmlAudio && this.htmlAudio.volume < targetVol) {
              this.htmlAudio.volume = Math.min(1, this.htmlAudio.volume + inc);
            }
          }, stepTime);
        }

        if (maxDurationSeconds > 0) {
          this.maxDurationTimeoutId = window.setTimeout(() => {
            this.stop();
          }, maxDurationSeconds * 1000);
        }

        return { ok: true };
      } catch {
        this.stop();
        return {
          ok: false,
          error: 'تعذر تشغيل هذا الملف الصوتي؛ قد تكون الصيغة غير مدعومة على هذا الجهاز.',
        };
      }
    }

    // Native Android file:// or content:// URI
    if (nativeAlarmBridge.isNativeAndroid()) {
      const res = await nativeAlarmBridge.playNativeUriAudio({
        uri,
        loop,
        gradualFadeSeconds,
        maxDurationSeconds,
      });
      if (!res.playing) {
        return {
          ok: false,
          error: 'تعذر فتح ملف الأغنية المحفوظة. قد يكون الملف مفقوداً.',
        };
      }
      this.isPlaying = true;
      return { ok: true };
    }

    return {
      ok: false,
      error: 'تعذر تشغيل مسار الملف الصوتي في هذه البيئة.',
    };
  }

  /**
   * Starts ringing for a full AlarmItem, respecting its independent soundSource
   * ('app_tone' | 'phone_ringtone' | 'my_song'), gradualFadeSeconds, and maxPlaybackDurationSeconds.
   * If a custom URI/song is inaccessible, notifies the caller via onFallbackWarning and plays the fallback app tone.
   */
  public async startAlarmItemLoop(
    alarm: AlarmItem,
    onFallbackWarning?: (warningMsg: string) => void
  ): Promise<void> {
    this.stop();
    const source: SoundSourceType = alarm.soundSource || 'app_tone';
    const fadeSecs = alarm.gradualFadeSeconds ?? 30;
    const maxDurSecs = alarm.maxPlaybackDurationSeconds ?? 0;

    if (source === 'phone_ringtone' && alarm.customSoundUri) {
      if (nativeAlarmBridge.isNativeAndroid()) {
        const res = await nativeAlarmBridge.playNativeUriAudio({
          uri: alarm.customSoundUri,
          loop: true,
          gradualFadeSeconds: fadeSecs,
          maxDurationSeconds: maxDurSecs,
        });
        if (res.playing) {
          this.isPlaying = true;
          return;
        }
      }
      if (onFallbackWarning) {
        onFallbackWarning(
          `تعذر الوصول إلى نغمة الهاتف المحفوظة (${alarm.customSoundTitle || 'نغمة النظام'})؛ يتم تشغيل النغمة الاحتياطية الآمنة.`
        );
      }
      this.startAlarmLoop(alarm.sound || 'fajr_adhan_tone', fadeSecs, maxDurSecs);
      return;
    }

    if (source === 'my_song') {
      const songs = getImportedSongs();
      const song =
        songs.find((s) => s.id === alarm.customSongId) ||
        songs.find((s) => s.uri === alarm.customSoundUri);

      if (song) {
        const res = await this.playSongItemInternal(
          song.id,
          song.uri,
          true,
          fadeSecs,
          maxDurSecs
        );
        if (res.ok) {
          return;
        }
      }

      if (onFallbackWarning) {
        onFallbackWarning(
          `تعذر تشغيل الأغنية المحددة (${alarm.customSoundTitle || 'أغنية مستوردة'})؛ يتم تشغيل نغمة التطبيق الاحتياطية.`
        );
      }
      this.startAlarmLoop(alarm.sound || 'fajr_adhan_tone', fadeSecs, maxDurSecs);
      return;
    }

    this.startAlarmLoop(alarm.sound || 'fajr_adhan_tone', fadeSecs, maxDurSecs);
  }

  public startAlarmLoop(
    sound: SoundType,
    gradualFadeSeconds: number = 30,
    maxDurationSeconds: number = 0
  ) {
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

    if (maxDurationSeconds > 0) {
      this.maxDurationTimeoutId = window.setTimeout(() => {
        this.stop();
      }, maxDurationSeconds * 1000);
    }
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
        } catch {}
      }
      if (ttsText && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(ttsText);
          utterance.lang = 'ar-SA';
          utterance.rate = 1.0;
          utterance.volume = Math.min(1, volume);
          window.speechSynthesis.speak(utterance);
        } catch {}
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
    if (this.maxDurationTimeoutId !== null) {
      clearTimeout(this.maxDurationTimeoutId);
      this.maxDurationTimeoutId = null;
    }
    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.currentTime = 0;
        this.htmlAudio.src = '';
      } catch {}
      this.htmlAudio = null;
    }
    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {}
      this.currentObjectUrl = null;
    }
    nativeAlarmBridge.stopNativeUriAudio();
  }

  private triggerNotePattern(sound: SoundType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (sound === 'fajr_adhan_tone') {
      const notes = [293.66, 329.63, 370.0, 440.0, 370.0, 329.63, 293.66];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.32, 0.75, this.currentGain * 0.85, 'sine');
      });
    } else if (sound === 'makkah_tone') {
      const notes = [329.63, 392.0, 440.0, 493.88, 440.0, 392.0];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.34, 0.85, this.currentGain * 0.85, 'triangle');
      });
    } else if (sound === 'calm_piano') {
      const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.26, 0.9, this.currentGain * 0.75, 'sine');
      });
    } else if (sound === 'dawn_chimes') {
      const notes = [440, 493.88, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.28, 0.9, this.currentGain * 0.8, 'sine');
      });
    } else if (sound === 'nature_birds') {
      const chirps = [1200, 1450, 1320, 1680, 1500];
      chirps.forEach((freq, idx) => {
        this.playTone(freq, now + idx * 0.18, 0.22, this.currentGain * 0.6, 'triangle');
      });
    } else if (sound === 'zen_bowl') {
      this.playTone(256, now, 2.1, this.currentGain, 'sine');
      this.playTone(512, now + 0.05, 1.8, this.currentGain * 0.45, 'sine');
      this.playTone(768, now + 0.1, 1.4, this.currentGain * 0.2, 'sine');
    } else {
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
