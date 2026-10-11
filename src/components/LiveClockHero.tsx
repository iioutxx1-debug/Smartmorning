import React, { useState, useEffect, useMemo } from 'react';
import { AlarmItem } from '../types';
import { Bell, Sparkles, Play, Plus } from 'lucide-react';

interface LiveClockHeroProps {
  alarms: AlarmItem[];
  onTriggerDemoAlarm: (alarm: AlarmItem) => void;
  onOpenNewAlarm: () => void;
}

export const LiveClockHero: React.FC<LiveClockHeroProps> = ({
  alarms,
  onTriggerDemoAlarm,
  onOpenNewAlarm,
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate the next active alarm and remaining time
  const nextAlarmInfo = useMemo(() => {
    const enabledAlarms = alarms.filter((a) => a.enabled);
    if (enabledAlarms.length === 0) return null;

    let closestAlarm: AlarmItem | null = null;
    let minDiffMs = Infinity;

    enabledAlarms.forEach((alarm) => {
      const [h, m] = alarm.time.split(':').map(Number);
      for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const candidate = new Date(now);
        candidate.setDate(now.getDate() + dayOffset);
        candidate.setHours(h, m, 0, 0);

        const candidateDay = candidate.getDay();
        const isDayAllowed = alarm.days.length === 0 || alarm.days.includes(candidateDay);

        if (isDayAllowed && candidate.getTime() > now.getTime()) {
          const diff = candidate.getTime() - now.getTime();
          if (diff < minDiffMs) {
            minDiffMs = diff;
            closestAlarm = alarm;
          }
          break;
        }
      }
    });

    if (!closestAlarm || minDiffMs === Infinity) return null;

    const totalMinutes = Math.max(1, Math.ceil(minDiffMs / 60000));
    const hoursLeft = Math.floor(totalMinutes / 60);
    const minsLeft = totalMinutes % 60;

    const [alarmH, alarmM] = (closestAlarm as AlarmItem).time.split(':').map(Number);
    const period = alarmH >= 12 ? 'م' : 'ص';
    const displayH = alarmH % 12 || 12;
    const displayTime = `${displayH}:${String(alarmM).padStart(2, '0')}`;

    const smartStart = new Date();
    smartStart.setHours(
      alarmH,
      alarmM - (closestAlarm as AlarmItem).smartWindowMinutes,
      0,
      0
    );
    const smartStartStr = `${String(smartStart.getHours()).padStart(2, '0')}:${String(
      smartStart.getMinutes()
    ).padStart(2, '0')}`;

    return {
      alarm: closestAlarm as AlarmItem,
      displayTime,
      period,
      hoursLeft,
      minsLeft,
      smartStartStr,
    };
  }, [alarms, now]);

  const currentClockStr = useMemo(() => {
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const period = h >= 12 ? 'م' : 'ص';
    const dh = h % 12 || 12;
    return `${dh}:${m}:${s} ${period}`;
  }, [now]);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1B365D] via-[#152A4A] to-[#0E1E38] text-white p-6 sm:p-7 shadow-lg shadow-[#1B365D]/15">
      {/* Subtle Horizon Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-sky-400/15 blur-3xl"
      />

      {/* Mosque & Dawn Silhouette Vector on the Left Side (Exact Match to Reference Screen 2) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-4 sm:left-8 opacity-25 text-sky-200"
      >
        <svg
          width="150"
          height="115"
          viewBox="0 0 150 115"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Minaret */}
          <rect x="20" y="22" width="12" height="93" rx="2" />
          <path d="M18 22 L26 6 L34 22 Z" />
          <circle cx="26" cy="4" r="2" />
          <rect x="17" y="42" width="18" height="4" rx="1" />
          {/* Main Dome */}
          <path d="M44 75 C44 42, 96 42, 96 75 Z" />
          <path d="M69 34 L71 34 L70 25 Z" />
          {/* Base Building & Arches */}
          <rect x="36" y="75" width="76" height="40" rx="2" />
          <path
            d="M52 115 L52 92 C52 85, 62 85, 62 92 L62 115 Z"
            fill="#0E1E38"
          />
          <path
            d="M68 115 L68 88 C68 80, 80 80, 80 88 L80 115 Z"
            fill="#0E1E38"
          />
          <path
            d="M86 115 L86 92 C86 85, 96 85, 96 92 L96 115 Z"
            fill="#0E1E38"
          />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Right Side (RTL): Next Alarm Focus matching Reference Screen 2 */}
        <div className="space-y-2 text-right">
          <div className="flex items-center gap-2 text-xs text-sky-200/90 font-medium">
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span>{nextAlarmInfo ? nextAlarmInfo.alarm.label : 'الوقت الحالي'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-sky-300/80">
              الآن {currentClockStr}
            </span>
          </div>

          {nextAlarmInfo ? (
            <>
              <div className="flex items-baseline gap-2.5 pt-0.5">
                <span
                  dir="ltr"
                  className="font-mono tabular-nums text-4xl sm:text-5xl font-bold tracking-tight text-white"
                >
                  {nextAlarmInfo.displayTime}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-amber-300">
                  {nextAlarmInfo.period}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-sky-100/90 font-medium">
                متبقي{' '}
                {nextAlarmInfo.hoursLeft > 0
                  ? `${nextAlarmInfo.hoursLeft} ساعات و `
                  : ''}
                {nextAlarmInfo.minsLeft} دقيقة
              </p>

              {nextAlarmInfo.alarm.smartWindowMinutes > 0 && (
                <p className="text-[11px] text-sky-200/80 flex items-center gap-1.5 pt-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>
                    نافذة الاستيقاظ الذكي تبدأ{' '}
                    <span className="font-mono tabular-nums text-amber-200 font-semibold">
                      {nextAlarmInfo.smartStartStr}
                    </span>{' '}
                    ({nextAlarmInfo.alarm.smartWindowMinutes} د قبل الموعد)
                  </span>
                </p>
              )}
            </>
          ) : (
            <div className="py-2 space-y-1">
              <div className="text-2xl font-bold text-white">
                لا يوجد منبه نشط حالياً
              </div>
              <p className="text-xs text-sky-200/80">
                اضغط على زر "منبه جديد" لضبط موعد استيقاظك القادم.
              </p>
            </div>
          )}
        </div>

        {/* Left Action Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap md:flex-col gap-2.5 shrink-0">
          <button
            onClick={onOpenNewAlarm}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0F2342] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>ضبط منبه جديد</span>
          </button>

          <button
            onClick={() =>
              onTriggerDemoAlarm(
                nextAlarmInfo?.alarm ||
                  alarms[0] || {
                    id: 'demo',
                    time: '04:32',
                    label: 'الفجر',
                    days: [0, 1, 2, 3, 4, 5, 6],
                    enabled: true,
                    smartWindowMinutes: 20,
                    gradualFadeSeconds: 30,
                    sound: 'fajr_adhan_tone',
                    challenge: 'math',
                  }
              )
            }
            className="min-h-[42px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap backdrop-blur-xs"
          >
            <Play className="w-3.5 h-3.5 text-amber-300" />
            <span>تجربة رنين المنبه</span>
          </button>
        </div>
      </div>
    </section>
  );
};
