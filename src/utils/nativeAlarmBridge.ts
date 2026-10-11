import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';
import { AlarmItem } from '../types';

const ALARM_CHANNEL_ID = 'miqat_high_priority_alarms';
const REST_CHANNEL_ID = 'miqat_rest_expired_channel_v2';
const REST_ACTION_TYPE_ID = 'MIQAT_REST_EXPIRED_ACTIONS';
const REST_START_ACTION_TYPE_ID = 'MIQAT_REST_START_ACTIONS';

export type RestNotificationActionType =
  | 'MARK_RETURNED'
  | 'END_REST'
  | 'EXTEND_REST'
  | 'START_REST'
  | 'VIEW_DETAILS'
  | 'OPEN_REST_PAGE';

export interface NativeRestActionEvent {
  eventId: string;
  action: RestNotificationActionType;
  employeeId: string;
  employeeName?: string;
  sessionId: string;
  extraMinutes?: number;
  timestampMs: number;
}

export type RestNotificationActionPayload = NativeRestActionEvent;

interface SmartMorningNativePluginInterface {
  pickSystemAlarmRingtone(options?: { existingUri?: string }): Promise<{
    cancelled: boolean;
    uri?: string;
    title?: string;
    source?: string;
  }>;
  verifyToneUri(options: { uri: string }): Promise<{ valid: boolean }>;
  playNativeAudio(options: {
    uri: string;
    loop?: boolean;
    gradualFadeSeconds?: number;
    maxDurationSeconds?: number;
  }): Promise<{ playing: boolean; error?: string }>;
  stopNativeAudio(): Promise<{ stopped: boolean }>;
  scheduleNativeRestAlarm(options: {
    employeeId: string;
    employeeName: string;
    sessionId: string;
    startedAtMs: number;
    targetEndMs: number;
    allocatedMinutes: number;
    notifyOnRestEnd?: boolean;
    notifyOnOvertime?: boolean;
    overtimeAlertAfterMinutes?: number;
  }): Promise<{ scheduled: boolean; notificationId: number }>;
  cancelNativeRestAlarm(options: {
    employeeId: string;
    sessionId?: string;
  }): Promise<{ cancelled: boolean }>;
  consumePendingNativeRestEvents(): Promise<{ events: NativeRestActionEvent[] }>;
  checkExactAlarmCapability(): Promise<{ canScheduleExact: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  addListener(
    eventName: 'nativeRestAction',
    listenerFunc: (data: NativeRestActionEvent) => void
  ): Promise<{ remove: () => void }>;
}

const SmartMorningNative = registerPlugin<SmartMorningNativePluginInterface>('SmartMorningNative');

class NativeAlarmBridge {
  private initialized = false;
  private actionListeners = new Set<(ev: NativeRestActionEvent) => void>();
  private processedEventIds = new Set<string>();
  private activeWebNotifications = new Map<string, Notification>();

  public isNativeAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.isNativeAndroid()) {
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {}
      }
      this.initialized = true;
      return;
    }

    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.createChannel({
        id: ALARM_CHANNEL_ID,
        name: 'منبهات ميقات الفجر الذكية',
        description: 'تنبيهات عالية الأولوية لإيقاظ الصباح ومواعيد الفجر',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#F59E0B',
      });

      await LocalNotifications.createChannel({
        id: REST_CHANNEL_ID,
        name: 'تنبيهات انتهاء استراحة الموظفين',
        description: 'إشعارات وتنبيهات فورية عند انتهاء وقت استراحة الموظف مع إجراءات مباشرة',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#EF4444',
      });

      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: REST_ACTION_TYPE_ID,
            actions: [
              {
                id: 'MARK_RETURNED',
                title: 'تمت العودة',
                foreground: false,
              },
              {
                id: 'EXTEND_REST',
                title: 'تمديد الاستراحة (+5د)',
                foreground: true,
              },
              {
                id: 'VIEW_DETAILS',
                title: 'عرض التفاصيل',
                foreground: true,
              },
            ],
          },
          {
            id: REST_START_ACTION_TYPE_ID,
            actions: [
              {
                id: 'START_REST',
                title: 'بدء الاستراحة',
                foreground: true,
              },
              {
                id: 'VIEW_DETAILS',
                title: 'فتح إدارة الاستراحات',
                foreground: true,
              },
            ],
          },
        ],
      });

      // Listen for events from our native BroadcastReceiver / MainActivity
      await SmartMorningNative.addListener('nativeRestAction', (ev) => {
        this.emitRestAction(ev);
      });

      // Also listen for Capacitor LocalNotifications actionPerformed as fallback
      await LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        const extra = notificationAction.notification?.extra || {};
        if ((extra.type !== 'rest_expired' && extra.type !== 'rest_start_prompt') || !extra.employeeId) {
          return;
        }

        let actionType: RestNotificationActionType = 'OPEN_REST_PAGE';
        if (notificationAction.actionId === 'MARK_RETURNED') {
          actionType = 'MARK_RETURNED';
        } else if (notificationAction.actionId === 'EXTEND_REST') {
          actionType = 'EXTEND_REST';
        } else if (notificationAction.actionId === 'START_REST') {
          actionType = 'START_REST';
        }

        this.emitRestAction({
          eventId: `cap_${actionType}_${extra.sessionId || extra.employeeId}_${Date.now()}`,
          action: actionType,
          employeeId: String(extra.employeeId),
          employeeName: extra.employeeName ? String(extra.employeeName) : undefined,
          sessionId: String(extra.sessionId || extra.employeeId),
          extraMinutes: extra.allocatedMinutes ? Number(extra.allocatedMinutes) : 5,
          timestampMs: Date.now(),
        });
      });

      this.initialized = true;
    } catch {
      this.initialized = true;
    }
  }

  public addRestActionListener(cb: (ev: NativeRestActionEvent) => void): () => void {
    this.actionListeners.add(cb);
    return () => {
      this.actionListeners.delete(cb);
    };
  }

  public onRestNotificationAction(cb: (ev: NativeRestActionEvent) => void): () => void {
    return this.addRestActionListener(cb);
  }

  public emitRestAction(ev: NativeRestActionEvent): void {
    if (!ev || !ev.employeeId || !ev.action) return;
    const dedupeKey = `${ev.action}:${ev.sessionId || ev.employeeId}`;
    // Prevent duplicate execution for MARK_RETURNED on the same sessionId
    if (ev.action === 'MARK_RETURNED' || ev.action === 'END_REST') {
      if (this.processedEventIds.has(dedupeKey)) return;
      this.processedEventIds.add(dedupeKey);
    } else if (ev.eventId) {
      if (this.processedEventIds.has(ev.eventId)) return;
      this.processedEventIds.add(ev.eventId);
    }

    this.actionListeners.forEach((listener) => {
      try {
        listener(ev);
      } catch {}
    });
  }

  public async consumePendingNativeRestEvents(): Promise<NativeRestActionEvent[]> {
    if (!this.isNativeAndroid()) return [];
    await this.initialize();
    try {
      const res = await SmartMorningNative.consumePendingNativeRestEvents();
      const list = Array.isArray(res?.events) ? res.events : [];
      return list;
    } catch {
      return [];
    }
  }

  public async consumePendingRestActions(): Promise<NativeRestActionEvent[]> {
    return this.consumePendingNativeRestEvents();
  }

  public async getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
    if (this.isNativeAndroid()) {
      try {
        const status = await LocalNotifications.checkPermissions();
        if (status.display === 'granted') return 'granted';
        if (status.display === 'denied') return 'denied';
        return 'prompt';
      } catch {
        return 'granted';
      }
    }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      return 'prompt';
    }
    return 'denied';
  }

  public async requestNotificationPermissionExplicit(): Promise<'granted' | 'denied' | 'prompt'> {
    if (this.isNativeAndroid()) {
      try {
        const status = await LocalNotifications.requestPermissions();
        return status.display === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'denied';
      }
    }
    if ('Notification' in window) {
      try {
        const p = await Notification.requestPermission();
        return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt';
      } catch {
        return 'denied';
      }
    }
    return 'denied';
  }

  // =========================================================================
  // SECTION 1: ANDROID SYSTEM RINGTONE PICKER & NATIVE AUDIO PLAYBACK
  // =========================================================================
  public async pickSystemAlarmRingtone(existingUri?: string): Promise<{
    cancelled: boolean;
    uri?: string;
    title?: string;
    error?: string;
  }> {
    if (!this.isNativeAndroid()) {
      return {
        cancelled: false,
        error:
          'منتقي نغمات النظام الأصلي (RingtoneManager) متاح فقط عند تشغيل التطبيق على جهاز Android. يمكنك في المتصفح استخدام تبويب «أغنياتي» لإضافة ملف صوتي من جهازك أو اختيار نغمة من «نغمات التطبيق».',
      };
    }

    try {
      const res = await SmartMorningNative.pickSystemAlarmRingtone({ existingUri });
      if (res.cancelled || !res.uri) {
        return { cancelled: true };
      }
      return {
        cancelled: false,
        uri: res.uri,
        title: res.title || 'نغمة منبه الهاتف',
      };
    } catch (err: any) {
      return {
        cancelled: false,
        error: err?.message || 'تعذر فتح منتقي نغمات أندرويد. يرجى المحاولة مرة أخرى.',
      };
    }
  }

  public async verifyToneUri(uri: string): Promise<boolean> {
    if (!uri) return false;
    if (!this.isNativeAndroid()) return false;
    try {
      const res = await SmartMorningNative.verifyToneUri({ uri });
      return Boolean(res.valid);
    } catch {
      return false;
    }
  }

  public async playNativeUriAudio(options: {
    uri: string;
    loop?: boolean;
    gradualFadeSeconds?: number;
    maxDurationSeconds?: number;
  }): Promise<{ playing: boolean; error?: string }> {
    if (!this.isNativeAndroid()) {
      return { playing: false, error: 'تشغيل روابط نظام أندرويد يتطلب بيئة أندرويد.' };
    }
    try {
      return await SmartMorningNative.playNativeAudio(options);
    } catch (err: any) {
      return { playing: false, error: err?.message || 'تعذر تشغيل النغمة المختارة.' };
    }
  }

  public async stopNativeUriAudio(): Promise<void> {
    if (!this.isNativeAndroid()) return;
    try {
      await SmartMorningNative.stopNativeAudio();
    } catch {}
  }

  // =========================================================================
  // SMART ALARMS SCHEDULING
  // =========================================================================
  public async syncSmartAlarms(alarms: AlarmItem[]): Promise<void> {
    if (!this.isNativeAndroid()) return;
    await this.initialize();

    try {
      const pending = await LocalNotifications.getPending();
      const alarmNotifIds = pending.notifications
        .filter((n) => n.id >= 1000 && n.id < 5000)
        .map((n) => ({ id: n.id }));

      if (alarmNotifIds.length > 0) {
        await LocalNotifications.cancel({ notifications: alarmNotifIds });
      }

      const now = new Date();
      const notificationsToSchedule: ScheduleOptions['notifications'] = [];
      let idCounter = 1000;

      for (const alarm of alarms) {
        if (!alarm.enabled) continue;
        const [hours, minutes] = alarm.time.split(':').map(Number);

        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
          const candidate = new Date(now);
          candidate.setDate(now.getDate() + dayOffset);
          candidate.setHours(hours, minutes, 0, 0);

          const dayAllowed =
            alarm.days.length === 0 || alarm.days.includes(candidate.getDay());

          if (dayAllowed && candidate.getTime() > now.getTime()) {
            notificationsToSchedule.push({
              id: idCounter++,
              title: `⏰ حان موعد المنبه: ${alarm.label}`,
              body: `الساعة الآن ${alarm.time} — افتح التطبيق لإيقاف المنبه.`,
              schedule: {
                at: candidate,
                allowWhileIdle: true,
              },
              channelId: ALARM_CHANNEL_ID,
              extra: {
                alarmId: alarm.id,
                type: 'smart_alarm',
              },
            });
            break;
          }
        }
      }

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule,
        });
      }
    } catch {}
  }

  // =========================================================================
  // SECTION 3: EMPLOYEE REST END SCHEDULING & NOTIFICATIONS
  // =========================================================================
  public async scheduleEmployeeRestEnd(
    employeeId: string,
    employeeName: string,
    targetEndMs: number,
    allocatedMinutesOrOptions?:
      | number
      | {
          sessionId?: string;
          startedAtMs?: number;
          allocatedMinutes?: number;
          notifyOnRestEnd?: boolean;
          notifyOnOvertime?: boolean;
          overtimeAlertAfterMinutes?: number;
        },
    notifConfig?: {
      notifyOnRestEnd?: boolean;
      notifyOnOvertime?: boolean;
      overtimeAlertAfterMinutes?: number;
    }
  ): Promise<void> {
    const isNum = typeof allocatedMinutesOrOptions === 'number';
    const allocatedMinutes = isNum
      ? allocatedMinutesOrOptions
      : allocatedMinutesOrOptions?.allocatedMinutes || 15;
    const sessionId =
      (!isNum && allocatedMinutesOrOptions?.sessionId) || `${employeeId}_${targetEndMs}`;
    const startedAtMs =
      (!isNum && allocatedMinutesOrOptions?.startedAtMs) || Date.now();
    const notifyOnRestEnd =
      notifConfig?.notifyOnRestEnd ??
      (!isNum ? allocatedMinutesOrOptions?.notifyOnRestEnd : true) ??
      true;
    const notifyOnOvertime =
      notifConfig?.notifyOnOvertime ??
      (!isNum ? allocatedMinutesOrOptions?.notifyOnOvertime : true) ??
      true;
    const overtimeAlertAfterMinutes =
      notifConfig?.overtimeAlertAfterMinutes ??
      (!isNum ? allocatedMinutesOrOptions?.overtimeAlertAfterMinutes : 5) ??
      5;

    if (this.isNativeAndroid()) {
      await this.initialize();
      try {
        await SmartMorningNative.scheduleNativeRestAlarm({
          employeeId,
          employeeName,
          sessionId,
          startedAtMs,
          targetEndMs,
          allocatedMinutes,
          notifyOnRestEnd,
          notifyOnOvertime,
          overtimeAlertAfterMinutes,
        });
        return;
      } catch {
        // Fallback to Capacitor LocalNotifications if custom plugin call fails
      }

      const notifId = this.hashEmployeeIdToNotifId(employeeId);
      const overtimeNotifId = notifId + 1;
      try {
        await LocalNotifications.cancel({
          notifications: [{ id: notifId }, { id: overtimeNotifId }],
        });
        if (targetEndMs <= Date.now()) return;

        const notificationsToSchedule: ScheduleOptions['notifications'] = [];
        if (notifyOnRestEnd) {
          notificationsToSchedule.push({
            id: notifId,
            title: `انتهت استراحة الموظف ${employeeName}`,
            body: `الموظف: ${employeeName} — انتهت مدة الاستراحة (${allocatedMinutes} دقيقة). اختر (تمت العودة) أو (تمديد الاستراحة).`,
            schedule: {
              at: new Date(targetEndMs),
              allowWhileIdle: true,
            },
            channelId: REST_CHANNEL_ID,
            actionTypeId: REST_ACTION_TYPE_ID,
            extra: {
              employeeId,
              employeeName,
              sessionId,
              startedAtMs,
              targetEndMs,
              allocatedMinutes,
              type: 'rest_expired',
            },
          });
        }

        if (notifyOnOvertime && overtimeAlertAfterMinutes > 0) {
          const overtimeAtMs = targetEndMs + overtimeAlertAfterMinutes * 60000;
          notificationsToSchedule.push({
            id: overtimeNotifId,
            title: `تنبيه تأخير: ${employeeName}`,
            body: `الموظف ${employeeName} متأخر عن استراحته بمقدار ${overtimeAlertAfterMinutes} دقيقة (المدة المخصصة: ${allocatedMinutes} د).`,
            schedule: {
              at: new Date(overtimeAtMs),
              allowWhileIdle: true,
            },
            channelId: REST_CHANNEL_ID,
            actionTypeId: REST_ACTION_TYPE_ID,
            extra: {
              employeeId,
              employeeName,
              sessionId: `${sessionId}_overtime`,
              startedAtMs,
              targetEndMs,
              allocatedMinutes,
              type: 'rest_expired',
            },
          });
        }

        if (notificationsToSchedule.length > 0) {
          await LocalNotifications.schedule({
            notifications: notificationsToSchedule,
          });
        }
      } catch {}
    }
  }

  public async sendStartRestPromptNotification(
    employeeId: string,
    employeeName: string,
    allowanceMinutes: number
  ): Promise<void> {
    if (this.isNativeAndroid()) {
      await this.initialize();
      const notifId = this.hashEmployeeIdToNotifId(employeeId) + 2;
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: `تذكير استراحة: ${employeeName}`,
              body: `الموظف ${employeeName} لم يبدأ استراحته بعد (الرصيد المتاح: ${allowanceMinutes} د). اضغط «بدء الاستراحة» للبدء فوراً.`,
              schedule: {
                at: new Date(Date.now() + 500),
                allowWhileIdle: true,
              },
              channelId: REST_CHANNEL_ID,
              actionTypeId: REST_START_ACTION_TYPE_ID,
              extra: {
                employeeId,
                employeeName,
                allocatedMinutes: allowanceMinutes,
                type: 'rest_start_prompt',
              },
            },
          ],
        });
      } catch {}
      return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(`تذكير استراحة: ${employeeName}`, {
          body: `الموظف ${employeeName} لم يبدأ استراحته بعد (الرصيد: ${allowanceMinutes} د). اضغط لبدء الاستراحة.`,
          tag: `rest_start_${employeeId}`,
        });
        n.onclick = () => {
          window.focus();
          this.emitRestAction({
            eventId: `web_start_${employeeId}_${Date.now()}`,
            action: 'START_REST',
            employeeId,
            employeeName,
            sessionId: `start_${employeeId}`,
            extraMinutes: allowanceMinutes,
            timestampMs: Date.now(),
          });
          n.close();
        };
      } catch {}
    }
  }

  /**
   * Fires an immediate system notification when a rest expires while the app is open in Web/Browser
   * (guarded by sessionId so it NEVER fires more than once for the same rest expiration).
   */
  public triggerRestExpiredSystemNotificationOnce(params: {
    employeeId: string;
    employeeName: string;
    sessionId: string;
    startedAtMs: number;
    targetEndMs: number;
    allocatedMinutes: number;
  }): void {
    const dedupeId = `notif_${params.sessionId}`;
    if (this.processedEventIds.has(dedupeId)) return;
    this.processedEventIds.add(dedupeId);

    if (this.isNativeAndroid()) {
      return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const prev = this.activeWebNotifications.get(params.employeeId);
        if (prev) prev.close();

        const startStr = new Date(params.startedAtMs).toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const endStr = new Date(params.targetEndMs).toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const n = new Notification(`انتهت استراحة الموظف ${params.employeeName}`, {
          body: `حان وقت العودة إلى العمل.\nالمدة: ${params.allocatedMinutes} د (من ${startStr} إلى ${endStr})`,
          tag: `rest_expired_${params.employeeId}`,
          requireInteraction: true,
        });

        n.onclick = () => {
          window.focus();
          this.emitRestAction({
            eventId: `web_click_${params.sessionId}_${Date.now()}`,
            action: 'OPEN_REST_PAGE',
            employeeId: params.employeeId,
            employeeName: params.employeeName,
            sessionId: params.sessionId,
            timestampMs: Date.now(),
          });
          n.close();
        };

        this.activeWebNotifications.set(params.employeeId, n);
      } catch {}
    }
  }

  public async cancelEmployeeRestNotification(
    employeeId: string,
    sessionId?: string
  ): Promise<void> {
    const webNotif = this.activeWebNotifications.get(employeeId);
    if (webNotif) {
      try {
        webNotif.close();
      } catch {}
      this.activeWebNotifications.delete(employeeId);
    }

    if (!this.isNativeAndroid()) return;

    try {
      await SmartMorningNative.cancelNativeRestAlarm({ employeeId, sessionId });
    } catch {}

    const notifId = this.hashEmployeeIdToNotifId(employeeId);
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: notifId }, { id: notifId + 1 }, { id: notifId + 2 }],
      });
    } catch {}
  }

  private hashEmployeeIdToNotifId(empId: string): number {
    let hash = 7000;
    for (let i = 0; i < empId.length; i++) {
      hash = (hash * 31 + empId.charCodeAt(i)) % 800000;
    }
    return Math.max(7000, Math.abs(hash));
  }
}

export const nativeAlarmBridge = new NativeAlarmBridge();
