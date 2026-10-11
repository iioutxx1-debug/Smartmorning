import React, { useState } from 'react';
import { SmartSuggestion } from '../types';
import { Sparkles, Check, ArrowLeft, Compass, ShieldCheck } from 'lucide-react';

interface SmartAdvisorPanelProps {
  suggestions: SmartSuggestion[];
  onApplySuggestion: (suggestion: SmartSuggestion) => void;
  onGenerateCustomPlan: (goal: string, wakeTime: string, minutesAvailable: number) => void;
}

export const SmartAdvisorPanel: React.FC<SmartAdvisorPanelProps> = ({
  suggestions,
  onApplySuggestion,
  onGenerateCustomPlan,
}) => {
  const [selectedGoal, setSelectedGoal] = useState<'energy' | 'focus' | 'calm'>('energy');
  const [preferredWakeTime, setPreferredWakeTime] = useState('06:00');
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [planAppliedMessage, setPlanAppliedMessage] = useState(false);

  const handleBuildSmartPlan = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerateCustomPlan(selectedGoal, preferredWakeTime, availableMinutes);
    setPlanAppliedMessage(true);
    setTimeout(() => setPlanAppliedMessage(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="sm-card p-6 space-y-5">
        <div className="border-b border-[#E6EDF5] pb-4">
          <h2 className="text-xl font-bold text-[#172B4D] flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#2F80ED]" />
            <span>مُصمم الصباح الذكي والاقتراحات</span>
          </h2>
          <p className="text-xs text-[#6B7C93] mt-1">
            اختر هدفك الصباحي والوقت المتاح، وسيقوم التطبيق بضبط المنبه الذكي وبناء خطة روتينك تلقائياً.
          </p>
        </div>

        <form onSubmit={handleBuildSmartPlan} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label className="block text-xs font-bold text-[#6B7C93]">
              تركيزك الأساسي في الصباح
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedGoal('energy')}
                className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  selectedGoal === 'energy'
                    ? 'bg-[#EBF3FE] border-[#2F80ED] text-[#1B365D]'
                    : 'bg-[#F0F4F9] border-[#E6EDF5] text-[#6B7C93]'
                }`}
              >
                طاقة وحيوية
              </button>
              <button
                type="button"
                onClick={() => setSelectedGoal('focus')}
                className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  selectedGoal === 'focus'
                    ? 'bg-[#EBF3FE] border-[#2F80ED] text-[#1B365D]'
                    : 'bg-[#F0F4F9] border-[#E6EDF5] text-[#6B7C93]'
                }`}
              >
                إنجاز وتركيز
              </button>
              <button
                type="button"
                onClick={() => setSelectedGoal('calm')}
                className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  selectedGoal === 'calm'
                    ? 'bg-[#EBF3FE] border-[#2F80ED] text-[#1B365D]'
                    : 'bg-[#F0F4F9] border-[#E6EDF5] text-[#6B7C93]'
                }`}
              >
                هدوء وصفاء
              </button>
            </div>
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <label className="block text-xs font-bold text-[#6B7C93]">
              وقت الاستيقاظ
            </label>
            <input
              type="time"
              value={preferredWakeTime}
              onChange={(e) => setPreferredWakeTime(e.target.value)}
              className="w-full min-h-[42px] sm-input px-3.5 font-mono font-bold text-sm"
            />
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-bold text-[#6B7C93]">
              مدة الروتين
            </label>
            <select
              value={availableMinutes}
              onChange={(e) => setAvailableMinutes(Number(e.target.value))}
              className="w-full min-h-[42px] sm-input px-3 text-xs font-bold"
            >
              <option value={15}>15 دقيقة</option>
              <option value={30}>30 دقيقة</option>
              <option value={45}>45 دقيقة</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full min-h-[42px] px-4 py-2 sm-btn-navy text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>توليد الخطة</span>
            </button>
          </div>
        </form>

        {planAppliedMessage && (
          <div className="p-3.5 rounded-xl bg-[#E6F8EF] border border-[#10B981]/30 text-[#065F46] text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>
              تم تحديث المنبه الذكي على الساعة {preferredWakeTime} وتخصيص خطوات الروتين الصباحي بنجاح!
            </span>
          </div>
        )}
      </div>

      {/* Curated Smart Suggestions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suggestions.map((sug) => (
          <div
            key={sug.id}
            className="sm-card p-6 flex flex-col justify-between hover:border-[#CBD5E1] transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-[#2F80ED]">{sug.category}</span>
                <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                <span className="text-[#10B981]">{sug.impactMetric}</span>
              </div>

              <h3 className="text-base font-bold text-[#172B4D]">{sug.title}</h3>
              <p className="text-xs text-[#6B7C93] leading-relaxed">{sug.description}</p>
            </div>

            <div className="pt-4 mt-4 border-t border-[#E6EDF5]">
              <button
                onClick={() => onApplySuggestion(sug)}
                className={`min-h-[42px] w-full px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  sug.applied
                    ? 'bg-[#E6F8EF] text-[#10B981]'
                    : 'bg-[#1B365D] hover:bg-[#0F2342] text-white'
                }`}
              >
                {sug.applied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تم تطبيق الاقتراح بنجاح</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{sug.actionLabel}</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="sm-card p-5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#2F80ED] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-[#172B4D]">
            كيف يعمل التنبيه الذكي لتنظيم روتين الصباح؟
          </h4>
          <p className="text-xs text-[#6B7C93] leading-relaxed">
            يجمع التطبيق بين نافذة الاستيقاظ المتدرج قبل الموعد بـ 20 دقيقة لكسر خمول النوم، وتحدي تنشيط الذهن لمنع العودة للنوم، والتشغيل التلقائي الفوري لمؤقت الروتين الصباحي.
          </p>
        </div>
      </div>
    </div>
  );
};
