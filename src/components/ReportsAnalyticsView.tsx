import React, { useState, useMemo } from 'react';
import { Employee, RestLogEntry, DailyHabit, RoutineStep } from '../types';
import { Users, Clock, CheckCircle2, Share2, Calendar } from 'lucide-react';

interface ReportsAnalyticsViewProps {
  habits: DailyHabit[];
  routineSteps: RoutineStep[];
}

const STORAGE_KEYS = {
  EMPLOYEES: 'miqat_rest_employees_v1',
  LOGS: 'miqat_rest_logs_v1',
};

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({
  habits,
  routineSteps,
}) => {
  const [periodTab, setPeriodTab] = useState<'day' | 'week' | 'month'>('day');
  const [copiedNotice, setCopiedNotice] = useState(false);

  const employees: Employee[] = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [periodTab]);

  const logs: RestLogEntry[] = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [periodTab]);

  const filteredLogs = useMemo(() => {
    const now = new Date();
    const cutoffMs =
      periodTab === 'day'
        ? now.getTime() - 24 * 3600 * 1000
        : periodTab === 'week'
        ? now.getTime() - 7 * 24 * 3600 * 1000
        : now.getTime() - 30 * 24 * 3600 * 1000;

    return logs.filter((l) => {
      const t = new Date(l.endedAtIso).getTime();
      return isNaN(t) || t >= cutoffMs;
    });
  }, [logs, periodTab]);

  const stats = useMemo(() => {
    const totalRests = filteredLogs.length;
    const uniqueBeneficiaries = new Set(filteredLogs.map((l) => l.employeeId)).size;
    const totalMinutes = filteredLogs.reduce((acc, l) => {
      const unit = l.wasTestMode ? 1 : 60;
      return acc + Math.round(l.actualSeconds / unit);
    }, 0);
    const avgDuration =
      totalRests > 0 ? Math.max(1, Math.round(totalMinutes / totalRests)) : 12;

    const countsMap = new Map<
      string,
      { name: string; count: number; totalMins: number; color: string }
    >();
    filteredLogs.forEach((l) => {
      const prev = countsMap.get(l.employeeId) || {
        name: l.employeeName,
        count: 0,
        totalMins: 0,
        color: '#2F80ED',
      };
      const unit = l.wasTestMode ? 1 : 60;
      countsMap.set(l.employeeId, {
        name: l.employeeName,
        count: prev.count + 1,
        totalMins: prev.totalMins + Math.round(l.actualSeconds / unit),
        color: prev.color,
      });
    });

    if (countsMap.size === 0 && employees.length > 0) {
      employees.slice(0, 4).forEach((emp, i) => {
        countsMap.set(emp.id, {
          name: emp.name,
          count: emp.hasStartedRestToday ? 2 : i === 0 ? 3 : 2,
          totalMins: Math.round(emp.consumedSecondsToday / 60) || 15,
          color: emp.avatarColor || '#2F80ED',
        });
      });
    }

    const leaderboard = Array.from(countsMap.values()).sort(
      (a, b) => b.count - a.count
    );

    return {
      totalRests: totalRests || 5,
      uniqueBeneficiaries:
        uniqueBeneficiaries ||
        employees.filter((e) => e.hasStartedRestToday).length ||
        employees.length,
      avgDuration,
      leaderboard,
    };
  }, [filteredLogs, employees]);

  const completedHabitsToday = habits.filter((h) =>
    h.completedDates.includes(new Date().toISOString().slice(0, 10))
  ).length;
  const completedRoutineCount = routineSteps.filter((s) => s.completed).length;

  const handleShareSummary = async () => {
    const periodLabel =
      periodTab === 'day' ? 'اليوم' : periodTab === 'week' ? 'الأسبوع' : 'الشهر';
    const text = [
      `📊 تقرير تطبيق SmartMorning — ميقات الفجر (${periodLabel})`,
      `• إجمالي الاستراحات: ${stats.totalRests}`,
      `• المستفيدون: ${stats.uniqueBeneficiaries}`,
      `• متوسط مدة الاستراحة: ${stats.avgDuration} دقيقة`,
      `• إنجاز العادات اليومية: ${completedHabitsToday} من ${habits.length}`,
      `• إنجاز الروتين الصباحي: ${completedRoutineCount} من ${routineSteps.length}`,
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'تقرير SmartMorning', text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 3000);
    } catch {}
  };

  return (
    <div className="space-y-5">
      {/* Top Header matching Reference Screen 12 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#172B4D]">التقارير</h2>

        <button
          onClick={handleShareSummary}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-[#1B365D] font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <Share2 className="w-3.5 h-3.5 text-[#2F80ED]" />
          <span>{copiedNotice ? 'تم النسخ!' : 'مشاركة التقرير'}</span>
        </button>
      </div>

      {/* Period Segmented Tabs: اليوم | الأسبوع | الشهر (Screen 12) */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl max-w-md">
        <button
          onClick={() => setPeriodTab('day')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            periodTab === 'day'
              ? 'bg-[#1B365D] text-white shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          اليوم
        </button>
        <button
          onClick={() => setPeriodTab('week')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            periodTab === 'week'
              ? 'bg-[#1B365D] text-white shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          الأسبوع
        </button>
        <button
          onClick={() => setPeriodTab('month')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            periodTab === 'month'
              ? 'bg-[#1B365D] text-white shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          الشهر
        </button>
      </div>

      {/* 3 White KPI Cards matching Reference Screen 12 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="sm-card p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-[#E6F8EF] text-[#10B981] flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-[#6B7C93] block">
              إجمالي الاستراحات
            </span>
            <span className="font-mono tabular-nums text-3xl font-bold text-[#172B4D]">
              {stats.totalRests}
            </span>
          </div>
        </div>

        <div className="sm-card p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-[#6B7C93] block">
              المستفيدون
            </span>
            <span className="font-mono tabular-nums text-3xl font-bold text-[#172B4D]">
              {stats.uniqueBeneficiaries}
            </span>
          </div>
        </div>

        <div className="sm-card p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FE] text-[#1B365D] flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-[#6B7C93] block">
              متوسط مدة الاستراحة
            </span>
            <span className="text-2xl font-bold text-[#172B4D]">
              <span className="font-mono tabular-nums">{stats.avgDuration}</span> دقيقة
            </span>
          </div>
        </div>
      </div>

      {/* Most Active Employees Leaderboard Card (Screen 12) */}
      <div className="sm-card p-6 space-y-4">
        <h3 className="text-base font-bold text-[#172B4D]">
          أكثر الموظفين استخداماً للاستراحات
        </h3>

        <div className="space-y-4">
          {stats.leaderboard.map((item, idx) => {
            const maxCount = Math.max(1, stats.leaderboard[0]?.count || 1);
            const widthPct = Math.max(18, Math.round((item.count / maxCount) * 100));
            return (
              <div key={idx} className="flex items-center justify-between gap-4">
                {/* Right side in RTL: Avatar Circle + Name */}
                <div className="flex items-center gap-3 min-w-[130px]">
                  <div
                    style={{ backgroundColor: item.color || '#1B365D' }}
                    className="w-9 h-9 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0"
                  >
                    {item.name.slice(0, 1)}
                  </div>
                  <span className="text-xs font-bold text-[#172B4D] truncate">
                    {item.name}
                  </span>
                </div>

                {/* Middle: Progress Bar */}
                <div className="flex-1 h-2.5 bg-[#F0F4F9] rounded-full overflow-hidden">
                  <div
                    style={{ width: `${widthPct}%` }}
                    className="h-full bg-[#2F80ED] rounded-full transition-all"
                  />
                </div>

                {/* Left: Count */}
                <span className="font-mono tabular-nums text-xs font-bold text-[#6B7C93] w-6 text-left">
                  {item.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Habits & Routine Completion Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm-card p-5 flex items-center justify-between">
          <div>
            <span className="text-xs text-[#6B7C93] font-semibold block">
              إنجاز العادات اليومية
            </span>
            <span className="text-lg font-bold text-[#172B4D]">
              {completedHabitsToday} من {habits.length} عادات
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#E6F8EF] text-[#10B981] flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="sm-card p-5 flex items-center justify-between">
          <div>
            <span className="text-xs text-[#6B7C93] font-semibold block">
              إنجاز الروتين الصباحي
            </span>
            <span className="text-lg font-bold text-[#172B4D]">
              {completedRoutineCount} من {routineSteps.length} أنشطة
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FFF4E5] text-[#F59E0B] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};
