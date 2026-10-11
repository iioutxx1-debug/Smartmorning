import React, { useState } from 'react';
import { DailyHabit } from '../types';
import {
  Plus,
  Check,
  Trash2,
  BookOpen,
  Droplets,
  Dumbbell,
  Sun,
  Sparkles,
  Target,
  Flame,
} from 'lucide-react';

interface DailyHabitsTrackerProps {
  habits: DailyHabit[];
  onUpdateHabits: (habits: DailyHabit[]) => void;
}

export const DailyHabitsTracker: React.FC<DailyHabitsTrackerProps> = ({
  habits,
  onUpdateHabits,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'completed'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFreq, setNewFreq] = useState('يومياً');
  const [newIcon, setNewIcon] = useState<DailyHabit['iconType']>('prayer');
  const [newColor, setNewColor] = useState('#F59E0B');

  const todayKey = new Date().toISOString().slice(0, 10);

  const isCompletedToday = (habit: DailyHabit) =>
    habit.completedDates.includes(todayKey);

  const handleToggleHabitToday = (habitId: string) => {
    const updated = habits.map((h) => {
      if (h.id !== habitId) return h;
      const done = h.completedDates.includes(todayKey);
      const nextDates = done
        ? h.completedDates.filter((d) => d !== todayKey)
        : [...h.completedDates, todayKey];
      return { ...h, completedDates: nextDates };
    });
    onUpdateHabits(updated);
  };

  const handleDeleteHabit = (habitId: string) => {
    onUpdateHabits(habits.filter((h) => h.id !== habitId));
  };

  const handleAddHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created: DailyHabit = {
      id: `hab-${Date.now()}`,
      title: newTitle.trim(),
      frequency: newFreq,
      iconType: newIcon,
      colorHex: newColor,
      completedDates: [],
    };
    onUpdateHabits([...habits, created]);
    setNewTitle('');
    setShowAddModal(false);
  };

  const filteredHabits = habits.filter((h) =>
    filterTab === 'completed' ? isCompletedToday(h) : true
  );

  const completedTodayCount = habits.filter(isCompletedToday).length;

  const renderHabitIcon = (iconType: DailyHabit['iconType']) => {
    switch (iconType) {
      case 'prayer':
        return <Sun className="w-5 h-5" />;
      case 'quran':
        return <BookOpen className="w-5 h-5" />;
      case 'water':
        return <Droplets className="w-5 h-5" />;
      case 'sport':
        return <Dumbbell className="w-5 h-5" />;
      case 'reading':
        return <Sparkles className="w-5 h-5" />;
      default:
        return <Target className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header matching Reference Screen 8 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172B4D]">العادات</h2>
          <p className="text-xs text-[#6B7C93] mt-0.5">
            أنجزت {completedTodayCount} من {habits.length} عادات اليوم
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-11 h-11 rounded-2xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-[#1B365D] flex items-center justify-center shadow-xs cursor-pointer transition-colors"
          title="إضافة عادة جديدة"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Segmented Pill Filter: جميع العادات | المكتملة (Reference Screen 8) */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl max-w-md">
        <button
          onClick={() => setFilterTab('all')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            filterTab === 'all'
              ? 'bg-[#D8E8FC] text-[#1B365D] shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          جميع العادات
        </button>
        <button
          onClick={() => setFilterTab('completed')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            filterTab === 'completed'
              ? 'bg-[#D8E8FC] text-[#1B365D] shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          المكتملة ({completedTodayCount})
        </button>
      </div>

      {/* Habits Cards List */}
      {filteredHabits.length === 0 ? (
        <div className="sm-card p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-[#6B7C93]">
            {filterTab === 'completed'
              ? 'لم تكمل أي عادة اليوم بعد. اضغط على الدائرة بجانب العادة لتسجيل إنجازها!'
              : 'لا توجد عادات مضافة حالياً.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHabits.map((habit) => {
            const done = isCompletedToday(habit);
            const totalDays = habit.completedDates.length;

            return (
              <div
                key={habit.id}
                onClick={() => handleToggleHabitToday(habit.id)}
                className={`sm-card p-4 flex items-center justify-between gap-4 cursor-pointer transition-all hover:border-[#CBD5E1] ${
                  done ? 'bg-[#F8FAFC]' : ''
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    style={{
                      backgroundColor: `${habit.colorHex}18`,
                      color: habit.colorHex,
                    }}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  >
                    {renderHabitIcon(habit.iconType)}
                  </div>

                  <div className="space-y-0.5">
                    <h3
                      className={`text-base font-bold ${
                        done ? 'line-through text-[#9AA5B1]' : 'text-[#172B4D]'
                      }`}
                    >
                      {habit.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-[#6B7C93]">
                      <span>{habit.frequency}</span>
                      {totalDays > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#F59E0B] font-semibold flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5" />
                            <span>{totalDays} يوم</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteHabit(habit.id);
                    }}
                    className="p-2 rounded-xl text-[#9AA5B1] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="حذف العادة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleHabitToday(habit.id);
                    }}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      done
                        ? 'bg-[#22C55E] border-[#22C55E] text-white'
                        : 'border-[#CBD5E1] bg-white hover:border-[#2F80ED]'
                    }`}
                  >
                    {done && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Habit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleAddHabit}
            className="w-full max-w-md rounded-3xl bg-[#F4F7FB] border border-[#E6EDF5] p-6 shadow-2xl space-y-4 text-[#172B4D]"
          >
            <h3 className="text-lg font-bold text-[#172B4D]">إضافة عادة يومية جديدة</h3>

            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-1.5">
              <label className="block text-xs font-bold text-[#6B7C93]">اسم العادة</label>
              <input
                type="text"
                required
                placeholder="مثال: الصلاة في وقتها، قراءة القرآن..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full min-h-[44px] sm-input px-3.5 text-sm font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-3.5 border border-[#E6EDF5] space-y-1">
                <label className="block text-xs font-bold text-[#6B7C93]">التكرار</label>
                <select
                  value={newFreq}
                  onChange={(e) => setNewFreq(e.target.value)}
                  className="w-full min-h-[40px] sm-input px-2.5 text-xs font-semibold"
                >
                  <option value="يومياً">يومياً</option>
                  <option value="5 مرات أسبوعياً">5 مرات أسبوعياً</option>
                  <option value="3 مرات أسبوعياً">3 مرات أسبوعياً</option>
                </select>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-[#E6EDF5] space-y-1">
                <label className="block text-xs font-bold text-[#6B7C93]">الأيقونة</label>
                <select
                  value={newIcon}
                  onChange={(e) =>
                    setNewIcon(e.target.value as DailyHabit['iconType'])
                  }
                  className="w-full min-h-[40px] sm-input px-2.5 text-xs font-semibold"
                >
                  <option value="prayer">صلاة وعبادة</option>
                  <option value="quran">قرآن وأذكار</option>
                  <option value="water">شرب الماء</option>
                  <option value="sport">رياضة وحركة</option>
                  <option value="reading">قراءة وتعلّم</option>
                  <option value="goals">أهداف وتخطيط</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-2">
              <label className="block text-xs font-bold text-[#6B7C93]">لون الأيقونة</label>
              <div className="flex items-center gap-3">
                {['#F59E0B', '#10B981', '#3B82F6', '#F97316', '#8B5CF6', '#EC4899'].map(
                  (hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setNewColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`w-8 h-8 rounded-full cursor-pointer transition-transform ${
                        newColor === hex
                          ? 'scale-110 ring-2 ring-[#1B365D] ring-offset-2'
                          : 'opacity-75'
                      }`}
                    />
                  )
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E6EDF5] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-6 py-2 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
