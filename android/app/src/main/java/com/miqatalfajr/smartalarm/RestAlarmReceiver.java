package com.miqatalfajr.smartalarm;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class RestAlarmReceiver extends BroadcastReceiver {
    public static final String PREFS_NAME = "miqat_native_rest_store";
    public static final String KEY_ACTIVE_SESSIONS = "active_sessions_json";
    public static final String KEY_PENDING_EVENTS = "pending_rest_events_json";
    public static final String KEY_HANDLED_SESSIONS = "handled_sessions_json";

    public static final String CHANNEL_ID = "miqat_rest_expired_channel_v2";
    public static final String GROUP_KEY_REST_ALERTS = "com.miqatalfajr.smartalarm.REST_ALERTS";

    public static final String ACTION_REST_EXPIRED = "com.miqatalfajr.smartalarm.ACTION_REST_EXPIRED";
    public static final String ACTION_MARK_RETURNED = "com.miqatalfajr.smartalarm.ACTION_MARK_RETURNED";

    public static final String EXTRA_EMPLOYEE_ID = "extra_employee_id";
    public static final String EXTRA_EMPLOYEE_NAME = "extra_employee_name";
    public static final String EXTRA_SESSION_ID = "extra_session_id";
    public static final String EXTRA_STARTED_AT_MS = "extra_started_at_ms";
    public static final String EXTRA_TARGET_END_MS = "extra_target_end_ms";
    public static final String EXTRA_ALLOCATED_MINUTES = "extra_allocated_minutes";
    public static final String EXTRA_REST_ACTION = "extra_rest_action";

    public static int computeStableId(String employeeId) {
        if (employeeId == null || employeeId.isEmpty()) return 7000;
        int hash = 7000;
        for (int i = 0; i < employeeId.length(); i++) {
            hash = (hash * 31 + employeeId.charAt(i)) % 800000;
        }
        return Math.max(7000, Math.abs(hash));
    }

    public static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (alarmSound == null) {
                    alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "تنبيهات انتهاء استراحة الموظفين",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("إشعارات وتنبيهات فورية عند انتهاء وقت استراحة الموظف مع إجراءات مباشرة");
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 400, 200, 400, 200, 600});
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
                if (alarmSound != null) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                    channel.setSound(alarmSound, attrs);
                }
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        String employeeId = intent.getStringExtra(EXTRA_EMPLOYEE_ID);
        String employeeName = intent.getStringExtra(EXTRA_EMPLOYEE_NAME);
        String sessionId = intent.getStringExtra(EXTRA_SESSION_ID);

        if (employeeId == null || employeeId.isEmpty()) return;
        if (employeeName == null || employeeName.isEmpty()) employeeName = "موظف";
        if (sessionId == null || sessionId.isEmpty()) sessionId = employeeId;

        if (ACTION_REST_EXPIRED.equals(action)) {
            handleRestExpired(context, intent, employeeId, employeeName, sessionId);
        } else if (ACTION_MARK_RETURNED.equals(action)) {
            handleMarkReturnedFromNotification(context, employeeId, employeeName, sessionId);
        }
    }

    private void handleRestExpired(
        Context context,
        Intent intent,
        String employeeId,
        String employeeName,
        String sessionId
    ) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (isSessionAlreadyHandled(prefs, sessionId)) {
            return;
        }

        long startedAtMs = intent.getLongExtra(EXTRA_STARTED_AT_MS, 0L);
        long targetEndMs = intent.getLongExtra(EXTRA_TARGET_END_MS, System.currentTimeMillis());
        int allocatedMinutes = intent.getIntExtra(EXTRA_ALLOCATED_MINUTES, 15);

        ensureNotificationChannel(context);

        SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", new Locale("ar"));
        String startStr = startedAtMs > 0 ? sdf.format(new Date(startedAtMs)) : "--:--";
        String endStr = targetEndMs > 0 ? sdf.format(new Date(targetEndMs)) : "--:--";

        String title = "انتهت استراحة الموظف " + employeeName;
        String shortBody = "حان وقت العودة إلى العمل. (المدة المحددة: " + allocatedMinutes + " دقيقة)";
        String expandedBody = "حان وقت العودة إلى العمل.\n"
            + "• الموظف: " + employeeName + "\n"
            + "• مدة الاستراحة: " + allocatedMinutes + " دقيقة\n"
            + "• وقت البدء: " + startStr + " — وقت الانتهاء المحدد: " + endStr;

        int notifId = computeStableId(employeeId);

        // Action 1: Direct Broadcast Action "تمت العودة" (Executes without needing to open UI first)
        Intent returnIntent = new Intent(context, RestAlarmReceiver.class);
        returnIntent.setAction(ACTION_MARK_RETURNED);
        returnIntent.putExtra(EXTRA_EMPLOYEE_ID, employeeId);
        returnIntent.putExtra(EXTRA_EMPLOYEE_NAME, employeeName);
        returnIntent.putExtra(EXTRA_SESSION_ID, sessionId);
        int returnFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            returnFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent returnPendingIntent = PendingIntent.getBroadcast(
            context,
            notifId + 1,
            returnIntent,
            returnFlags
        );

        // Action 2: "تمديد الاستراحة" (Opens app directly to the Extend Rest modal for this exact employee)
        Intent extendIntent = new Intent(context, MainActivity.class);
        extendIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        extendIntent.putExtra(EXTRA_REST_ACTION, "EXTEND_REST");
        extendIntent.putExtra(EXTRA_EMPLOYEE_ID, employeeId);
        extendIntent.putExtra(EXTRA_EMPLOYEE_NAME, employeeName);
        extendIntent.putExtra(EXTRA_SESSION_ID, sessionId);
        PendingIntent extendPendingIntent = PendingIntent.getActivity(
            context,
            notifId + 2,
            extendIntent,
            returnFlags
        );

        // Action 3: "عرض التفاصيل" (Opens app directly to this employee in Employee Rest Manager)
        Intent detailsIntent = new Intent(context, MainActivity.class);
        detailsIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        detailsIntent.putExtra(EXTRA_REST_ACTION, "VIEW_DETAILS");
        detailsIntent.putExtra(EXTRA_EMPLOYEE_ID, employeeId);
        detailsIntent.putExtra(EXTRA_EMPLOYEE_NAME, employeeName);
        detailsIntent.putExtra(EXTRA_SESSION_ID, sessionId);
        PendingIntent detailsPendingIntent = PendingIntent.getActivity(
            context,
            notifId + 3,
            detailsIntent,
            returnFlags
        );

        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (soundUri == null) {
            soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(shortBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(expandedBody))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setSound(soundUri)
            .setVibrate(new long[]{0, 400, 200, 400, 200, 600})
            .setGroup(GROUP_KEY_REST_ALERTS)
            .setContentIntent(detailsPendingIntent)
            .addAction(android.R.drawable.checkbox_on_background, "تمت العودة", returnPendingIntent)
            .addAction(android.R.drawable.ic_menu_recent_history, "تمديد الاستراحة", extendPendingIntent)
            .addAction(android.R.drawable.ic_menu_info_details, "عرض التفاصيل", detailsPendingIntent);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(notifId, builder.build());
        }
    }

    private void handleMarkReturnedFromNotification(
        Context context,
        String employeeId,
        String employeeName,
        String sessionId
    ) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        // Idempotency guard: prevent duplicate return recording if button tapped twice
        if (isSessionAlreadyHandled(prefs, sessionId)) {
            cancelNotificationAndAlarm(context, employeeId);
            return;
        }
        markSessionHandled(prefs, sessionId);
        removeActiveSessionFromPrefs(prefs, employeeId);
        cancelNotificationAndAlarm(context, employeeId);

        // Stop any playing native audio
        SmartMorningNativePlugin.stopActiveMediaPlayerStatic();

        long actionTimeMs = System.currentTimeMillis();
        try {
            String rawEvents = prefs.getString(KEY_PENDING_EVENTS, "[]");
            JSONArray events = new JSONArray(rawEvents);
            JSONObject ev = new JSONObject();
            ev.put("eventId", "ret_" + sessionId + "_" + actionTimeMs);
            ev.put("action", "MARK_RETURNED");
            ev.put("employeeId", employeeId);
            ev.put("employeeName", employeeName);
            ev.put("sessionId", sessionId);
            ev.put("timestampMs", actionTimeMs);
            events.put(ev);
            prefs.edit().putString(KEY_PENDING_EVENTS, events.toString()).apply();
        } catch (Exception ignored) {}

        // If the app WebView is currently running, notify the plugin immediately
        SmartMorningNativePlugin.dispatchRestActionToWebView(
            "MARK_RETURNED",
            employeeId,
            sessionId,
            actionTimeMs
        );
    }

    public static void cancelNotificationAndAlarm(Context context, String employeeId) {
        int notifId = computeStableId(employeeId);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notifId);
        }

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            Intent alarmIntent = new Intent(context, RestAlarmReceiver.class);
            alarmIntent.setAction(ACTION_REST_EXPIRED);
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, notifId, alarmIntent, flags);
            if (pi != null) {
                am.cancel(pi);
                pi.cancel();
            }
        }
    }

    public static boolean isSessionAlreadyHandled(SharedPreferences prefs, String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return false;
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_HANDLED_SESSIONS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                if (sessionId.equals(arr.optString(i))) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public static void markSessionHandled(SharedPreferences prefs, String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return;
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_HANDLED_SESSIONS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                if (sessionId.equals(arr.optString(i))) return;
            }
            // Keep last 100 handled session IDs
            JSONArray trimmed = new JSONArray();
            int start = Math.max(0, arr.length() - 99);
            for (int i = start; i < arr.length(); i++) {
                trimmed.put(arr.get(i));
            }
            trimmed.put(sessionId);
            prefs.edit().putString(KEY_HANDLED_SESSIONS, trimmed.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static void removeActiveSessionFromPrefs(SharedPreferences prefs, String employeeId) {
        try {
            JSONObject activeMap = new JSONObject(prefs.getString(KEY_ACTIVE_SESSIONS, "{}"));
            if (activeMap.has(employeeId)) {
                activeMap.remove(employeeId);
                prefs.edit().putString(KEY_ACTIVE_SESSIONS, activeMap.toString()).apply();
            }
        } catch (Exception ignored) {}
    }
}
