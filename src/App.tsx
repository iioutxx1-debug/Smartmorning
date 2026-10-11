/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AlarmItem, SoundType, DefaultToneConfig } from './types';
import {
  INITIAL_ALARMS,
  DAY_NAMES,
  SOUND_OPTIONS,
} from './data/presets';
import { LiveClockHero } from './components/LiveClockHero';
import { SleepCycleCalculator } from './components/SleepCycleCalculator';
import { AlarmEditorModal } from './components/AlarmEditorModal';
import { ActiveAlarmModal } from './components/ActiveAlarmModal';
import { EmployeeRestManager } from './components/EmployeeRestManager';
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
  CheckCircle2,
  Moon,
  Users,
  Home,
  BarChart3,
  Settings,
  Menu,
  X,
} from 'lucide-react';

export type ActiveSection =
  | 'home'
  | 'alarms'
  | 'cycles'
  | 'rest'
  | 'reports'
  | 'settings';

const STORAGE_KEYS = {
  ALARMS: 'miqat_fajr_alarms_v1',
  THEME: 'miqat_fajr_theme_v2_light',
  DEFAULT_TONE: 'miqat_fajr_default_tone_v1',
  DEFAULT_TONE_CONFIG: 'miqat_fajr_default_tone_config_v1',
  LEGACY_ROUTINE: 'miqat_fajr_routine_v1',
  LEGACY_HABITS: 'miqat_fajr_habits_v1',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Theme Mode: Default is 'light' (#F4F7FB background + White Cards + #1B365D Navy)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Default Ringtone (App Tone ID)
  const [defaultRingtone, setDefaultRingtone] = useState<SoundType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DEFAULT_TONE);
      return (saved as SoundType) || 'fajr_adhan_tone';
    } catch {
      return 'fajr_adhan_tone';
    }
  });

  // Rich Default Tone Configuration (supports App Tone, Phone Ringtone, or Imported Song)
  const [defaultToneConfig, setDefaultToneConfig] = useState<DefaultToneConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DEFAULT_TONE_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.soundSource && parsed.sound) {
          return parsed;
        }
      }
    } catch {}
    return {
      soundSource: 'app_tone',
      sound: 'fajr_adhan_tone',
    };
  });

  // Alarms State with LocalStorage Persistence
  const [alarms, setAlarms] = useState<AlarmItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ALARMS);
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });

  // Modals State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<AlarmItem | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<AlarmItem | null>(null);
  const [deletingAlarmId, setDeletingAlarmId] = useState<string | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const lastTriggeredMinuteRef = useRef<string>('');

  // Clean up legacy Routine & Habits storage keys on startup
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ROUTINE);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_HABITS);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(alarms));
    } catch {}
    nativeAlarmBridge.syncSmartAlarms(alarms);
  }, [alarms]);

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

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.DEFAULT_TONE_CONFIG,
        JSON.stringify(defaultToneConfig)
      );
    } catch {}
  }, [defaultToneConfig]);

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
      sound: defaultToneConfig.sound || defaultRingtone,
      soundSource: defaultToneConfig.soundSource,
      customSongId: defaultToneConfig.customSongId,
      customSoundTitle: defaultToneConfig.customSoundTitle,
      customSoundUri: defaultToneConfig.customSoundUri,
      challenge: 'math',
    };
    setAlarms((prev) => [newAlarm, ...prev]);
    showToast(`تم إنشاء منبه ذكي على الساعة ${time24} بنافذة ${smartWindow} د`);
  };

  const handleSongDeletedFromLibrary = (deletedSongId: string, deletedSongName: string) => {
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.soundSource === 'my_song' && a.customSongId === deletedSongId) {
          return {
            ...a,
            soundSource: 'app_tone',
            sound: 'fajr_adhan_tone',
            customSongId: undefined,
            customSoundTitle: undefined,
            customSoundUri: undefined,
          };
        }
        return a;
      })
    );
    showToast(
      `تم حذف الأغنية "${deletedSongName}" وتحويل المنبهات المرتبطة بها إلى النغمة الافتراضية.`
    );
  };

  // Handlers for Active Alarm Dismissal & Snooze
  const handleDismissAlarm = (_alarm: AlarmItem) => {
    setRingingAlarm(null);
    showToast('صباح الخير! تم إيقاف المنبه بنجاح.');
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
    setDefaultToneConfig({
      soundSource: 'app_tone',
      sound: 'fajr_adhan_tone',
    });
    showToast('تمت استعادة الإعدادات والبيانات الافتراضية بنجاح.');
  };

  const getAlarmSoundDisplay = (alarm: AlarmItem): string => {
    if (
      (alarm.soundSource === 'phone_ringtone' || alarm.soundSource === 'my_song') &&
      alarm.customSoundTitle
    ) {
      const prefix = alarm.soundSource === 'phone_ringtone' ? 'نغمة الهاتف: ' : 'أغنيتي: ';
      return `${prefix}${alarm.customSoundTitle}`;
    }
    return SOUND_OPTIONS.find((s) => s.id === alarm.sound)?.name || 'أذان الفجر';
  };

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
    { id: 'rest', label: 'إدارة الاستراحات', icon: <Users className="w-4 h-4" /> },
    { id: 'cycles', label: 'حاسبة النوم', icon: <Moon className="w-4 h-4" /> },
    { id: 'reports', label: 'التقارير', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div
      className={`min-h-screen flex flex-col pb-22 md:pb-8 transition-colors ${
        themeMode === 'dark' ? 'dark-theme' : ''
      }`}
    >
      {/* Top Header Bar */}
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
          SLIDE-OVER SIDEBAR DRAWER
         ========================================================= */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
          />

          <aside className="relative z-10 w-72 max-w-[85vw] bg-gradient-to-b from-[#1B365D] via-[#14294A] to-[#0D1B32] p-6 flex flex-col justify-between text-white shadow-2xl overflow-y-auto">
            <div className="space-y-6">
              {/* Top Brand Header inside Drawer */}
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

              {/* Navigation Links List */}
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
              </div>
            </div>

            {/* Bottom Sunrise Promotional Card inside Drawer */}
            <div className="mt-6 rounded-2xl bg-gradient-to-t from-amber-500/30 via-sky-500/15 to-white/5 border border-amber-300/30 p-4 text-center space-y-1.5">
              <p className="text-xs font-extrabold text-amber-200">
                طريقك إلى بداية يوم أفضل
              </p>
              <p className="text-[11px] text-sky-100">
                بداية أفضل .. كل يوم
              </p>
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

        {/* Always-mounted EmployeeRestManager:
            - When activeSection === 'rest', renders full Employee Rest Manager UI.
            - When on other tabs, keeps timers/notification action handlers alive and displays interactive Rest Alert Banner if any employee's rest expires. */}
        <EmployeeRestManager
          onNavigateToRest={() => setActiveSection('rest')}
          isRestTabVisible={activeSection === 'rest'}
        />

        {/* =====================================================
            PAGE 1: HOME DASHBOARD (الرئيسية)
           ===================================================== */}
        {activeSection === 'home' && (
          <div className="space-y-6">
            {/* Morning Greeting Header */}
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
                onClick={() => setActiveSection('rest')}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-xs font-bold text-[#1B365D] flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#2F80ED]" />
                <span>إدارة الاستراحات</span>
              </button>
            </div>

            {/* Hero Next Alarm & Mosque Dawn Card */}
            <LiveClockHero
              alarms={alarms}
              onTriggerDemoAlarm={(alarm) => setRingingAlarm(alarm)}
              onOpenNewAlarm={() => {
                setEditingAlarm(null);
                setEditorOpen(true);
              }}
            />

            {/* Primary 4-Card Grid: المنبهات | إدارة الاستراحات | حاسبة النوم | التقارير */}
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

              {/* Card 2: إدارة الاستراحات */}
              <button
                onClick={() => setActiveSection('rest')}
                className="sm-card p-5 hover:border-[#2F80ED] flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#EBF3FE] text-[#1B365D] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Users className="w-7 h-7 text-[#2F80ED]" />
                </div>
                <div>
                  <span className="text-sm sm:text-base font-extrabold text-[#172B4D] block">
                    إدارة الاستراحات
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B7C93]">
                    مؤقتات وأرصدة الموظفين
                  </span>
                </div>
              </button>

              {/* Card 3: حاسبة النوم */}
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

              {/* Card 4: التقارير */}
              <button
                onClick={() => setActiveSection('reports')}
                className="sm-card p-5 hover:border-[#10B981] flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#E6F8EF] text-[#10B981] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-sm sm:text-base font-extrabold text-[#172B4D] block">
                    التقارير
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B7C93]">
                    إحصائيات الاستراحات
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* =====================================================
            PAGE 2: ALARMS LIST (المنبهات)
           ===================================================== */}
        {(activeSection === 'alarms' || activeSection === 'home') && (
          <div className="space-y-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                        {/* Right side in RTL: Large Time + Label + Days */}
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
                              {getAlarmSoundDisplay(alarm)}
                            </span>
                          </div>
                        </div>

                        {/* Left side in RTL: Modern Green Pill Switch */}
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
        )}

        {/* =====================================================
            PAGE 3: SLEEP CALCULATOR (حاسبة النوم)
           ===================================================== */}
        {activeSection === 'cycles' && (
          <SleepCycleCalculator
            onApplyRecommendedTime={handleApplyRecommendedWakeTime}
          />
        )}

        {/* =====================================================
            PAGE 5: REPORTS & ANALYTICS (التقارير)
           ===================================================== */}
        {activeSection === 'reports' && <ReportsAnalyticsView />}

        {/* =====================================================
            PAGE 6: SETTINGS & RINGTONES (الإعدادات ونغمات الرنين)
           ===================================================== */}
        {activeSection === 'settings' && (
          <AppSettingsView
            themeMode={themeMode}
            onToggleTheme={() =>
              setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
            }
            defaultToneConfig={defaultToneConfig}
            onChangeDefaultToneConfig={(cfg) => {
              setDefaultToneConfig(cfg);
              if (cfg.sound) {
                setDefaultRingtone(cfg.sound);
              }
              showToast('تم تحديث النغمة الافتراضية للمنبهات الجديدة');
            }}
            allAlarms={alarms}
            onSongDeletedFromLibrary={handleSongDeletedFromLibrary}
            onResetAllData={handleResetAllData}
          />
        )}
      </main>

      {/* Fixed Bottom Navigation Bar for Mobile / Android (4 Balanced Items) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E6EDF5] px-2 py-1.5 md:hidden shadow-lg">
        <div className="grid grid-cols-4 gap-1.5 max-w-md mx-auto">
          <button
            onClick={() => setActiveSection('home')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
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
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeSection === 'alarms'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px]">المنبهات</span>
          </button>

          <button
            onClick={() => setActiveSection('rest')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeSection === 'rest'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px]">الاستراحات</span>
          </button>

          <button
            onClick={() => setActiveSection('reports')}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeSection === 'reports'
                ? 'text-[#1B365D] font-extrabold bg-[#EBF3FE]'
                : 'text-[#6B7C93]'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px]">التقارير</span>
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

      {/* Alarm Editor Modal */}
      <AlarmEditorModal
        isOpen={editorOpen}
        initialAlarm={editingAlarm}
        defaultToneConfig={defaultToneConfig}
        allAlarms={alarms}
        onSongDeletedFromLibrary={handleSongDeletedFromLibrary}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveAlarm}
      />

      {/* Active Ringing & Wake-up Challenge Modal */}
      <ActiveAlarmModal
        alarm={ringingAlarm}
        onDismiss={handleDismissAlarm}
        onSnooze={handleSnoozeAlarm}
      />
    </div>
  );
}
