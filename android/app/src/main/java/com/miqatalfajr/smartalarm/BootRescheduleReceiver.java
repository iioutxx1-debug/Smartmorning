package com.miqatalfajr.smartalarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.util.Iterator;

public class BootRescheduleReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(RestAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        try {
            JSONObject activeMap = new JSONObject(prefs.getString(RestAlarmReceiver.KEY_ACTIVE_SESSIONS, "{}"));
            Iterator<String> keys = activeMap.keys();
            while (keys.hasNext()) {
                String empId = keys.next();
                JSONObject item = activeMap.optJSONObject(empId);
                if (item == null) continue;
                String sessionId = item.optString("sessionId", empId);
                if (RestAlarmReceiver.isSessionAlreadyHandled(prefs, sessionId)) continue;

                String empName = item.optString("employeeName", "موظف");
                long startedAtMs = item.optLong("startedAtMs", 0L);
                long targetEndMs = item.optLong("targetEndMs", 0L);
                int allocatedMinutes = item.optInt("allocatedMinutes", 15);
                if (targetEndMs > 0L) {
                    SmartMorningNativePlugin.scheduleExactOrAllowIdleRestAlarm(
                        context,
                        empId,
                        empName,
                        sessionId,
                        startedAtMs,
                        targetEndMs,
                        allocatedMinutes
                    );
                }
            }
        } catch (Exception ignored) {}
    }
}
