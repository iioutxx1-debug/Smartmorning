import React, { useState, useEffect, useMemo } from 'react';
import { AlarmItem } from '../types';
import { SOUND_OPTIONS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import { Sun, Volume2, CheckCircle2, Sparkles, Clock, AlertTriangle } from 'lucide-react';

interface ActiveAlarmModalProps {
  alarm: AlarmItem | null;
  onDismiss: (alarm: AlarmItem) => void;
  onSnooze: (alarm: AlarmItem) => void;
}

const MORNING_INTENTIONS = [
  'اليوم سأركز على أهم أولوياتي بهدوء وإنجاز',
  'صباح جديد يحمل طاقة عالية وفرصاً مميزة',
  'أختار اليقظة والنشاط والامتنان في هذا الصباح',
];

export const ActiveAlarmModal: React.FC<ActiveAlarmModalProps> = ({
  alarm,
  onDismiss,
  onSnooze,
}) => {
  const [mathAnswer, setMathAnswer] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [typedIntention, setTypedIntention] = useState('');
  const [memoryTarget, setMemoryTarget] = useState<number[]>([0, 4, 8]);
  const [memorySelected, setMemorySelected] = useState<number[]>([]);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  const mathProblem = useMemo(() => {
    const a = Math.floor(Math.random() * 14) + 12;
    const b = Math.floor(Math.random() * 9) + 6;
    return {
      question: `${a} + ${b}`,
      solution: a + b,
    };
  }, [alarm]);

  const targetIntention = useMemo(() => {
    return MORNING_INTENTIONS[Math.floor(Math.random() * MORNING_INTENTIONS.length)];
  }, [alarm]);

  useEffect(() => {
    if (!alarm) {
      soundEngine.stop();
      setFallbackWarning(null);
      return;
    }

    setMathAnswer('');
    setTypedIntention('');
    setErrorMsg('');
    setFallbackWarning(null);
    setMemorySelected([]);
    const indices: number[] = [];
    while (indices.length < 3) {
      const r = Math.floor(Math.random() * 9);
      if (!indices.includes(r)) indices.push(r);
    }
    setMemoryTarget(indices);

    // Play the exact alarm sound source (Phone Ringtone URI, Imported Song, or App Tone)
    soundEngine.startAlarmItemLoop(alarm, (warning) => {
      setFallbackWarning(warning);
    });

    return () => {
      soundEngine.stop();
    };
  }, [alarm]);

  if (!alarm) return null;

  const toneDisplayTitle =
    alarm.soundSource === 'phone_ringtone' || alarm.soundSource === 'my_song'
      ? alarm.customSoundTitle || 'نغمة مخصصة'
      : SOUND_OPTIONS.find((s) => s.id === alarm.sound)?.name || 'نداء الفجر الهادئ';

  const handleVerifyChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    if (alarm.challenge === 'math') {
      if (Number(mathAnswer.trim()) === mathProblem.solution) {
        soundEngine.stop();
        onDismiss(alarm);
      } else {
        setErrorMsg('الإجابة غير صحيحة، حاول مرة أخرى لتنشيط ذهنك!');
      }
    } else if (alarm.challenge === 'intention') {
      if (typedIntention.trim().length >= 8) {
        soundEngine.stop();
        onDismiss(alarm);
      } else {
        setErrorMsg('يرجى كتابة عبارة النية الصباحية أو الضغط على زر النسخ السريع.');
      }
    } else {
      soundEngine.stop();
      onDismiss(alarm);
    }
  };

  const handleMemoryTileClick = (idx: number) => {
    if (memorySelected.includes(idx)) return;
    if (!memoryTarget.includes(idx)) {
      setErrorMsg('مربع غير مطابق! ركّز على المربعات الزرقاء المحددة.');
      setMemorySelected([]);
      return;
    }
    const next = [...memorySelected, idx];
    setMemorySelected(next);
    setErrorMsg('');
    if (next.length === memoryTarget.length) {
      soundEngine.stop();
      onDismiss(alarm);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#F4F7FB] border border-[#E6EDF5] p-6 sm:p-8 shadow-2xl text-center space-y-6 overflow-hidden text-[#172B4D]">
        {/* Top Navy Sunrise Banner */}
        <div className="rounded-2xl bg-gradient-to-br from-[#1B365D] to-[#0F2342] text-white p-5 space-y-2 shadow-md">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300">
            <Sun className="w-7 h-7 animate-spin" style={{ animationDuration: '14s' }} />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-sky-200 font-medium">
            <Volume2 className="w-4 h-4 text-amber-300" />
            <span>{toneDisplayTitle}</span>
            <span aria-hidden="true">·</span>
            <span>تدرج صوتي ({alarm.gradualFadeSeconds} ث)</span>
          </div>

          <div className="font-mono tabular-nums text-5xl font-bold text-white tracking-tight">
            {alarm.time}
          </div>

          <h2 className="text-lg font-bold text-amber-300">{alarm.label}</h2>
        </div>

        {fallbackWarning && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2 text-right">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{fallbackWarning}</span>
          </div>
        )}

        {/* Challenge Interactive Area */}
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-5 text-right space-y-4">
          {alarm.challenge === 'math' && (
            <form onSubmit={handleVerifyChallenge} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2F80ED]">
                  تحدي تنشيط الذهن الصباحي
                </span>
                <span className="text-xs text-[#6B7C93]">احسب الناتج لإيقاف الرنين</span>
              </div>

              <div
                dir="ltr"
                className="font-mono tabular-nums text-3xl font-bold text-center py-3 rounded-xl bg-[#F0F4F9] border border-[#E6EDF5] text-[#1B365D]"
              >
                {mathProblem.question} = ?
              </div>

              <input
                type="number"
                autoFocus
                placeholder="أدخل الناتج هنا..."
                value={mathAnswer}
                onChange={(e) => {
                  setMathAnswer(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full min-h-[48px] text-center font-mono tabular-nums text-xl font-bold sm-input"
              />

              {errorMsg && <p className="text-xs text-rose-600 font-bold text-center">{errorMsg}</p>}

              <button
                type="submit"
                className="w-full min-h-[50px] sm-btn-navy text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>تأكيد الإجابة وإيقاف المنبه</span>
              </button>
            </form>
          )}

          {alarm.challenge === 'intention' && (
            <form onSubmit={handleVerifyChallenge} className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#2F80ED]">
                  تأكيد نية الصباح الواعية
                </span>
                <p className="text-xs text-[#6B7C93]">
                  اضغط على العبارة التالية أو اكتبها لتثبيت تركيزك الصباحي:
                </p>
              </div>

              <div
                onClick={() => setTypedIntention(targetIntention)}
                className="p-3.5 rounded-xl bg-[#EBF3FE] border border-[#2F80ED]/30 text-sm font-bold text-[#1B365D] cursor-pointer text-center"
              >
                "{targetIntention}"
                <span className="block text-[11px] text-[#2F80ED] mt-1">
                  (اضغط هنا للنسخ السريع)
                </span>
              </div>

              <input
                type="text"
                value={typedIntention}
                onChange={(e) => {
                  setTypedIntention(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="اكتب نيتك الصباحية هنا..."
                className="w-full min-h-[46px] sm-input px-4 text-sm font-bold"
              />

              {errorMsg && <p className="text-xs text-rose-600 font-bold">{errorMsg}</p>}

              <button
                type="submit"
                className="w-full min-h-[50px] sm-btn-navy text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>إيقاف المنبه</span>
              </button>
            </form>
          )}

          {alarm.challenge === 'memory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2F80ED]">
                  تحدي الذاكرة البصرية
                </span>
                <span className="text-xs text-[#6B7C93]">
                  اضغط على المربعات الـ 3 المحددة
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto py-2">
                {Array.from({ length: 9 }).map((_, idx) => {
                  const isTarget = memoryTarget.includes(idx);
                  const isPicked = memorySelected.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleMemoryTileClick(idx)}
                      className={`h-14 rounded-xl border transition-all cursor-pointer ${
                        isPicked
                          ? 'bg-[#22C55E] border-[#16A34A] scale-95'
                          : isTarget
                          ? 'bg-[#D8E8FC] border-[#2F80ED]'
                          : 'bg-[#F0F4F9] border-[#E6EDF5]'
                      }`}
                    />
                  );
                })}
              </div>

              {errorMsg && <p className="text-xs text-rose-600 font-bold text-center">{errorMsg}</p>}
            </div>
          )}

          {alarm.challenge === 'none' && (
            <button
              onClick={() => {
                soundEngine.stop();
                onDismiss(alarm);
              }}
              className="w-full min-h-[50px] sm-btn-navy text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>إيقاف المنبه</span>
            </button>
          )}
        </div>

        {/* Snooze Option */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              soundEngine.stop();
              onSnooze(alarm);
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-[#6B7C93] hover:text-[#172B4D] hover:bg-slate-200/60 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>غفوة ذكية قصيرة (5 دقائق)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
