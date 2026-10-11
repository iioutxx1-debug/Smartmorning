import React, { useState, useEffect } from 'react';
import { AlarmItem, SoundType, ChallengeType } from '../types';
import { DAY_NAMES, SOUND_OPTIONS, CHALLENGE_OPTIONS, ROUTINE_PRESETS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import {
  ChevronRight,
  Clock,
  Music,
  Bell,
  Play,
  Check,
  Search,
  Sparkles,
} from 'lucide-react';

interface AlarmEditorModalProps {
  isOpen: boolean;
  initialAlarm: AlarmItem | null;
  onClose: () => void;
  onSave: (alarm: AlarmItem) => void;
}

const PHONE_RINGTONES: { id: SoundType; title: string; subtitle: string }[] = [
  { id: 'fajr_adhan_tone', title: 'Ringtone 1', subtitle: 'إشراقة الفجر الهادئة' },
  { id: 'makkah_tone', title: 'Ringtone 2', subtitle: 'نسيم الصباح الروحي' },
  { id: 'nature_birds', title: 'Ringtone 3', subtitle: 'عصافير الطبيعة' },
  { id: 'dawn_chimes', title: 'Ringtone 4', subtitle: 'أجراس الصباح الناعمة' },
  { id: 'classic_pulse', title: 'Ringtone 5', subtitle: 'منبه رقمي كلاسيكي' },
  { id: 'zen_bowl', title: 'Ringtone 6', subtitle: 'رنين الصفاء المتدرج' },
  { id: 'calm_piano', title: 'Ringtone 7', subtitle: 'معزوفة بيانو هادئة' },
];

export const AlarmEditorModal: React.FC<AlarmEditorModalProps> = ({
  isOpen,
  initialAlarm,
  onClose,
  onSave,
}) => {
  const [time, setTime] = useState('04:32');
  const [label, setLabel] = useState('الفجر');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [enabled, setEnabled] = useState(true);
  const [smartWindowMinutes, setSmartWindowMinutes] = useState(20);
  const [gradualFadeSeconds, setGradualFadeSeconds] = useState(60);
  const [sound, setSound] = useState<SoundType>('fajr_adhan_tone');
  const [challenge, setChallenge] = useState<ChallengeType>('math');
  const [linkedRoutinePresetId, setLinkedRoutinePresetId] = useState('energized_45');
  const [autoLaunchRoutine, setAutoLaunchRoutine] = useState(true);

  // Sub-page state inside the modal: 'form' (Screen 4) or 'ringtone_picker' (Screens 5 & 6)
  const [subView, setSubView] = useState<'form' | 'ringtone_picker'>('form');
  const [ringtoneTab, setRingtoneTab] = useState<'app' | 'phone'>('app');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSubView('form');
    if (initialAlarm) {
      setTime(initialAlarm.time);
      setLabel(initialAlarm.label);
      setDays(initialAlarm.days);
      setEnabled(initialAlarm.enabled);
      setSmartWindowMinutes(initialAlarm.smartWindowMinutes);
      setGradualFadeSeconds(initialAlarm.gradualFadeSeconds);
      setSound(initialAlarm.sound);
      setChallenge(initialAlarm.challenge);
      setLinkedRoutinePresetId(initialAlarm.linkedRoutinePresetId);
      setAutoLaunchRoutine(initialAlarm.autoLaunchRoutine);
    } else {
      setTime('04:32');
      setLabel('الفجر');
      setDays([0, 1, 2, 3, 4, 5, 6]);
      setEnabled(true);
      setSmartWindowMinutes(20);
      setGradualFadeSeconds(60);
      setSound('fajr_adhan_tone');
      setChallenge('math');
      setLinkedRoutinePresetId('energized_45');
      setAutoLaunchRoutine(true);
    }
  }, [initialAlarm, isOpen]);

  if (!isOpen) return null;

  const toggleDay = (dayIdx: number) => {
    setDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const selectedSoundName =
    SOUND_OPTIONS.find((s) => s.id === sound)?.name || 'أذان الفجر';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.stop();
    onSave({
      id: initialAlarm ? initialAlarm.id : `alarm-${Date.now()}`,
      time,
      label: label.trim() || 'الفجر',
      days,
      enabled,
      smartWindowMinutes,
      gradualFadeSeconds,
      sound,
      challenge,
      linkedRoutinePresetId,
      autoLaunchRoutine,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#F4F7FB] border border-[#E6EDF5] p-5 sm:p-6 shadow-2xl my-auto text-[#172B4D]">
        {/* =====================================================
            SUB-VIEW 1: RINGTONE PICKER (Screens 5 & 6)
           ===================================================== */}
        {subView === 'ringtone_picker' ? (
          <div className="space-y-5">
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.stop();
                  setSubView('form');
                }}
                className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-200/60 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
                <span>رجوع</span>
              </button>
              <h3 className="text-lg font-bold text-[#172B4D]">
                {ringtoneTab === 'app' ? 'إختيار نغمة الرنين' : 'نغمات الهاتف'}
              </h3>
              <div className="w-12" />
            </div>

            {/* Segmented Pill Control: نغمات التطبيق | من الهاتف */}
            <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl">
              <button
                type="button"
                onClick={() => setRingtoneTab('app')}
                className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  ringtoneTab === 'app'
                    ? 'bg-[#D8E8FC] text-[#1B365D] shadow-xs'
                    : 'text-[#6B7C93] hover:text-[#172B4D]'
                }`}
              >
                نغمات التطبيق
              </button>
              <button
                type="button"
                onClick={() => setRingtoneTab('phone')}
                className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  ringtoneTab === 'phone'
                    ? 'bg-[#D8E8FC] text-[#1B365D] shadow-xs'
                    : 'text-[#6B7C93] hover:text-[#172B4D]'
                }`}
              >
                من الهاتف
              </button>
            </div>

            {/* Search Input on Phone Ringtones Tab (Screen 6) */}
            {ringtoneTab === 'phone' && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="البحث عن نغمة..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[44px] rounded-2xl bg-[#EBF1F8] border border-[#DCE5F0] px-4 pl-10 text-xs text-[#172B4D] placeholder:text-[#6B7C93] focus:outline-none focus:border-[#2F80ED]"
                />
                <Search className="w-4 h-4 text-[#6B7C93] absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            )}

            {/* Ringtones List */}
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-0.5">
              {ringtoneTab === 'app'
                ? SOUND_OPTIONS.map((opt) => {
                    const isSelected = sound === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          setSound(opt.id);
                          soundEngine.playPreview(opt.id);
                        }}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#E3EFFD] border-[#2F80ED]/50'
                            : 'bg-white border-[#E6EDF5] hover:border-[#CBD5E1]'
                        }`}
                      >
                        {/* Right side in RTL: Radio circle + Name */}
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected
                                ? 'border-[#2F80ED] bg-[#2F80ED]'
                                : 'border-[#CBD5E1] bg-white'
                            }`}
                          >
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-white block" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#172B4D]">{opt.name}</p>
                            <p className="text-[11px] text-[#6B7C93]">{opt.desc}</p>
                          </div>
                        </div>

                        {/* Left side: Play preview button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            soundEngine.playPreview(opt.id);
                          }}
                          className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] hover:bg-[#2F80ED] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    );
                  })
                : PHONE_RINGTONES.filter(
                    (r) =>
                      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      r.subtitle.includes(searchQuery)
                  ).map((item, idx) => {
                    const isSelected = sound === item.id;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSound(item.id);
                          soundEngine.playPreview(item.id);
                        }}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#E3EFFD] border-[#2F80ED]/50'
                            : 'bg-white border-[#E6EDF5] hover:border-[#CBD5E1]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected
                                ? 'border-[#2F80ED] bg-[#2F80ED]'
                                : 'border-[#CBD5E1] bg-white'
                            }`}
                          >
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-white block" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#172B4D]" dir="ltr">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-[#6B7C93]">{item.subtitle}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            soundEngine.playPreview(item.id);
                          }}
                          className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    );
                  })}
            </div>

            {/* Bottom Full-Width Navy Confirmation Button */}
            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setSubView('form');
              }}
              className="w-full min-h-[50px] rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-sm flex items-center justify-center shadow-md cursor-pointer transition-colors"
            >
              {ringtoneTab === 'app' ? 'تأكيد' : 'استخدام'}
            </button>
          </div>
        ) : (
          /* =====================================================
              SUB-VIEW 2: ALARM SETTINGS FORM (Screen 4)
             ===================================================== */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.stop();
                  onClose();
                }}
                className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-200/60 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
                <span>رجوع</span>
              </button>
              <h3 className="text-lg font-bold text-[#172B4D]">إعدادات المنبه</h3>
              <div className="w-12" />
            </div>

            {/* Alarm Name Field */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-1.5">
              <label className="block text-xs font-bold text-[#6B7C93]">
                اسم المنبه
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="الفجر"
                className="w-full min-h-[44px] rounded-xl bg-[#F0F4F9] border border-[#E6EDF5] px-3.5 text-sm font-bold text-[#172B4D] focus:outline-none focus:border-[#2F80ED]"
              />
            </div>

            {/* Alarm Time Field */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-1.5">
              <label className="block text-xs font-bold text-[#6B7C93]">الوقت</label>
              <div className="relative flex items-center">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="w-full min-h-[48px] font-mono tabular-nums text-xl font-bold rounded-xl bg-[#F0F4F9] border border-[#E6EDF5] px-4 text-[#172B4D] focus:outline-none focus:border-[#2F80ED]"
                />
                <Clock className="w-5 h-5 text-[#6B7C93] pointer-events-none absolute left-3.5" />
              </div>
            </div>

            {/* Days of Week Selector (Circles in Navy Blue matching Screen 4) */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-2.5">
              <label className="block text-xs font-bold text-[#6B7C93]">
                أيام التكرار
              </label>
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {DAY_NAMES.map((d) => {
                  const active = days.includes(d.index);
                  return (
                    <div key={d.index} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleDay(d.index)}
                        className={`w-10 h-10 rounded-full text-[11px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                          active
                            ? 'bg-[#1B365D] text-white shadow-xs'
                            : 'bg-[#F0F4F9] text-[#6B7C93] hover:bg-[#E2E8F0]'
                        }`}
                      >
                        {d.short}
                      </button>
                      <span className="text-[10px] text-[#6B7C93]">{d.full}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alarm Sound & Ringtone Selector Trigger (Opens Sub-view Screen 5) */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#6B7C93] mb-1.5">
                  صوت المنبه ونغمة الرنين
                </label>
                <button
                  type="button"
                  onClick={() => setSubView('ringtone_picker')}
                  className="w-full min-h-[46px] rounded-xl bg-[#F0F4F9] hover:bg-[#E6EEF8] border border-[#E6EDF5] px-3.5 flex items-center justify-between text-xs font-bold text-[#172B4D] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Music className="w-4 h-4 text-[#1B365D]" />
                    <span>{selectedSoundName}</span>
                  </div>
                  <span className="text-[#2F80ED] flex items-center gap-1">
                    <span>تغيير النغمة</span>
                    <Bell className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>

              {/* Smart Wake-up Window & Challenge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[#6B7C93] mb-1">
                    الاستيقاظ التدريجي (النافذة الذكية)
                  </label>
                  <select
                    value={smartWindowMinutes}
                    onChange={(e) => setSmartWindowMinutes(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl bg-[#F0F4F9] border border-[#E6EDF5] px-3 text-xs font-semibold text-[#172B4D]"
                  >
                    <option value={0}>رنين مباشر في الموعد</option>
                    <option value={10}>10 دقائق قبل الموعد</option>
                    <option value={20}>20 دقيقة (موصى به)</option>
                    <option value={30}>30 دقيقة تدرج هادئ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#6B7C93] mb-1">
                    تحدي الاستيقاظ
                  </label>
                  <select
                    value={challenge}
                    onChange={(e) => setChallenge(e.target.value as ChallengeType)}
                    className="w-full min-h-[40px] rounded-xl bg-[#F0F4F9] border border-[#E6EDF5] px-3 text-xs font-semibold text-[#172B4D]"
                  >
                    {CHALLENGE_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Enable Alarm Row with Green Pill Switch (Screen 4) */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] flex items-center justify-between">
              <span className="text-sm font-bold text-[#172B4D]">تفعيل المنبه</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={`w-14 h-8 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
                  enabled ? 'bg-[#22C55E] justify-end' : 'bg-[#CBD5E1] justify-start'
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-white shadow-xs block" />
              </button>
            </div>

            {/* Save Button (Wide Dark Navy Button matching Screen 4) */}
            <button
              type="submit"
              className="w-full min-h-[52px] rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-base flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
            >
              <span>حفظ</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
