export type SoundType =
  | 'fajr_adhan_tone'
  | 'makkah_tone'
  | 'dawn_chimes'
  | 'nature_birds'
  | 'zen_bowl'
  | 'classic_pulse'
  | 'calm_piano';

export type SoundSourceType = 'app_tone' | 'phone_ringtone' | 'my_song';

export type ChallengeType = 'none' | 'math' | 'memory' | 'intention';

export interface ImportedSongItem {
  id: string;
  name: string;
  fileName: string;
  uri: string; // file:// on Android app-private storage, or idb://<id> in IndexedDB
  originalContentUri?: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  createdAtMs: number;
}

export interface DefaultToneConfig {
  soundSource: SoundSourceType;
  sound: SoundType;
  customSoundUri?: string;
  customSoundTitle?: string;
  customSongId?: string;
}

export interface AlarmItem {
  id: string;
  time: string; // "HH:mm" in 24h format, e.g., "06:30"
  label: string;
  days: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  enabled: boolean;
  smartWindowMinutes: number; // e.g., 0, 15, 20, 30
  gradualFadeSeconds: number; // e.g., 30, 60, 120
  sound: SoundType; // Built-in fallback or selected app_tone
  soundSource?: SoundSourceType; // 'app_tone' | 'phone_ringtone' | 'my_song'
  customSoundUri?: string; // Real Android content:// or file:// URI
  customSoundTitle?: string; // Human-readable title of phone ringtone or song
  customSongId?: string; // ID in «أغنياتي» library
  maxPlaybackDurationSeconds?: number; // Optional max playback duration for long songs (0 = unlimited)
  challenge: ChallengeType;
}

// ==========================================
// Employee Rest (إدارة استراحات الموظفين)
// ==========================================

export interface ActiveRestSession {
  sessionId?: string; // Unique ID per rest session to bind notifications & prevent duplicate actions
  startedAtMs: number;
  targetEndMs: number;
  allocatedUnits: number; // Planned rest duration in minutes
  unitMs: number; // 60000 in normal mode, 1000 in test mode
  isPaused: boolean;
  pausedAtMs: number | null;
  totalPausedMs: number;
  alarmAcknowledged: boolean; // True after pressing "تم" when time reaches 0
  notificationDispatched?: boolean; // Ensures rest-end notification is sent only once per targetEndMs
  notifiedEnd?: boolean;
  notifiedOvertime?: boolean;
  extendedMinutes?: number;
}

export interface Employee {
  id: string;
  name: string;
  dailyAllowanceMinutes: number; // Default 30
  consumedSecondsToday: number; // Always stored in standard seconds (60s = 1 minute of rest)
  delaySecondsToday: number; // Always stored in standard seconds (60s = 1 minute of delay)
  hasStartedRestToday: boolean;
  optedOutRemainingToday: boolean; // Pressed "اعتماد الاكتفاء"
  shiftStartTime?: string; // Optional HH:mm for shift start alert
  shiftPreAlertMinutes?: number; // Default 10
  avatarColor?: string; // Hex color badge
  activeSession: ActiveRestSession | null;
}

export interface RestLogEntry {
  id: string;
  dayKey: string; // e.g., "2026-10-10"
  employeeId: string;
  employeeName: string;
  sessionId?: string;
  startedAtIso: string;
  endedAtIso: string;
  allocatedMinutes: number;
  actualSeconds: number; // Standard seconds (60s = 1m)
  delaySeconds: number; // Standard seconds (60s = 1m)
  remainingAfterSeconds: number; // Standard seconds (60s = 1m)
  summaryMessage: string;
  wasTestMode: boolean;
}

export interface RestSettings {
  dayResetHour: number; // Default 5 (05:00 AM)
  dayResetMinute: number; // Default 0
  testModeMinuteAsSecond: boolean; // 1 minute = 1 second for live timer testing
  wakeLockEnabled: boolean;
  maxConcurrentRests: number; // Default 2
  enableVoiceTTS: boolean;
  enableVibration: boolean;
  alarmSound: SoundType;
  alarmVolume: number; // 0.1 to 1.0
  enablePhase2Extras: boolean;
  notifyOnRestEnd?: boolean;
  notifyOnOvertime?: boolean;
  overtimeAlertAfterMinutes?: number;
}
