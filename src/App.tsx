/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  AlarmItem,
  RoutineStep,
  RoutinePreset,
  SmartSuggestion,
  DailyHabit,
  SoundType,
} from './types';
import {
  INITIAL_ALARMS,
  ROUTINE_PRESETS,
  SMART_SUGGESTIONS,
  INITIAL_HABITS,
  DAY_NAMES,
  SOUND_OPTIONS,
  CHALLENGE_OPTIONS,
} from './data/presets';
import { LiveClockHero } from './components/LiveClockHero';
import { SleepCycleCalculator } from './components/SleepCycleCalculator';
import { MorningRoutineBuilder } from './components/MorningRoutineBuilder';
import { SmartAdvisorPanel } from './components/SmartAdvisorPanel';
import { AlarmEditorModal } from './components/AlarmEditorModal';
import { ActiveAlarmModal } from './components/ActiveAlarmModal';
import { EmployeeRestManager } from './components/EmployeeRestManager';
import { DailyHabitsTracker } from './components/DailyHabitsTracker';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView';
import { AppSettingsView } from './components/AppSettingsView';
import { SmartMorningIcon } from './components/SmartMorningIcon';
import { nativeAlarmBridge } from './utils/nativeAlarmBridge';
import {
  Bell,
  Plus,
  Trash2,
  Edit3,
  Play,
  Sparkles,
  CheckCircle2,
  Moon,
  ListChecks,
  Users,
  Home,
  BarChart3,
  Settings,
  Menu,
  X,
  Sun,
  CheckSquare,
} from 'lucide-react';

export type ActiveSection =
  | 'home'
  | 'alarms'
  | 'routine'
  | 'habits'
  | 'cycles'
  | 'rest'
  | 'reports'
  | 'advisor'
  | 'settings';

const STORAGE_KEYS = {
  ALARMS: 'miqat_fajr_alarms_v1',
  ROUTINE: 'miqat_fajr_routine_v1',
  HABITS: 'miqat_fajr_habits_v1',
  THEME: 'miqat_fajr_theme_v2_light',
  DEFAULT_TONE: 'miqat_fajr_default_tone_v1',
  SPLASH_SEEN: 'miqat_fajr_splash_seen_session_v1',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Welcome Splash Screen (Reference Screen 1)
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.SPLASH_SEEN) !== '1';
    } catch {
      return false;
    }
  });

  // Theme Mode: Default is 'light' to match the Reference Image (#F4F7FB background + White Cards + #1B365D Navy)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Default Ringtone
  const [defaultRingtone, setDefaultRingtone] = useState<SoundType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DEFAULT_TONE);
      return (saved as SoundType) || 'fajr_adhan_tone';
    } catch {
      return 'fajr_adhan_tone';
    }
  });

  // Alarms State with LocalStorage Persistence
  const [alarms, setAlarms] = useState<AlarmItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ALARMS);
      return saved ? JSON.parse(saved) : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });

  // Morning Routine Steps State with LocalStorage Persistence
  const [routineSteps, setRoutineSteps] = useState<RoutineStep[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ROUTINE);
      return saved ? JSON.parse(saved) : ROUTINE_PRESETS[0].steps;
    } catch {
      return ROUTINE_PRESETS[0].steps;
    }
  });

  // Daily Habits State with LocalStorage Persistence
  const [habits, setHabits] = useState<DailyHabit[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HABITS);
      return saved ? JSON.parse(saved) : INITIAL_HABITS;
    } catch {
      return INITIAL_HABITS;
    }
  });

  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>(SMART_SUGGESTIONS);

  // Modals State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<AlarmItem | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<AlarmItem | null>(null);
  const [deletingAlarmId, setDeletingAlarmId] = useState<string | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const lastTriggeredMinuteRef = useRef<string>('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(alarms));
    } catch {}
    nativeAlarmBridge.syncSmartAlarms(alarms);
  }, [alarms]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTINE, JSON.stringify(routineSteps));
    } catch {}
  }, [routineSteps]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
    } catch {}
  }, [habits]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, themeMode);
    } catch {}
  }, [themeMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DEFAULT_TONE, defaultRingtone);
    } catch {}
  }, [defaultRingtone]);

  // Real-time background alarm trigger check every second
  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const currentHM = `${h}:${m}`;
      const currentDay = now.getDay();

      if (lastTriggeredMinuteRef.current === currentHM) return;

      const matched = alarms.find((alarm) => {
        if (!alarm.enabled) return false;
        const dayOk = alarm.days.length === 0 || alarm.days.includes(currentDay);
        return dayOk && alarm.time === currentHM;
      });

      if (matched) {
        lastTriggeredMinuteRef.current = currentHM;
        setRingingAlarm(matched);
      }
    };

    const interval = setInterval(checkAlarms, 1000);
    return () => clearInterval(interval);
  }, [alarms]);

  const showToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => setToastBanner(null), 4000);
  };

  const handleDismissSplash = () => {
    try {
      sessionStorage.setItem(STORAGE_KEYS.SPLASH_SEEN, '1');
    } catch {}
    setShowSplash(false);
  };

  // Handlers for Alarms
  const handleToggleAlarm = (id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const handleSaveAlarm = (saved: AlarmItem) => {
    setAlarms((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      if (exists) {
        return prev.map((a) => (a.id === saved.id ? saved : a));
      }
      return [saved, ...prev];
    });
    showToast(`تم حفظ المنبه (${saved.label}) على الساعة ${saved.time}`);
  };

  const handleConfirmDeleteAlarm = () => {
    if (!deletingAlarmId) return;
    setAlarms((prev) => prev.filter((a) => a.id !== deletingAlarmId));
    setDeletingAlarmId(null);
    showToast('تم حذف المنبه بنجاح');
  };

  // Handlers for Sleep Cycle Calculator
  const handleApplyRecommendedWakeTime = (time24: string, smartWindow: number) => {
    const newAlarm: AlarmItem = {
      id: `alarm-${Date.now()}`,
      time: time24,
      label: 'منبه دورة النوم الذكية',
      days: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
      smartWindowMinutes: smartWindow,
      gradualFadeSeconds: 60,
      sound: defaultRingtone,
      challenge: 'math',
      linkedRoutinePresetId: 'energized_45',
      autoLaunchRoutine: true,
    };
    setAlarms((prev) => [newAlarm, ...prev]);
    showToast(`تم إنشاء منبه ذكي على الساعة ${time24} بنافذة ${smartWindow} د`);
  };

  // Handlers for Smart Suggestions & Advisor
  const handleApplySuggestion = (sug: SmartSuggestion) => {
    if (sug.actionType === 'enable_smart_window') {
      const win = sug.payload.smartWindow || 20;
      setAlarms((prev) =>
        prev.map((a, idx) => (idx === 0 ? { ...a, smartWindowMinutes: win, enabled: true } : a))
      );
      showToast(`تم تفعيل نافذة الاستيقاظ الذكي (${win} دقيقة)`);
    } else if (sug.actionType === 'add_habit_step' && sug.payload.habitStep) {
      const step = sug.payload.habitStep;
      setRoutineSteps((prev) => {
        if (prev.some((s) => s.id === step.id)) return prev;
        return [step, ...prev];
      });
      showToast(`تمت إضافة "${step.title}" إلى روتينك الصباحي`);
    } else if (sug.actionType === 'apply_routine' && sug.payload.presetId) {
      const found = ROUTINE_PRESETS.find((p) => p.id === sug.payload.presetId);
      if (found) {
        setRoutineSteps(found.steps);
        showToast(`تم اعتماد قالب "${found.name}" لروتينك الصباحي`);
      }
    } else if (sug.actionType === 'apply_alarm' && sug.payload.time) {
      const newAlarm: AlarmItem = {
        id: `alarm-${Date.now()}`,
        time: sug.payload.time,
        label: 'منبه الساعة الذهبية',
        days: [0, 1, 2, 3, 4],
        enabled: true,
        smartWindowMinutes: sug.payload.smartWindow || 20,
        gradualFadeSeconds: 60,
        sound: 'zen_bowl',
        challenge: 'intention',
        linkedRoutinePresetId: sug.payload.presetId || 'calm_dawn_30',
        autoLaunchRoutine: true,
      };
      setAlarms((prev) => [newAlarm, ...prev]);
      showToast(`تمت إضافة منبه الساعة الذهبية (${sug.payload.time})`);
    }

    setSuggestions((prev) =>
      prev.map((item) => (item.id === sug.id ? { ...item, applied: true } : item))
    );
  };

  const handleGenerateCustomPlan = (
    goal: string,
    wakeTime: string,
    minutesAvailable: number
  ) => {
    let preset = ROUTINE_PRESETS[0];
    if (minutesAvailable <= 15) {
      preset = ROUTINE_PRESETS[1];
    } else if (goal === 'calm' || minutesAvailable === 30) {
      preset = ROUTINE_PRESETS[2];
    }

    setRoutineSteps(preset.steps);

    const goalTitle =
      goal === 'energy'
        ? 'منبه الطاقة والحيوية'
        : goal === 'focus'
        ? 'منبه التركيز والإنجاز'
        : 'منبه الصفاء والهدوء';

    const customAlarm: AlarmItem = {
      id: `alarm-plan-${Date.now()}`,
      time: wakeTime,
      label: goalTitle,
      days: [0, 1, 2, 3, 4],
      enabled: true,
      smartWindowMinutes: 20,
      gradualFadeSeconds: 60,
      sound: goal === 'calm' ? 'zen_bowl' : defaultRingtone,
      challenge: goal === 'focus' ? 'math' : 'intention',
      linkedRoutinePresetId: preset.id,
      autoLaunchRoutine: true,
    };

    setAlarms((prev) => [customAlarm, ...prev]);
  };

  // Handlers for Active Alarm Dismissal & Snooze
  const handleDismissAlarm = (alarm: AlarmItem) => {
    setRingingAlarm(null);
    if (alarm.autoLaunchRoutine) {
      const linkedPreset = ROUTINE_PRESETS.find(
        (p) => p.id === alarm.linkedRoutinePresetId
      );
      if (linkedPreset && routineSteps.length === 0) {
        setRoutineSteps(linkedPreset.steps);
      }
      setActiveSection('routine');
      showToast('صباح النور والنشاط! بدأ الآن جدول روتينك الصباحي.');
    } else {
      showToast('صباح الخير! تم إيقاف المنبه بنجاح.');
    }
  };

  const handleSnoozeAlarm = (alarm: AlarmItem) => {
    setRingingAlarm(null);
    const now = new Date(Date.now() + 5 * 60000);
    const snoozeTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    showToast(`تم تفعيل غفوة لمدة 5 دقائق (يرن الساعة ${snoozeTime})`);
    setAlarms((prev) =>
      prev.map((a) => (a.id === alarm.id ? { ...a, time: snoozeTime, enabled: true } : a))
    );
  };

  const handleResetAllData = () => {
    localStorage.clear();
    setAlarms(INITIAL_ALARMS);
    setRoutineSteps(ROUTINE_PRESETS[0].steps);
    setHabits(INITIAL_HABITS);
    showToast('تمت استعادة الإعدادات والبيانات الافتراضية بنجاح.');
  };

  const primaryActiveWakeTime =
    alarms.find((a) => a.enabled)?.time || alarms[0]?.time || '04:32';

  const getSoundName = (id: AlarmItem['sound']) =>
    SOUND_OPTIONS.find((s) => s.id === id)?.name || 'أذان الفجر';

  const formatDaysLabel = (days: number[]) => {
    if (days.length === 7 || days.length === 0) return 'يومياً';
    if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) {
      return 'الأحد - الخميس';
    }
    if (days.length === 2 && days.includes(5) && days.includes(6)) {
      return 'الجمعة، السبت';
    }
    return days
      .map((d) => DAY_NAMES.find((dn) => dn.index === d)?.full)
      .filter(Boolean)
      .join('، ');
  };

  const navMenuItems: { id: ActiveSection; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'الرئيسية', icon: <Home className="w-4 h-4" /> },
    { id: 'alarms', label: 'المنبهات', icon: <Bell className="w-4 h-4" /> },
    { id: 'routine', label: 'الروتين الصباحي', icon: <Sun className="w-4 h-4" /> },
    { id: 'habits', label: 'العادات اليومية', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'cycles', label: 'حاسبة النوم', icon: <Moon className="w-4 h-4" /> },
    { id: 'rest', label: 'إدارة الاستراحات', icon: <Users className="w-4 h-4" /> },
    { id: 'reports', label: 'التقارير', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-4 h-4" /> },
  ];

  // =========================================================
  // SPLASH / WELCOME SCREEN (Exact Match to Reference Screen 1)
  // =========================================================
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-[#0E1E38] via-[#1B365D] to-[#244775] text-white px-6 py-12 overflow-hidden select-none">
        {/* Subtle Stars & Dawn Horizon Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-amber-300/20 blur-3xl"
        />

        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-5 max-w-sm mx-auto z-10">
          <div className="p-2 rounded-3xl shadow-2xl shadow-black/30">
            <SmartMorningIcon size={116} />
          </div>

          <div className="space-y-1.5 pt-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-display">
              SmartMorning
            </h1>
            <p className="text-xl sm:text-2xl font-bold text-[#FDE68A]">
              ميقات الفجر
            </p>
            <p className="text-sm text-sky-100/90 pt-2 font-medium">
              بداية جديدة .. كل يوم
            </p>
          </div>
        </div>

        {/* Bottom Sunrise Mosque Silhouette & Golden CTA Button (Screen 1) */}
        <div className="w-full max-w-xs space-y-6 z-10 text-center">
          <button
            onClick={handleDismissSplash}
            className="w-full min-h-[54px] rounded-2xl bg-gradient-to-r from-[#F59E0B] via-[#FBBF24] to-[#F59E0B] hover:brightness-105 text-[#0F2342] font-extrabold text-base shadow-xl shadow-amber-500/25 cursor-pointer transition-transform active:scale-98"
          >
            ابدأ يومك
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col pb-22 md:pb-8 transition-colors ${
        themeMode === 'dark' ? 'dark-theme' : ''
      }`}
    >
      {/* Top Header Bar: Matches Clean Light App Header with Navy Accents */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8 py-3.5 border-b border-[#E6EDF5] bg-white/95 backdrop-blur-md text-[#172B4D] shadow-2xs">
        {/* Zone 1: Drawer Menu Button + Brand Lockup */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="min-h-[42px] min-w-[42px] rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#1B365D] cursor-pointer transition-colors"
            title="القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </button>

          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('home');
            }}
            className="flex items-center gap-2.5"
          >
            <SmartMorningIcon size={38} />
            <div className="leading-tight">
              <span className="block text-base sm:text-lg font-extrabold tracking-tight text-[#1B365D] font-display">
                SmartMorning
              </span>
              <span className="block text-[11px] font-bold text-[#2F80ED]">
                ميقات الفجر
              </span>
            </div>
          </a>
        </div>

        {/* Zone 2: Desktop Navigation Pills */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-[#F4F7FB] p-1.5 rounded-2xl border border-[#E6EDF5]">
          {navMenuItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#1B365D] text-white shadow-xs'
                    : 'text-[#6B7C93] hover:text-[#172B4D]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action (+ منبه جديد) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingAlarm(null);
              setEditorOpen(true);
            }}
            className="min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-[#1B365D] hover:bg-[#0F2342] rounded-xl transition-colors whitespace-nowrap cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>منبه جديد</span>
          </button>
        </div>
      </header>

      {/* =========================================================
          SLIDE-OVER SIDEBAR DRAWER (Exact Match to Reference Screen 14)
         ========================================================= */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
          />

          <aside className="relative z-10 w-72 max-w-[85vw] bg-gradient-to-b from-[#1B365D] via-[#14294A] to-[#0D1B32] p-6 flex flex-col justify-between text-white shadow-2xl overflow-y-auto">
            <div className="space-y-6">
              {/* Top Brand Header inside Drawer (Screen 14) */}
              <div className="relative flex flex-col items-center text-center pt-2 space-y-2">
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="absolute top-0 left-0 min-h-[36px] min-w-[36px] rounded-xl bg-white/10 text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <SmartMorningIcon size={68} />
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-white">
                    SmartMorning
                  </h2>
                  <p className="text-xs font-bold text-amber-300 mt-0.5">
                    ميقات الفجر
                  </p>
                </div>
              </div>

              {/* Navigation Links List (Screen 14) */}
              <div className="space-y-1.5 pt-3 border-t border-white/10">
                {navMenuItems.map((item) => {
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveSection(item.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-[#1B365D] shadow-md'
                          : 'text-slate-100 hover:bg-white/10'
                      }`}
                    >
                      <span className={active ? 'text-[#2F80ED]' : 'text-amber-300'}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <button
                  onClick={() => {
                    setActiveSection('advisor');
                    setDrawerOpen(false);
                  }}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                    activeSection === 'advisor'
                      ? 'bg-white text-[#1B365D] shadow-md'
                      : 'text-slate-100 hover:bg-white/10'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>مُصمم الصباح الذكي</span>
                </button>
              </div>
            </div>

            {/* Bottom Sunrise Promotional Card inside Drawer (Screen 14) */}
            <div className="mt-6 rounded-2xl bg-gradient-to-t from-amber-500/30 via-sky-500/15 to-white/5 border border-amber-300/30 p-4 text-center space-y-1.5">
              <p className="text-xs font-extrabold text-amber-200">
                طريقك إلى بداية يوم أفضل
              </p>
              <p className="text-[11px] text-sky-100">
                بداية أفضل .. كل يوم
              </p>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  setShowSplash(true);
                }}
                className="mt-2 w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white cursor-pointer"
              >
                عرض شاشة الترحيب
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Toast Notification Banner */}
        {toastBanner && (
          <div className="sm-card border-emerald-500/40 bg-[#E6F8EF] px-4 py-3 text-xs font-bold text-[#065F46] flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>{toastBanner}</span>
            </div>
            <button
              onClick={() => setToastBanner(null)}
              className="text-[#065F46] hover:underline text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* =====================================================
            PAGE 1: HOME DASHBOARD (الرئيسية - Exact Match to Reference Screen 2)
           ===================================================== */}
        {activeSection === 'home' && (
          <div className="space-y-6">
            {/* Morning Greeting Header (Screen 2) */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#172B4D]">
                  صباح الخير
                </h1>
                <p className="text-xs sm:text-sm text-[#6B7C93] font-medium mt-0.5">
                  تذكر أن كل يوم فرصة جديدة
                </p>
              </div>
              <button
                onClick={() => setActiveSection('advisor')}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-xs font-bold text-[#1B365D] flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                <span>اقتراحات ذكية</span>
              </button>
            </div>

            {/* Hero Next Alarm & Mosque Dawn Card (Screen 2) */}
            <LiveClockHero
              alarms={alarms}
              onTriggerDemoAlarm={(alarm) => setRingingAlarm(alarm)}
              onOpenNewAlarm={() => {
                setEditingAlarm(null);
                setEditorOpen(true);
              }}
            />

            {/* Primary 2x2 Grid of White Cards (المنبهات | الروتين الصباحي | العادات | حاسبة النوم) matching Screen 2 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Card 1: المنبهات */}
              <button
                onClick={() => setActiveSection('alarms')}
                className="sm-card p-5 hover:border-[#2F80ED] flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Bell className="w-7 h-7 fill-[#F59E0B] text-[#F59E0B]" />
                </div>
                <div>
                  <span className="text-sm sm:text-base font-extrabold text-[#172B4D] block">
                    المنبهات
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B7C93]">
                    {alarms.filter((a) => a.enabled).length} منبهات مفعّلة
                  </span>
                </div>
              </button>

              {/* Card 2: الروتين الصباحي */}
              <button
                onClick={() => setActiveSection('routine')}
                className="sm-card p-5 hover:border-[#F59E0B] flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4E5] text-[#F59E0B] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Sun className="w-7 h-7 fill-[#F59E0B]" />
                </div>
                <div>
                  <span className="text-sm sm:text-base font-extrabold text-[#172B4D] block">
                    الروتين الصباحي
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B7C93]">
                    {routineSteps.length} أنشطة صباحية
                  </span>
                </div>
              </button>

              {/* Card 3: العادات */}
              <button
                onClick={() => setActiveSection('habits')}
                className="sm-card p-5 hover:border-[#10B981] flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#E6F8EF] text-[#10B981] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CheckSquare className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-sm sm:text-base font-extrabold text-[#172B4D] block">
                    العادات
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B7C93]">
                    {habits.length} عادات يومية
                  </span>
                </div>
              </button>

              {/* Card 4: حاسبة النوم */}
              <button
                onClick={() => setActiveSection('cycles')}
                className="sm-card p-5 hover:border-[#8B5CF6] flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#F3E8FF] text-[#8B5CF6] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Moon className="w-7 h-7 fill-[#8B5CF6]" />
                </div>
                <div>
                  <span className="text-sm sm:text-base font-extrabold text-[#172B4D] block">
                    حاسبة النوم
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B7C93]">
                    دورات 90 دقيقة
                  </span>
                </div>
              </button>
            </div>

            {/* Secondary Row: Employee Rest Management & Reports Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setActiveSection('rest')}
                className="sm-card p-5 hover:border-[#2F80ED] flex items-center justify-between gap-4 text-right transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#EBF3FE] text-[#1B365D] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Users className="w-6 h-6 text-[#2F80ED]" />
                  </div>
                  <div>
                    <span className="text-base font-extrabold text-[#172B4D] block">
                      إدارة استراحات الموظفين (ريست)
                    </span>
                    <span className="text-xs text-[#6B7C93]">
                      مؤقتات الاستراحات والرصيد اليومي وسجل التأخير
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-[#F0F4F9] text-[#1B365D] text-xs font-bold shrink-0">
                  فتح ←
                </span>
              </button>

              <button
                onClick={() => setActiveSection('reports')}
                className="sm-card p-5 hover:border-[#10B981] flex items-center justify-between gap-4 text-right transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#E6F8EF] text-[#10B981] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-base font-extrabold text-[#172B4D] block">
                      التقارير والإحصائيات
                    </span>
                    <span className="text-xs text-[#6B7C93]">
                      ملخص الاستراحات والعادات اليومية والأسبوعية
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-[#F0F4F9] text-[#1B365D] text-xs font-bold shrink-0">
                  عرض ←
                </span>
              </button>
            </div>
          </div>
        )}

        {/* =====================================================
            PAGE 2: ALARMS LIST (المنبهات - Exact Match to Reference Screen 3)
           ===================================================== */}
        {(activeSection === 'alarms' || activeSection === 'home') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#172B4D]">
                    المنبهات
                  </h2>
                  <p className="text-xs text-[#6B7C93] mt-0.5">
                    إدارة مواعيد الاستيقاظ ونافذة الفجر الذكية
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingAlarm(null);
                    setEditorOpen(true);
                  }}
                  className="w-11 h-11 rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-95"
                  title="إضافة منبه"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {alarms.length === 0 ? (
                <div className="sm-card p-8 text-center space-y-4">
                  <p className="text-sm text-[#6B7C93]">
                    لا توجد منبهات مضافة حالياً. ابدأ بإنشاء أول منبه ذكي لتنظيم صباحك.
                  </p>
                  <button
                    onClick={() => {
                      setEditingAlarm(null);
                      setEditorOpen(true);
                    }}
                    className="min-h-[44px] px-5 py-2.5 sm-btn-navy text-xs inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة أول منبه ذكي</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {alarms.map((alarm) => {
                    const [h, m] = alarm.time.split(':').map(Number);
                    const period = h >= 12 ? 'م' : 'ص';
                    const displayH = h % 12 || 12;
                    const displayM = String(m).padStart(2, '0');

                    return (
                      <div
                        key={alarm.id}
                        className={`sm-card p-5 transition-all ${
                          alarm.enabled ? '' : 'opacity-70 bg-[#F8FAFC]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          {/* Right side in RTL: Large Time + Label + Days (Screen 3) */}
                          <div className="space-y-1">
                            <div className="flex items-baseline gap-2">
                              <span
                                dir="ltr"
                                className="font-mono tabular-nums text-3xl sm:text-4xl font-extrabold text-[#172B4D]"
                              >
                                {displayH}:{displayM}
                              </span>
                              <span className="text-sm font-extrabold text-[#172B4D]">
                                {period}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                              <span className="text-[#1B365D]">{alarm.label}</span>
                              <span aria-hidden="true" className="text-[#CBD5E1]">
                                ·
                              </span>
                              <span className="text-[#6B7C93]">
                                {formatDaysLabel(alarm.days)}
                              </span>
                              <span aria-hidden="true" className="text-[#CBD5E1]">
                                ·
                              </span>
                              <span className="text-[#2F80ED]">
                                {getSoundName(alarm.sound)}
                              </span>
                            </div>
                          </div>

                          {/* Left side in RTL: Modern Green Pill Switch (Screen 3) */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={alarm.enabled}
                            onClick={() => handleToggleAlarm(alarm.id)}
                            className={`w-14 h-8 rounded-full p-1 transition-colors cursor-pointer flex items-center shrink-0 ${
                              alarm.enabled
                                ? 'bg-[#22C55E] justify-end'
                                : 'bg-[#CBD5E1] justify-start'
                            }`}
                          >
                            <span className="w-6 h-6 rounded-full bg-white shadow-xs block" />
                          </button>
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#E6EDF5] flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-[#6B7C93]">
                            {alarm.smartWindowMinutes > 0
                              ? `نافذة استيقاظ ذكية (${alarm.smartWindowMinutes} د)`
                              : 'رنين مباشر'}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setRingingAlarm(alarm)}
                              className="min-h-[34px] px-3 py-1 rounded-xl bg-[#F0F4F9] hover:bg-[#1B365D] hover:text-white text-[#172B4D] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>تجربة</span>
                            </button>

                            <button
                              onClick={() => {
                                setEditingAlarm(alarm);
                                setEditorOpen(true);
                              }}
                              className="min-h-[34px] px-3 py-1 rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#172B4D] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>

                            <button
                              onClick={() => setDeletingAlarmId(alarm.id)}
                              className="min-h-[34px] min-w-[34px] rounded-xl bg-[#F0F4F9] hover:bg-rose-50 text-[#6B7C93] hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="حذف المنبه"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Left Column (5 cols): Quick Morning Routine Preview Card */}
            <div className="lg:col-span-5 space-y-4">
              <div className="sm-card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
                  <div>
                    <h3 className="text-base font-extrabold text-[#172B4D]">
                      الروتين الصباحي المرتبط
                    </h3>
                    <p className="text-xs text-[#6B7C93] mt-0.5">
                      يبدأ تلقائياً بعد منبه الساعة{' '}
                      <span className="font-mono tabular-nums font-bold text-[#2F80ED]">
                        {primaryActiveWakeTime}
                      </span>
                    </p>
                  </div>

                  <button
                    onClick={() => setActiveSection('routine')}
                    className="text-xs font-bold text-[#2F80ED] hover:underline cursor-pointer"
                  >
                    عرض الكل ←
                  </button>
                </div>

                <div className="divide-y divide-[#E6EDF5]">
                  {routineSteps.slice(0, 4).map((step, i) => (
                    <div
                      key={step.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono tabular-nums text-[#9AA5B1] font-bold">
                          0{i + 1}.
                        </span>
                        <span
                          className={
                            step.completed
                              ? 'line-through text-[#9AA5B1]'
                              : 'text-[#172B4D] font-bold'
                          }
                        >
                          {step.title}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-[#2F80ED] font-bold shrink-0">
                        {step.durationMinutes} دقائق
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setActiveSection('routine')}
                  className="w-full min-h-[44px] sm-btn-navy text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ListChecks className="w-4 h-4" />
                  <span>فتح الروتين الصباحي والمؤقت</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            PAGE 3: MORNING ROUTINE (الروتين الصباحي - Reference Screen 7)
           ===================================================== */}
        {activeSection === 'routine' && (
          <MorningRoutineBuilder
            steps={routineSteps}
            activeWakeTime={primaryActiveWakeTime}
            onUpdateSteps={setRoutineSteps}
            onSelectPreset={(preset: RoutinePreset) => {
              setRoutineSteps(preset.steps);
              showToast(`تم تحميل "${preset.name}" (${preset.totalMinutes} دقيقة)`);
            }}
          />
        )}

        {/* =====================================================
            PAGE 4: DAILY HABITS (العادات اليومية - Reference Screen 8)
           ===================================================== */}
        {activeSection === 'habits' && (
          <DailyHabitsTracker habits={habits} onUpdateHabits={setHabits} />
        )}

        {/* =====================================================
            PAGE 5: SLEEP CALCULATOR (حاسبة النوم - Reference Screen 9)
           ===================================================== */}
        {activeSection === 'cycles' && (
          <SleepCycleCalculator
            onApplyRecommendedTime={handleApplyRecommendedWakeTime}
          />
        )}

        {/* =====================================================
            PAGE 6: EMPLOYEE REST MANAGER (إدارة الاستراحات - Reference Screens 10 & 11)
           ===================================================== */}
        {activeSection === 'rest' && <EmployeeRestManager />}

        {/* =====================================================
            PAGE 7: REPORTS & ANALYTICS (التقارير - Reference Screen 12)
           ===================================================== */}
        {activeSection === 'reports' && (
          <ReportsAnalyticsView habits={habits} routineSteps={routineSteps} />
        )}

        {/* =====================================================
            PAGE 8: SMART ADVISOR (الاقتراحات الذكية)
           ===================================================== */}
        {activeSection === 'advisor' && (
          <SmartAdvisorPanel
            suggestions={suggestions}
            onApplySuggestion={handleApplySuggestion}
            onGenerateCustomPlan={handleGenerateCustomPlan}
          />
        )}

        {/* =====================================================
            PAGE 9: SETTINGS & RINGTONES (الإعدادات ونغمات الرنين - Reference Screens 5, 6, 13)
           ===================================================== */}
        {activeSection === 'settings' && (
          <AppSettingsView
            themeMode={themeMode}
            onToggleTheme={() =>
              setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
            }
            defaultRingtone={defaultRingtone}
            onChangeDefaultRingtone={(s) => {
              setDefaultRingtone(s);
              showToast('تم تحديث نغمة المنبه الافتراضية');
            }}
            onResetAllData={handleResetAllData}
          />
        )}
      </main>

      {/* Fixed Bottom Navigation Bar for Mobile / Android (Clean White Bar with Navy Active State) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E6EDF5] px-2 py-1.5 md:hidden shadow-lg">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          <button
            onClick={() => setActiveSection('home')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeSection === 'home'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px]">الرئيسية</span>
          </button>

          <button
            onClick={() => setActiveSection('alarms')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeSection === 'alarms'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px]">المنبهات</span>
          </button>

          <button
            onClick={() => setActiveSection('routine')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeSection === 'routine' || activeSection === 'habits'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Sun className="w-5 h-5" />
            <span className="text-[10px]">الروتين</span>
          </button>

          <button
            onClick={() => setActiveSection('rest')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeSection === 'rest'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px]">الاستراحات</span>
          </button>

          <button
            onClick={() => setDrawerOpen(true)}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              ['cycles', 'reports', 'settings', 'advisor'].includes(activeSection)
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px]">القائمة</span>
          </button>
        </div>
      </nav>

      {/* Confirm Delete Alarm Modal */}
      {deletingAlarmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl border border-[#E6EDF5] bg-white p-6 shadow-2xl space-y-4 text-[#172B4D]">
            <h3 className="text-lg font-bold">تأكيد حذف المنبه</h3>
            <p className="text-xs text-[#6B7C93] leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا المنبه؟
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingAlarmId(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDeleteAlarm}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alarm Editor Modal (Screens 4, 5, 6) */}
      <AlarmEditorModal
        isOpen={editorOpen}
        initialAlarm={editingAlarm}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveAlarm}
      />

      {/* Active Ringing & Wake-up Challenge Modal */}
      <ActiveAlarmModal
        alarm={ringingAlarm}
        onDismissAndStartRoutine={handleDismissAlarm}
        onSnooze={handleSnoozeAlarm}
      />
    </div>
  );
}
