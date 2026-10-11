import React, { useState, useMemo } from 'react';
import { Check, Sparkles, Clock } from 'lucide-react';

interface SleepCycleCalculatorProps {
  onApplyRecommendedTime: (time24: string, smartWindow: number) => void;
}

export const SleepCycleCalculator: React.FC<SleepCycleCalculatorProps> = ({
  onApplyRecommendedTime,
}) => {
  const [targetWakeTime, setTargetWakeTime] = useState('06:00');
  const [selectedCycles, setSelectedCycles] = useState<number>(5); // Default 5 cycles = 7:30 hours
  const [appliedNotice, setAppliedNotice] = useState(false);

  const cycleOptions = useMemo(() => {
    const FALL_ASLEEP_MINS = 14;
    const [wakeH, wakeM] = targetWakeTime.split(':').map(Number);
    const wakeDate = new Date();
    wakeDate.setHours(wakeH || 6, wakeM || 0, 0, 0);

    return [
      { count: 5, durationLabel: '7:30', desc: '5 دورات نوم (المعدل المثالي الموصى به)' },
      { count: 6, durationLabel: '9:00', desc: '6 دورات نوم (نوم مشبع لطاقة قصوى)' },
      { count: 4, durationLabel: '6:00', desc: '4 دورات نوم (الحد الكافي للنشاط)' },
    ].map((c) => {
      const bedDate = new Date(
        wakeDate.getTime() - (FALL_ASLEEP_MINS + c.count * 90) * 60000
      );
      const bh = bedDate.getHours();
      const bm = String(bedDate.getMinutes()).padStart(2, '0');
      const period = bh >= 12 ? 'م' : 'ص';
      const displayH = bh % 12 || 12;
      const bedTime24 = `${String(bh).padStart(2, '0')}:${bm}`;
      const bedTimeFormatted = `${displayH}:${bm} ${period}`;

      return {
        ...c,
        bedTime24,
        bedTimeFormatted,
      };
    });
  }, [targetWakeTime]);

  const activeCycle =
    cycleOptions.find((c) => c.count === selectedCycles) || cycleOptions[0];

  const handleCalculateAndApply = () => {
    onApplyRecommendedTime(targetWakeTime, 20);
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 3000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header matching Reference Screen 9 */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-[#172B4D]">حاسبة النوم</h2>
        <p className="text-xs text-[#6B7C93]">احصل على أفضل وقت للاستيقاظ</p>
      </div>

      <div className="sm-card p-6 sm:p-8 space-y-6">
        {/* Large Circular Progress Ring Indicator (7:30 ساعات نوم مقترحة - Screen 9) */}
        <div className="flex justify-center py-2">
          <div className="relative w-52 h-52 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#DCE8F8"
                strokeWidth="7"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#sleepRingGrad)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="326"
                strokeDashoffset={selectedCycles === 6 ? '30' : selectedCycles === 5 ? '75' : '125'}
              />
              <defs>
                <linearGradient id="sleepRingGrad" x1="0" y1="0" x2="120" y2="120">
                  <stop offset="0%" stopColor="#2F80ED" />
                  <stop offset="100%" stopColor="#34D399" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span
                dir="ltr"
                className="font-mono tabular-nums text-4xl font-bold text-[#1B365D]"
              >
                {activeCycle.durationLabel}
              </span>
              <span className="text-xs font-semibold text-[#6B7C93] mt-1">
                ساعات نوم مقترحة
              </span>
            </div>
          </div>
        </div>

        {/* Fields matching Screen 9: وقت الاستيقاظ المطلوب & وقت النوم المقترح */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#172B4D]">
              وقت الاستيقاظ المطلوب
            </label>
            <input
              type="time"
              value={targetWakeTime}
              onChange={(e) => setTargetWakeTime(e.target.value)}
              className="w-full min-h-[48px] sm-input px-4 font-mono tabular-nums text-base font-bold text-[#172B4D]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#172B4D]">
              وقت النوم المقترح
            </label>
            <select
              value={selectedCycles}
              onChange={(e) => setSelectedCycles(Number(e.target.value))}
              className="w-full min-h-[48px] sm-input px-4 text-sm font-bold text-[#172B4D]"
            >
              {cycleOptions.map((c) => (
                <option key={c.count} value={c.count}>
                  {c.bedTimeFormatted} — ({c.desc})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Alternative Cycles Pills */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {cycleOptions.map((c) => {
            const active = c.count === selectedCycles;
            return (
              <button
                key={c.count}
                type="button"
                onClick={() => setSelectedCycles(c.count)}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                  active
                    ? 'bg-[#EBF3FE] border-[#2F80ED] text-[#1B365D]'
                    : 'bg-[#F8FAFC] border-[#E6EDF5] text-[#6B7C93] hover:border-[#CBD5E1]'
                }`}
              >
                <div className="font-mono font-bold text-sm text-[#172B4D]">
                  {c.bedTimeFormatted}
                </div>
                <div className="text-[11px] mt-0.5">{c.count} دورات</div>
              </button>
            );
          })}
        </div>

        {/* Full-Width Dark Navy Button "احسب" (Screen 9) */}
        <button
          type="button"
          onClick={handleCalculateAndApply}
          className="w-full min-h-[52px] rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-base flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
        >
          {appliedNotice ? (
            <>
              <Check className="w-5 h-5 text-emerald-400" />
              <span>تم ضبط منبه الاستيقاظ الذكي ({targetWakeTime})!</span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" />
              <span>احسب واضبط المنبه الذكي</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
