import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Employee,
  ActiveRestSession,
  RestLogEntry,
  RestSettings,
} from '../types';
import { soundEngine } from '../utils/soundEngine';
import {
  nativeAlarmBridge,
  RestNotificationActionPayload,
} from '../utils/nativeAlarmBridge';
import {
  RestCategory,
  normalizeDigitsToAscii,
  computeOperationalDayKey,
  calculateRestSessionMetrics,
  calculateEmployeeBalance,
  getEmployeeDetailedState,
  classifyEmployeeCategory,
  formatDurationArabic,
  sanitizeAndRepairEmployees,
} from '../utils/timeMath';
import {
  Plus,
  Trash2,
  Edit3,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Settings,
  Share2,
  Download,
  Upload,
  RotateCcw,
  Volume2,
  BellRing,
  Bell,
  Check,
  X,
  ChevronRight,
  Clock,
} from 'lucide-react';

const STORAGE_KEYS = {
  EMPLOYEES: 'miqat_rest_employees_v1',
  LOGS: 'miqat_rest_logs_v1',
  SETTINGS: 'miqat_rest_settings_v1',
  LAST_RESET_KEY: 'miqat_rest_last_reset_day_v1',
};

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    name: 'حسين',
    dailyAllowanceMinutes: 30,
    consumedSecondsToday: 0,
    delaySecondsToday: 0,
    hasStartedRestToday: false,
    optedOutRemainingToday: false,
    shiftStartTime: '09:00',
    shiftPreAlertMinutes: 10,
    avatarColor: '#2F80ED',
    activeSession: null,
  },
  {
    id: 'emp-2',
    name: 'أحمد محمد',
    dailyAllowanceMinutes: 30,
    consumedSecondsToday: 0,
    delaySecondsToday: 0,
    hasStartedRestToday: false,
    optedOutRemainingToday: false,
    shiftStartTime: '09:00',
    shiftPreAlertMinutes: 10,
    avatarColor: '#10B981',
    activeSession: null,
  },
  {
    id: 'emp-3',
    name: 'سارة علي',
    dailyAllowanceMinutes: 30,
    consumedSecondsToday: 0,
    delaySecondsToday: 0,
    hasStartedRestToday: false,
    optedOutRemainingToday: false,
    shiftStartTime: '10:00',
    shiftPreAlertMinutes: 15,
    avatarColor: '#EC4899',
    activeSession: null,
  },
  {
    id: 'emp-4',
    name: 'علي حسين',
    dailyAllowanceMinutes: 30,
    consumedSecondsToday: 0,
    delaySecondsToday: 0,
    hasStartedRestToday: false,
    optedOutRemainingToday: false,
    shiftStartTime: '10:00',
    shiftPreAlertMinutes: 15,
    avatarColor: '#F59E0B',
    activeSession: null,
  },
];

const DEFAULT_SETTINGS: RestSettings = {
  dayResetHour: 5,
  dayResetMinute: 0,
  testModeMinuteAsSecond: false,
  wakeLockEnabled: true,
  maxConcurrentRests: 2,
  enableVoiceTTS: true,
  enableVibration: true,
  alarmSound: 'classic_pulse',
  alarmVolume: 0.85,
  enablePhase2Extras: true,
  notifyOnRestEnd: true,
  notifyOnOvertime: true,
  overtimeAlertAfterMinutes: 5,
};

const QUICK_DURATION_PRESETS = [10, 15, 20, 25, 30, 45, 60];

interface EmployeeRestManagerProps {
  onNavigateToRest?: () => void;
  isRestTabVisible?: boolean;
}

export const EmployeeRestManager: React.FC<EmployeeRestManagerProps> = ({
  onNavigateToRest,
  isRestTabVisible = true,
}) => {
  const [settings, setSettings] = useState<RestSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Load and sanitize employees on startup to automatically repair any corrupted or stale timers (e.g. 2364 min delay)
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      if (!saved) return INITIAL_EMPLOYEES;
      const parsed = JSON.parse(saved);
      const { employees: repaired } = sanitizeAndRepairEmployees(
        parsed,
        Date.now(),
        DEFAULT_SETTINGS.dayResetHour,
        DEFAULT_SETTINGS.dayResetMinute
      );
      return repaired.length > 0 ? repaired : INITIAL_EMPLOYEES;
    } catch {
      return INITIAL_EMPLOYEES;
    }
  });

  const [logs, setLogs] = useState<RestLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGS);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Primary View Tab: 'employees' | 'logs' | 'add_employee' | 'settings'
  const [subTab, setSubTab] = useState<'employees' | 'logs' | 'add_employee' | 'settings'>('employees');

  // Four Main Employee Category Tabs at the top of the Employees view
  const [activeCategoryTab, setActiveCategoryTab] = useState<RestCategory>('not_taken');

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Persistent Arabic Return Banner Cards
  const [returnBannerMessages, setReturnBannerMessages] = useState<
    { id: string; employeeName: string; lines: string[]; timestamp: string; isLate: boolean }[]
  >([]);

  // Start-rest interactive prompt cards (for employees who haven't started rest yet)
  const [startRestPrompts, setStartRestPrompts] = useState<
    { employeeId: string; employeeName: string; allowanceMinutes: number; createdAt: string }[]
  >([]);

  // Start Rest Modal State
  const [startingEmployee, setStartingEmployee] = useState<Employee | null>(null);
  const [customMinutesText, setCustomMinutesText] = useState<string>('15');
  const [startModalError, setStartModalError] = useState<string | null>(null);
  const [confirmExceedModal, setConfirmExceedModal] = useState<{
    employee: Employee;
    requestedMinutes: number;
    remainingMinutes: number;
    exceedConcurrentWarning: boolean;
  } | null>(null);

  // Add Employee State
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpAllowanceText, setNewEmpAllowanceText] = useState<string>('30');
  const [newEmpColor, setNewEmpColor] = useState('#2F80ED');
  const [newEmpError, setNewEmpError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Edit Employee / Edit Rest Duration Modal State
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editEmpName, setEditEmpName] = useState<string>('');
  const [editAllowanceText, setEditAllowanceText] = useState<string>('30');
  const [editEmpColor, setEditEmpColor] = useState<string>('#2F80ED');
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [confirmNewDayModal, setConfirmNewDayModal] = useState(false);

  const [shiftAlertMessage, setShiftAlertMessage] = useState<{
    employeeId: string;
    employeeName: string;
    allowanceMinutes: number;
    text: string;
  } | null>(null);
  const triggeredShiftAlertsRef = useRef<Set<string>>(new Set());
  const wakeLockRef = useRef<any>(null);
  const [wakeLockActiveStatus, setWakeLockActiveStatus] = useState<boolean>(false);

  const employeesRef = useRef<Employee[]>(employees);
  useEffect(() => {
    employeesRef.current = employees;
  }, [employees]);

  const settingsRef = useRef<RestSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const currentOpDayKey = useMemo(
    () => computeOperationalDayKey(new Date(nowMs), settings.dayResetHour, settings.dayResetMinute),
    [nowMs, settings.dayResetHour, settings.dayResetMinute]
  );
  const [selectedReportDay, setSelectedReportDay] = useState<string>(currentOpDayKey);

  const showNotice = useCallback((msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  }, []);

  // Helper to schedule native & local notifications with current settings
  const scheduleRestNotificationsForSession = useCallback(
    (empId: string, empName: string, targetEndMs: number, allocatedMinutes: number) => {
      const currSettings = settingsRef.current;
      nativeAlarmBridge.scheduleEmployeeRestEnd(
        empId,
        empName,
        targetEndMs,
        allocatedMinutes,
        {
          notifyOnRestEnd: currSettings.notifyOnRestEnd ?? true,
          notifyOnOvertime: currSettings.notifyOnOvertime ?? true,
          overtimeAlertAfterMinutes: currSettings.overtimeAlertAfterMinutes ?? 5,
        }
      );
    },
    []
  );

  // Run a one-time mount check to repair any stale sessions relative to custom dayResetHour
  useEffect(() => {
    const { employees: repaired, repairedCount, repairNotes } = sanitizeAndRepairEmployees(
      employees,
      Date.now(),
      settings.dayResetHour,
      settings.dayResetMinute
    );
    if (repairedCount > 0) {
      setEmployees(repaired);
      if (repairNotes.length > 0) {
        showNotice(repairNotes[0]);
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    } catch {}
  }, [employees]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch {}
  }, [logs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Single clean interval for live timer updates with cleanup on unmount
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const requestWakeLock = async () => {
      if (!settings.wakeLockEnabled) {
        if (wakeLockRef.current) {
          try {
            await wakeLockRef.current.release();
          } catch {}
          wakeLockRef.current = null;
        }
        setWakeLockActiveStatus(false);
        return;
      }

      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActiveStatus(true);
          wakeLockRef.current.addEventListener('release', () => {
            setWakeLockActiveStatus(false);
          });
        } catch {
          setWakeLockActiveStatus(false);
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && settings.wakeLockEnabled) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [settings.wakeLockEnabled]);

  // Operational Day Rollover: reset daily counters AND close stale sessions from previous days
  useEffect(() => {
    const savedDayKey = localStorage.getItem(STORAGE_KEYS.LAST_RESET_KEY);
    if (!savedDayKey) {
      localStorage.setItem(STORAGE_KEYS.LAST_RESET_KEY, currentOpDayKey);
      return;
    }
    if (savedDayKey !== currentOpDayKey) {
      setEmployees((prev) =>
        prev.map((emp) => {
          let keptSession: ActiveRestSession | null = null;
          if (emp.activeSession) {
            const sessDayKey = computeOperationalDayKey(
              new Date(emp.activeSession.startedAtMs),
              settings.dayResetHour,
              settings.dayResetMinute
            );
            if (sessDayKey === currentOpDayKey) {
              keptSession = emp.activeSession;
            } else {
              nativeAlarmBridge.cancelEmployeeRestNotification(emp.id);
            }
          }
          return {
            ...emp,
            consumedSecondsToday: 0,
            delaySecondsToday: 0,
            hasStartedRestToday: keptSession !== null,
            optedOutRemainingToday: false,
            activeSession: keptSession,
          };
        })
      );
      localStorage.setItem(STORAGE_KEYS.LAST_RESET_KEY, currentOpDayKey);
      setSelectedReportDay(currentOpDayKey);
    }
  }, [currentOpDayKey, settings.dayResetHour, settings.dayResetMinute]);

  // One-time transition check for End-of-Rest and Overtime threshold (prevents repeating notifications every second!)
  useEffect(() => {
    const overtimeThresholdMins = Math.max(1, settings.overtimeAlertAfterMinutes ?? 5);
    let updatedAny = false;

    const nextEmployees = employees.map((emp) => {
      if (!emp.activeSession || emp.activeSession.isPaused) return emp;
      const sess = emp.activeSession;
      const metrics = calculateRestSessionMetrics({
        startTimeMs: sess.startedAtMs,
        allowedMinutes: sess.allocatedUnits,
        nowMs,
        unitMs: sess.unitMs,
        isPaused: sess.isPaused,
        pausedAtMs: sess.pausedAtMs,
        totalPausedMs: sess.totalPausedMs,
      });

      if (!metrics.isValid) return emp;

      // 1. Reached End of Rest for the first time
      if (metrics.hasReachedLimit && !sess.notifiedEnd) {
        updatedAny = true;
        if (
          settings.notifyOnRestEnd !== false &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(`انتهت استراحة ${emp.name}`, {
              body: `الموظف: ${emp.name} — انتهت المدة المحددة (${sess.allocatedUnits} د). يمكنك تسجيل العودة أو التمديد.`,
              tag: `rest-end-${emp.id}`,
            });
          } catch {}
        }
        return {
          ...emp,
          activeSession: {
            ...sess,
            notifiedEnd: true,
          },
        };
      }

      // 2. Reached Overtime Threshold for the first time
      const isOvertimeThresholdReached =
        metrics.overtimeMinutes >= overtimeThresholdMins;

      if (isOvertimeThresholdReached && !sess.notifiedOvertime) {
        updatedAny = true;
        if (
          settings.notifyOnOvertime !== false &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(`تنبيه تأخير: ${emp.name}`, {
              body: `الموظف ${emp.name} متأخر عن استراحته بمقدار ${overtimeThresholdMins} دقيقة (المدة المخصصة: ${sess.allocatedUnits} د).`,
              tag: `rest-overtime-${emp.id}`,
            });
          } catch {}
        }
        return {
          ...emp,
          activeSession: {
            ...sess,
            notifiedOvertime: true,
            // Re-activate alert banner if notifyOnOvertime is enabled
            alarmAcknowledged:
              settings.notifyOnOvertime !== false ? false : sess.alarmAcknowledged,
          },
        };
      }

      return emp;
    });

    if (updatedAny) {
      setEmployees(nextEmployees);
    }
  }, [
    nowMs,
    employees,
    settings.notifyOnRestEnd,
    settings.notifyOnOvertime,
    settings.overtimeAlertAfterMinutes,
  ]);

  // Identify employees whose active rest timer has reached or exceeded the allowed duration without acknowledgement
  const unacknowledgedExpiredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.activeSession || emp.activeSession.isPaused) return false;
      const metrics = calculateRestSessionMetrics({
        startTimeMs: emp.activeSession.startedAtMs,
        allowedMinutes: emp.activeSession.allocatedUnits,
        nowMs,
        unitMs: emp.activeSession.unitMs,
        isPaused: emp.activeSession.isPaused,
        pausedAtMs: emp.activeSession.pausedAtMs,
        totalPausedMs: emp.activeSession.totalPausedMs,
      });
      return metrics.isValid && metrics.hasReachedLimit && !emp.activeSession.alarmAcknowledged;
    });
  }, [employees, nowMs]);

  const ringingNamesKey = unacknowledgedExpiredEmployees.map((e) => e.id).join(',');

  useEffect(() => {
    if (unacknowledgedExpiredEmployees.length > 0) {
      const names = unacknowledgedExpiredEmployees.map((e) => e.name).join(' و ');
      const ttsPhrase =
        settings.enablePhase2Extras && settings.enableVoiceTTS
          ? `انتهت استراحة ${names}`
          : undefined;

      soundEngine.startRestExpiredLoop(
        settings.alarmSound,
        settings.alarmVolume,
        settings.enableVibration,
        ttsPhrase
      );
    } else {
      soundEngine.stop();
    }
  }, [
    ringingNamesKey,
    settings.alarmSound,
    settings.alarmVolume,
    settings.enableVibration,
    settings.enableVoiceTTS,
    settings.enablePhase2Extras,
  ]);

  useEffect(() => {
    if (!settings.enablePhase2Extras) return;
    const now = new Date(nowMs);
    employees.forEach((emp) => {
      if (!emp.shiftStartTime) return;
      const [sh, sm] = emp.shiftStartTime.split(':').map(Number);
      if (!Number.isFinite(sh) || !Number.isFinite(sm)) return;
      const preMins = emp.shiftPreAlertMinutes ?? 10;
      const shiftDate = new Date(now);
      shiftDate.setHours(sh, sm - preMins, 0, 0);

      const alertKey = `${currentOpDayKey}-${emp.id}-${emp.shiftStartTime}`;
      if (
        now.getHours() === shiftDate.getHours() &&
        now.getMinutes() === shiftDate.getMinutes() &&
        !triggeredShiftAlertsRef.current.has(alertKey)
      ) {
        triggeredShiftAlertsRef.current.add(alertKey);
        setShiftAlertMessage({
          employeeId: emp.id,
          employeeName: emp.name,
          allowanceMinutes: emp.dailyAllowanceMinutes,
          text: `تنبيه مباشرة الدوام: يبدأ دوام الموظف "${emp.name}" بعد ${preMins} دقائق (الساعة ${emp.shiftStartTime})`,
        });
        soundEngine.playStepCompleteChime();
      }
    });
  }, [nowMs, employees, currentOpDayKey, settings.enablePhase2Extras]);

  // =========================================================
  // CENTRALIZED REST STATE & CATEGORY CLASSIFICATION
  // =========================================================
  const getEmployeeRemainingUnits = (emp: Employee): number => {
    return calculateEmployeeBalance(emp).remainingMinutes;
  };

  // Single-source-of-truth partitioned view over `employees` (no duplicate employee records)
  const categorizedEmployees = useMemo(() => {
    const groups: Record<RestCategory, Employee[]> = {
      not_taken: [],
      completed: [],
      incomplete: [],
      exceeded: [],
    };
    const seenIds = new Set<string>();
    employees.forEach((emp) => {
      if (seenIds.has(emp.id)) return;
      seenIds.add(emp.id);
      const cat = classifyEmployeeCategory(emp, nowMs);
      groups[cat].push(emp);
    });
    return groups;
  }, [employees, nowMs]);

  const activeRestCount = useMemo(
    () => employees.filter((e) => e.activeSession !== null).length,
    [employees]
  );

  // =========================================================
  // START REST HANDLERS
  // =========================================================
  const openStartRestModal = (emp: Employee) => {
    const rem = getEmployeeRemainingUnits(emp);
    const defaultDuration = rem > 0 ? Math.ceil(rem) : emp.dailyAllowanceMinutes || 15;
    setStartingEmployee(emp);
    setCustomMinutesText(String(defaultDuration));
    setStartModalError(null);
  };

  const executeStartRest = useCallback(
    (emp: Employee, durationUnits: number) => {
      const safeDuration = Math.max(1, Math.min(240, Math.round(durationUnits)));
      const currSettings = settingsRef.current;
      const unitMs = currSettings.testModeMinuteAsSecond ? 1000 : 60000;
      const startMs = Date.now();
      const session: ActiveRestSession = {
        startedAtMs: startMs,
        targetEndMs: startMs + safeDuration * unitMs,
        allocatedUnits: safeDuration,
        unitMs,
        isPaused: false,
        pausedAtMs: null,
        totalPausedMs: 0,
        alarmAcknowledged: false,
        notifiedEnd: false,
        notifiedOvertime: false,
        extendedMinutes: 0,
      };

      setEmployees((prev) =>
        prev.map((item) =>
          item.id === emp.id
            ? {
                ...item,
                hasStartedRestToday: true,
                optedOutRemainingToday: false,
                activeSession: session,
              }
            : item
        )
      );
      setStartingEmployee(null);
      setConfirmExceedModal(null);
      setStartRestPrompts((prev) => prev.filter((p) => p.employeeId !== emp.id));

      // Automatically switch to 'incomplete' tab so the user sees the running timer immediately
      setActiveCategoryTab('incomplete');

      scheduleRestNotificationsForSession(
        emp.id,
        emp.name,
        session.targetEndMs,
        safeDuration
      );

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    },
    [scheduleRestNotificationsForSession]
  );

  const handleSendStartRestNotification = async (emp: Employee) => {
    const rem = getEmployeeRemainingUnits(emp);
    const duration = rem > 0 ? Math.ceil(rem) : emp.dailyAllowanceMinutes || 30;
    await nativeAlarmBridge.sendStartRestPromptNotification(emp.id, emp.name, duration);

    setStartRestPrompts((prev) => {
      const filtered = prev.filter((p) => p.employeeId !== emp.id);
      return [
        {
          employeeId: emp.id,
          employeeName: emp.name,
          allowanceMinutes: duration,
          createdAt: new Date().toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
        ...filtered,
      ];
    });
    showNotice(
      `تم إرسال إشعار تفاعلي لبدء استراحة الموظف "${emp.name}" (${duration} دقيقة) مع زر "بدء الاستراحة".`
    );
  };

  const requestStartRest = (emp: Employee, requestedUnits: number) => {
    if (!Number.isFinite(requestedUnits) || requestedUnits < 1 || requestedUnits > 240) {
      setStartModalError('يرجى إدخال مدة صحيحة بين 1 و 240 دقيقة.');
      return;
    }
    setStartModalError(null);
    const remUnits = getEmployeeRemainingUnits(emp);
    const exceedsAllowance = requestedUnits > remUnits;
    const exceedsConcurrent =
      settings.enablePhase2Extras &&
      settings.maxConcurrentRests > 0 &&
      activeRestCount >= settings.maxConcurrentRests;

    if (exceedsAllowance || exceedsConcurrent) {
      setConfirmExceedModal({
        employee: emp,
        requestedMinutes: requestedUnits,
        remainingMinutes: remUnits,
        exceedConcurrentWarning: exceedsConcurrent,
      });
      return;
    }

    executeStartRest(emp, requestedUnits);
  };

  const handleStartWithCustomInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startingEmployee) return;
    const clean = normalizeDigitsToAscii(customMinutesText);
    const parsed = parseInt(clean, 10);
    if (!clean || isNaN(parsed) || parsed < 1 || parsed > 240) {
      setStartModalError('يرجى كتابة رقم صحيح للمدة بين 1 و 240 دقيقة.');
      return;
    }
    requestStartRest(startingEmployee, parsed);
  };

  // =========================================================
  // EDIT EMPLOYEE & REST DURATION HANDLERS
  // =========================================================
  const openEditEmployeeModal = (emp: Employee) => {
    setEditingEmployeeId(emp.id);
    setEditEmpName(emp.name);
    setEditAllowanceText(String(emp.dailyAllowanceMinutes));
    setEditEmpColor(emp.avatarColor || '#2F80ED');
    setEditModalError(null);
  };

  const editingEmployeeObj = useMemo(
    () => employees.find((e) => e.id === editingEmployeeId) || null,
    [employees, editingEmployeeId]
  );

  const handleResetSingleEmployeeToday = (empId: string) => {
    nativeAlarmBridge.cancelEmployeeRestNotification(empId);
    setEmployees((prev) =>
      prev.map((item) =>
        item.id === empId
          ? {
              ...item,
              consumedSecondsToday: 0,
              delaySecondsToday: 0,
              hasStartedRestToday: false,
              optedOutRemainingToday: false,
              activeSession: null,
            }
          : item
      )
    );
    setEditingEmployeeId(null);
    setActiveCategoryTab('not_taken');
    showNotice('تم تصفير سجل ومؤقت الموظف لهذا اليوم وإعادته لقسم «لم يأخذوا استراحتهم».');
  };

  const handleSaveEditedEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeId) return;

    const trimmedName = editEmpName.trim();
    if (!trimmedName) {
      setEditModalError('يرجى إدخال اسم الموظف.');
      return;
    }

    const cleanDigits = normalizeDigitsToAscii(editAllowanceText);
    const parsedMinutes = parseInt(cleanDigits, 10);

    if (!cleanDigits || isNaN(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 240) {
      setEditModalError('يرجى إدخال مدة استراحة صحيحة بين 1 و 240 دقيقة.');
      return;
    }

    setEmployees((prev) =>
      prev.map((item) => {
        if (item.id !== editingEmployeeId) return item;

        let updatedSession = item.activeSession;
        if (item.activeSession) {
          const sess = item.activeSession;
          const newTargetEndMs =
            sess.startedAtMs + sess.totalPausedMs + parsedMinutes * sess.unitMs;
          const isFuture = newTargetEndMs > Date.now();
          updatedSession = {
            ...sess,
            allocatedUnits: parsedMinutes,
            targetEndMs: newTargetEndMs,
            alarmAcknowledged: isFuture ? false : sess.alarmAcknowledged,
            notifiedEnd: isFuture ? false : sess.notifiedEnd,
            notifiedOvertime: isFuture ? false : sess.notifiedOvertime,
          };
          if (!sess.isPaused) {
            if (isFuture) {
              scheduleRestNotificationsForSession(
                item.id,
                trimmedName,
                newTargetEndMs,
                parsedMinutes
              );
            } else {
              nativeAlarmBridge.cancelEmployeeRestNotification(item.id);
            }
          }
        }

        return {
          ...item,
          name: trimmedName,
          dailyAllowanceMinutes: parsedMinutes,
          avatarColor: editEmpColor,
          activeSession: updatedSession,
        };
      })
    );

    setEditingEmployeeId(null);
    setEditModalError(null);
    showNotice(`تم حفظ مدة الاستراحة لـ "${trimmedName}" (${parsedMinutes} دقيقة) بنجاح.`);
  };

  // =========================================================
  // ACTIVE TIMER CONTROLS & NOTIFICATION ACTION EXECUTORS
  // =========================================================
  const handleTogglePause = (empId: string) => {
    const currentNow = Date.now();
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId || !emp.activeSession) return emp;
        const sess = emp.activeSession;
        if (!sess.isPaused) {
          nativeAlarmBridge.cancelEmployeeRestNotification(emp.id);
          return {
            ...emp,
            activeSession: {
              ...sess,
              isPaused: true,
              pausedAtMs: currentNow,
            },
          };
        } else {
          const pausedDelta =
            sess.pausedAtMs && currentNow > sess.pausedAtMs
              ? currentNow - sess.pausedAtMs
              : 0;
          const newTotalPausedMs = sess.totalPausedMs + pausedDelta;
          const newTargetEndMs =
            sess.startedAtMs + newTotalPausedMs + sess.allocatedUnits * sess.unitMs;
          scheduleRestNotificationsForSession(
            emp.id,
            emp.name,
            newTargetEndMs,
            sess.allocatedUnits
          );
          return {
            ...emp,
            activeSession: {
              ...sess,
              isPaused: false,
              pausedAtMs: null,
              totalPausedMs: newTotalPausedMs,
              targetEndMs: newTargetEndMs,
            },
          };
        }
      })
    );
  };

  const handleExtendRestMinutes = useCallback(
    (empId: string, extraMinutes = 5) => {
      const safeExtra = Math.max(1, Math.min(120, Math.round(extraMinutes)));
      let targetEmpName = '';
      let newTotalAllocated = 0;

      setEmployees((prev) =>
        prev.map((emp) => {
          if (emp.id !== empId || !emp.activeSession) return emp;
          targetEmpName = emp.name;
          const sess = emp.activeSession;
          const now = Date.now();
          // Ensure extending from an already-expired session gives a future end time
          const currentElapsedUnits = Math.floor(
            Math.max(0, now - sess.startedAtMs - sess.totalPausedMs) / sess.unitMs
          );
          const baseUnits = Math.max(sess.allocatedUnits, currentElapsedUnits);
          const newAllocated = Math.min(240, baseUnits + safeExtra);
          newTotalAllocated = newAllocated;
          const newTargetEndMs =
            sess.startedAtMs + sess.totalPausedMs + newAllocated * sess.unitMs;

          if (!sess.isPaused) {
            scheduleRestNotificationsForSession(
              emp.id,
              emp.name,
              newTargetEndMs,
              newAllocated
            );
          }

          return {
            ...emp,
            activeSession: {
              ...sess,
              allocatedUnits: newAllocated,
              targetEndMs: newTargetEndMs,
              alarmAcknowledged: false,
              notifiedEnd: false,
              notifiedOvertime: false,
              extendedMinutes: (sess.extendedMinutes || 0) + safeExtra,
            },
          };
        })
      );

      if (targetEmpName) {
        setActiveCategoryTab('incomplete');
        showNotice(
          `تم تمديد استراحة الموظف "${targetEmpName}" بمقدار +${safeExtra} دقائق (الإجمالي: ${newTotalAllocated} د).`
        );
      }
    },
    [scheduleRestNotificationsForSession, showNotice]
  );

  const handleCancelRest = (empId: string) => {
    nativeAlarmBridge.cancelEmployeeRestNotification(empId);
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        return {
          ...emp,
          activeSession: null,
          hasStartedRestToday: emp.consumedSecondsToday > 0,
        };
      })
    );
  };

  const handleAcknowledgeAlarm = (empId: string) => {
    nativeAlarmBridge.cancelEmployeeRestNotification(empId);
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId || !emp.activeSession) return emp;
        return {
          ...emp,
          activeSession: {
            ...emp.activeSession,
            alarmAcknowledged: true,
          },
        };
      })
    );
  };

  const handleEmployeeReturned = useCallback(
    (emp: Employee, markSatisfiedEarly = false, customEndTimestampMs?: number) => {
      if (!emp.activeSession) return;
      nativeAlarmBridge.cancelEmployeeRestNotification(emp.id);
      const sess = emp.activeSession;
      const rawEndMs =
        customEndTimestampMs && customEndTimestampMs >= sess.startedAtMs
          ? customEndTimestampMs
          : Date.now();
      const endMs = sess.isPaused && sess.pausedAtMs ? sess.pausedAtMs : rawEndMs;

      const metrics = calculateRestSessionMetrics({
        startTimeMs: sess.startedAtMs,
        allowedMinutes: sess.allocatedUnits,
        nowMs: endMs,
        unitMs: sess.unitMs,
        isPaused: sess.isPaused,
        pausedAtMs: sess.pausedAtMs,
        totalPausedMs: sess.totalPausedMs,
      });

      const isTestOption = sess.unitMs === 1000;

      // Normalize elapsed & overtime to STANDARD seconds (60 standard seconds = 1 minute of rest)
      const actualStandardSeconds = isTestOption
        ? Math.max(60, Math.round((metrics.elapsedMs / 1000) * 60))
        : Math.max(1, Math.round(metrics.elapsedMs / 1000));

      const sessionDelayStandardSeconds = isTestOption
        ? Math.max(0, Math.round((metrics.overtimeMs / 1000) * 60))
        : Math.max(0, Math.round(metrics.overtimeMs / 1000));

      const newTotalConsumedSeconds = emp.consumedSecondsToday + actualStandardSeconds;
      const newTotalDelaySeconds = emp.delaySecondsToday + sessionDelayStandardSeconds;

      const allowanceTotalSeconds = emp.dailyAllowanceMinutes * 60;
      const remainingAfterSeconds = allowanceTotalSeconds - newTotalConsumedSeconds;

      const takenMinutesRounded = Math.max(1, Math.round(actualStandardSeconds / 60));
      const remainingMinutesRounded =
        Math.max(0, Math.round((remainingAfterSeconds / 60) * 10) / 10);
      const delayMinutesRounded = Math.floor(sessionDelayStandardSeconds / 60);
      const exceededTotalMinutesRounded = Math.round(
        Math.max(0, newTotalConsumedSeconds - allowanceTotalSeconds) / 60
      );

      const messageLines: string[] = [];
      let isLateOrExceeded = false;

      const isCompletedNow = remainingMinutesRounded <= 0 || markSatisfiedEarly;

      if (sessionDelayStandardSeconds > 0 || remainingAfterSeconds < 0) {
        isLateOrExceeded = true;
        if (sessionDelayStandardSeconds > 0) {
          const delayFormatted =
            delayMinutesRounded > 0
              ? `${delayMinutesRounded} دقيقة`
              : formatDurationArabic(sessionDelayStandardSeconds);
          messageLines.push(
            `${emp.name} تأخر ${delayFormatted} بعد انتهاء مدة استراحته (${sess.allocatedUnits} د)`
          );
        }
        if (remainingAfterSeconds < 0) {
          const exceedFormatted =
            exceededTotalMinutesRounded > 0
              ? `${exceededTotalMinutesRounded} دقيقة`
              : formatDurationArabic(Math.abs(remainingAfterSeconds));
          messageLines.push(`تجاوز رصيده اليومي بمقدار ${exceedFormatted}`);
        } else if (remainingMinutesRounded > 0 && !markSatisfiedEarly) {
          messageLines.push(`بقي له ${remainingMinutesRounded} دقيقة من رصيده اليومي`);
        } else {
          messageLines.push(`${emp.name} أنهى رصيد استراحته اليومي`);
        }
      } else if (isCompletedNow) {
        messageLines.push(
          `${emp.name} أنهى استراحته في الوقت المحدد (${takenMinutesRounded} دقيقة)`
        );
      } else {
        messageLines.push(
          `${emp.name} أخذ ${takenMinutesRounded} دقيقة (أنهى مبكراً)، وبقي له ${remainingMinutesRounded} دقيقة`
        );
      }

      const summaryText = messageLines.join(' — ');
      const opDayKey = computeOperationalDayKey(
        new Date(endMs),
        settingsRef.current.dayResetHour,
        settingsRef.current.dayResetMinute
      );

      const newLog: RestLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dayKey: opDayKey,
        employeeId: emp.id,
        employeeName: emp.name,
        startedAtIso: new Date(metrics.startTimeMs || endMs).toISOString(),
        endedAtIso: new Date(endMs).toISOString(),
        allocatedMinutes: sess.allocatedUnits,
        actualSeconds: actualStandardSeconds,
        delaySeconds: sessionDelayStandardSeconds,
        remainingAfterSeconds: Math.max(0, remainingAfterSeconds),
        summaryMessage: summaryText,
        wasTestMode: false,
      };

      setLogs((prev) => [newLog, ...prev]);

      setEmployees((prev) =>
        prev.map((item) =>
          item.id === emp.id
            ? {
                ...item,
                consumedSecondsToday: newTotalConsumedSeconds,
                delaySecondsToday: newTotalDelaySeconds,
                hasStartedRestToday: true,
                optedOutRemainingToday: markSatisfiedEarly
                  ? true
                  : item.optedOutRemainingToday,
                activeSession: null,
              }
            : item
        )
      );

      // Move active tab to the employee's resulting category
      if (isCompletedNow) {
        setActiveCategoryTab('completed');
      } else {
        setActiveCategoryTab('incomplete');
      }

      setReturnBannerMessages((prev) => [
        {
          id: newLog.id,
          employeeName: emp.name,
          lines: messageLines,
          timestamp: new Date(endMs).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          isLate: isLateOrExceeded,
        },
        ...prev,
      ]);
    },
    []
  );

  // Process interactive notification actions from Android Status Bar / BroadcastReceiver / LocalNotifications
  const processNotificationAction = useCallback(
    (payload: RestNotificationActionPayload) => {
      if (!payload || !payload.action) return;

      if (payload.action === 'OPEN_REST_PAGE') {
        onNavigateToRest?.();
        setSubTab('employees');
        if (payload.employeeId) {
          const target = employeesRef.current.find((e) => e.id === payload.employeeId);
          if (target) {
            const cat = classifyEmployeeCategory(target, Date.now());
            setActiveCategoryTab(cat);
          }
        }
        return;
      }

      const targetEmp = employeesRef.current.find((e) => e.id === payload.employeeId);
      if (!targetEmp) return;

      if (payload.action === 'MARK_RETURNED' || payload.action === 'END_REST') {
        onNavigateToRest?.();
        setSubTab('employees');
        if (targetEmp.activeSession) {
          handleEmployeeReturned(targetEmp, false, payload.timestampMs);
          showNotice(
            `تم تسجيل عودة الموظف "${targetEmp.name}" من خلال زر الإشعار وإيقاف المؤقت.`
          );
        }
      } else if (payload.action === 'EXTEND_REST') {
        onNavigateToRest?.();
        setSubTab('employees');
        const extraMins = payload.extraMinutes && payload.extraMinutes > 0 ? payload.extraMinutes : 5;
        if (targetEmp.activeSession) {
          handleExtendRestMinutes(targetEmp.id, extraMins);
        } else {
          executeStartRest(targetEmp, extraMins);
        }
      } else if (payload.action === 'START_REST') {
        onNavigateToRest?.();
        setSubTab('employees');
        if (!targetEmp.activeSession) {
          const rem = calculateEmployeeBalance(targetEmp).remainingMinutes;
          const dur =
            payload.extraMinutes && payload.extraMinutes > 0
              ? payload.extraMinutes
              : rem > 0
              ? Math.ceil(rem)
              : targetEmp.dailyAllowanceMinutes || 30;
          executeStartRest(targetEmp, dur);
          showNotice(`تم بدء استراحة الموظف "${targetEmp.name}" (${dur} د) من خلال زر الإشعار.`);
        }
      }
    },
    [executeStartRest, handleEmployeeReturned, handleExtendRestMinutes, onNavigateToRest, showNotice]
  );

  // Subscribe to real-time notification actions AND consume any queued background actions on mount/resume
  useEffect(() => {
    let isMounted = true;

    const drainPendingActions = async () => {
      const pending = await nativeAlarmBridge.consumePendingRestActions();
      if (!isMounted || pending.length === 0) return;
      pending.forEach((act) => {
        processNotificationAction(act);
      });
    };

    drainPendingActions();

    const unsubscribe = nativeAlarmBridge.onRestNotificationAction((payload) => {
      if (!isMounted) return;
      processNotificationAction(payload);
    });

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        drainPendingActions();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [processNotificationAction]);

  const handleMarkSatisfied = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === empId
          ? { ...emp, hasStartedRestToday: true, optedOutRemainingToday: true }
          : emp
      )
    );
    showNotice('تم اعتماد إنهاء الاستراحة ونقل الموظف إلى قسم «أنهوا استراحتهم».');
  };

  const handleReopenIncomplete = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === empId ? { ...emp, optedOutRemainingToday: false } : emp
      )
    );
  };

  const handleAddSingleEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) {
      setNewEmpError('يرجى إدخال اسم الموظف.');
      return;
    }
    const cleanDigits = normalizeDigitsToAscii(newEmpAllowanceText);
    const parsedAllowance = parseInt(cleanDigits, 10);
    if (!cleanDigits || isNaN(parsedAllowance) || parsedAllowance < 1 || parsedAllowance > 240) {
      setNewEmpError('يرجى إدخال مدة استراحة صحيحة بين 1 و 240 دقيقة.');
      return;
    }

    const created: Employee = {
      id: `emp-${Date.now()}`,
      name: newEmpName.trim(),
      dailyAllowanceMinutes: parsedAllowance,
      consumedSecondsToday: 0,
      delaySecondsToday: 0,
      hasStartedRestToday: false,
      optedOutRemainingToday: false,
      avatarColor: newEmpColor,
      activeSession: null,
    };
    setEmployees((prev) => [...prev, created]);
    setNewEmpName('');
    setNewEmpAllowanceText('30');
    setNewEmpError(null);
    setSubTab('employees');
    setActiveCategoryTab('not_taken');
    showNotice(`تمت إضافة الموظف "${created.name}" بمدة استراحة ${parsedAllowance} دقيقة.`);
  };

  const handleBulkAddEmployees = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const palette = ['#2F80ED', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316'];
    const nowStamp = Date.now();
    const newItems: Employee[] = lines.map((name, idx) => ({
      id: `emp-${nowStamp}-${idx}`,
      name,
      dailyAllowanceMinutes: 30,
      consumedSecondsToday: 0,
      delaySecondsToday: 0,
      hasStartedRestToday: false,
      optedOutRemainingToday: false,
      avatarColor: palette[idx % palette.length],
      activeSession: null,
    }));

    setEmployees((prev) => [...prev, ...newItems]);
    setBulkText('');
    setShowBulkModal(false);
    setSubTab('employees');
    setActiveCategoryTab('not_taken');
  };

  const handleConfirmDeleteEmployee = () => {
    if (!deletingEmployee) return;
    if (deletingEmployee.activeSession) {
      nativeAlarmBridge.cancelEmployeeRestNotification(deletingEmployee.id);
    }
    setEmployees((prev) => prev.filter((item) => item.id !== deletingEmployee.id));
    setDeletingEmployee(null);
  };

  const handleStartNewDayNow = () => {
    employees.forEach((emp) => {
      if (emp.activeSession) {
        nativeAlarmBridge.cancelEmployeeRestNotification(emp.id);
      }
    });
    setEmployees((prev) =>
      prev.map((emp) => ({
        ...emp,
        consumedSecondsToday: 0,
        delaySecondsToday: 0,
        hasStartedRestToday: false,
        optedOutRemainingToday: false,
        activeSession: null,
      }))
    );
    localStorage.setItem(STORAGE_KEYS.LAST_RESET_KEY, currentOpDayKey);
    setConfirmNewDayModal(false);
    setReturnBannerMessages([]);
    setStartRestPrompts([]);
    setActiveCategoryTab('not_taken');
    showNotice('تم بدء يوم عمل جديد وإعادة ضبط أرصدة الاستراحات لجميع الموظفين.');
  };

  const handleExportBackup = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      employees,
      logs,
      settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartmorning-rest-backup-${currentOpDayKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || '{}'));
        if (Array.isArray(parsed.employees)) {
          const { employees: repaired } = sanitizeAndRepairEmployees(
            parsed.employees,
            Date.now(),
            settings.dayResetHour,
            settings.dayResetMinute
          );
          setEmployees(repaired);
        }
        if (Array.isArray(parsed.logs)) setLogs(parsed.logs);
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      } catch {}
    };
    reader.readAsText(file);
  };

  const generateFormattedArabicReport = (dayKey: string): string => {
    const dayLogs = logs.filter((l) => l.dayKey === dayKey);
    const lines: string[] = [
      `📋 *تقرير استراحات الموظفين — SmartMorning*`,
      `📅 التاريخ: ${dayKey}`,
      `────────────────────`,
    ];

    employees.forEach((emp) => {
      const empLogs = dayLogs.filter((l) => l.employeeId === emp.id);
      const { allowanceMinutes, remainingMinutes, delayMinutes } = calculateEmployeeBalance(emp);

      lines.push(
        `👤 *${emp.name}* (الرصيد: ${allowanceMinutes} د | المتبقي: ${remainingMinutes} د${
          delayMinutes > 0 ? ` | التأخير: ${delayMinutes} د` : ''
        })`
      );

      if (empLogs.length === 0) {
        lines.push(`   • لم يأخذ استراحة في هذا اليوم`);
      } else {
        empLogs.forEach((l, idx) => {
          const startStr = new Date(l.startedAtIso).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const endStr = new Date(l.endedAtIso).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
          });
          lines.push(
            `   ${idx + 1}) من ${startStr} إلى ${endStr} — ${l.summaryMessage}`
          );
        });
      }
    });

    return lines.join('\n');
  };

  const [copiedReportMsg, setCopiedReportMsg] = useState(false);
  const handleShareReport = async () => {
    const text = generateFormattedArabicReport(selectedReportDay);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `تقرير استراحات الموظفين - ${selectedReportDay}`,
          text,
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReportMsg(true);
      setTimeout(() => setCopiedReportMsg(false), 3000);
    } catch {}
  };

  const availableLogDays = useMemo(() => {
    const set = new Set<string>([currentOpDayKey]);
    logs.forEach((l) => set.add(l.dayKey));
    return Array.from(set).sort().reverse();
  }, [logs, currentOpDayKey]);

  const categoryTabsMeta: {
    id: RestCategory;
    label: string;
    count: number;
    badgeBg: string;
    badgeText: string;
    emptyMessage: string;
  }[] = [
    {
      id: 'not_taken',
      label: 'لم يأخذوا استراحتهم',
      count: categorizedEmployees.not_taken.length,
      badgeBg: 'bg-[#EBF3FE]',
      badgeText: 'text-[#2F80ED]',
      emptyMessage: 'جميع الموظفين بدأوا أو أنهوا استراحاتهم اليوم.',
    },
    {
      id: 'completed',
      label: 'أنهوا استراحتهم',
      count: categorizedEmployees.completed.length,
      badgeBg: 'bg-[#E6F8EF]',
      badgeText: 'text-[#10B981]',
      emptyMessage: 'لا يوجد موظفون أنهوا مدة استراحتهم بالكامل حتى الآن.',
    },
    {
      id: 'incomplete',
      label: 'لم يكملوا استراحتهم',
      count: categorizedEmployees.incomplete.length,
      badgeBg: 'bg-[#FFF4E5]',
      badgeText: 'text-[#F59E0B]',
      emptyMessage: 'لا توجد استراحات جارية أو متوقفة مبكراً في الوقت الحالي.',
    },
    {
      id: 'exceeded',
      label: 'تجاوزوا مدة الاستراحة',
      count: categorizedEmployees.exceeded.length,
      badgeBg: 'bg-rose-100',
      badgeText: 'text-rose-600',
      emptyMessage: 'ممتاز! لا يوجد أي موظف متجاوز لمدة الاستراحة حالياً.',
    },
  ];

  const activeCategoryEmployees = categorizedEmployees[activeCategoryTab];
  const activeCategoryMeta =
    categoryTabsMeta.find((c) => c.id === activeCategoryTab) || categoryTabsMeta[0];

  // If the user is on another tab (e.g. Home / Alarms), render any active interactive Rest Notification Banner globally at the top
  if (!isRestTabVisible) {
    if (unacknowledgedExpiredEmployees.length === 0) return null;
    return (
      <div className="mb-4 space-y-3">
        {unacknowledgedExpiredEmployees.map((emp) => {
          const sess = emp.activeSession!;
          const metrics = calculateRestSessionMetrics({
            startTimeMs: sess.startedAtMs,
            allowedMinutes: sess.allocatedUnits,
            nowMs,
            unitMs: sess.unitMs,
            isPaused: sess.isPaused,
            pausedAtMs: sess.pausedAtMs,
            totalPausedMs: sess.totalPausedMs,
          });
          const overtimeThreshold = settings.overtimeAlertAfterMinutes ?? 5;
          const isOvertimeAlert = metrics.overtimeMinutes >= overtimeThreshold;
          const delayLabel =
            metrics.overtimeMinutes > 0
              ? `${metrics.overtimeMinutes} دقيقة`
              : `${Math.max(1, Math.ceil(metrics.overtimeMs / 1000))} ثانية`;

          return (
            <div
              key={emp.id}
              className="rounded-3xl border-2 border-rose-500 bg-rose-600 text-white p-5 shadow-xl space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-7 h-7 text-white shrink-0 animate-bounce" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/20 text-[11px] font-extrabold">
                        {isOvertimeAlert
                          ? 'إشعار تأخير موظف'
                          : 'إشعار انتهاء مدة الاستراحة'}
                      </span>
                      <span className="font-mono text-xs text-rose-100">
                        المدة المخصصة: {sess.allocatedUnits} د
                      </span>
                    </div>
                    <h4 className="text-lg font-extrabold mt-0.5">
                      الموظف: {emp.name} — التأخير الحالي: +{delayLabel}
                    </h4>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateToRest?.()}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold cursor-pointer"
                >
                  فتح إدارة الاستراحات
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleEmployeeReturned(emp, false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>تمت العودة (إنهاء الاستراحة)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExtendRestMinutes(emp.id, 5)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300 font-extrabold text-xs cursor-pointer shadow-sm"
                >
                  تمديد +5 د
                </button>

                <button
                  type="button"
                  onClick={() => handleExtendRestMinutes(emp.id, 10)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-300 text-slate-950 hover:bg-amber-200 font-extrabold text-xs cursor-pointer shadow-sm"
                >
                  تمديد +10 د
                </button>

                <button
                  type="button"
                  onClick={() => handleAcknowledgeAlarm(emp.id)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-800/80 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>كتم الصوت</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#172B4D]">إدارة الاستراحات</h2>
          <p className="text-xs text-[#6B7C93] mt-0.5">
            يوم العمل: <span className="font-mono">{currentOpDayKey}</span> · الشاشة:{' '}
            {wakeLockActiveStatus ? 'مضاءة (Wake Lock)' : 'عادية'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                testModeMinuteAsSecond: !prev.testModeMinuteAsSecond,
              }))
            }
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              settings.testModeMinuteAsSecond
                ? 'bg-[#FFF4E5] border-[#F59E0B] text-[#B45309]'
                : 'bg-white border-[#E6EDF5] text-[#6B7C93] hover:text-[#172B4D]'
            }`}
          >
            {settings.testModeMinuteAsSecond
              ? '✓ وضع الاختبار (1 د = 1 ث)'
              : 'وضع الاختبار (1 د = 1 ث)'}
          </button>

          <button
            onClick={() => setConfirmNewDayModal(true)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-[#172B4D] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            title="بدء يوم عمل جديد وتصفير استهلاك اليوم"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#2F80ED]" />
            <span>بدء يوم جديد</span>
          </button>

          <button
            onClick={() => {
              setNewEmpError(null);
              setSubTab('add_employee');
            }}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#1B365D] hover:bg-[#0F2342] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موظف</span>
          </button>

          <button
            onClick={() => setSubTab('settings')}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#E6EDF5] text-[#172B4D] text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#2F80ED]" />
            <span>إعدادات</span>
          </button>
        </div>
      </div>

      {/* Status Toast Notification */}
      {statusToast && (
        <div className="sm-card p-3.5 border-emerald-500/40 bg-[#E6F8EF] text-[#065F46] text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>{statusToast}</span>
          </div>
          <button
            onClick={() => setStatusToast(null)}
            className="text-[#065F46] underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Primary Segmented Switcher: الموظفون | السجل */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#E6EDF5] rounded-2xl max-w-md">
        <button
          onClick={() => setSubTab('employees')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'employees'
              ? 'bg-white text-[#1B365D] shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          الموظفون ({employees.length})
        </button>
        <button
          onClick={() => setSubTab('logs')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'logs'
              ? 'bg-white text-[#1B365D] shadow-xs'
              : 'text-[#6B7C93] hover:text-[#172B4D]'
          }`}
        >
          السجل ({logs.filter((l) => l.dayKey === currentOpDayKey).length})
        </button>
      </div>

      {/* Shift Start Pre-Alert Banner with Direct Interactive Start Rest Button */}
      {shiftAlertMessage && (
        <div className="sm-card p-4 border-amber-400 bg-[#FFF8E6] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs font-bold text-[#92400E]">
            <BellRing className="w-5 h-5 text-[#F59E0B] shrink-0" />
            <span>{shiftAlertMessage.text}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const emp = employees.find((e) => e.id === shiftAlertMessage.employeeId);
                if (emp && !emp.activeSession) {
                  executeStartRest(emp, shiftAlertMessage.allowanceMinutes);
                }
                setShiftAlertMessage(null);
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>بدء الاستراحة</span>
            </button>
            <button
              type="button"
              onClick={() => setShiftAlertMessage(null)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Interactive Start-Rest Notification Prompts (for employees who have not started rest yet) */}
      {startRestPrompts.length > 0 && (
        <div className="space-y-2.5">
          {startRestPrompts.map((prompt) => {
            const emp = employees.find((e) => e.id === prompt.employeeId);
            if (!emp || emp.activeSession) return null;
            return (
              <div
                key={prompt.employeeId}
                className="rounded-3xl border-2 border-[#2F80ED] bg-[#EBF3FE] p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#1B365D] text-white text-[10px] font-extrabold">
                      إشعار تفاعلي لبدء الاستراحة · {prompt.createdAt}
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-[#172B4D]">
                    الموظف: {emp.name} — لم يبدأ استراحته بعد (الرصيد المتاح: {prompt.allowanceMinutes} دقيقة)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => executeStartRest(emp, prompt.allowanceMinutes)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>بدء الاستراحة ({prompt.allowanceMinutes} د)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setStartRestPrompts((prev) =>
                        prev.filter((p) => p.employeeId !== prompt.employeeId)
                      )
                    }
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-white text-[#6B7C93] hover:text-[#172B4D] text-xs font-bold cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INTERACTIVE NOTIFICATION BANNER WHEN ANY EMPLOYEE REST ENDS OR OVERRUNS */}
      {unacknowledgedExpiredEmployees.length > 0 && (
        <div className="space-y-3">
          {unacknowledgedExpiredEmployees.map((emp) => {
            const sess = emp.activeSession!;
            const metrics = calculateRestSessionMetrics({
              startTimeMs: sess.startedAtMs,
              allowedMinutes: sess.allocatedUnits,
              nowMs,
              unitMs: sess.unitMs,
              isPaused: sess.isPaused,
              pausedAtMs: sess.pausedAtMs,
              totalPausedMs: sess.totalPausedMs,
            });
            const overtimeThreshold = settings.overtimeAlertAfterMinutes ?? 5;
            const isOvertimeAlert = metrics.overtimeMinutes >= overtimeThreshold;
            const delayLabel =
              metrics.overtimeMinutes > 0
                ? `${metrics.overtimeMinutes} دقيقة`
                : `${Math.max(1, Math.ceil(metrics.overtimeMs / 1000))} ثانية`;

            return (
              <div
                key={emp.id}
                className="rounded-3xl border-2 border-rose-500 bg-rose-600 text-white p-5 shadow-xl space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Volume2 className="w-7 h-7 text-white shrink-0 mt-0.5 animate-bounce" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-white/20 text-[11px] font-extrabold">
                          {isOvertimeAlert
                            ? 'سبب التنبيه: الموظف متأخر عن الاستراحة'
                            : 'سبب التنبيه: انتهت مدة الاستراحة'}
                        </span>
                        <span className="font-mono text-xs text-rose-100">
                          المدة المخصصة: {sess.allocatedUnits} د · المنقضي: {metrics.elapsedMinutes} د
                        </span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-extrabold">
                        الموظف: {emp.name} — مقدار التأخير الحالي: +{delayLabel}
                      </h3>
                      <p className="text-xs text-rose-100">
                        اختر إجراءً فورياً من أزرار الإشعار أدناه لتسجيل عودة الموظف أو تمديد استراحته:
                      </p>
                    </div>
                  </div>
                </div>

                {/* Interactive Action Buttons inside Notification */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-white/20">
                  <button
                    type="button"
                    onClick={() => handleEmployeeReturned(emp, false)}
                    className="min-h-[46px] px-4 py-2 rounded-2xl bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تمت العودة / إنهاء الاستراحة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExtendRestMinutes(emp.id, 5)}
                    className="min-h-[46px] px-4 py-2 rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span>تمديد الاستراحة (+5 د)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExtendRestMinutes(emp.id, 10)}
                    className="min-h-[46px] px-4 py-2 rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span>تمديد الاستراحة (+10 د)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAcknowledgeAlarm(emp.id)}
                    className="min-h-[46px] px-4 py-2 rounded-2xl bg-rose-800/80 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>كتم الصوت فقط</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BIG PERSISTENT ARABIC RETURN SUMMARY CARDS */}
      {returnBannerMessages.length > 0 && (
        <div className="space-y-3">
          {returnBannerMessages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-3xl border-2 p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                msg.isLate
                  ? 'border-rose-400 bg-rose-50 text-rose-950'
                  : 'border-emerald-400 bg-emerald-50 text-emerald-950'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[#6B7C93] font-semibold">
                  <span>تم التسجيل في السجل</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>
                {msg.lines.map((line, idx) => (
                  <p key={idx} className="text-lg sm:text-xl font-bold leading-snug">
                    {line}
                  </p>
                ))}
              </div>

              <button
                onClick={() =>
                  setReturnBannerMessages((prev) =>
                    prev.filter((item) => item.id !== msg.id)
                  )
                }
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1B365D] text-white font-bold text-xs self-end sm:self-center cursor-pointer"
              >
                إغلاق الرسالة
              </button>
            </div>
          ))}
        </div>
      )}

      {/* =========================================================
          VIEW 1: EMPLOYEES & 4 ORGANIZED SECTIONS
         ========================================================= */}
      {subTab === 'employees' && (
        <div className="space-y-5">
          {/* 4 Category Tabs Bar at the Top of the Employees List */}
          <div className="sm-card p-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {categoryTabsMeta.map((tab) => {
                const isSelected = activeCategoryTab === tab.id;
                const isUrgentExceeded = tab.id === 'exceeded' && tab.count > 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCategoryTab(tab.id)}
                    className={`min-h-[52px] px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1B365D] text-white shadow-sm'
                        : isUrgentExceeded
                        ? 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100'
                        : 'bg-[#F4F7FB] text-[#172B4D] hover:bg-[#E6EDF5]'
                    }`}
                  >
                    <span className="truncate text-right">{tab.label}</span>
                    <span
                      className={`font-mono tabular-nums px-2.5 py-0.5 rounded-xl text-xs font-extrabold shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : `${tab.badgeBg} ${tab.badgeText}`
                      }`}
                    >
                      ({tab.count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Category Section Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-[#172B4D]">
                {activeCategoryMeta.label}
              </h3>
              <span
                className={`font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-xl ${activeCategoryMeta.badgeBg} ${activeCategoryMeta.badgeText}`}
              >
                {activeCategoryMeta.count}
              </span>
            </div>

            {categorizedEmployees.exceeded.length > 0 &&
              activeCategoryTab !== 'exceeded' && (
                <button
                  onClick={() => setActiveCategoryTab('exceeded')}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    يوجد ({categorizedEmployees.exceeded.length}) في قسم تجاوز المدة
                  </span>
                </button>
              )}
          </div>

          {/* Filtered Employees List for the Selected Category */}
          {activeCategoryEmployees.length === 0 ? (
            <div className="sm-card p-8 text-center space-y-3">
              <p className="text-sm font-bold text-[#6B7C93]">
                {activeCategoryMeta.emptyMessage}
              </p>
              {activeCategoryTab !== 'not_taken' &&
                categorizedEmployees.not_taken.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategoryTab('not_taken')}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#1B365D] text-xs font-bold cursor-pointer"
                  >
                    عرض الموظفين الذين لم يأخذوا استراحتهم ({categorizedEmployees.not_taken.length})
                  </button>
                )}
            </div>
          ) : (
            <div className="space-y-3.5">
              {activeCategoryEmployees.map((emp) => {
                const detailedState = getEmployeeDetailedState(emp, nowMs);
                const {
                  allowanceMinutes,
                  consumedMinutes: consumedUnits,
                  remainingMinutes: remUnits,
                  delayMinutes: totalDelayUnits,
                } = calculateEmployeeBalance(emp);

                const sessionMetrics = emp.activeSession
                  ? calculateRestSessionMetrics({
                      startTimeMs: emp.activeSession.startedAtMs,
                      allowedMinutes: emp.activeSession.allocatedUnits,
                      nowMs,
                      unitMs: emp.activeSession.unitMs,
                      isPaused: emp.activeSession.isPaused,
                      pausedAtMs: emp.activeSession.pausedAtMs,
                      totalPausedMs: emp.activeSession.totalPausedMs,
                    })
                  : null;

                const isOvertime = sessionMetrics ? sessionMetrics.isExceeded : false;
                const timerDisplay = sessionMetrics ? sessionMetrics.timerDisplay : '00:00';

                // Format live overtime in clear Arabic without unit confusion
                let overtimeFormattedArabic = '';
                if (sessionMetrics && sessionMetrics.isExceeded) {
                  if (sessionMetrics.unitMs === 1000) {
                    const simOverMins = Math.max(1, sessionMetrics.overtimeMinutes);
                    overtimeFormattedArabic = `${simOverMins} دقيقة`;
                  } else if (sessionMetrics.overtimeMinutes > 0) {
                    overtimeFormattedArabic = formatDurationArabic(
                      Math.floor(sessionMetrics.overtimeMs / 1000)
                    );
                  } else {
                    overtimeFormattedArabic = `${Math.max(
                      1,
                      Math.ceil(sessionMetrics.overtimeMs / 1000)
                    )} ثانية`;
                  }
                }

                return (
                  <div
                    key={emp.id}
                    className={`sm-card p-5 space-y-4 transition-all ${
                      detailedState === 'active_exceeded'
                        ? 'border-2 border-rose-500 bg-rose-50/30'
                        : ''
                    }`}
                  >
                    {/* Employee Card Top Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      {/* Right in RTL: Avatar + Name + Duration Details */}
                      <div className="flex items-center gap-3.5">
                        <div
                          style={{ backgroundColor: emp.avatarColor || '#1B365D' }}
                          className="w-12 h-12 rounded-full text-white font-bold text-base flex items-center justify-center shrink-0 shadow-xs"
                        >
                          {emp.name.slice(0, 1)}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-extrabold text-[#172B4D]">
                              {emp.name}
                            </h4>
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#F0F4F9] text-[#1B365D] font-mono text-xs font-bold">
                              المدة المخصصة: {allowanceMinutes} د
                            </span>
                          </div>

                          {/* Clear Status Description per Section */}
                          <div className="text-xs font-bold">
                            {detailedState === 'not_started' && (
                              <span className="text-[#6B7C93]">
                                لم يبدأ الاستراحة بعد · الرصيد المتاح بالكامل ({allowanceMinutes} دقيقة)
                              </span>
                            )}

                            {detailedState === 'active_in_progress' && sessionMetrics && (
                              <span className="text-[#F59E0B]">
                                استراحة جارية الآن ({sessionMetrics.allowedMinutes} د) — المنقضي{' '}
                                {sessionMetrics.elapsedMinutes} د والمتبقي{' '}
                                {sessionMetrics.remainingMinutes} د
                              </span>
                            )}

                            {detailedState === 'ended_early_partial' && (
                              <span className="text-[#F59E0B]">
                                أنهى استراحة مبكراً (استهلك {consumedUnits} د) · متبقي له{' '}
                                <strong className="font-mono text-[#172B4D]">{remUnits} دقيقة</strong>
                              </span>
                            )}

                            {detailedState === 'active_exceeded' && sessionMetrics && (
                              <span className="text-rose-600">
                                متأخر عن موعد انتهاء استراحته ({sessionMetrics.allowedMinutes} د) بمقدار{' '}
                                <strong>{overtimeFormattedArabic}</strong>
                              </span>
                            )}

                            {detailedState === 'completed_full' && (
                              <span className="text-[#10B981]">
                                أنهى مدة استراحته المطلوبة بالكامل ({consumedUnits} د من {allowanceMinutes} د)
                                {totalDelayUnits > 0 ? ` · تأخير مسجل: ${totalDelayUnits} د` : ''}
                              </span>
                            )}

                            {detailedState === 'completed_early_approved' && (
                              <span className="text-[#10B981]">
                                أنهى استراحته باعتماد الاكتفاء (استهلك {consumedUnits} د من {allowanceMinutes} د)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Left in RTL: Status Badge + Primary Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Pill */}
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-extrabold ${
                            detailedState === 'active_exceeded'
                              ? 'bg-rose-100 text-rose-700'
                              : detailedState === 'active_in_progress'
                              ? 'bg-[#FFF4E5] text-[#B45309]'
                              : detailedState === 'ended_early_partial'
                              ? 'bg-[#FFF4E5] text-[#D97706]'
                              : detailedState === 'completed_full' ||
                                detailedState === 'completed_early_approved'
                              ? 'bg-[#E6F8EF] text-[#10B981]'
                              : 'bg-[#EBF3FE] text-[#2F80ED]'
                          }`}
                        >
                          {detailedState === 'active_exceeded'
                            ? 'تجاوز المدة'
                            : detailedState === 'active_in_progress'
                            ? 'في استراحة جارية'
                            : detailedState === 'ended_early_partial'
                            ? `متبقي ${remUnits} د`
                            : detailedState === 'completed_full' ||
                              detailedState === 'completed_early_approved'
                            ? 'أنهى استراحته'
                            : 'لم يبدأ'}
                        </span>

                        {/* Start / Resume Remaining Rest Button */}
                        {!emp.activeSession && detailedState === 'not_started' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openStartRestModal(emp)}
                              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#1B365D] hover:bg-[#0F2342] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>بدء الاستراحة</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendStartRestNotification(emp)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#EBF3FE] hover:bg-[#DBEAFE] text-[#1B365D] text-xs font-bold flex items-center gap-1 cursor-pointer"
                              title="إرسال إشعار تذكير ببدء الاستراحة مع زر بدء الاستراحة التفاعلي"
                            >
                              <Bell className="w-3.5 h-3.5 text-[#2F80ED]" />
                              <span>إشعار بدء</span>
                            </button>
                          </>
                        )}

                        {!emp.activeSession && detailedState === 'ended_early_partial' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openStartRestModal(emp)}
                              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#1B365D] hover:bg-[#0F2342] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>استكمال المتبقي ({remUnits} د)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkSatisfied(emp.id)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#E6F8EF] hover:bg-[#D1F2E1] text-[#065F46] text-xs font-bold cursor-pointer"
                              title="اعتماد إنهاء الاستراحة مبكراً ونقل الموظف إلى قسم أنهوا استراحتهم"
                            >
                              اعتماد الاكتفاء
                            </button>
                          </>
                        )}

                        {!emp.activeSession &&
                          (detailedState === 'completed_full' ||
                            detailedState === 'completed_early_approved') && (
                            <>
                              {detailedState === 'completed_early_approved' && remUnits > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleReopenIncomplete(emp.id)}
                                  className="min-h-[36px] px-3 py-1 rounded-xl bg-[#F0F4F9] text-[#1B365D] text-xs font-bold cursor-pointer"
                                >
                                  إرجاع للمتبقي ({remUnits} د)
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openStartRestModal(emp)}
                                className="min-h-[36px] px-3 py-1 rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#172B4D] text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Play className="w-3 h-3" />
                                <span>استراحة إضافية</span>
                              </button>
                            </>
                          )}

                        {/* Explicit Button: تعديل مدة الاستراحة */}
                        <button
                          type="button"
                          onClick={() => openEditEmployeeModal(emp)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#1B365D] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          title="تعديل مدة الاستراحة أو اسم الموظف"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#2F80ED]" />
                          <span>تعديل مدة الاستراحة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingEmployee(emp)}
                          className="min-h-[38px] min-w-[38px] rounded-xl bg-[#F0F4F9] hover:bg-rose-50 text-[#6B7C93] hover:text-rose-600 flex items-center justify-center cursor-pointer"
                          title="حذف الموظف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Active Timer Box (Shown in Section 3 'incomplete' and Section 4 'exceeded') */}
                    {emp.activeSession && sessionMetrics && (
                      <div
                        className={`rounded-2xl border p-4 space-y-3 ${
                          isOvertime
                            ? 'bg-rose-50/90 border-rose-300'
                            : 'bg-[#F4F7FB] border-[#E6EDF5]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`text-xs font-bold ${
                              isOvertime ? 'text-rose-700' : 'text-[#6B7C93]'
                            }`}
                          >
                            {isOvertime
                              ? `عدّاد التجاوز والتأخير (المدة المخصصة كانت ${sessionMetrics.allowedMinutes} د):`
                              : `الوقت المتبقي لإتمام الاستراحة (${sessionMetrics.allowedMinutes} د):`}
                          </span>

                          {isOvertime && !emp.activeSession.alarmAcknowledged && (
                            <button
                              type="button"
                              onClick={() => handleAcknowledgeAlarm(emp.id)}
                              className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              تم (إيقاف الصوت)
                            </button>
                          )}
                        </div>

                        <div
                          dir="ltr"
                          className={`font-mono tabular-nums text-4xl font-bold text-center py-1 ${
                            isOvertime ? 'text-rose-600' : 'text-[#1B365D]'
                          }`}
                        >
                          {timerDisplay}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          <button
                            type="button"
                            onClick={() => handleEmployeeReturned(emp, false)}
                            className="sm:col-span-2 min-h-[44px] rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {isOvertime
                                ? 'رجع — إنهاء وتسجيل التأخير'
                                : 'رجع من الاستراحة'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePause(emp.id)}
                            className="min-h-[44px] rounded-xl bg-white border border-[#E6EDF5] text-[#172B4D] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {emp.activeSession.isPaused ? (
                              <>
                                <Play className="w-3.5 h-3.5 text-[#2F80ED]" />
                                <span>استئناف</span>
                              </>
                            ) : (
                              <>
                                <Pause className="w-3.5 h-3.5 text-[#F59E0B]" />
                                <span>إيقاف مؤقت</span>
                              </>
                            )}
                          </button>

                          <div className="sm:col-span-2 grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleExtendRestMinutes(emp.id, 5)}
                              className="min-h-[44px] rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-[#2F80ED] text-xs font-bold cursor-pointer"
                            >
                              +5 د
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExtendRestMinutes(emp.id, 10)}
                              className="min-h-[44px] rounded-xl bg-white border border-[#E6EDF5] hover:border-[#2F80ED] text-[#1B365D] text-xs font-bold cursor-pointer"
                            >
                              +10 د
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelRest(emp.id)}
                              className="min-h-[44px] rounded-xl bg-white border border-[#E6EDF5] text-rose-600 text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          VIEW 2: ADD EMPLOYEE SCREEN (With Custom Duration Input)
         ========================================================= */}
      {subTab === 'add_employee' && (
        <div className="max-w-lg mx-auto sm-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => setSubTab('employees')}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">إضافة موظف</h3>
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="text-xs font-bold text-[#2F80ED] hover:underline cursor-pointer"
            >
              لصق قائمة
            </button>
          </div>

          <form onSubmit={handleAddSingleEmployee} className="space-y-5">
            {newEmpError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                {newEmpError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#172B4D]">
                اسم الموظف
              </label>
              <input
                type="text"
                required
                placeholder="مثال: أحمد محمد"
                value={newEmpName}
                onChange={(e) => setNewEmpName(e.target.value)}
                className="w-full min-h-[48px] sm-input px-4 text-sm font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#172B4D]">
                مدة الاستراحة اليومية (بالدقائق)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DURATION_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setNewEmpAllowanceText(String(mins));
                      setNewEmpError(null);
                    }}
                    className={`min-h-[38px] px-3 py-1 rounded-xl font-mono text-xs font-bold transition-colors cursor-pointer ${
                      normalizeDigitsToAscii(newEmpAllowanceText) === String(mins)
                        ? 'bg-[#1B365D] text-white'
                        : 'bg-[#F0F4F9] text-[#172B4D] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    {mins} د
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="أدخل مدة مخصصة (مثلاً 25)"
                value={newEmpAllowanceText}
                onChange={(e) => {
                  setNewEmpAllowanceText(normalizeDigitsToAscii(e.target.value));
                  setNewEmpError(null);
                }}
                className="w-full min-h-[48px] sm-input px-4 font-mono text-base font-bold text-center"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#172B4D]">
                لون الموظف
              </label>
              <div className="flex items-center gap-3 pt-1">
                {[
                  '#2563EB',
                  '#8B4513',
                  '#22C55E',
                  '#EAB308',
                  '#EC4899',
                  '#93C5FD',
                ].map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setNewEmpColor(hex)}
                    style={{ backgroundColor: hex }}
                    className={`w-9 h-9 rounded-full cursor-pointer transition-transform ${
                      newEmpColor === hex
                        ? 'scale-110 ring-2 ring-[#1B365D] ring-offset-2'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[52px] sm-btn-navy text-base flex items-center justify-center cursor-pointer shadow-md"
            >
              حفظ
            </button>
          </form>
        </div>
      )}

      {/* =========================================================
          VIEW 3: REST LOGS & WHATSAPP REPORT
         ========================================================= */}
      {subTab === 'logs' && (
        <div className="sm-card p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6EDF5] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#172B4D]">
                سجل الاستراحات اليومي والتقارير
              </h3>
              <p className="text-xs text-[#6B7C93]">
                جميع الاستراحات المسجلة مع المدة الفعلية والتأخير.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedReportDay}
                onChange={(e) => setSelectedReportDay(e.target.value)}
                className="min-h-[40px] sm-input px-3 text-xs font-mono font-bold"
              >
                {availableLogDays.map((day) => (
                  <option key={day} value={day}>
                    {day} {day === currentOpDayKey ? '(اليوم)' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={handleShareReport}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1B365D] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>
                  {copiedReportMsg ? 'تم النسخ!' : 'مشاركة التقرير (واتساب)'}
                </span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] p-4">
            <pre className="text-xs text-[#172B4D] whitespace-pre-wrap font-sans leading-relaxed">
              {generateFormattedArabicReport(selectedReportDay)}
            </pre>
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW 4: REST SETTINGS, INTERACTIVE NOTIFICATIONS & BACKUP
         ========================================================= */}
      {subTab === 'settings' && (
        <div className="sm-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3.5">
            <button
              type="button"
              onClick={() => setSubTab('employees')}
              className="min-h-[38px] px-2.5 rounded-xl hover:bg-slate-100 text-[#172B4D] flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
              <span>رجوع</span>
            </button>
            <h3 className="text-lg font-bold text-[#172B4D]">إعدادات الاستراحات والإشعارات</h3>
            <button
              type="button"
              onClick={() => setConfirmNewDayModal(true)}
              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
            >
              بدء يوم جديد
            </button>
          </div>

          {/* Interactive Notifications Configuration Card */}
          <div className="p-4 rounded-2xl bg-[#EBF3FE]/60 border border-[#2F80ED]/30 space-y-3.5">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#2F80ED]" />
              <h4 className="text-sm font-extrabold text-[#172B4D]">
                إعدادات إشعارات الاستراحة التفاعلية (انتهاء المدة والتأخير)
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#E6EDF5] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#172B4D] block">
                    إشعار انتهاء مدة الاستراحة
                  </span>
                  <span className="text-[11px] text-[#6B7C93]">
                    يرسل إشعاراً تفاعلياً مع أزرار (تمت العودة / تمديد +5د / +10د) فور انتهاء المدة
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOnRestEnd !== false}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      notifyOnRestEnd: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1B365D] shrink-0"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#E6EDF5] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#172B4D] block">
                    إشعار تأخير الموظف عن العودة
                  </span>
                  <span className="text-[11px] text-[#6B7C93]">
                    يرسل إشعار تأخير إضافي إذا لم يسجل الموظف عودته بعد المدة المحددة
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOnOvertime !== false}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      notifyOnOvertime: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1B365D] shrink-0"
                />
              </label>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#E6EDF5] flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-[#172B4D] block">
                  إرسال إشعار التأخير بعد مرور (دقائق من انتهاء الاستراحة):
                </span>
                <span className="text-[11px] text-[#6B7C93]">
                  لا يُرسل إشعار التأخير إذا سجل الموظف عودته قبل هذا الوقت
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {[1, 3, 5, 10, 15].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        overtimeAlertAfterMinutes: mins,
                      }))
                    }
                    className={`min-h-[36px] px-3 py-1 rounded-xl font-mono text-xs font-bold cursor-pointer transition-colors ${
                      (settings.overtimeAlertAfterMinutes ?? 5) === mins
                        ? 'bg-[#1B365D] text-white'
                        : 'bg-[#F0F4F9] text-[#172B4D] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    {mins} د
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-[#172B4D]">
                  وضع الاختبار السريع (الدقيقة = ثانية)
                </span>
                <input
                  type="checkbox"
                  checked={settings.testModeMinuteAsSecond}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      testModeMinuteAsSecond: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1B365D]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-[#172B4D]">
                  النطق الصوتي بالعربية عند انتهاء الاستراحة
                </span>
                <input
                  type="checkbox"
                  checked={settings.enableVoiceTTS}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      enableVoiceTTS: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1B365D]"
                />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#172B4D]">
                  ساعة بداية اليوم الجديد (صباحاً)
                </span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={settings.dayResetHour}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      dayResetHour: Number(e.target.value),
                    }))
                  }
                  className="w-20 min-h-[36px] sm-input px-2.5 text-center font-mono font-bold text-xs"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#172B4D]">
                  الحد الأقصى للمستريحين معاً
                </span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxConcurrentRests}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxConcurrentRests: Math.max(1, Number(e.target.value) || 2),
                    }))
                  }
                  className="w-20 min-h-[36px] sm-input px-2.5 text-center font-mono font-bold text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-[#E6EDF5] text-xs font-bold text-[#172B4D] flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#2F80ED]" />
                  <span>نسخة احتياطية JSON</span>
                </button>

                <label className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-[#E6EDF5] text-xs font-bold text-[#172B4D] flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>استعادة</span>
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1: START REST DURATION PICKER
         ========================================================= */}
      {startingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-5 text-[#172B4D]">
            <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3">
              <h3 className="text-lg font-bold">
                بدء استراحة: {startingEmployee.name}
              </h3>
              <button
                type="button"
                onClick={() => setStartingEmployee(null)}
                className="w-9 h-9 rounded-xl bg-[#F0F4F9] text-[#6B7C93] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {startModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                {startModalError}
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] flex items-center justify-between text-xs font-bold">
              <span className="text-[#6B7C93]">الرصيد المتبقي اليوم:</span>
              <span className="font-mono text-base text-[#2F80ED]">
                {getEmployeeRemainingUnits(startingEmployee)} دقيقة
              </span>
            </div>

            {getEmployeeRemainingUnits(startingEmployee) > 0 && (
              <button
                type="button"
                onClick={() =>
                  requestStartRest(
                    startingEmployee,
                    getEmployeeRemainingUnits(startingEmployee)
                  )
                }
                className="w-full min-h-[48px] sm-btn-navy text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>
                  خذ المتبقي بالكامل ({getEmployeeRemainingUnits(startingEmployee)} د)
                </span>
              </button>
            )}

            <div className="space-y-2">
              <span className="text-xs font-bold text-[#6B7C93] block">
                أو اختر مدة سريعة (بالدقائق):
              </span>
              <div className="grid grid-cols-6 gap-1.5">
                {[5, 10, 15, 20, 25, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setCustomMinutesText(String(mins));
                      requestStartRest(startingEmployee, mins);
                    }}
                    className="min-h-[42px] rounded-xl bg-[#F0F4F9] hover:bg-[#1B365D] hover:text-white text-[#172B4D] font-mono font-bold text-xs transition-colors cursor-pointer"
                  >
                    {mins}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleStartWithCustomInput}
              className="pt-3 border-t border-[#E6EDF5] flex items-end gap-2.5"
            >
              <div className="flex-1 space-y-1">
                <label className="block text-xs font-bold text-[#6B7C93]">
                  مدة مخصصة (تقبل الأرقام العربية والإنجليزية مثل 25 أو ٢٥):
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="25"
                  value={customMinutesText}
                  onChange={(e) => {
                    setCustomMinutesText(normalizeDigitsToAscii(e.target.value));
                    setStartModalError(null);
                  }}
                  className="w-full min-h-[44px] sm-input px-3.5 font-mono font-bold text-base text-center"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#2F80ED] hover:bg-[#1B365D] text-white font-bold text-xs cursor-pointer transition-colors"
              >
                بدء بالمخصص
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: CONFIRM EXCEED ALLOWANCE OR CONCURRENT LIMIT
         ========================================================= */}
      {confirmExceedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-4 text-[#172B4D]">
            <div className="flex items-center gap-2.5 text-[#F59E0B]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-[#172B4D]">تأكيد بدء الاستراحة</h3>
            </div>

            <div className="space-y-2 text-xs text-[#6B7C93] leading-relaxed">
              {confirmExceedModal.requestedMinutes >
                confirmExceedModal.remainingMinutes && (
                <p>
                  • المدة المطلوبة لـ <strong>{confirmExceedModal.employee.name}</strong> هي{' '}
                  <strong className="text-[#172B4D]">
                    {confirmExceedModal.requestedMinutes} دقيقة
                  </strong>{' '}
                  بينما رصيده المتبقي هو{' '}
                  <strong className="text-rose-600">
                    {confirmExceedModal.remainingMinutes} دقيقة
                  </strong>.
                </p>
              )}
              {confirmExceedModal.exceedConcurrentWarning && (
                <p>
                  • يوجد حالياً <strong>{activeRestCount} موظفين</strong> في استراحة متزامنة.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmExceedModal(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() =>
                  executeStartRest(
                    confirmExceedModal.employee,
                    confirmExceedModal.requestedMinutes
                  )
                }
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
              >
                نعم، ابدأ الاستراحة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: BULK PASTE EMPLOYEES
         ========================================================= */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleBulkAddEmployees}
            className="w-full max-w-md rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-4 text-[#172B4D]"
          >
            <h3 className="text-lg font-bold">إضافة قائمة موظفين دفعة واحدة</h3>
            <p className="text-xs text-[#6B7C93]">
              الصق أسماء الموظفين (اسم في كل سطر):
            </p>
            <textarea
              rows={5}
              required
              placeholder={'حسين\nأحمد\nسارة\nمحمود'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full sm-input p-3.5 text-sm"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
              >
                إضافة الجميع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================
          MODAL 4: EDIT EMPLOYEE & REST DURATION
         ========================================================= */}
      {editingEmployeeId && editingEmployeeObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveEditedEmployee}
            className="w-full max-w-md rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-5 text-[#172B4D]"
          >
            <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3">
              <h3 className="text-lg font-extrabold text-[#172B4D]">
                تعديل مدة الاستراحة وبيانات الموظف
              </h3>
              <button
                type="button"
                onClick={() => setEditingEmployeeId(null)}
                className="w-9 h-9 rounded-xl bg-[#F0F4F9] text-[#6B7C93] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                {editModalError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#6B7C93]">
                اسم الموظف
              </label>
              <input
                type="text"
                required
                value={editEmpName}
                onChange={(e) => {
                  setEditEmpName(e.target.value);
                  setEditModalError(null);
                }}
                className="w-full min-h-[44px] sm-input px-3.5 text-sm font-bold"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#172B4D]">
                  مدة الاستراحة المخصصة (بالدقائق)
                </label>
                <span className="text-[11px] font-bold text-[#2F80ED]">
                  المحفوظة حالياً: {editingEmployeeObj.dailyAllowanceMinutes} د
                </span>
              </div>

              {/* Preset Options */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DURATION_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setEditAllowanceText(String(mins));
                      setEditModalError(null);
                    }}
                    className={`min-h-[38px] px-3 py-1 rounded-xl font-mono text-xs font-bold transition-colors cursor-pointer ${
                      normalizeDigitsToAscii(editAllowanceText) === String(mins)
                        ? 'bg-[#1B365D] text-white shadow-2xs'
                        : 'bg-[#F0F4F9] text-[#172B4D] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    {mins} د
                  </button>
                ))}
              </div>

              {/* Custom Manual Numeric Input (Supports English 25, Arabic ٢٥, Persian ۲۵) */}
              <div className="space-y-1">
                <span className="block text-[11px] font-semibold text-[#6B7C93]">
                  أو اكتب مدة مخصصة يدوياً (1 إلى 240 دقيقة):
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="مثال: 25"
                  value={editAllowanceText}
                  onChange={(e) => {
                    setEditAllowanceText(normalizeDigitsToAscii(e.target.value));
                    setEditModalError(null);
                  }}
                  className="w-full min-h-[48px] sm-input px-4 font-mono font-extrabold text-lg text-center text-[#1B365D]"
                />
              </div>

              {editingEmployeeObj.activeSession && (
                <p className="text-[11px] text-[#B45309] bg-[#FFF4E5] p-2.5 rounded-xl font-semibold">
                  ملاحظة: لدى هذا الموظف استراحة جارية حالياً؛ سيتم تحديث المدة المخصصة وإعادة حساب الوقت المتبقي أو التأخير تلقائياً مع الحفاظ على وقت بداية الاستراحة الفعلي.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#6B7C93]">لون الموظف</label>
              <div className="flex items-center gap-2.5">
                {['#2563EB', '#8B4513', '#22C55E', '#EAB308', '#EC4899', '#93C5FD'].map(
                  (hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setEditEmpColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`w-8 h-8 rounded-full cursor-pointer ${
                        editEmpColor === hex
                          ? 'ring-2 ring-[#1B365D] ring-offset-2'
                          : ''
                      }`}
                    />
                  )
                )}
              </div>
            </div>

            {/* Per-employee reset option if supervisor wants to reset today's state for this employee */}
            {(editingEmployeeObj.consumedSecondsToday > 0 ||
              editingEmployeeObj.delaySecondsToday > 0 ||
              editingEmployeeObj.activeSession !== null) && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleResetSingleEmployeeToday(editingEmployeeObj.id)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة ضبط استراحة ورصيد هذا الموظف لليوم</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E6EDF5]">
              <button
                type="button"
                onClick={() => setEditingEmployeeId(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-6 py-2 rounded-xl bg-[#1B365D] hover:bg-[#0F2342] text-white text-xs font-bold cursor-pointer shadow-xs"
              >
                حفظ المدة والتعديلات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================
          MODAL 5: DELETE EMPLOYEE CONFIRMATION
         ========================================================= */}
      {deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-4 text-[#172B4D]">
            <h3 className="text-lg font-bold">تأكيد حذف الموظف</h3>
            <p className="text-xs text-[#6B7C93] leading-relaxed">
              هل أنت متأكد من حذف الموظف <strong>"{deletingEmployee.name}"</strong>؟
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingEmployee(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEmployee}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 6: CONFIRM START NEW DAY
         ========================================================= */}
      {confirmNewDayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-4 text-[#172B4D]">
            <h3 className="text-lg font-bold">تأكيد بدء يوم عمل جديد</h3>
            <p className="text-xs text-[#6B7C93] leading-relaxed">
              سيتم تصفير استهلاك اليوم وإعادة الرصيد اليومي الكامل لجميع الموظفين ونقلهم إلى قسم «لم يأخذوا استراحتهم». هل تريد المتابعة؟
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmNewDayModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleStartNewDayNow}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
