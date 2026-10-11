import React, { useState } from 'react';
import { SoundType } from '../types';
import { SOUND_OPTIONS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import { SmartMorningIcon } from './SmartMorningIcon';
import {
  Volume2,
  Bell,
  Globe,
  Sun,
  Database,
  HelpCircle,
  Info,
  Play,
  Download,
  Upload,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';

interface AppSettingsViewProps {
  themeMode: 'dark' | 'light';
  onToggleTheme: () => void;
  defaultRingtone: SoundType;
  onChangeDefaultRingtone: (sound: SoundType) => void;
  onResetAllData: () => void;
}

export const AppSettingsView: React.FC<AppSettingsViewProps> = ({
  themeMode,
  onToggleTheme,
  defaultRingtone,
  onChangeDefaultRingtone,
  onResetAllData,
}) => {
  const [subScreen, setSubScreen] = useState<
    'main' | 'sound' | 'ringtones' | 'storage' | 'help' | 'about'
  >('main');
  const [ringtoneTab, setRingtoneTab] = useState<'app_tones' | 'phone_tones'>('app_tones');
  const [searchTone, setSearchTone] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(85);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [confirmResetModal, setConfirmResetModal] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const phoneStandardTones: { id: SoundType; title: string; subtitle: string }[] = [
    { id: 'fajr_adhan_tone', title: 'Ringtone 1', subtitle: 'نغمة شروق الصباح الهادئة' },
    { id: 'makkah_tone', title: 'Ringtone 2', subtitle: 'ترددات روحانية صافية' },
    { id: 'dawn_chimes', title: 'Ringtone 3', subtitle: 'أجراس الصباح الكلاسيكية' },
    { id: 'nature_birds', title: 'Ringtone 4', subtitle: 'أصوات عصافير الصباح' },
    { id: 'calm_piano', title: 'Ringtone 5', subtitle: 'بيانو هادئ للاستيقاظ' },
    { id: 'zen_bowl', title: 'Ringtone 6', subtitle: 'رنين متوازن مريح' },
    { id: 'classic_pulse', title: 'Ringtone 7', subtitle: 'منبه رقمي واضح' },
  ];

  const handleExportAll = () => {
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('miqat_')) {
        try {
          payload[k] = JSON.parse(localStorage.getItem(k) || 'null');
        } catch {
          payload[k] = localStorage.getItem(k);
        }
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartmorning-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusNotice('تم تصدير النسخة الاحتياطية لجميع بيانات التطبيق بنجاح.');
  };

  const handleImportAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || '{}'));
        Object.keys(data).forEach((k) => {
          if (k.startsWith('miqat_')) {
            localStorage.setItem(k, JSON.stringify(data[k]));
          }
        });
        setStatusNotice('تمت استعادة البيانات بنجاح! جاري تحديث الواجهة...');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        setStatusNotice('ملف النسخة الاحتياطية غير صالح.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {statusNotice && (
        <div className="sm-card p-4 border-emerald-500/40 bg-emerald-50 text-emerald-900 text-xs font-bold flex items-center justify-between">
          <span>{statusNotice}</span>
          <button
            onClick={() => setStatusNotice(null)}
            className="text-emerald-700 underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* =====================================================
          MAIN SETTINGS LIST (Reference Screen 13)
         ===================================================== */}
      {subScreen === 'main' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-[#172B4D]">الإعدادات</h2>

          <div className="space-y-3">
            {/* Row 1: الصوت والاهتزاز */}
            <button
              type="button"
              onClick={() => setSubScreen('sound')}
              className="w-full sm-card p-4 flex items-center justify-between hover:border-[#2F80ED]/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center">
                  <Volume2 className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">
                  الصوت والاهتزاز
                </span>
              </div>
              <ChevronLeft className="w-4 h-4 text-[#6B7C93]" />
            </button>

            {/* Row 2: نغمات الرنين */}
            <button
              type="button"
              onClick={() => setSubScreen('ringtones')}
              className="w-full sm-card p-4 flex items-center justify-between hover:border-[#2F80ED]/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#FCE8F3] text-[#EC4899] flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">
                  نغمات الرنين
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6B7C93]">
                <span>
                  {SOUND_OPTIONS.find((s) => s.id === defaultRingtone)?.name}
                </span>
                <ChevronLeft className="w-4 h-4" />
              </div>
            </button>

            {/* Row 3: اللغة */}
            <div className="w-full sm-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">اللغة</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#6B7C93]">
                <span>العربية</span>
                <ChevronLeft className="w-4 h-4" />
              </div>
            </div>

            {/* Row 4: المظهر */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-full sm-card p-4 flex items-center justify-between hover:border-[#2F80ED]/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FE] text-[#1B365D] flex items-center justify-center">
                  <Sun className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">المظهر</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#6B7C93]">
                <span>{themeMode === 'light' ? 'فاتح' : 'داكن'}</span>
                <ChevronLeft className="w-4 h-4" />
              </div>
            </button>

            {/* Row 5: البيانات والتخزين */}
            <button
              type="button"
              onClick={() => setSubScreen('storage')}
              className="w-full sm-card p-4 flex items-center justify-between hover:border-[#2F80ED]/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FE] text-[#1B365D] flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">
                  البيانات والتخزين
                </span>
              </div>
              <ChevronLeft className="w-4 h-4 text-[#6B7C93]" />
            </button>

            {/* Row 6: مساعدة ودعم */}
            <button
              type="button"
              onClick={() => setSubScreen('help')}
              className="w-full sm-card p-4 flex items-center justify-between hover:border-[#2F80ED]/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">
                  مساعدة ودعم
                </span>
              </div>
              <ChevronLeft className="w-4 h-4 text-[#6B7C93]" />
            </button>

            {/* Row 7: حول التطبيق */}
            <button
              type="button"
              onClick={() => setSubScreen('about')}
              className="w-full sm-card p-4 flex items-center justify-between hover:border-[#2F80ED]/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center">
                  <Info className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#172B4D]">
                  حول التطبيق
                </span>
              </div>
              <ChevronLeft className="w-4 h-4 text-[#6B7C93]" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          SUB-SCREEN: RINGTONES (Screens 5 & 6)
         ===================================================== */}
      {subScreen === 'ringtones' && (
        <div className="sm-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setSubScreen('main');
              }}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">
              {ringtoneTab === 'app_tones' ? 'إختيار نغمة الرنين' : 'نغمات الهاتف'}
            </h3>
            <div className="w-12" />
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl">
            <button
              onClick={() => setRingtoneTab('app_tones')}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                ringtoneTab === 'app_tones'
                  ? 'bg-[#D8E8FC] text-[#1B365D] shadow-xs'
                  : 'text-[#6B7C93]'
              }`}
            >
              نغمات التطبيق
            </button>
            <button
              onClick={() => setRingtoneTab('phone_tones')}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                ringtoneTab === 'phone_tones'
                  ? 'bg-[#D8E8FC] text-[#1B365D] shadow-xs'
                  : 'text-[#6B7C93]'
              }`}
            >
              من الهاتف
            </button>
          </div>

          {ringtoneTab === 'phone_tones' && (
            <div className="relative">
              <input
                type="text"
                placeholder="البحث عن نغمة..."
                value={searchTone}
                onChange={(e) => setSearchTone(e.target.value)}
                className="w-full min-h-[44px] sm-input px-4 pl-10 text-xs"
              />
              <Search className="w-4 h-4 text-[#6B7C93] absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          )}

          <div className="space-y-2.5">
            {ringtoneTab === 'app_tones'
              ? SOUND_OPTIONS.map((tone) => {
                  const selected = defaultRingtone === tone.id;
                  return (
                    <div
                      key={tone.id}
                      onClick={() => {
                        onChangeDefaultRingtone(tone.id);
                        soundEngine.playPreview(tone.id);
                      }}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        selected
                          ? 'bg-[#E3EFFD] border-[#2F80ED]/50'
                          : 'bg-white border-[#E6EDF5] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selected
                              ? 'border-[#2F80ED] bg-[#2F80ED]'
                              : 'border-[#CBD5E1] bg-white'
                          }`}
                        >
                          {selected && (
                            <span className="w-2 h-2 rounded-full bg-white block" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[#172B4D]">
                            {tone.name}
                          </div>
                          <div className="text-[11px] text-[#6B7C93]">{tone.desc}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          soundEngine.playPreview(tone.id);
                        }}
                        className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  );
                })
              : phoneStandardTones
                  .filter(
                    (t) =>
                      t.title.toLowerCase().includes(searchTone.toLowerCase()) ||
                      t.subtitle.includes(searchTone)
                  )
                  .map((tone, idx) => {
                    const selected = defaultRingtone === tone.id;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          onChangeDefaultRingtone(tone.id);
                          soundEngine.playPreview(tone.id);
                        }}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          selected
                            ? 'bg-[#E3EFFD] border-[#2F80ED]/50'
                            : 'bg-white border-[#E6EDF5] hover:border-[#CBD5E1]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selected
                                ? 'border-[#2F80ED] bg-[#2F80ED]'
                                : 'border-[#CBD5E1] bg-white'
                            }`}
                          >
                            {selected && (
                              <span className="w-2 h-2 rounded-full bg-white block" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[#172B4D]" dir="ltr">
                              {tone.title}
                            </div>
                            <div className="text-[11px] text-[#6B7C93]">
                              {tone.subtitle}
                            </div>
                          </div>
                        </div>

                        <Play className="w-4 h-4 text-[#2F80ED] fill-current" />
                      </div>
                    );
                  })}
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.stop();
              setSubScreen('main');
            }}
            className="w-full min-h-[50px] sm-btn-navy text-sm flex items-center justify-center cursor-pointer"
          >
            {ringtoneTab === 'app_tones' ? 'تأكيد' : 'استخدام'}
          </button>
        </div>
      )}

      {/* =====================================================
          SUB-SCREEN: SOUND & VIBRATION
         ===================================================== */}
      {subScreen === 'sound' && (
        <div className="sm-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => setSubScreen('main')}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">الصوت والاهتزاز</h3>
            <div className="w-12" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#172B4D]">مستوى صوت المنبه</span>
              <span className="font-mono font-bold text-sm text-[#2F80ED]">
                {volumeLevel}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={volumeLevel}
              onChange={(e) => setVolumeLevel(Number(e.target.value))}
              className="w-full accent-[#1B365D] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#E6EDF5]">
            <span className="text-sm font-bold text-[#172B4D]">
              تفعيل الاهتزاز عند الرنين
            </span>
            <button
              type="button"
              onClick={() => setVibrationEnabled(!vibrationEnabled)}
              className={`w-14 h-8 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
                vibrationEnabled
                  ? 'bg-[#22C55E] justify-end'
                  : 'bg-[#CBD5E1] justify-start'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-white shadow-xs block" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          SUB-SCREEN: DATA & STORAGE
         ===================================================== */}
      {subScreen === 'storage' && (
        <div className="sm-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => setSubScreen('main')}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">البيانات والتخزين</h3>
            <div className="w-12" />
          </div>

          <p className="text-xs text-[#6B7C93] leading-relaxed">
            يتم حفظ جميع المنبهات والروتين الصباحي والعادات واستراحات الموظفين محلياً على جهازك دون الحاجة لأي اتصال بالإنترنت.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleExportAll}
              className="w-full min-h-[48px] rounded-2xl bg-[#EBF3FE] hover:bg-[#DCE8F8] text-[#1B365D] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#2F80ED]" />
              <span>تصدير نسخة احتياطية كاملة (JSON)</span>
            </button>

            <label className="w-full min-h-[48px] rounded-2xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#172B4D] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4 text-[#10B981]" />
              <span>استعادة نسخة احتياطية من ملف</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportAll}
                className="hidden"
              />
            </label>

            <button
              onClick={() => setConfirmResetModal(true)}
              className="w-full min-h-[48px] rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة ضبط المصنع واستعادة البيانات الافتراضية</span>
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          SUB-SCREEN: HELP & SUPPORT
         ===================================================== */}
      {subScreen === 'help' && (
        <div className="sm-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => setSubScreen('main')}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">مساعدة ودعم</h3>
            <div className="w-12" />
          </div>

          <div className="space-y-3 text-xs text-[#172B4D] leading-relaxed">
            <p className="font-bold text-[#1B365D]">
              كيف تضمن عمل المنبهات واستراحات الموظفين بأفضل دقة على أندرويد؟
            </p>
            <ul className="list-disc pr-5 space-y-1.5 text-[#6B7C93]">
              <li>اسمح للتطبيق بصلاحية الإشعارات والمنبهات الدقيقة عند تثبيت الـ APK.</li>
              <li>فعّل خيار إبقاء الشاشة مضاءة (Wake Lock) أثناء متابعة مؤقتات الاستراحات.</li>
              <li>تجنب إغلاق التطبيق قسرياً (Force Stop) من إعدادات النظام.</li>
            </ul>
          </div>
        </div>
      )}

      {/* =====================================================
          SUB-SCREEN: ABOUT SMARTMORNING
         ===================================================== */}
      {subScreen === 'about' && (
        <div className="sm-card p-6 text-center space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => setSubScreen('main')}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">حول التطبيق</h3>
            <div className="w-12" />
          </div>

          <div className="py-4 flex flex-col items-center space-y-2">
            <SmartMorningIcon size={72} />
            <h4 className="text-xl font-bold text-[#1B365D]">SmartMorning</h4>
            <p className="text-sm font-bold text-[#2F80ED]">ميقات الفجر</p>
            <p className="text-xs text-[#6B7C93] max-w-sm">
              طريقك إلى بداية يوم أفضل · تنظيم الوقت · رفع الإنتاجية · حياة متوازنة
            </p>
          </div>
        </div>
      )}

      {/* Confirm Factory Reset Modal */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[#172B4D]">
              تأكيد إعادة ضبط البيانات
            </h3>
            <p className="text-xs text-[#6B7C93] leading-relaxed">
              هل أنت متأكد من مسح جميع البيانات المخصصة واستعادة الإعدادات الافتراضية للتطبيق؟
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmResetModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  setConfirmResetModal(false);
                  onResetAllData();
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                تأكيد المسح
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
