import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';
import { AlarmItem } from '../types';

const ALARM_CHANNEL_ID = 'miqat_high_priority_alarms';
const REST_CHANNEL_ID = 'miqat_employee_rest_alerts';

class NativeAlarmBridge {
  private initialized = false;

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

      // Create high-importance Android notification channels for alarm wake-up
      await LocalNotifications.createChannel({
        id: ALARM_CHANNEL_ID,
        name: 'منبهات ميقات الفجر الذكية',
        description: 'تنبيهات عالية الأولوية لإيقاظ الصباح وروتين الفجر',
        importance: 5, // IMPORTANCE_HIGH / MAX
        visibility: 1, // VISIBILITY_PUBLIC on lockscreen
        vibration: true,
        lights: true,
        lightColor: '#F59E0B',
      });

      await LocalNotifications.createChannel({
        id: REST_CHANNEL_ID,
        name: 'تنبيهات استراحات الموظفين (ريست)',
        description: 'إشعارات انتهاء وقت استراحة الموظف',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#EF4444',
      });

      this.initialized = true;
    } catch {
      // Fallback silently if permissions denied
    }
  }

  /**
   * Synchronizes all enabled smart alarms with Android AlarmManager via Capacitor LocalNotifications.
   * Uses allowWhileIdle: true so alarms fire even in Android Doze mode.
   */
  public async syncSmartAlarms(alarms: AlarmItem[]): Promise<void> {
    if (!this.isNativeAndroid()) return;
    await this.initialize();

    try {
      const pending = await LocalNotifications.getPending();
      // Cancel previously scheduled smart alarms (IDs 1000..4999)
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

        // Find next occurrence of this alarm
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
              body: `الساعة الآن ${alarm.time} — افتح التطبيق لإيقاف المنبه وبدء روتين الصباح.`,
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
    } catch {
      // Ignore scheduling errors on unsupported web environments
    }
  }

  /**
   * Schedules an exact Android native notification for an employee's rest expiration
   * based on the absolute targetEndMs timestamp.
   */
  public async scheduleEmployeeRestEnd(
    employeeId: string,
    employeeName: string,
    targetEndMs: number
  ): Promise<void> {
    if (!this.isNativeAndroid()) return;
    await this.initialize();

    const notifId = this.hashEmployeeIdToNotifId(employeeId);
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
      if (targetEndMs <= Date.now()) return;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: `🔔 انتهت استراحة ${employeeName}`,
            body: `انتهى وقت الاستراحة المخصص للموظف ${employeeName}. اضغط لتسجيل الرجوع أو إيقاف التنبيه.`,
            schedule: {
              at: new Date(targetEndMs),
              allowWhileIdle: true,
            },
            channelId: REST_CHANNEL_ID,
            extra: {
              employeeId,
              type: 'rest_expired',
            },
          },
        ],
      });
    } catch {}
  }

  public async cancelEmployeeRestNotification(employeeId: string): Promise<void> {
    if (!this.isNativeAndroid()) return;
    const notifId = this.hashEmployeeIdToNotifId(employeeId);
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
    } catch {}
  }

  private hashEmployeeIdToNotifId(empId: string): number {
    let hash = 5000;
    for (let i = 0; i < empId.length; i++) {
      hash = (hash * 31 + empId.charCodeAt(i)) % 900000;
    }
    return Math.max(5000, hash);
  }
}

export const nativeAlarmBridge = new NativeAlarmBridge();
