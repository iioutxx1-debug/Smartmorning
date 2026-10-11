import { AlarmItem, SoundType, ChallengeType } from '../types';

export const DAY_NAMES = [
  { index: 6, short: 'سبت', full: 'السبت' },
  { index: 0, short: 'أحد', full: 'الأحد' },
  { index: 1, short: 'إثنين', full: 'الإثنين' },
  { index: 2, short: 'ثلاثاء', full: 'الثلاثاء' },
  { index: 3, short: 'أربعاء', full: 'الأربعاء' },
  { index: 4, short: 'خميس', full: 'الخميس' },
  { index: 5, short: 'جمعة', full: 'الجمعة' },
];

export const SOUND_OPTIONS: { id: SoundType; name: string; desc: string }[] = [
  { id: 'fajr_adhan_tone', name: 'نداء الفجر الهادئ', desc: 'نغمة روحانية مستوحاة من مقامات الفجر' },
  { id: 'makkah_tone', name: 'نسيم الحرم (مقام حجاز)', desc: 'ترددات دافئة تبعث الطمأنينة والسكينة' },
  { id: 'nature_birds', name: 'الطبيعة والعصافير', desc: 'محاكاة صوتية لإشراقة طبيعية هادئة' },
  { id: 'dawn_chimes', name: 'موسيقى هادئة (أجراس الفجر)', desc: 'نغمات دافئة متدرجة توقظ الدماغ بلطف' },
  { id: 'classic_pulse', name: 'نغمة محفزة (نبض رقمي)', desc: 'تنبيه إيقاعي منتظم للاستيقاظ الحاسم' },
  { id: 'zen_bowl', name: 'موسيقى عصرية (رنين الصفاء)', desc: 'ترددات هادئة مريحة للأعصاب عند الاستيقاظ' },
  { id: 'calm_piano', name: 'بيانو الصباح الكلاسيكي', desc: 'معزوفة بيانو ناعمة لبداية يوم متوازنة' },
];

export const CHALLENGE_OPTIONS: { id: ChallengeType; name: string; desc: string }[] = [
  { id: 'math', name: 'معادلة تنشيط الذهن', desc: 'حل مسألة حسابية سريعة لطرد الخمول الصباحي' },
  { id: 'intention', name: 'تأكيد نية اليوم', desc: 'كتابة أو تأكيد عبارة تحفيزية لبدء الصباح بوعي' },
  { id: 'memory', name: 'تسلسل الذاكرة البصرية', desc: 'تذكر ترتيب المربعات المضيئة لتنشيط التركيز' },
  { id: 'none', name: 'إيقاف مباشر بدون تحدٍ', desc: 'إغلاق المنبه بضغطة واحدة' },
];

export const INITIAL_ALARMS: AlarmItem[] = [
  {
    id: 'alarm-fajr',
    time: '04:32',
    label: 'الفجر',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    smartWindowMinutes: 20,
    gradualFadeSeconds: 60,
    sound: 'fajr_adhan_tone',
    challenge: 'math',
  },
  {
    id: 'alarm-1',
    time: '06:00',
    label: 'العمل والدوام الصباحي',
    days: [0, 1, 2, 3, 4],
    enabled: true,
    smartWindowMinutes: 20,
    gradualFadeSeconds: 60,
    sound: 'dawn_chimes',
    challenge: 'math',
  },
  {
    id: 'alarm-dhuhr',
    time: '12:15',
    label: 'الظهر (استراحة منتصف اليوم)',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: false,
    smartWindowMinutes: 10,
    gradualFadeSeconds: 30,
    sound: 'makkah_tone',
    challenge: 'none',
  },
  {
    id: 'alarm-asr',
    time: '15:45',
    label: 'العصر (تجديد النشاط)',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: false,
    smartWindowMinutes: 15,
    gradualFadeSeconds: 30,
    sound: 'nature_birds',
    challenge: 'intention',
  },
  {
    id: 'alarm-maghrib',
    time: '18:12',
    label: 'المغرب (هدوء المساء)',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: false,
    smartWindowMinutes: 15,
    gradualFadeSeconds: 60,
    sound: 'zen_bowl',
    challenge: 'none',
  },
];
