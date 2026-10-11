import React, { useState, useEffect } from 'react';
import { RoutineStep, RoutinePreset } from '../types';
import { ROUTINE_PRESETS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Sun,
  BookOpen,
  Droplets,
  Dumbbell,
  Target,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface MorningRoutineBuilderProps {
  steps: RoutineStep[];
  activeWakeTime: string;
  onUpdateSteps: (steps: RoutineStep[]) => void;
  onSelectPreset: (preset: RoutinePreset) => void;
}

export const MorningRoutineBuilder: React.FC<MorningRoutineBuilderProps> = ({
  steps,
  activeWakeTime,
  onUpdateSteps,
  onSelectPreset,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDuration, setNewDuration] = useState(10);
  const [newCategory, setNewCategory] = useState<RoutineStep['category']>('health');
  const [showAddForm, setShowAddForm] = useState(false);

  // Interactive Live Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(
    (steps[0]?.durationMinutes || 5) * 60
  );

  const totalMinutes = steps.reduce((acc, s) => acc + s.durationMinutes, 0);
  const completedCount = steps.filter((s) => s.completed).length;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          soundEngine.playStepCompleteChime();
          const updated = steps.map((s, idx) =>
            idx === activeStepIndex ? { ...s, completed: true } : s
          );
          onUpdateSteps(updated);

          if (activeStepIndex + 1 < steps.length) {
            const nextIdx = activeStepIndex + 1;
            setActiveStepIndex(nextIdx);
            return steps[nextIdx].durationMinutes * 60;
          } else {
            setIsPlaying(false);
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, activeStepIndex, steps, onUpdateSteps]);

  const handleToggleComplete = (id: string) => {
    const updated = steps.map((s) =>
      s.id === id ? { ...s, completed: !s.completed } : s
    );
    onUpdateSteps(updated);
  };

  const handleAddStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newStep: RoutineStep = {
      id: `custom-${Date.now()}`,
      title: newTitle.trim(),
      durationMinutes: Math.max(1, Math.min(120, Number(newDuration) || 5)),
      category: newCategory,
      description: 'نشاط صباحي مخصص ضمن روتينك اليومي.',
      completed: false,
    };
    onUpdateSteps([...steps, newStep]);
    setNewTitle('');
    setShowAddForm(false);
  };

  const handleDeleteStep = (id: string) => {
    onUpdateSteps(steps.filter((s) => s.id !== id));
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const copy = [...steps];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    onUpdateSteps(copy);
  };

  const startStepTimer = (index: number) => {
    setActiveStepIndex(index);
    setSecondsLeft(steps[index].durationMinutes * 60);
    setIsPlaying(true);
  };

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Pastel icon box style matching Reference Screen 7
  const getStepVisuals = (step: RoutineStep, idx: number) => {
    const title = step.title;
    if (title.includes('صلاة') || title.includes('فجر') || idx === 0) {
      return {
        bg: 'bg-[#FFF4E5]',
        color: 'text-[#F59E0B]',
        icon: <Sun className="w-5 h-5" />,
      };
    }
    if (title.includes('قرآن') || title.includes('قراءة') || step.category === 'mindfulness') {
      return {
        bg: 'bg-[#E6F8EF]',
        color: 'text-[#10B981]',
        icon: <BookOpen className="w-5 h-5" />,
      };
    }
    if (title.includes('ماء') || title.includes('ترطيب')) {
      return {
        bg: 'bg-[#EBF3FE]',
        color: 'text-[#2F80ED]',
        icon: <Droplets className="w-5 h-5" />,
      };
    }
    if (title.includes('تمارين') || title.includes('إطالة') || step.category === 'health') {
      return {
        bg: 'bg-[#FFF0E6]',
        color: 'text-[#F97316]',
        icon: <Dumbbell className="w-5 h-5" />,
      };
    }
    return {
      bg: 'bg-[#EBF3FE]',
      color: 'text-[#1B365D]',
      icon: <Target className="w-5 h-5" />,
    };
  };

  return (
    <div className="space-y-5">
      {/* Top Header matching Reference Screen 7 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172B4D]">الروتين الصباحي</h2>
          <p className="text-xs text-[#6B7C93] mt-0.5">
            ابدأ يومك بخطوات بسيطة · الإجمالي {totalMinutes} دقيقة (أُنجز {completedCount} من {steps.length})
          </p>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-[#FFF8E6] border border-[#FDE68A] flex items-center justify-center text-[#F59E0B] shadow-xs">
          <Sun className="w-7 h-7 fill-amber-400" />
        </div>
      </div>

      {/* Interactive Timer Player Card */}
      {steps.length > 0 && (
        <div className="sm-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-r-4 border-r-[#2F80ED]">
          <div className="space-y-1">
            <span className="text-xs font-bold text-[#2F80ED]">
              المؤقت التفاعلي للنشاط الحالي ({activeStepIndex + 1}/{steps.length})
            </span>
            <h3 className="text-base font-bold text-[#172B4D]">
              {steps[activeStepIndex]?.title || steps[0].title}
            </h3>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <div className="font-mono tabular-nums text-2xl font-bold text-[#1B365D] bg-[#F0F4F9] px-3.5 py-1.5 rounded-xl border border-[#E6EDF5]">
              {formatTimer(secondsLeft)}
            </div>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>إيقاف مؤقت</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>بدء النشاط</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setSecondsLeft(
                  (steps[activeStepIndex]?.durationMinutes || 5) * 60
                );
              }}
              className="min-h-[42px] min-w-[42px] rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#6B7C93] flex items-center justify-center cursor-pointer"
              title="إعادة ضبط المؤقت"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Individual White Cards List matching Reference Screen 7 */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const vis = getStepVisuals(step, idx);
          return (
            <div
              key={step.id}
              onClick={() => handleToggleComplete(step.id)}
              className={`sm-card p-4 flex items-center justify-between gap-4 cursor-pointer transition-all hover:border-[#CBD5E1] ${
                step.completed ? 'opacity-75 bg-[#F8FAFC]' : ''
              }`}
            >
              {/* Right side in RTL: Colored Icon Box + Title + Duration */}
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${vis.bg} ${vis.color}`}
                >
                  {vis.icon}
                </div>

                <div>
                  <h4
                    className={`text-base font-bold ${
                      step.completed
                        ? 'line-through text-[#9AA5B1]'
                        : 'text-[#172B4D]'
                    }`}
                  >
                    {step.title}
                  </h4>
                  <span className="text-xs text-[#6B7C93] font-medium">
                    {step.durationMinutes} دقائق
                  </span>
                </div>
              </div>

              {/* Left side in RTL: Actions + Completion Circle */}
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => startStepTimer(idx)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#1B365D] text-[11px] font-bold cursor-pointer"
                >
                  مؤقت
                </button>

                <button
                  type="button"
                  onClick={() => handleMoveStep(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1.5 rounded-lg text-[#6B7C93] hover:bg-[#F0F4F9] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleMoveStep(idx, 'down')}
                  disabled={idx === steps.length - 1}
                  className="p-1.5 rounded-lg text-[#6B7C93] hover:bg-[#F0F4F9] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteStep(step.id)}
                  className="p-1.5 rounded-lg text-[#6B7C93] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Circular Check Indicator matching Reference Screen 7 */}
                <button
                  type="button"
                  onClick={() => handleToggleComplete(step.id)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer mr-1 ${
                    step.completed
                      ? 'bg-[#22C55E] border-[#22C55E] text-white'
                      : 'border-[#CBD5E1] bg-white hover:border-[#2F80ED]'
                  }`}
                >
                  {step.completed && <Check className="w-4 h-4 stroke-[3]" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Activity / Preset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة نشاط صباحي جديد</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {ROUTINE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onSelectPreset(preset);
                setActiveStepIndex(0);
                setSecondsLeft((preset.steps[0]?.durationMinutes || 5) * 60);
                setIsPlaying(false);
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-xs font-bold text-[#172B4D] cursor-pointer"
            >
              قالب: {preset.name} ({preset.totalMinutes} د)
            </button>
          ))}
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddStep}
          className="sm-card p-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
        >
          <div className="sm:col-span-6 space-y-1">
            <label className="block text-xs font-bold text-[#6B7C93]">
              اسم النشاط الصباحي
            </label>
            <input
              type="text"
              required
              placeholder="مثال: تحديد أهداف اليوم، قراءة القرآن..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full min-h-[44px] sm-input px-3.5 text-sm font-semibold"
            />
          </div>

          <div className="sm:col-span-3 space-y-1">
            <label className="block text-xs font-bold text-[#6B7C93]">
              المدة (دقائق)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={newDuration}
              onChange={(e) => setNewDuration(Number(e.target.value))}
              className="w-full min-h-[44px] sm-input px-3.5 font-mono font-bold text-sm"
            />
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              className="w-full min-h-[44px] sm-btn-navy text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>حفظ النشاط</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
