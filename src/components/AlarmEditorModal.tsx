import React, { useState, useEffect } from 'react';
import {
  AlarmItem,
  SoundType,
  SoundSourceType,
  ChallengeType,
  ImportedSongItem,
  DefaultToneConfig,
} from '../types';
import { DAY_NAMES, SOUND_OPTIONS, CHALLENGE_OPTIONS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import { nativeAlarmBridge } from '../utils/nativeAlarmBridge';
import {
  getImportedSongs,
  importSongFromDevice,
  deleteImportedSongFromLibrary,
  verifyImportedSongAccessible,
  formatBytesArabic,
  formatSecondsMMSS,
} from '../utils/audioLibraryStore';
import {
  ChevronRight,
  Clock,
  Music,
  Bell,
  Play,
  Square,
  Smartphone,
  Upload,
  Trash2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface AlarmEditorModalProps {
  isOpen: boolean;
  initialAlarm: AlarmItem | null;
  defaultToneConfig?: DefaultToneConfig;
  allAlarms?: AlarmItem[];
  onClose: () => void;
  onSave: (alarm: AlarmItem) => void;
  onSongDeletedFromLibrary?: (deletedSongId: string, deletedSongName: string) => void;
}

export const AlarmEditorModal: React.FC<AlarmEditorModalProps> = ({
  isOpen,
  initialAlarm,
  defaultToneConfig,
  allAlarms = [],
  onClose,
  onSave,
  onSongDeletedFromLibrary,
}) => {
  const [time, setTime] = useState('04:32');
  const [label, setLabel] = useState('الفجر');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [enabled, setEnabled] = useState(true);
  const [smartWindowMinutes, setSmartWindowMinutes] = useState(20);
  const [gradualFadeSeconds, setGradualFadeSeconds] = useState(60);

  // Independent Tone Source & Metadata per Alarm
  const [soundSource, setSoundSource] = useState<SoundSourceType>('app_tone');
  const [sound, setSound] = useState<SoundType>('fajr_adhan_tone');
  const [customSoundUri, setCustomSoundUri] = useState<string>('');
  const [customSoundTitle, setCustomSoundTitle] = useState<string>('');
  const [customSongId, setCustomSongId] = useState<string>('');
  const [maxPlaybackDurationSeconds, setMaxPlaybackDurationSeconds] = useState<number>(0);

  const [challenge, setChallenge] = useState<ChallengeType>('math');

  // Sub-page state inside the modal: 'form' or 'ringtone_picker'
  const [subView, setSubView] = useState<'form' | 'ringtone_picker'>('form');
  const [ringtoneTab, setRingtoneTab] = useState<'app_tone' | 'phone_ringtone' | 'my_song'>('app_tone');

  // Imported Songs State («أغنياتي»)
  const [songs, setSongs] = useState<ImportedSongItem[]>([]);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [pickerFeedbackError, setPickerFeedbackError] = useState<string | null>(null);
  const [pickerFeedbackSuccess, setPickerFeedbackSuccess] = useState<string | null>(null);
  const [uriAccessibilityWarning, setUriAccessibilityWarning] = useState<string | null>(null);
  const [deletingSongCandidate, setDeletingSongCandidate] = useState<ImportedSongItem | null>(null);

  useEffect(() => {
    if (!isOpen) {
      soundEngine.stop();
      setPreviewingKey(null);
      return;
    }

    setSubView('form');
    setPickerFeedbackError(null);
    setPickerFeedbackSuccess(null);
    setUriAccessibilityWarning(null);
    setDeletingSongCandidate(null);
    const loadedSongs = getImportedSongs();
    setSongs(loadedSongs);

    if (initialAlarm) {
      setTime(initialAlarm.time);
      setLabel(initialAlarm.label);
      setDays(initialAlarm.days);
      setEnabled(initialAlarm.enabled);
      setSmartWindowMinutes(initialAlarm.smartWindowMinutes);
      setGradualFadeSeconds(initialAlarm.gradualFadeSeconds);
      const src: SoundSourceType = initialAlarm.soundSource || 'app_tone';
      setSoundSource(src);
      setRingtoneTab(src);
      setSound(initialAlarm.sound || 'fajr_adhan_tone');
      setCustomSoundUri(initialAlarm.customSoundUri || '');
      setCustomSoundTitle(initialAlarm.customSoundTitle || '');
      setCustomSongId(initialAlarm.customSongId || '');
      setMaxPlaybackDurationSeconds(initialAlarm.maxPlaybackDurationSeconds || 0);
      setChallenge(initialAlarm.challenge);

      // Verify saved custom tone accessibility on open
      if (src === 'phone_ringtone' && initialAlarm.customSoundUri) {
        if (nativeAlarmBridge.isNativeAndroid()) {
          nativeAlarmBridge.verifyToneUri(initialAlarm.customSoundUri).then((valid) => {
            if (!valid) {
              setUriAccessibilityWarning(
                'تعذر الوصول إلى نغمة الهاتف المحفوظة سابقاً. يرجى إعادة اختيار النغمة أو اختيار بديل.'
              );
            }
          });
        }
      } else if (src === 'my_song') {
        const matchedSong = loadedSongs.find(
          (s) => s.id === initialAlarm.customSongId || s.uri === initialAlarm.customSoundUri
        );
        if (!matchedSong) {
          setUriAccessibilityWarning(
            'الأغنية المحددة سابقاً لم تعد موجودة في مكتبة «أغنياتي». يرجى اختيار أغنية أو نغمة بديلة.'
          );
        } else {
          verifyImportedSongAccessible(matchedSong).then((valid) => {
            if (!valid) {
              setUriAccessibilityWarning(
                'تعذر فتح ملف الأغنية المحفوظة. يرجى استيرادها مجدداً أو اختيار نغمة بديلة.'
              );
            }
          });
        }
      }
    } else {
      setTime('04:32');
      setLabel('الفجر');
      setDays([0, 1, 2, 3, 4, 5, 6]);
      setEnabled(true);
      setSmartWindowMinutes(20);
      setGradualFadeSeconds(60);
      const defSrc: SoundSourceType = defaultToneConfig?.soundSource || 'app_tone';
      setSoundSource(defSrc);
      setRingtoneTab(defSrc);
      setSound(defaultToneConfig?.sound || 'fajr_adhan_tone');
      setCustomSoundUri(defaultToneConfig?.customSoundUri || '');
      setCustomSoundTitle(defaultToneConfig?.customSoundTitle || '');
      setCustomSongId(defaultToneConfig?.customSongId || '');
      setMaxPlaybackDurationSeconds(0);
      setChallenge('math');
    }
  }, [initialAlarm, isOpen, defaultToneConfig]);

  if (!isOpen) return null;

  const toggleDay = (dayIdx: number) => {
    setDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const getActiveSoundSummary = (): { badge: string; title: string } => {
    if (soundSource === 'phone_ringtone' && customSoundUri) {
      return {
        badge: 'نغمة هاتف',
        title: customSoundTitle || 'نغمة منبه الهاتف',
      };
    }
    if (soundSource === 'my_song') {
      const matched = songs.find((s) => s.id === customSongId || s.uri === customSoundUri);
      return {
        badge: 'أغنياتي',
        title: matched?.name || customSoundTitle || 'أغنية مخصصة',
      };
    }
    const appOpt = SOUND_OPTIONS.find((s) => s.id === sound);
    return {
      badge: 'نغمة التطبيق',
      title: appOpt?.name || 'نداء الفجر الهادئ',
    };
  };

  // =========================================================
  // HANDLER 1: LAUNCH REAL ANDROID RINGTONE PICKER
  // =========================================================
  const handleLaunchAndroidRingtonePicker = async () => {
    setPickerFeedbackError(null);
    setPickerFeedbackSuccess(null);
    soundEngine.stop();
    setPreviewingKey(null);

    const res = await nativeAlarmBridge.pickSystemAlarmRingtone(
      soundSource === 'phone_ringtone' ? customSoundUri : undefined
    );

    if (res.cancelled) {
      // User cancelled picker -> keep previous selection untouched!
      return;
    }

    if (res.error || !res.uri) {
      setPickerFeedbackError(
        res.error || 'تعذر فتح منتقي نغمات أندرويد. لم يتم تغيير نغمتك السابقة.'
      );
      return;
    }

    setSoundSource('phone_ringtone');
    setCustomSoundUri(res.uri);
    setCustomSoundTitle(res.title || 'نغمة منبه النظام');
    setCustomSongId('');
    setUriAccessibilityWarning(null);
    setPickerFeedbackSuccess(`تم اختيار نغمة الهاتف: «${res.title || 'نغمة النظام'}» بنجاح.`);
  };

  // =========================================================
  // HANDLER 2: IMPORT SONG FROM DEVICE («إضافة أغنية من الهاتف»)
  // =========================================================
  const handleImportSongClick = async () => {
    setPickerFeedbackError(null);
    setPickerFeedbackSuccess(null);
    soundEngine.stop();
    setPreviewingKey(null);

    const res = await importSongFromDevice();
    if (res.cancelled) {
      return;
    }
    if (res.error || !res.song) {
      setPickerFeedbackError(res.error || 'تعذر استيراد الأغنية المختارة.');
      return;
    }

    const updatedSongs = getImportedSongs();
    setSongs(updatedSongs);
    setSoundSource('my_song');
    setCustomSongId(res.song.id);
    setCustomSoundUri(res.song.uri);
    setCustomSoundTitle(res.song.name);
    setUriAccessibilityWarning(null);
    setPickerFeedbackSuccess(`تمت إضافة الأغنية «${res.song.name}» إلى «أغنياتي» وتعيينها لهذا المنبه.`);
  };

  // =========================================================
  // HANDLER 3: PREVIEW PLAY / STOP
  // =========================================================
  const handleTogglePreview = async (
    key: string,
    opts: {
      soundSource: SoundSourceType;
      sound: SoundType;
      customSoundUri?: string;
      customSongId?: string;
    }
  ) => {
    setPickerFeedbackError(null);
    if (previewingKey === key) {
      soundEngine.stop();
      setPreviewingKey(null);
      return;
    }

    setPreviewingKey(key);
    const res = await soundEngine.playCustomSourcePreview(opts);
    if (!res.ok) {
      setPreviewingKey(null);
      setPickerFeedbackError(res.error || 'تعذر تشغيل المعاينة الصوتية.');
    }
  };

  // =========================================================
  // HANDLER 4: CONFIRM DELETE SONG FROM «أغنياتي»
  // =========================================================
  const handleConfirmDeleteSong = async () => {
    if (!deletingSongCandidate) return;
    const target = deletingSongCandidate;
    soundEngine.stop();
    setPreviewingKey(null);

    await deleteImportedSongFromLibrary(target.id);
    const refreshed = getImportedSongs();
    setSongs(refreshed);
    setDeletingSongCandidate(null);

    // If current alarm being edited was using this deleted song, switch to safe fallback
    if (
      soundSource === 'my_song' &&
      (customSongId === target.id || customSoundUri === target.uri)
    ) {
      setSoundSource('app_tone');
      setSound('fajr_adhan_tone');
      setCustomSongId('');
      setCustomSoundUri('');
      setCustomSoundTitle('');
      setPickerFeedbackSuccess(
        `تم حذف «${target.name}» من أغنياتي، وتم تعيين النغمة الاحتياطية الآمنة «نداء الفجر الهادئ» لهذا المنبه.`
      );
    } else {
      setPickerFeedbackSuccess(`تم حذف الأغنية «${target.name}» من مكتبة التطبيق دون المساس بملفك الأصلي.`);
    }

    if (onSongDeletedFromLibrary) {
      onSongDeletedFromLibrary(target.id, target.name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.stop();
    setPreviewingKey(null);

    onSave({
      id: initialAlarm ? initialAlarm.id : `alarm-${Date.now()}`,
      time,
      label: label.trim() || 'الفجر',
      days,
      enabled,
      smartWindowMinutes,
      gradualFadeSeconds,
      sound,
      soundSource,
      customSoundUri:
        soundSource === 'phone_ringtone' || soundSource === 'my_song'
          ? customSoundUri
          : undefined,
      customSoundTitle:
        soundSource === 'phone_ringtone' || soundSource === 'my_song'
          ? customSoundTitle
          : undefined,
      customSongId: soundSource === 'my_song' ? customSongId : undefined,
      maxPlaybackDurationSeconds:
        maxPlaybackDurationSeconds > 0 ? maxPlaybackDurationSeconds : undefined,
      challenge,
    });
    onClose();
  };

  const activeSummary = getActiveSoundSummary();
  const alarmsUsingCandidateSong = deletingSongCandidate
    ? allAlarms.filter(
        (a) =>
          a.soundSource === 'my_song' &&
          (a.customSongId === deletingSongCandidate.id ||
            a.customSoundUri === deletingSongCandidate.uri)
      )
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#F4F7FB] border border-[#E6EDF5] p-5 sm:p-6 shadow-2xl my-auto text-[#172B4D]">
        {/* =====================================================
            SUB-VIEW 1: 3-SOURCE RINGTONE & SONG PICKER
           ===================================================== */}
        {subView === 'ringtone_picker' ? (
          <div className="space-y-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.stop();
                  setPreviewingKey(null);
                  setSubView('form');
                }}
                className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-200/60 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
                <span>رجوع</span>
              </button>
              <h3 className="text-lg font-bold text-[#172B4D]">
                اختيار نغمة المنبه أو الأغنية
              </h3>
              <div className="w-12" />
            </div>

            {/* 3 Independent Sources Tabs: نغمات التطبيق | نغمات الهاتف | أغنياتي */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  soundEngine.stop();
                  setPreviewingKey(null);
                  setPickerFeedbackError(null);
                  setRingtoneTab('app_tone');
                }}
                className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  ringtoneTab === 'app_tone'
                    ? 'bg-[#1B365D] text-white shadow-xs'
                    : 'text-[#6B7C93] hover:text-[#172B4D]'
                }`}
              >
                نغمات التطبيق
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.stop();
                  setPreviewingKey(null);
                  setPickerFeedbackError(null);
                  setRingtoneTab('phone_ringtone');
                  // Automatically launch real Android Ringtone Picker when on Android device
                  if (nativeAlarmBridge.isNativeAndroid()) {
                    handleLaunchAndroidRingtonePicker();
                  }
                }}
                className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  ringtoneTab === 'phone_ringtone'
                    ? 'bg-[#1B365D] text-white shadow-xs'
                    : 'text-[#6B7C93] hover:text-[#172B4D]'
                }`}
              >
                نغمات الهاتف
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.stop();
                  setPreviewingKey(null);
                  setPickerFeedbackError(null);
                  setRingtoneTab('my_song');
                }}
                className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  ringtoneTab === 'my_song'
                    ? 'bg-[#1B365D] text-white shadow-xs'
                    : 'text-[#6B7C93] hover:text-[#172B4D]'
                }`}
              >
                أغنياتي ({songs.length})
              </button>
            </div>

            {/* Currently Selected Tone Summary Bar */}
            <div className="p-3 rounded-2xl bg-white border border-[#E6EDF5] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className="px-2 py-0.5 rounded-lg bg-[#EBF3FE] text-[#2F80ED] font-extrabold shrink-0">
                  {activeSummary.badge}
                </span>
                <span className="font-bold text-[#172B4D] truncate">
                  المحدد حالياً: {activeSummary.title}
                </span>
              </div>
              {previewingKey && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.stop();
                    setPreviewingKey(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold shrink-0 cursor-pointer"
                >
                  إيقاف الصوت
                </button>
              )}
            </div>

            {/* Feedback Banners */}
            {pickerFeedbackError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{pickerFeedbackError}</span>
                </div>
                {ringtoneTab === 'phone_ringtone' && (
                  <button
                    type="button"
                    onClick={handleLaunchAndroidRingtonePicker}
                    className="min-h-[34px] px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>المحاولة مجدداً</span>
                  </button>
                )}
              </div>
            )}

            {pickerFeedbackSuccess && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{pickerFeedbackSuccess}</span>
              </div>
            )}

            {/* =================================================
                TAB 1: نغمات التطبيق (Built-in App Tones)
               ================================================= */}
            {ringtoneTab === 'app_tone' && (
              <div className="space-y-2.5 max-h-[310px] overflow-y-auto pr-0.5">
                {SOUND_OPTIONS.map((opt) => {
                  const isSelected = soundSource === 'app_tone' && sound === opt.id;
                  const isPreviewing = previewingKey === `app_${opt.id}`;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        setSoundSource('app_tone');
                        setSound(opt.id);
                        setUriAccessibilityWarning(null);
                        handleTogglePreview(`app_${opt.id}`, {
                          soundSource: 'app_tone',
                          sound: opt.id,
                        });
                      }}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#E3EFFD] border-[#2F80ED]/60'
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
                          <p className="text-sm font-bold text-[#172B4D]">{opt.name}</p>
                          <p className="text-[11px] text-[#6B7C93]">{opt.desc}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePreview(`app_${opt.id}`, {
                            soundSource: 'app_tone',
                            sound: opt.id,
                          });
                        }}
                        className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] hover:bg-[#2F80ED] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title={isPreviewing ? 'إيقاف المعاينة' : 'معاينة النغمة'}
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

            {/* =================================================
                TAB 2: نغمات الهاتف (Real Android RingtoneManager)
               ================================================= */}
            {ringtoneTab === 'phone_ringtone' && (
              <div className="bg-white rounded-2xl border border-[#E6EDF5] p-5 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#EBF3FE] text-[#1B365D] flex items-center justify-center shrink-0">
                    <Smartphone className="w-6 h-6 text-[#2F80ED]" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-[#172B4D]">
                      منتقي نغمات منبه أندرويد الأصلي
                    </h4>
                    <p className="text-xs text-[#6B7C93] leading-relaxed">
                      يفتح نافذة نغمات النظام الحقيقية (<span className="font-mono">RingtoneManager.TYPE_ALARM</span>) لاختيار أي نغمة منبه مثبتة على هاتفك. إذا ألغيت الاختيار تبقى نغمتك السابقة محفوظة دون تغيير.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLaunchAndroidRingtonePicker}
                  className="w-full min-h-[48px] rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                >
                  <Bell className="w-4 h-4 text-amber-300" />
                  <span>فتح منتقي نغمات الهاتف (Android)</span>
                </button>

                {soundSource === 'phone_ringtone' && customSoundUri && (
                  <div className="p-3.5 rounded-2xl bg-[#E3EFFD] border border-[#2F80ED]/40 flex items-center justify-between gap-3">
                    <div className="space-y-0.5 truncate">
                      <span className="text-[11px] font-bold text-[#2F80ED] block">
                        نغمة الهاتف المحفوظة لهذا المنبه:
                      </span>
                      <p className="text-sm font-extrabold text-[#172B4D] truncate">
                        {customSoundTitle || 'نغمة منبه الهاتف'}
                      </p>
                      <p
                        dir="ltr"
                        className="text-[10px] font-mono text-[#6B7C93] truncate"
                      >
                        {customSoundUri}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleTogglePreview('phone_current', {
                          soundSource: 'phone_ringtone',
                          sound,
                          customSoundUri,
                        })
                      }
                      className="min-h-[38px] px-3 rounded-xl bg-[#1B365D] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {previewingKey === 'phone_current' ? (
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

            {/* =================================================
                TAB 3: أغنياتي (Imported Audio Songs Library)
               ================================================= */}
            {ringtoneTab === 'my_song' && (
              <div className="space-y-3">
                {/* Required Button: «إضافة أغنية من الهاتف» */}
                <button
                  type="button"
                  onClick={handleImportSongClick}
                  className="w-full min-h-[48px] rounded-2xl bg-[#2F80ED] hover:bg-[#1B365D] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>إضافة أغنية من الهاتف</span>
                </button>

                <p className="text-[11px] text-[#6B7C93] text-center">
                  يدعم الصيغ الصوتية: <span className="font-mono font-bold">MP3, M4A, WAV, AAC, OGG</span> · تُحفظ نسخة آمنة داخل التطبيق.
                </p>

                {songs.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E6EDF5] p-6 text-center space-y-2">
                    <Music className="w-8 h-8 text-[#9AA5B1] mx-auto" />
                    <p className="text-xs font-bold text-[#172B4D]">
                      قائمة «أغنياتي» فارغة حالياً
                    </p>
                    <p className="text-[11px] text-[#6B7C93]">
                      اضغط على زر «إضافة أغنية من الهاتف» بالأعلى لاستيراد ملف صوتي واستخدامه كمنبه.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[240px] overflow-y-auto pr-0.5">
                    {songs.map((songItem) => {
                      const isSelected =
                        soundSource === 'my_song' &&
                        (customSongId === songItem.id || customSoundUri === songItem.uri);
                      const isPreviewing = previewingKey === `song_${songItem.id}`;

                      return (
                        <div
                          key={songItem.id}
                          onClick={() => {
                            setSoundSource('my_song');
                            setCustomSongId(songItem.id);
                            setCustomSoundUri(songItem.uri);
                            setCustomSoundTitle(songItem.name);
                            setUriAccessibilityWarning(null);
                          }}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[#E3EFFD] border-[#2F80ED]/60'
                              : 'bg-white border-[#E6EDF5] hover:border-[#CBD5E1]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'border-[#2F80ED] bg-[#2F80ED]'
                                  : 'border-[#CBD5E1] bg-white'
                              }`}
                            >
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-white block" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-[#172B4D] truncate">
                                {songItem.name}
                              </p>
                              <p className="text-[11px] text-[#6B7C93] flex items-center gap-1.5">
                                <span className="font-mono">
                                  {formatSecondsMMSS(songItem.durationSeconds)}
                                </span>
                                <span>·</span>
                                <span>{formatBytesArabic(songItem.sizeBytes)}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePreview(`song_${songItem.id}`, {
                                  soundSource: 'my_song',
                                  sound,
                                  customSongId: songItem.id,
                                  customSoundUri: songItem.uri,
                                });
                              }}
                              className="w-9 h-9 rounded-xl bg-[#EBF3FE] text-[#2F80ED] hover:bg-[#2F80ED] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                              title={isPreviewing ? 'إيقاف المعاينة' : 'معاينة وتشغيل'}
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
                                setDeletingSongCandidate(songItem);
                              }}
                              className="w-9 h-9 rounded-xl bg-[#F0F4F9] text-[#6B7C93] hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="حذف من أغنياتي"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Optional Max Playback Duration for Long Songs */}
                <div className="bg-white rounded-2xl border border-[#E6EDF5] p-3.5 space-y-1.5">
                  <label className="block text-xs font-bold text-[#172B4D]">
                    مدة تشغيل الأغنية عند رنين المنبه (اختياري للأغاني الطويلة):
                  </label>
                  <select
                    value={maxPlaybackDurationSeconds}
                    onChange={(e) => setMaxPlaybackDurationSeconds(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl bg-[#F0F4F9] border border-[#E6EDF5] px-3 text-xs font-bold text-[#172B4D]"
                  >
                    <option value={0}>بدون حد مخصص (يستمر حتى إيقاف المنبه)</option>
                    <option value={30}>30 ثانية</option>
                    <option value={60}>دقيقة واحدة (60 ثانية)</option>
                    <option value={120}>دقيقتان (120 ثانية)</option>
                    <option value={180}>3 دقائق</option>
                    <option value={300}>5 دقائق</option>
                  </select>
                </div>
              </div>
            )}

            {/* Confirm Delete Song Modal inside Picker */}
            {deletingSongCandidate && (
              <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-3">
                <p className="text-xs font-extrabold text-rose-900">
                  هل أنت متأكد من حذف «{deletingSongCandidate.name}» من مكتبة التطبيق؟
                </p>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  • لن يتم حذف الملف الأصلي من مجلد الموسيقى أو التنزيلات في هاتفك.
                  {alarmsUsingCandidateSong.length > 0 && (
                    <span className="block mt-1 font-bold">
                      • تنبيه: هذه الأغنية مستخدمة حالياً في ({alarmsUsingCandidateSong.length}) منبه؛ سيتم تحويلها تلقائياً إلى النغمة الاحتياطية الآمنة «نداء الفجر الهادئ» حتى لا يتعطل أي منبه.
                    </span>
                  )}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeletingSongCandidate(null)}
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

            {/* Bottom Confirmation Button */}
            <button
              type="button"
              onClick={() => {
                soundEngine.stop();
                setPreviewingKey(null);
                setSubView('form');
              }}
              className="w-full min-h-[50px] rounded-2xl bg-[#1B365D] hover:bg-[#0F2342] text-white font-bold text-sm flex items-center justify-center shadow-md cursor-pointer transition-colors"
            >
              اعتماد النغمة المختارة
            </button>
          </div>
        ) : (
          /* =====================================================
              SUB-VIEW 2: ALARM SETTINGS FORM
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

            {uriAccessibilityWarning && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{uriAccessibilityWarning}</span>
              </div>
            )}

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

            {/* Days of Week Selector */}
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

            {/* Alarm Sound & Ringtone Selector Trigger */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6EDF5] space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#6B7C93]">
                    صوت المنبه ونغمة الرنين
                  </label>
                  <span className="px-2 py-0.5 rounded-lg bg-[#EBF3FE] text-[#2F80ED] text-[10px] font-extrabold">
                    {activeSummary.badge}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('ringtone_picker')}
                  className="w-full min-h-[46px] rounded-xl bg-[#F0F4F9] hover:bg-[#E6EEF8] border border-[#E6EDF5] px-3.5 flex items-center justify-between text-xs font-bold text-[#172B4D] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Music className="w-4 h-4 text-[#1B365D] shrink-0" />
                    <span className="truncate">{activeSummary.title}</span>
                  </div>
                  <span className="text-[#2F80ED] flex items-center gap-1 shrink-0">
                    <span>تغيير النغمة / أغنياتي</span>
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

            {/* Enable Alarm Row with Green Pill Switch */}
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

            {/* Save Button */}
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
