import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Employee,
  ActiveRestSession,
  RestLogEntry,
  RestSettings,
  SoundType,
} from '../types';
import { SOUND_OPTIONS } from '../data/presets';
import { soundEngine } from '../utils/soundEngine';
import { nativeAlarmBridge } from '../utils/nativeAlarmBridge';
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  Play,
  Pause,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Settings,
  FileText,
  Share2,
  Download,
  Upload,
  RotateCcw,
  Volume2,
  Sparkles,
  UserPlus,
  BellRing,
  Check,
  X,
  ChevronRight,
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
};

function computeOperationalDayKey(now: Date, resetHour: number, resetMinute: number): string {
  const shifted = new Date(now);
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
  const resetTotalMins = resetHour * 60 + resetMinute;
  if (currentTotalMins < resetTotalMins) {
    shifted.setDate(shifted.getDate() - 1);
  }
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDurationArabic(totalSeconds: number, isTestMode: boolean): string {
  if (isTestMode) {
    const simulatedMinutes = Math.floor(totalSeconds);
    const remainderSub = Math.round((totalSeconds - simulatedMinutes) * 60);
    if (simulatedMinutes > 0 && remainderSub > 0) {
      return `${simulatedMinutes} دقيقة و ${remainderSub} ثانية`;
    }
    if (simulatedMinutes > 0) {
      return `${simulatedMinutes} دقيقة`;
    }
    return `${Math.max(1, remainderSub)} ثانية`;
  }

  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (mins > 0 && secs > 0) {
    return `${mins} دقيقة و ${secs} ثانية`;
  }
  if (mins > 0) {
    return `${mins} دقيقة`;
  }
  return `${secs} ثانية`;
}

export const EmployeeRestManager: React.FC = () => {
  const [settings, setSettings] = useState<RestSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      return saved ? JSON.parse(saved) : INITIAL_EMPLOYEES;
    } catch {
      return INITIAL_EMPLOYEES;
    }
  });

  const [logs, setLogs] = useState<RestLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Primary View Tab: 'employees' | 'logs' | 'add_employee' | 'settings' (matching Screens 10 & 11)
  const [subTab, setSubTab] = useState<'employees' | 'logs' | 'add_employee' | 'settings'>('employees');

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Persistent Arabic Return Banner Cards (Section 5)
  const [returnBannerMessages, setReturnBannerMessages] = useState<
    { id: string; employeeName: string; lines: string[]; timestamp: string; isLate: boolean }[]
  >([]);

  // Start Rest Modal State
  const [startingEmployee, setStartingEmployee] = useState<Employee | null>(null);
  const [customMinutesInput, setCustomMinutesInput] = useState<number>(15);
  const [confirmExceedModal, setConfirmExceedModal] = useState<{
    employee: Employee;
    requestedMinutes: number;
    remainingMinutes: number;
    exceedConcurrentWarning: boolean;
  } | null>(null);

  // Add / Edit / Delete Employee State (Screen 11)
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpAllowance, setNewEmpAllowance] = useState(30);
  const [newEmpColor, setNewEmpColor] = useState('#2F80ED');
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [confirmNewDayModal, setConfirmNewDayModal] = useState(false);

  const [shiftAlertMessage, setShiftAlertMessage] = useState<string | null>(null);
  const triggeredShiftAlertsRef = useRef<Set<string>>(new Set());
  const longPressTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const [wakeLockActiveStatus, setWakeLockActiveStatus] = useState<boolean>(false);

  const currentOpDayKey = useMemo(
    () => computeOperationalDayKey(new Date(nowMs), settings.dayResetHour, settings.dayResetMinute),
    [nowMs, settings.dayResetHour, settings.dayResetMinute]
  );
  const [selectedReportDay, setSelectedReportDay] = useState<string>(currentOpDayKey);

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

  useEffect(() => {
    const savedDayKey = localStorage.getItem(STORAGE_KEYS.LAST_RESET_KEY);
    if (!savedDayKey) {
      localStorage.setItem(STORAGE_KEYS.LAST_RESET_KEY, currentOpDayKey);
      return;
    }
    if (savedDayKey !== currentOpDayKey) {
      setEmployees((prev) =>
        prev.map((emp) => ({
          ...emp,
          consumedSecondsToday: 0,
          delaySecondsToday: 0,
          hasStartedRestToday: emp.activeSession !== null,
          optedOutRemainingToday: false,
        }))
      );
      localStorage.setItem(STORAGE_KEYS.LAST_RESET_KEY, currentOpDayKey);
      setSelectedReportDay(currentOpDayKey);
    }
  }, [currentOpDayKey]);

  const unacknowledgedExpiredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.activeSession || emp.activeSession.isPaused) return false;
      const remainingMs = emp.activeSession.targetEndMs - nowMs;
      return remainingMs <= 0 && !emp.activeSession.alarmAcknowledged;
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

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`انتهت استراحة ${names}`, {
            body: `يرجى الضغط على "تم" أو تسجيل رجوع الموظف (${names}).`,
          });
        } catch {}
      }
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
        setShiftAlertMessage(
          `تنبيه مباشرة الدوام: يبدأ دوام الموظف "${emp.name}" بعد ${preMins} دقائق (الساعة ${emp.shiftStartTime})`
        );
        soundEngine.playStepCompleteChime();
      }
    });
  }, [nowMs, employees, currentOpDayKey, settings.enablePhase2Extras]);

  const getEmployeeRemainingUnits = (emp: Employee): number => {
    const unitSec = settings.testModeMinuteAsSecond ? 1 : 60;
    const consumedUnits = emp.consumedSecondsToday / unitSec;
    return Math.max(0, Math.round((emp.dailyAllowanceMinutes - consumedUnits) * 10) / 10);
  };

  const getEmployeeStatus = (
    emp: Employee
  ): 'available' | 'in_rest' | 'late' | 'finished' => {
    if (emp.activeSession) {
      const effectiveNow = emp.activeSession.isPaused
        ? emp.activeSession.pausedAtMs || nowMs
        : nowMs;
      if (effectiveNow > emp.activeSession.targetEndMs) {
        return 'late';
      }
      return 'in_rest';
    }
    const remUnits = getEmployeeRemainingUnits(emp);
    if (remUnits <= 0 || emp.optedOutRemainingToday) {
      return 'finished';
    }
    return 'available';
  };

  const activeRestCount = useMemo(
    () => employees.filter((e) => e.activeSession !== null).length,
    [employees]
  );

  const openStartRestModal = (emp: Employee) => {
    const rem = getEmployeeRemainingUnits(emp);
    const defaultDuration = rem > 0 ? Math.ceil(rem) : 5;
    setStartingEmployee(emp);
    setCustomMinutesInput(defaultDuration);
  };

  const executeStartRest = (emp: Employee, durationUnits: number) => {
    const unitMs = settings.testModeMinuteAsSecond ? 1000 : 60000;
    const startMs = Date.now();
    const session: ActiveRestSession = {
      startedAtMs: startMs,
      targetEndMs: startMs + durationUnits * unitMs,
      allocatedUnits: durationUnits,
      unitMs,
      isPaused: false,
      pausedAtMs: null,
      totalPausedMs: 0,
      alarmAcknowledged: false,
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

    nativeAlarmBridge.scheduleEmployeeRestEnd(emp.id, emp.name, session.targetEndMs);

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  const requestStartRest = (emp: Employee, requestedUnits: number) => {
    if (requestedUnits <= 0) return;
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
          const pausedDelta = sess.pausedAtMs ? currentNow - sess.pausedAtMs : 0;
          const newTargetEndMs = sess.targetEndMs + pausedDelta;
          nativeAlarmBridge.scheduleEmployeeRestEnd(emp.id, emp.name, newTargetEndMs);
          return {
            ...emp,
            activeSession: {
              ...sess,
              isPaused: false,
              pausedAtMs: null,
              totalPausedMs: sess.totalPausedMs + pausedDelta,
              targetEndMs: newTargetEndMs,
            },
          };
        }
      })
    );
  };

  const handleAddFiveMinutes = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId || !emp.activeSession) return emp;
        const sess = emp.activeSession;
        const addMs = 5 * sess.unitMs;
        const newTargetEndMs = sess.targetEndMs + addMs;
        if (!sess.isPaused) {
          nativeAlarmBridge.scheduleEmployeeRestEnd(emp.id, emp.name, newTargetEndMs);
        }
        return {
          ...emp,
          activeSession: {
            ...sess,
            allocatedUnits: sess.allocatedUnits + 5,
            targetEndMs: newTargetEndMs,
            alarmAcknowledged: false,
          },
        };
      })
    );
  };

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

  const handleEmployeeReturned = (emp: Employee) => {
    if (!emp.activeSession) return;
    nativeAlarmBridge.cancelEmployeeRestNotification(emp.id);
    const sess = emp.activeSession;
    const endMs = sess.isPaused && sess.pausedAtMs ? sess.pausedAtMs : Date.now();
    const totalActiveMs = Math.max(1000, endMs - sess.startedAtMs - sess.totalPausedMs);

    const isTestOption = sess.unitMs === 1000;
    const unitSec = isTestOption ? 1 : 60;

    const actualElapsedSeconds = Math.round(totalActiveMs / 1000);
    const allocatedSeconds = Math.round(sess.allocatedUnits * unitSec);
    const sessionDelaySeconds = Math.max(0, actualElapsedSeconds - allocatedSeconds);

    const newTotalConsumedSeconds = emp.consumedSecondsToday + actualElapsedSeconds;
    const newTotalDelaySeconds = emp.delaySecondsToday + sessionDelaySeconds;

    const allowanceTotalSeconds = emp.dailyAllowanceMinutes * unitSec;
    const remainingAfterSeconds = allowanceTotalSeconds - newTotalConsumedSeconds;

    const takenUnitsRounded = Math.max(1, Math.round(actualElapsedSeconds / unitSec));
    const remainingUnitsRounded = Math.round(remainingAfterSeconds / unitSec);
    const delayUnitsRounded = Math.round(sessionDelaySeconds / unitSec);
    const exceededTotalUnitsRounded = Math.round(
      Math.max(0, newTotalConsumedSeconds - allowanceTotalSeconds) / unitSec
    );

    const messageLines: string[] = [];
    let isLateOrExceeded = false;

    if (sessionDelaySeconds > 0 || remainingAfterSeconds < 0) {
      isLateOrExceeded = true;
      if (sessionDelaySeconds > 0) {
        const delayFormatted =
          delayUnitsRounded > 0
            ? `${delayUnitsRounded} دقائق`
            : formatDurationArabic(sessionDelaySeconds, isTestOption);
        messageLines.push(
          `${emp.name} تأخر ${delayFormatted} زيادة على ريسته (${formatDurationArabic(
            sessionDelaySeconds,
            isTestOption
          )})`
        );
      }
      if (remainingAfterSeconds < 0) {
        const exceedFormatted =
          exceededTotalUnitsRounded > 0
            ? `${exceededTotalUnitsRounded} دقائق`
            : formatDurationArabic(Math.abs(remainingAfterSeconds), isTestOption);
        messageLines.push(`تجاوز رصيده بـ ${exceedFormatted}`);
      } else if (remainingAfterSeconds > 0) {
        messageLines.push(`بقي له ${Math.max(1, remainingUnitsRounded)} دقائق من رصيده اليومي`);
      } else {
        messageLines.push(`${emp.name} أنهى رصيد استراحته`);
      }
    } else if (remainingUnitsRounded <= 0) {
      messageLines.push(`${emp.name} أنهى رصيد استراحته`);
    } else {
      messageLines.push(
        `${emp.name} أخذ ${takenUnitsRounded} دقيقة، بقي له ${remainingUnitsRounded} دقائق`
      );
    }

    const summaryText = messageLines.join(' — ');

    const newLog: RestLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dayKey: currentOpDayKey,
      employeeId: emp.id,
      employeeName: emp.name,
      startedAtIso: new Date(sess.startedAtMs).toISOString(),
      endedAtIso: new Date(endMs).toISOString(),
      allocatedMinutes: sess.allocatedUnits,
      actualSeconds: actualElapsedSeconds,
      delaySeconds: sessionDelaySeconds,
      remainingAfterSeconds: Math.max(0, remainingAfterSeconds),
      summaryMessage: summaryText,
      wasTestMode: isTestOption,
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
              activeSession: null,
            }
          : item
      )
    );

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
  };

  const handleMarkSatisfied = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === empId ? { ...emp, optedOutRemainingToday: true } : emp
      )
    );
  };

  const handleAddSingleEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;
    const created: Employee = {
      id: `emp-${Date.now()}`,
      name: newEmpName.trim(),
      dailyAllowanceMinutes: Math.max(1, Number(newEmpAllowance) || 30),
      consumedSecondsToday: 0,
      delaySecondsToday: 0,
      hasStartedRestToday: false,
      optedOutRemainingToday: false,
      avatarColor: newEmpColor,
      activeSession: null,
    };
    setEmployees((prev) => [...prev, created]);
    setNewEmpName('');
    setNewEmpAllowance(30);
    setSubTab('employees');
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
  };

  const handleSaveEditedEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !editingEmployee.name.trim()) return;
    setEmployees((prev) =>
      prev.map((item) =>
        item.id === editingEmployee.id ? editingEmployee : item
      )
    );
    setEditingEmployee(null);
  };

  const handleConfirmDeleteEmployee = () => {
    if (!deletingEmployee) return;
    setEmployees((prev) => prev.filter((item) => item.id !== deletingEmployee.id));
    setDeletingEmployee(null);
  };

  const handleStartNewDayNow = () => {
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
        if (Array.isArray(parsed.employees)) setEmployees(parsed.employees);
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
      const remUnits = getEmployeeRemainingUnits(emp);
      const unitSec = settings.testModeMinuteAsSecond ? 1 : 60;
      const delayMins = Math.round((emp.delaySecondsToday / unitSec) * 10) / 10;

      lines.push(
        `👤 *${emp.name}* (الرصيد: ${emp.dailyAllowanceMinutes} د | المتبقي: ${remUnits} د${
          delayMins > 0 ? ` | التأخير: ${delayMins} د` : ''
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

  const notStartedEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const rem = getEmployeeRemainingUnits(emp);
      if (rem <= 0 || emp.optedOutRemainingToday) return false;
      return emp.consumedSecondsToday === 0;
    });
  }, [employees, settings.testModeMinuteAsSecond]);

  const partialRemainingEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const rem = getEmployeeRemainingUnits(emp);
      if (rem <= 0 || emp.optedOutRemainingToday) return false;
      return emp.consumedSecondsToday > 0;
    });
  }, [employees, settings.testModeMinuteAsSecond]);

  const statusCounts = useMemo(() => {
    let greenFinished = 0;
    let orangePartial = 0;
    let grayNotTaken = 0;
    let redLate = 0;

    employees.forEach((emp) => {
      const st = getEmployeeStatus(emp);
      if (st === 'late' || emp.delaySecondsToday > 0) {
        redLate++;
      }
      if (st === 'finished') {
        greenFinished++;
      } else if (emp.consumedSecondsToday > 0) {
        orangePartial++;
      } else {
        grayNotTaken++;
      }
    });

    return { greenFinished, orangePartial, grayNotTaken, redLate };
  }, [employees, nowMs, settings.testModeMinuteAsSecond]);

  const availableLogDays = useMemo(() => {
    const set = new Set<string>([currentOpDayKey]);
    logs.forEach((l) => set.add(l.dayKey));
    return Array.from(set).sort().reverse();
  }, [logs, currentOpDayKey]);

  return (
    <div className="space-y-5">
      {/* Top Header matching Reference Screen 10 */}
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
            onClick={() => setSubTab('add_employee')}
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

      {/* Segmented Tabs matching Reference Screen 10: الموظفون | السجل */}
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

      {/* Shift Start Pre-Alert Banner */}
      {shiftAlertMessage && (
        <div className="sm-card p-4 border-amber-400 bg-[#FFF8E6] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs font-bold text-[#92400E]">
            <BellRing className="w-5 h-5 text-[#F59E0B] shrink-0" />
            <span>{shiftAlertMessage}</span>
          </div>
          <button
            onClick={() => setShiftAlertMessage(null)}
            className="px-3 py-1.5 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* LOUD PERSISTENT ALARM BANNER WHEN ANY REST HITS ZERO */}
      {unacknowledgedExpiredEmployees.length > 0 && (
        <div className="rounded-3xl border-2 border-rose-500 bg-rose-600 text-white p-6 shadow-xl space-y-4 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Volume2 className="w-8 h-8 text-white shrink-0" />
              <div>
                <h3 className="text-xl font-bold">
                  انتهت استراحة {unacknowledgedExpiredEmployees.map((e) => e.name).join(' ، ')}!
                </h3>
                <p className="text-xs text-rose-100 mt-0.5">
                  اضغط "تم" لإيقاف الصوت مع استمرار عدّاد التأخير الأحمر حتى يضغط الموظف "رجع".
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {unacknowledgedExpiredEmployees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => handleAcknowledgeAlarm(emp.id)}
                  className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-white text-rose-700 font-bold text-sm flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Check className="w-5 h-5" />
                  <span>تم — إيقاف صوت {emp.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BIG PERSISTENT ARABIC RETURN SUMMARY CARDS (Section 5) */}
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
          VIEW 1: EMPLOYEES & TIMERS (Reference Screen 10)
         ========================================================= */}
      {subTab === 'employees' && (
        <div className="space-y-6">
          {/* Top Queue: "لم يأخذوا الريست بعد" & "لهم رصيد متبقٍ" */}
          <div className="sm-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6EDF5] pb-3.5">
              <div>
                <h3 className="text-base font-bold text-[#172B4D]">
                  قائمة المتابعة: لم يأخذوا الريست بعد ولهم رصيد متبقٍ
                </h3>
                <p className="text-xs text-[#6B7C93]">
                  اضغط مطولاً على اسم الموظف للبدء السريع بالرصيد المتبقي
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
                <span className="text-[#6B7C93]">
                  لم يأخذ: <strong className="font-mono text-[#172B4D]">{statusCounts.grayNotTaken}</strong>
                </span>
                <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                <span className="text-[#F59E0B]">
                  رصيد متبقٍ: <strong className="font-mono">{statusCounts.orangePartial}</strong>
                </span>
                <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                <span className="text-[#10B981]">
                  أنهى: <strong className="font-mono">{statusCounts.greenFinished}</strong>
                </span>
                <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                <span className="text-rose-600">
                  متأخر: <strong className="font-mono">{statusCounts.redLate}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Group 1: لم يبدؤوا أي استراحة اليوم */}
              <div className="rounded-2xl bg-[#F8FAFC] border border-[#E6EDF5] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#172B4D]">
                    1. لم يبدؤوا أي استراحة اليوم
                  </span>
                  <span className="font-mono text-xs font-bold text-[#6B7C93] bg-white px-2.5 py-0.5 rounded-lg border border-[#E6EDF5]">
                    {notStartedEmployees.length}
                  </span>
                </div>

                {notStartedEmployees.length === 0 ? (
                  <p className="text-xs text-[#9AA5B1] py-3 text-center">
                    الجميع بدأوا استراحاتهم اليوم.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {notStartedEmployees.map((emp) => {
                      const inRestNow = emp.activeSession !== null;
                      return (
                        <div
                          key={emp.id}
                          className="p-3 rounded-xl bg-white border border-[#E6EDF5] flex items-center justify-between gap-2"
                        >
                          <div
                            onMouseDown={() => {
                              if (!settings.enablePhase2Extras || inRestNow) return;
                              longPressTimerRef.current = window.setTimeout(() => {
                                requestStartRest(emp, getEmployeeRemainingUnits(emp));
                              }, 600);
                            }}
                            onMouseUp={() => {
                              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                            }}
                            onTouchStart={() => {
                              if (!settings.enablePhase2Extras || inRestNow) return;
                              longPressTimerRef.current = window.setTimeout(() => {
                                requestStartRest(emp, getEmployeeRemainingUnits(emp));
                              }, 600);
                            }}
                            onTouchEnd={() => {
                              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                            }}
                            className="flex items-center gap-2.5 cursor-pointer select-none"
                          >
                            <div
                              style={{ backgroundColor: emp.avatarColor || '#1B365D' }}
                              className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                            >
                              {emp.name.slice(0, 1)}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-[#172B4D] block">
                                {emp.name}
                              </span>
                              <span className="text-[11px] text-[#6B7C93]">
                                الرصيد الكامل: {emp.dailyAllowanceMinutes} د
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {inRestNow ? (
                              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">
                                في استراحة
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => openStartRestModal(emp)}
                                  className="min-h-[36px] px-3 py-1 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
                                >
                                  بدء
                                </button>
                                <button
                                  onClick={() => handleMarkSatisfied(emp.id)}
                                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
                                >
                                  اكتفى
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Group 2: لهم رصيد متبقٍ */}
              <div className="rounded-2xl bg-[#F8FAFC] border border-[#E6EDF5] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F59E0B]">
                    2. لهم رصيد متبقٍ
                  </span>
                  <span className="font-mono text-xs font-bold text-[#F59E0B] bg-[#FFF4E5] px-2.5 py-0.5 rounded-lg">
                    {partialRemainingEmployees.length}
                  </span>
                </div>

                {partialRemainingEmployees.length === 0 ? (
                  <p className="text-xs text-[#9AA5B1] py-3 text-center">
                    لا يوجد موظفون برصيد جزئي متبقٍ حالياً.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {partialRemainingEmployees.map((emp) => {
                      const remUnits = getEmployeeRemainingUnits(emp);
                      const inRestNow = emp.activeSession !== null;
                      return (
                        <div
                          key={emp.id}
                          className="p-3 rounded-xl bg-white border border-[#FDE68A] flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              style={{ backgroundColor: emp.avatarColor || '#F59E0B' }}
                              className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                            >
                              {emp.name.slice(0, 1)}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-[#172B4D] block">
                                {emp.name}
                              </span>
                              <span className="text-xs font-bold text-[#F59E0B]">
                                متبقي {remUnits} دقائق
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {inRestNow ? (
                              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">
                                في استراحة
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => openStartRestModal(emp)}
                                  className="min-h-[36px] px-3 py-1 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
                                >
                                  خذ المتبقي ({remUnits} د)
                                </button>
                                <button
                                  onClick={() => handleMarkSatisfied(emp.id)}
                                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
                                >
                                  اكتفى
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Employee Cards List matching Reference Screen 10 */}
          <div className="space-y-3">
            {employees.map((emp) => {
              const status = getEmployeeStatus(emp);
              const remUnits = getEmployeeRemainingUnits(emp);
              const unitSec = settings.testModeMinuteAsSecond ? 1 : 60;
              const consumedUnits =
                Math.round((emp.consumedSecondsToday / unitSec) * 10) / 10;

              let timerDisplay = '00:00';
              let isOvertime = false;
              if (emp.activeSession) {
                const sess = emp.activeSession;
                const effectiveNow = sess.isPaused
                  ? sess.pausedAtMs || nowMs
                  : nowMs;
                const diffMs = sess.targetEndMs - effectiveNow;

                if (diffMs >= 0) {
                  const totalSecsLeft = Math.ceil(diffMs / 1000);
                  const m = Math.floor(totalSecsLeft / 60);
                  const s = totalSecsLeft % 60;
                  timerDisplay = `${String(m).padStart(2, '0')}:${String(s).padStart(
                    2,
                    '0'
                  )}`;
                } else {
                  isOvertime = true;
                  const overSecs = Math.floor(Math.abs(diffMs) / 1000);
                  const m = Math.floor(overSecs / 60);
                  const s = overSecs % 60;
                  timerDisplay = `+${String(m).padStart(2, '0')}:${String(s).padStart(
                    2,
                    '0'
                  )}`;
                }
              }

              return (
                <div key={emp.id} className="sm-card p-5 space-y-4">
                  {/* Top Row matching Reference Screen 10: Right Avatar + Name + Remaining | Left Status Badge + Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div
                        style={{ backgroundColor: emp.avatarColor || '#1B365D' }}
                        className="w-12 h-12 rounded-full text-white font-bold text-base flex items-center justify-center shrink-0 shadow-xs"
                      >
                        {emp.name.slice(0, 1)}
                      </div>

                      <div>
                        <h4 className="text-base font-bold text-[#172B4D]">
                          {emp.name}
                        </h4>
                        <div className="text-xs font-semibold mt-0.5">
                          {status === 'in_rest' || status === 'late' ? (
                            <span className="text-rose-600">في استراحة</span>
                          ) : status === 'finished' ? (
                            <span className="text-[#10B981]">
                              أنهى رصيده ({emp.dailyAllowanceMinutes} د)
                            </span>
                          ) : (
                            <span className="text-[#6B7C93]">
                              متبقي {remUnits} دقيقة (استهلك {consumedUnits} د)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status indicator matching Screen 10 */}
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-bold ${
                          status === 'late' || status === 'in_rest'
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-[#E6F8EF] text-[#10B981]'
                        }`}
                      >
                        {status === 'late'
                          ? 'متأخر'
                          : status === 'in_rest'
                          ? 'غير متاح'
                          : 'متاح'}
                      </span>

                      {!emp.activeSession && (
                        <button
                          onClick={() => openStartRestModal(emp)}
                          className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#1B365D] hover:bg-[#0F2342] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>بدء استراحة</span>
                        </button>
                      )}

                      <button
                        onClick={() => setEditingEmployee({ ...emp })}
                        className="p-2 rounded-xl bg-[#F0F4F9] hover:bg-[#E2E8F0] text-[#6B7C93] cursor-pointer"
                        title="تعديل الموظف"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setDeletingEmployee(emp)}
                        className="p-2 rounded-xl bg-[#F0F4F9] hover:bg-rose-50 text-[#6B7C93] hover:text-rose-600 cursor-pointer"
                        title="حذف الموظف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Active Timer Box if Employee is in Rest */}
                  {emp.activeSession && (
                    <div className="rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#6B7C93]">
                          {isOvertime
                            ? 'عدّاد التأخير والتجاوز:'
                            : `الوقت المتبقي من الاستراحة (${emp.activeSession.allocatedUnits} د):`}
                        </span>
                        {isOvertime && !emp.activeSession.alarmAcknowledged && (
                          <button
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

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <button
                          onClick={() => handleEmployeeReturned(emp)}
                          className="sm:col-span-2 min-h-[44px] rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>رجع من الاستراحة</span>
                        </button>

                        <button
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

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => handleAddFiveMinutes(emp.id)}
                            className="min-h-[44px] rounded-xl bg-white border border-[#E6EDF5] text-[#2F80ED] text-xs font-bold cursor-pointer"
                          >
                            +5 د
                          </button>
                          <button
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
        </div>
      )}

      {/* =========================================================
          VIEW 2: ADD EMPLOYEE SCREEN (Reference Screen 11)
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
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#172B4D]">
                إسم الموظف
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

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#172B4D]">
                مدة الاستراحة اليومية
              </label>
              <select
                value={newEmpAllowance}
                onChange={(e) => setNewEmpAllowance(Number(e.target.value))}
                className="w-full min-h-[48px] sm-input px-4 text-sm font-bold"
              >
                <option value={15}>15 دقيقة</option>
                <option value={20}>20 دقيقة</option>
                <option value={30}>30 دقيقة (الافتراضي)</option>
                <option value={45}>45 دقيقة</option>
                <option value={60}>60 دقيقة</option>
              </select>
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
          VIEW 4: REST SETTINGS & BACKUP
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
            <h3 className="text-lg font-bold text-[#172B4D]">إعدادات الاستراحات</h3>
            <button
              type="button"
              onClick={() => setConfirmNewDayModal(true)}
              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
            >
              بدء يوم جديد
            </button>
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
                onClick={() => setStartingEmployee(null)}
                className="w-9 h-9 rounded-xl bg-[#F0F4F9] text-[#6B7C93] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F4F7FB] border border-[#E6EDF5] flex items-center justify-between text-xs font-bold">
              <span className="text-[#6B7C93]">الرصيد المتبقي اليوم:</span>
              <span className="font-mono text-base text-[#2F80ED]">
                {getEmployeeRemainingUnits(startingEmployee)} دقيقة
              </span>
            </div>

            {getEmployeeRemainingUnits(startingEmployee) > 0 && (
              <button
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
              <div className="grid grid-cols-5 gap-2">
                {[5, 10, 15, 20, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => requestStartRest(startingEmployee, mins)}
                    className="min-h-[44px] rounded-xl bg-[#F0F4F9] hover:bg-[#1B365D] hover:text-white text-[#172B4D] font-mono font-bold text-sm transition-colors cursor-pointer"
                  >
                    {mins}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                requestStartRest(startingEmployee, Number(customMinutesInput) || 5);
              }}
              className="pt-2 border-t border-[#E6EDF5] flex items-end gap-2.5"
            >
              <div className="flex-1 space-y-1">
                <label className="block text-xs font-bold text-[#6B7C93]">
                  مدة مخصصة (دقائق):
                </label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={customMinutesInput}
                  onChange={(e) => setCustomMinutesInput(Number(e.target.value))}
                  className="w-full min-h-[44px] sm-input px-3.5 font-mono font-bold text-sm"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#2F80ED] text-white font-bold text-xs cursor-pointer"
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
                onClick={() => setConfirmExceedModal(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
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
          MODAL 4: EDIT EMPLOYEE
         ========================================================= */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveEditedEmployee}
            className="w-full max-w-md rounded-3xl bg-white border border-[#E6EDF5] p-6 shadow-2xl space-y-4 text-[#172B4D]"
          >
            <h3 className="text-lg font-bold">تعديل بيانات الموظف</h3>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#6B7C93]">اسم الموظف</label>
              <input
                type="text"
                required
                value={editingEmployee.name}
                onChange={(e) =>
                  setEditingEmployee({ ...editingEmployee, name: e.target.value })
                }
                className="w-full min-h-[44px] sm-input px-3.5 text-sm font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#6B7C93]">
                رصيد الاستراحة اليومي (دقائق)
              </label>
              <input
                type="number"
                min={1}
                max={240}
                value={editingEmployee.dailyAllowanceMinutes}
                onChange={(e) =>
                  setEditingEmployee({
                    ...editingEmployee,
                    dailyAllowanceMinutes: Math.max(1, Number(e.target.value) || 30),
                  })
                }
                className="w-full min-h-[44px] sm-input px-3.5 font-mono font-bold text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#6B7C93]">لون الموظف</label>
              <div className="flex items-center gap-2.5">
                {['#2563EB', '#8B4513', '#22C55E', '#EAB308', '#EC4899', '#93C5FD'].map(
                  (hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setEditingEmployee({ ...editingEmployee, avatarColor: hex })
                      }
                      style={{ backgroundColor: hex }}
                      className={`w-8 h-8 rounded-full cursor-pointer ${
                        editingEmployee.avatarColor === hex
                          ? 'ring-2 ring-[#1B365D] ring-offset-2'
                          : ''
                      }`}
                    />
                  )
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#1B365D] text-white text-xs font-bold cursor-pointer"
              >
                حفظ
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
                onClick={() => setDeletingEmployee(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
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
              سيتم تصفير استهلاك اليوم وإعادة الرصيد اليومي الكامل لجميع الموظفين. هل تريد المتابعة؟
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmNewDayModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F4F9] text-[#6B7C93] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
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
