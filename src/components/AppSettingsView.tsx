import React, { useState, useEffect } from 'react';
import {
  SoundType,
  SoundSourceType,
  DefaultToneConfig,
  ImportedSongItem,
  AlarmItem,
} from '../types';
import { SOUND_OPTIONS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import { nativeAlarmBridge } from '../utils/nativeAlarmBridge';
import {
  getImportedSongs,
  importSongFromDevice,
  deleteImportedSongFromLibrary,
  formatBytesArabic,
  formatSecondsMMSS,
} from '../utils/audioLibraryStore';
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
  Square,
  Download,
  Upload,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Music,
  Trash2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface AppSettingsViewProps {
  themeMode: 'dark' | 'light';
  onToggleTheme: () => void;
  defaultToneConfig: DefaultToneConfig;
  onChangeDefaultToneConfig: (config: DefaultToneConfig) => void;
  allAlarms?: AlarmItem[];
  onSongDeletedFromLibrary?: (deletedSongId: string, deletedSongName: string) => void;
  onResetAllData: () => void;
}

export const AppSettingsView: React.FC<AppSettingsViewProps> = ({
  themeMode,
  onToggleTheme,
  defaultToneConfig,
  onChangeDefaultToneConfig,
  allAlarms = [],
  onSongDeletedFromLibrary,
  onResetAllData,
}) => {
  const [subScreen, setSubScreen] = useState<
    'main' | 'sound' | 'ringtones' | 'storage' | 'help' | 'about'
  >('main');
  const [ringtoneTab, setRingtoneTab] = useState<SoundSourceType>(
    defaultToneConfig.soundSource || 'app_tone'
  );
  const [songs, setSongs] = useState<ImportedSongItem[]>(() => getImportedSongs());
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [deletingSong, setDeletingSong] = useState<ImportedSongItem | null>(null);

  const [volumeLevel, setVolumeLevel] = useState(85);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [confirmResetModal, setConfirmResetModal] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    setSongs(getImportedSongs());
  }, [subScreen]);

  const getDefaultToneTitle = (): string => {
    if (defaultToneConfig.soundSource === 'phone_ringtone' && defaultToneConfig.customSoundUri) {
      return defaultToneConfig.customSoundTitle || 'نغمة منبه الهاتف';
    }
    if (defaultToneConfig.soundSource === 'my_song') {
      const matched = songs.find(
        (s) =>
          s.id === defaultToneConfig.customSongId ||
          s.uri === defaultToneConfig.customSoundUri
      );
      return matched?.name || defaultToneConfig.customSoundTitle || 'أغنية مخصصة';
    }
    return (
      SOUND_OPTIONS.find((s) => s.id === defaultToneConfig.sound)?.name ||
      'نداء الفجر الهادئ'
    );
  };

  const handlePickAndroidRingtone = async () => {
    setPickerError(null);
    soundEngine.stop();
    setPreviewingKey(null);

    const res = await nativeAlarmBridge.pickSystemAlarmRingtone(
      defaultToneConfig.soundSource === 'phone_ringtone'
        ? defaultToneConfig.customSoundUri
        : undefined
    );

    if (res.cancelled) return;
    if (res.error || !res.uri) {
      setPickerError(res.error || 'تعذر فتح منتقي نغمات أندرويد.');
      return;
    }

    onChangeDefaultToneConfig({
      soundSource: 'phone_ringtone',
      sound: defaultToneConfig.sound,
      customSoundUri: res.uri,
      customSoundTitle: res.title || 'نغمة منبه الهاتف',
      customSongId: undefined,
    });
    setStatusNotice(`تم اختيار نغمة الهاتف الافتراضية: «${res.title || 'نغمة النظام'}»`);
  };

  const handleImportSongInSettings = async () => {
    setPickerError(null);
    soundEngine.stop();
    setPreviewingKey(null);

    const res = await importSongFromDevice();
    if (res.cancelled) return;
    if (res.error || !res.song) {
      setPickerError(res.error || 'تعذر استيراد الأغنية المختارة.');
      return;
    }

    setSongs(getImportedSongs());
    onChangeDefaultToneConfig({
      soundSource: 'my_song',
      sound: defaultToneConfig.sound,
      customSoundUri: res.song.uri,
      customSoundTitle: res.song.name,
      customSongId: res.song.id,
    });
    setStatusNotice(`تمت إضافة «${res.song.name}» إلى «أغنياتي» وتعيينها كنغمة افتراضية.`);
  };

  const handleTogglePreview = async (
    key: string,
    opts: {
      soundSource: SoundSourceType;
      sound: SoundType;
      customSoundUri?: string;
      customSongId?: string;
    }
  ) => {
    setPickerError(null);
    if (previewingKey === key) {
      soundEngine.stop();
      setPreviewingKey(null);
      return;
    }

    setPreviewingKey(key);
    const res = await soundEngine.playCustomSourcePreview(opts);
    if (!res.ok) {
      setPreviewingKey(null);
      setPickerError(res.error || 'تعذر تشغيل المعاينة الصوتية.');
    }
  };

  const handleConfirmDeleteSong = async () => {
    if (!deletingSong) return;
    const target = deletingSong;
    soundEngine.stop();
    setPreviewingKey(null);

    await deleteImportedSongFromLibrary(target.id);
    setSongs(getImportedSongs());
    setDeletingSong(null);

    if (
      defaultToneConfig.soundSource === 'my_song' &&
      (defaultToneConfig.customSongId === target.id ||
        defaultToneConfig.customSoundUri === target.uri)
    ) {
      onChangeDefaultToneConfig({
        soundSource: 'app_tone',
        sound: 'fajr_adhan_tone',
      });
    }

    if (onSongDeletedFromLibrary) {
      onSongDeletedFromLibrary(target.id, target.name);
    }
    setStatusNotice(`تم حذف «${target.name}» من مكتبة التطبيق بأمان.`);
  };

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

  const alarmsUsingDeletingSong = deletingSong
    ? allAlarms.filter(
        (a) =>
          a.soundSource === 'my_song' &&
          (a.customSongId === deletingSong.id || a.customSoundUri === deletingSong.uri)
      )
    : [];

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
          MAIN SETTINGS LIST
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

            {/* Row 2: نغمات الرنين وأغنياتي */}
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
                  نغمات الرنين وأغنياتي
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6B7C93]">
                <span className="truncate max-w-[160px]">{getDefaultToneTitle()}</span>
                <ChevronLeft className="w-4 h-4 shrink-0" />
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
          SUB-SCREEN: RINGTONES & MY SONGS (3 Independent Sources)
         ===================================================== */}
      {subScreen === 'ringtones' && (
        <div className="sm-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setPreviewingKey(null);
                setSubScreen('main');
              }}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">
              نغمات الرنين وأغنياتي
            </h3>
            <div className="w-12" />
          </div>

          {/* 3 Independent Tabs: نغمات التطبيق | نغمات الهاتف | أغنياتي */}
          <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl">
            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setPreviewingKey(null);
                setPickerError(null);
                setRingtoneTab('app_tone');
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                ringtoneTab === 'app_tone'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'text-[#6B7C93]'
              }`}
            >
              نغمات التطبيق
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setPreviewingKey(null);
                setPickerError(null);
                setRingtoneTab('phone_ringtone');
                if (nativeAlarmBridge.isNativeAndroid()) {
                  handlePickAndroidRingtone();
                }
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                ringtoneTab === 'phone_ringtone'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'text-[#6B7C93]'
              }`}
            >
              نغمات الهاتف
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setPreviewingKey(null);
                setPickerError(null);
                setRingtoneTab('my_song');
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                ringtoneTab === 'my_song'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'text-[#6B7C93]'
              }`}
            >
              أغنياتي ({songs.length})
            </button>
          </div>

          {pickerError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{pickerError}</span>
              </div>
              {ringtoneTab === 'phone_ringtone' && (
                <button
                  type="button"
                  onClick={handlePickAndroidRingtone}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>المحاولة مجدداً</span>
                </button>
              )}
            </div>
          )}

          {ringtoneTab === 'app_tone' && (
            <div className="space-y-2.5">
              {SOUND_OPTIONS.map((tone) => {
                const selected =
                  defaultToneConfig.soundSource === 'app_tone' &&
                  defaultToneConfig.sound === tone.id;
                const isPreviewing = previewingKey === `settings_app_${tone.id}`;
                return (
                  <div
                    key={tone.id}
                    onClick={() => {
                      onChangeDefaultToneConfig({
                        soundSource: 'app_tone',
                        sound: tone.id,
                      });
                      handleTogglePreview(`settings_app_${tone.id}`, {
                        soundSource: 'app_tone',
                        sound: tone.id,
                      });
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
                        handleTogglePreview(`settings_app_${tone.id}`, {
                          soundSource: 'app_tone',
                          sound: tone.id,
                        });
                      }}
                      className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center cursor-pointer"
                    >
                      {isPreviewing ? (
                        <Square className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {ringtoneTab === 'phone_ringtone' && (
            <div className="p-5 rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center shrink-0">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[#172B4D]">
                    منتقي نغمات منبه أندرويد الحقيقي
                  </h4>
                  <p className="text-xs text-[#6B7C93] leading-relaxed">
                    يفتح منتقي نغمات النظام (<span className="font-mono">RingtoneManager</span>) لاختيار نغمة منبه افتراضية من هاتفك.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePickAndroidRingtone}
                className="w-full min-h-[48px] sm-btn-navy text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bell className="w-4 h-4 text-amber-300" />
                <span>فتح منتقي نغمات الهاتف (Android)</span>
              </button>

              {defaultToneConfig.soundSource === 'phone_ringtone' &&
                defaultToneConfig.customSoundUri && (
                  <div className="p-3.5 rounded-2xl bg-white border border-[#2F80ED]/40 flex items-center justify-between gap-3">
                    <div className="truncate">
                      <span className="text-[11px] font-bold text-[#2F80ED] block">
                        نغمة الهاتف الافتراضية الحالية:
                      </span>
                      <span className="text-sm font-extrabold text-[#172B4D] truncate block">
                        {defaultToneConfig.customSoundTitle || 'نغمة النظام'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleTogglePreview('settings_phone', {
                          soundSource: 'phone_ringtone',
                          sound: defaultToneConfig.sound,
                          customSoundUri: defaultToneConfig.customSoundUri,
                        })
                      }
                      className="min-h-[36px] px-3 rounded-xl bg-[#1B365D] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {previewingKey === 'settings_phone' ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>إيقاف</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>معاينة</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
            </div>
          )}

          {ringtoneTab === 'my_song' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleImportSongInSettings}
                className="w-full min-h-[48px] rounded-2xl bg-[#2F80ED] hover:bg-[#1B365D] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>إضافة أغنية من الهاتف</span>
              </button>

              {songs.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] text-center space-y-2">
                  <Music className="w-8 h-8 text-[#9AA5B1] mx-auto" />
                  <p className="text-xs font-bold text-[#172B4D]">
                    لا توجد أغاني مستوردة في «أغنياتي» بعد
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {songs.map((songItem) => {
                    const selected =
                      defaultToneConfig.soundSource === 'my_song' &&
                      (defaultToneConfig.customSongId === songItem.id ||
                        defaultToneConfig.customSoundUri === songItem.uri);
                    const isPreviewing = previewingKey === `settings_song_${songItem.id}`;

                    return (
                      <div
                        key={songItem.id}
                        onClick={() =>
                          onChangeDefaultToneConfig({
                            soundSource: 'my_song',
                            sound: defaultToneConfig.sound,
                            customSoundUri: songItem.uri,
                            customSoundTitle: songItem.name,
                            customSongId: songItem.id,
                          })
                        }
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          selected
                            ? 'bg-[#E3EFFD] border-[#2F80ED]/60'
                            : 'bg-white border-[#E6EDF5] hover:border-[#CBD5E1]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              selected
                                ? 'border-[#2F80ED] bg-[#2F80ED]'
                                : 'border-[#CBD5E1] bg-white'
                            }`}
                          >
                            {selected && (
                              <span className="w-2 h-2 rounded-full bg-white block" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#172B4D] truncate">
                              {songItem.name}
                            </p>
                            <p className="text-[11px] text-[#6B7C93]">
                              {formatSecondsMMSS(songItem.durationSeconds)} ·{' '}
                              {formatBytesArabic(songItem.sizeBytes)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePreview(`settings_song_${songItem.id}`, {
                                soundSource: 'my_song',
                                sound: defaultToneConfig.sound,
                                customSongId: songItem.id,
                                customSoundUri: songItem.uri,
                              });
                            }}
                            className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] flex items-center justify-center cursor-pointer"
                          >
                            {isPreviewing ? (
                              <Square className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingSong(songItem);
                            }}
                            className="w-9 h-9 rounded-xl bg-[#F0F4F9] text-[#6B7C93] hover:text-rose-600 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {deletingSong && (
            <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-3">
              <p className="text-xs font-extrabold text-rose-900">
                تأكيد حذف «{deletingSong.name}» من مكتبة التطبيق؟
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                • لن يُحذف الملف الأصلي من ذاكرة الهاتف.
                {alarmsUsingDeletingSong.length > 0 && (
                  <span className="block mt-1 font-bold">
                    • سيتم تحديث ({alarmsUsingDeletingSong.length}) منبه مرتبط بهذه الأغنية إلى النغمة الاحتياطية الآمنة «نداء الفجر الهادئ».
                  </span>
                )}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingSong(null)}
                  className="min-h-[36px] px-3.5 rounded-xl bg-white text-[#172B4D] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSong}
                  className="min-h-[36px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.stop();
              setPreviewingKey(null);
              setSubScreen('main');
            }}
            className="w-full min-h-[50px] sm-btn-navy text-sm flex items-center justify-center cursor-pointer"
          >
            تأكيد وحفظ
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
            يتم حفظ جميع المنبهات والأغاني المستوردة واستراحات الموظفين وسجلات التقارير محلياً على جهازك دون الحاجة لأي اتصال بالإنترنت.
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
