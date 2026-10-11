export type SoundType =
  | 'fajr_adhan_tone'
  | 'makkah_tone'
  | 'dawn_chimes'
  | 'nature_birds'
  | 'zen_bowl'
  | 'classic_pulse'
  | 'calm_piano';
export type ChallengeType = 'none' | 'math' | 'memory' | 'intention';

export interface DailyHabit {
  id: string;
  title: string;
  frequency: string; // e.g., "يومياً", "3 مرات أسبوعياً"
  iconType: 'prayer' | 'quran' | 'water' | 'sport' | 'reading' | 'goals';
  colorHex: string;
  completedDates: string[]; // Array of YYYY-MM-DD
}

export interface RoutineStep {
  id: string;
  title: string;
  durationMinutes: number;
  category: 'health' | 'focus' | 'mindfulness' | 'planning';
  description: string;
  completed?: boolean;
}

export interface AlarmItem {
  id: string;
  time: string; // "HH:mm" in 24h format, e.g., "06:30"
  label: string;
  days: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  enabled: boolean;
  smartWindowMinutes: number; // e.g., 0, 15, 20, 30
  gradualFadeSeconds: number; // e.g., 30, 60, 120
  sound: SoundType;
  challenge: ChallengeType;
  linkedRoutinePresetId: string;
  autoLaunchRoutine: boolean;
}

export interface RoutinePreset {
  id: string;
  name: string;
  subtitle: string;
  totalMinutes: number;
  recommendedWakeTime: string;
  benefitText: string;
  steps: RoutineStep[];
}

export interface SmartSuggestion {
  id: string;
  title: string;
  category: string;
  impactMetric: string;
  description: string;
  actionLabel: string;
  actionType: 'apply_alarm' | 'apply_routine' | 'enable_smart_window' | 'add_habit_step';
  payload: {
    time?: string;
    smartWindow?: number;
    presetId?: string;
    habitStep?: RoutineStep;
  };
  applied?: boolean;
}

// ==========================================
// Employee Rest (إدارة استراحات الموظفين)
// ==========================================

export interface ActiveRestSession {
  startedAtMs: number;
  targetEndMs: number;
  allocatedUnits: number; // Planned minutes (in test mode: 1 unit = 1 second, normal: 1 unit = 1 minute)
  unitMs: number; // 60000 in normal mode, 1000 in test mode
  isPaused: boolean;
  pausedAtMs: number | null;
  totalPausedMs: number;
  alarmAcknowledged: boolean; // True after pressing "تم" when time reaches 0
}

export interface Employee {
  id: string;
  name: string;
  dailyAllowanceMinutes: number; // Default 30
  consumedSecondsToday: number; // Total actual seconds consumed today (including delay)
  delaySecondsToday: number; // Total overtime/delay seconds today
  hasStartedRestToday: boolean;
  optedOutRemainingToday: boolean; // Pressed "اكتفى"
  shiftStartTime?: string; // Optional HH:mm for shift start alert
  shiftPreAlertMinutes?: number; // Default 10
  avatarColor?: string; // Hex color badge from reference UI
  activeSession: ActiveRestSession | null;
}

export interface RestLogEntry {
  id: string;
  dayKey: string; // e.g., "2026-10-10"
  employeeId: string;
  employeeName: string;
  startedAtIso: string;
  endedAtIso: string;
  allocatedMinutes: number;
  actualSeconds: number;
  delaySeconds: number;
  remainingAfterSeconds: number;
  summaryMessage: string;
  wasTestMode: boolean;
}

export interface RestSettings {
  dayResetHour: number; // Default 5 (05:00 AM)
  dayResetMinute: number; // Default 0
  testModeMinuteAsSecond: boolean; // 1 minute = 1 second
  wakeLockEnabled: boolean;
  maxConcurrentRests: number; // Default 2
  enableVoiceTTS: boolean;
  enableVibration: boolean;
  alarmSound: SoundType;
  alarmVolume: number; // 0.1 to 1.0
  enablePhase2Extras: boolean; // Toggle for Phase 2 extras (Section 7)
}

