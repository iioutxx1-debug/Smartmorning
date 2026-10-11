import { Employee, ActiveRestSession } from '../types';

export type RestCategory = 'not_taken' | 'completed' | 'incomplete' | 'exceeded';

export type EmployeeDetailedState =
  | 'not_started'
  | 'active_in_progress'
  | 'active_exceeded'
  | 'completed_full'
  | 'completed_early_approved'
  | 'ended_early_partial';

export const MIN_VALID_TIMESTAMP_MS = 1577836800000; // 2020-01-01T00:00:00Z
export const MAX_ACTIVE_SESSION_DURATION_MS = 8 * 3600 * 1000; // 8 hours max for a single rest session
export const MAX_DAILY_ALLOWANCE_MINUTES = 240; // 4 hours max daily rest allowance

/**
 * Converts Arabic-Indic (٠-٩), Eastern Arabic/Persian (۰-۹), and ASCII digits
 * into a clean ASCII numeric string without resetting empty strings while typing.
 */
export function normalizeDigitsToAscii(raw: string): string {
  return String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^0-9]/g, '');
}

/**
 * Computes the operational workday key (YYYY-MM-DD) respecting the custom day reset hour/minute.
 */
export function computeOperationalDayKey(
  now: Date,
  resetHour = 5,
  resetMinute = 0
): string {
  const safeDate =
    now instanceof Date && !isNaN(now.getTime()) ? new Date(now.getTime()) : new Date();
  const safeHour = Number.isFinite(resetHour) ? Math.max(0, Math.min(23, resetHour)) : 5;
  const safeMin = Number.isFinite(resetMinute) ? Math.max(0, Math.min(59, resetMinute)) : 0;

  const currentTotalMins = safeDate.getHours() * 60 + safeDate.getMinutes();
  const resetTotalMins = safeHour * 60 + safeMin;
  if (currentTotalMins < resetTotalMins) {
    safeDate.setDate(safeDate.getDate() - 1);
  }
  const y = safeDate.getFullYear();
  const m = String(safeDate.getMonth() + 1).padStart(2, '0');
  const d = String(safeDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Validates and normalizes any timestamp input (number, numeric string, ISO string, or seconds).
 * Returns null if the timestamp is missing, NaN, <= 0, before 2020, or in the future beyond tolerance.
 */
export function parseValidTimestampMs(
  raw: unknown,
  nowMs: number = Date.now()
): number | null {
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
    return null;
  }

  let num: number;
  if (typeof raw === 'number') {
    num = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      num = Number(trimmed);
    } else {
      num = Date.parse(trimmed);
    }
  } else {
    return null;
  }

  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }

  // If timestamp was accidentally stored in Unix seconds (e.g. 1.7e9) instead of milliseconds (1.7e12),
  // convert it to milliseconds safely.
  if (num >= 1_577_836_800 && num < 10_000_000_000) {
    num = Math.round(num * 1000);
  }

  if (num < MIN_VALID_TIMESTAMP_MS) {
    return null;
  }

  // Reject timestamps more than 5 minutes into the future relative to nowMs
  if (Number.isFinite(nowMs) && num > nowMs + 5 * 60 * 1000) {
    return null;
  }

  return Math.round(num);
}

export interface RestSessionMetrics {
  isValid: boolean;
  startTimeMs: number;
  allowedMinutes: number;
  unitMs: number;
  elapsedMs: number;
  elapsedMinutes: number;
  remainingMs: number;
  remainingMinutes: number;
  overtimeMs: number;
  overtimeMinutes: number;
  isExceeded: boolean;
  hasReachedLimit: boolean;
  timerDisplay: string;
}

/**
 * Unified, pure calculation of elapsed, remaining, and overtime metrics for a rest session.
 *
 * Core equations (with unitMs = 60000 for standard minutes, or 1000 for 1s=1m test mode):
 *   elapsedMinutes   = max(0, floor((effectiveNow - startTime - totalPausedMs) / unitMs))
 *   remainingMinutes = max(0, allowedMinutes - elapsedMinutes)
 *   overtimeMinutes  = max(0, elapsedMinutes - allowedMinutes)
 *
 * Guarantees:
 * - Never returns negative numbers, NaN, or Infinity.
 * - Overtime is strictly 0 before and up to the exact allowedMinutes mark (e.g., at 15m of a 15m rest, overtimeMinutes = 0).
 * - At 16m of a 15m rest, remainingMinutes = 0 and overtimeMinutes = 1.
 */
export function calculateRestSessionMetrics(params: {
  startTimeMs: unknown;
  allowedMinutes: unknown;
  nowMs: unknown;
  unitMs?: unknown;
  isPaused?: boolean;
  pausedAtMs?: unknown;
  totalPausedMs?: unknown;
}): RestSessionMetrics {
  const safeNowMs =
    typeof params.nowMs === 'number' && Number.isFinite(params.nowMs) && params.nowMs > 0
      ? params.nowMs
      : Date.now();

  const validStartMs = parseValidTimestampMs(params.startTimeMs, safeNowMs);
  const rawAllowed = Number(params.allowedMinutes);
  const validAllowedMinutes =
    Number.isFinite(rawAllowed) && rawAllowed > 0
      ? Math.min(MAX_DAILY_ALLOWANCE_MINUTES, Math.round(rawAllowed * 10) / 10)
      : 0;

  const rawUnitMs = Number(params.unitMs);
  const unitMs = rawUnitMs === 1000 ? 1000 : 60000;

  if (validStartMs === null || validAllowedMinutes <= 0) {
    return {
      isValid: false,
      startTimeMs: 0,
      allowedMinutes: validAllowedMinutes,
      unitMs,
      elapsedMs: 0,
      elapsedMinutes: 0,
      remainingMs: 0,
      remainingMinutes: 0,
      overtimeMs: 0,
      overtimeMinutes: 0,
      isExceeded: false,
      hasReachedLimit: false,
      timerDisplay: '00:00',
    };
  }

  let effectiveNowMs = safeNowMs;
  if (params.isPaused) {
    const validPausedAt = parseValidTimestampMs(params.pausedAtMs, safeNowMs);
    if (validPausedAt !== null && validPausedAt >= validStartMs) {
      effectiveNowMs = validPausedAt;
    }
  }

  const rawTotalPaused = Number(params.totalPausedMs);
  const safePausedMs =
    Number.isFinite(rawTotalPaused) && rawTotalPaused > 0
      ? Math.min(rawTotalPaused, Math.max(0, effectiveNowMs - validStartMs))
      : 0;

  const elapsedMs = Math.max(0, effectiveNowMs - validStartMs - safePausedMs);
  const allowedDurationMs = validAllowedMinutes * unitMs;

  // Core minute-unit equations
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / unitMs));
  const remainingMinutes = Math.max(0, validAllowedMinutes - elapsedMinutes);
  const overtimeMinutes = Math.max(0, elapsedMinutes - validAllowedMinutes);

  const remainingMs = Math.max(0, allowedDurationMs - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - allowedDurationMs);

  // Rest is considered exceeded (متأخر / تجاوز المدة) only AFTER the allocated duration has passed:
  // In minute terms: overtimeMinutes > 0 (e.g. >= 16m for a 15m rest) or elapsedMs >= allowedDurationMs + unitMs,
  // or when elapsedMs > allowedDurationMs in live second countdown.
  // To satisfy both exact minute boundary tests (15m -> 0 overtime, not exceeded; 16m -> 1m overtime, exceeded)
  // and live sub-minute overtime after a full minute or more:
  const isExceeded = overtimeMinutes > 0 || elapsedMs > allowedDurationMs;
  const hasReachedLimit = elapsedMs >= allowedDurationMs;

  // Format MM:SS display
  let timerDisplay = '00:00';
  if (!isExceeded) {
    if (unitMs === 1000) {
      // In test mode (1s = 1 simulated minute), display remaining simulated minutes:00
      const remSimMins = Math.ceil(remainingMs / 1000);
      timerDisplay = `${String(remSimMins).padStart(2, '0')}:00`;
    } else {
      const totalRemSecs = Math.ceil(remainingMs / 1000);
      const m = Math.floor(totalRemSecs / 60);
      const s = totalRemSecs % 60;
      timerDisplay = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  } else {
    if (unitMs === 1000) {
      const overSimMins = Math.max(1, Math.floor(overtimeMs / 1000));
      timerDisplay = `+${String(overSimMins).padStart(2, '0')}:00`;
    } else {
      const totalOverSecs = Math.floor(overtimeMs / 1000);
      const m = Math.floor(totalOverSecs / 60);
      const s = totalOverSecs % 60;
      timerDisplay = `+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  return {
    isValid: true,
    startTimeMs: validStartMs,
    allowedMinutes: validAllowedMinutes,
    unitMs,
    elapsedMs,
    elapsedMinutes,
    remainingMs,
    remainingMinutes,
    overtimeMs,
    overtimeMinutes,
    isExceeded,
    hasReachedLimit,
    timerDisplay,
  };
}

/**
 * Computes an employee's consumed, remaining, and delay minutes from standard seconds.
 * Always uses 60 seconds = 1 minute so toggling testMode never corrupts stored balances by 60x!
 */
export function calculateEmployeeBalance(emp: Employee): {
  allowanceMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  delayMinutes: number;
} {
  const allowanceMinutes =
    Number.isFinite(emp.dailyAllowanceMinutes) && emp.dailyAllowanceMinutes > 0
      ? Math.min(MAX_DAILY_ALLOWANCE_MINUTES, emp.dailyAllowanceMinutes)
      : 30;

  const safeConsumedSecs =
    Number.isFinite(emp.consumedSecondsToday) && emp.consumedSecondsToday > 0
      ? emp.consumedSecondsToday
      : 0;

  const safeDelaySecs =
    Number.isFinite(emp.delaySecondsToday) && emp.delaySecondsToday > 0
      ? emp.delaySecondsToday
      : 0;

  const consumedMinutes = Math.round((safeConsumedSecs / 60) * 10) / 10;
  const remainingMinutes = Math.max(
    0,
    Math.round((allowanceMinutes - safeConsumedSecs / 60) * 10) / 10
  );
  const delayMinutes = Math.round((safeDelaySecs / 60) * 10) / 10;

  return {
    allowanceMinutes,
    consumedMinutes,
    remainingMinutes,
    delayMinutes,
  };
}

/**
 * Central state machine determining the exact state of an employee.
 */
export function getEmployeeDetailedState(
  emp: Employee,
  nowMs: number = Date.now()
): EmployeeDetailedState {
  if (emp.activeSession) {
    const metrics = calculateRestSessionMetrics({
      startTimeMs: emp.activeSession.startedAtMs,
      allowedMinutes: emp.activeSession.allocatedUnits,
      nowMs,
      unitMs: emp.activeSession.unitMs,
      isPaused: emp.activeSession.isPaused,
      pausedAtMs: emp.activeSession.pausedAtMs,
      totalPausedMs: emp.activeSession.totalPausedMs,
    });

    if (metrics.isValid) {
      if (metrics.isExceeded) {
        return 'active_exceeded';
      }
      return 'active_in_progress';
    }
  }

  const { consumedMinutes, remainingMinutes } = calculateEmployeeBalance(emp);

  if (consumedMinutes <= 0 && !emp.optedOutRemainingToday) {
    return 'not_started';
  }
  if (remainingMinutes <= 0) {
    return 'completed_full';
  }
  if (emp.optedOutRemainingToday) {
    return 'completed_early_approved';
  }
  return 'ended_early_partial';
}

/**
 * Maps an employee to EXACTLY ONE of the 4 UI sections.
 */
export function classifyEmployeeCategory(
  emp: Employee,
  nowMs: number = Date.now()
): RestCategory {
  const state = getEmployeeDetailedState(emp, nowMs);
  switch (state) {
    case 'not_started':
      return 'not_taken';
    case 'completed_full':
    case 'completed_early_approved':
      return 'completed';
    case 'active_in_progress':
    case 'ended_early_partial':
      return 'incomplete';
    case 'active_exceeded':
      return 'exceeded';
  }
}

/**
 * Formats seconds into readable Arabic duration text.
 */
export function formatDurationArabic(
  totalStandardSeconds: number
): string {
  const safeSecs =
    Number.isFinite(totalStandardSeconds) && totalStandardSeconds > 0
      ? Math.round(totalStandardSeconds)
      : 0;
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  if (mins > 0 && secs > 0) {
    return `${mins} دقيقة و ${secs} ثانية`;
  }
  if (mins > 0) {
    return `${mins} دقيقة`;
  }
  return `${secs} ثانية`;
}

/**
 * Inspects and safely repairs stored employee records loaded from localStorage:
 * 1. Fixes invalid/missing/future/stale activeSession.startedAtMs (e.g., sessions left open from previous days causing 2364 min delay).
 * 2. Fixes corrupted consumedSecondsToday or delaySecondsToday (e.g., values where seconds were treated as minutes or exceeded max workday bounds).
 * 3. Preserves all employee names, IDs, colors, and valid balances.
 */
export function sanitizeAndRepairEmployees(
  rawEmployees: unknown,
  nowMs: number = Date.now(),
  resetHour = 5,
  resetMinute = 0
): {
  employees: Employee[];
  repairedCount: number;
  repairNotes: string[];
} {
  if (!Array.isArray(rawEmployees)) {
    return { employees: [], repairedCount: 0, repairNotes: [] };
  }

  const currentDayKey = computeOperationalDayKey(new Date(nowMs), resetHour, resetMinute);
  const seenIds = new Set<string>();
  const sanitized: Employee[] = [];
  let repairedCount = 0;
  const repairNotes: string[] = [];

  for (const item of rawEmployees) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<Employee>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'موظف';
    const rawAllowance = Number(raw.dailyAllowanceMinutes);
    const dailyAllowanceMinutes =
      Number.isFinite(rawAllowance) && rawAllowance >= 1 && rawAllowance <= MAX_DAILY_ALLOWANCE_MINUTES
        ? Math.round(rawAllowance)
        : 30;

    let consumedSecondsToday = Number(raw.consumedSecondsToday);
    let delaySecondsToday = Number(raw.delaySecondsToday);
    let itemRepaired = false;

    if (!Number.isFinite(consumedSecondsToday) || consumedSecondsToday < 0) {
      consumedSecondsToday = 0;
      itemRepaired = true;
    }
    if (!Number.isFinite(delaySecondsToday) || delaySecondsToday < 0) {
      delaySecondsToday = 0;
      itemRepaired = true;
    }

    // Detect abnormal multi-hour / multi-day corruption (e.g. 2364 minutes = 141840s, or 2364s in test mode)
    const maxReasonableSeconds = (dailyAllowanceMinutes + 180) * 60; // Allowance + max 3 hours
    if (delaySecondsToday > maxReasonableSeconds || delaySecondsToday >= 2000 * 60) {
      repairNotes.push(`تم إصلاح تأخير غير صالح محفوظ للموظف "${name}"`);
      delaySecondsToday = 0;
      itemRepaired = true;
    }
    if (consumedSecondsToday > maxReasonableSeconds || consumedSecondsToday >= 2000 * 60) {
      repairNotes.push(`تم إصلاح رصيد استهلاك تالف للموظف "${name}"`);
      consumedSecondsToday = Math.min(consumedSecondsToday, dailyAllowanceMinutes * 60);
      itemRepaired = true;
    }

    // Validate activeSession if present
    let activeSession: ActiveRestSession | null = null;
    if (raw.activeSession && typeof raw.activeSession === 'object') {
      const sess = raw.activeSession as Partial<ActiveRestSession>;
      const validStartMs = parseValidTimestampMs(sess.startedAtMs, nowMs);
      const rawAlloc = Number(sess.allocatedUnits);
      const allocatedUnits =
        Number.isFinite(rawAlloc) && rawAlloc >= 1 && rawAlloc <= MAX_DAILY_ALLOWANCE_MINUTES
          ? rawAlloc
          : dailyAllowanceMinutes;
      const unitMs = Number(sess.unitMs) === 1000 ? 1000 : 60000;

      if (validStartMs === null) {
        repairNotes.push(`تم إغلاق جلسة استراحة ذات وقت بداية غير صالح للموظف "${name}"`);
        activeSession = null;
        itemRepaired = true;
      } else {
        const sessionDayKey = computeOperationalDayKey(
          new Date(validStartMs),
          resetHour,
          resetMinute
        );
        const rawElapsedWallMs = nowMs - validStartMs;

        // If session belongs to a previous operational day, or has been running > 8 hours (or > 15 mins in 1s=1m test mode = 900 simulated mins)
        const isStaleTestSession = unitMs === 1000 && rawElapsedWallMs > 180 * 1000; // > 180 simulated minutes in test mode
        const isStaleNormalSession =
          sessionDayKey !== currentDayKey || rawElapsedWallMs > MAX_ACTIVE_SESSION_DURATION_MS;

        if (isStaleTestSession || isStaleNormalSession) {
          repairNotes.push(
            `تم إنهاء مؤقت قديم معلّق من فترة سابقة للموظف "${name}" لمنع احتساب تأخير وهمي`
          );
          activeSession = null;
          itemRepaired = true;
        } else {
          const isPaused = Boolean(sess.isPaused);
          const validPausedAt = isPaused
            ? parseValidTimestampMs(sess.pausedAtMs, nowMs)
            : null;
          const rawTotalPaused = Number(sess.totalPausedMs);
          const totalPausedMs =
            Number.isFinite(rawTotalPaused) && rawTotalPaused >= 0 && rawTotalPaused < rawElapsedWallMs
              ? rawTotalPaused
              : 0;

          const targetEndMs =
            validStartMs + totalPausedMs + allocatedUnits * unitMs;

          activeSession = {
            startedAtMs: validStartMs,
            targetEndMs,
            allocatedUnits,
            unitMs,
            isPaused: isPaused && validPausedAt !== null,
            pausedAtMs: validPausedAt,
            totalPausedMs,
            alarmAcknowledged: Boolean(sess.alarmAcknowledged),
          };
        }
      }
    }

    if (itemRepaired) {
      repairedCount++;
    }

    sanitized.push({
      id,
      name,
      dailyAllowanceMinutes,
      consumedSecondsToday,
      delaySecondsToday,
      hasStartedRestToday: activeSession !== null || consumedSecondsToday > 0,
      optedOutRemainingToday: Boolean(raw.optedOutRemainingToday),
      shiftStartTime: typeof raw.shiftStartTime === 'string' ? raw.shiftStartTime : '09:00',
      shiftPreAlertMinutes:
        typeof raw.shiftPreAlertMinutes === 'number' && Number.isFinite(raw.shiftPreAlertMinutes)
          ? raw.shiftPreAlertMinutes
          : 10,
      avatarColor: typeof raw.avatarColor === 'string' ? raw.avatarColor : '#2F80ED',
      activeSession,
    });
  }

  return {
    employees: sanitized,
    repairedCount,
    repairNotes,
  };
}
