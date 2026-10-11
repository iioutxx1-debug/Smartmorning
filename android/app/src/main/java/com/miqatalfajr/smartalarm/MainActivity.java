package com.miqatalfajr.smartalarm;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmartMorningNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleNotificationActionIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationActionIntent(intent);
    }

    private void handleNotificationActionIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(RestAlarmReceiver.EXTRA_REST_ACTION);
        String employeeId = intent.getStringExtra(RestAlarmReceiver.EXTRA_EMPLOYEE_ID);
        String employeeName = intent.getStringExtra(RestAlarmReceiver.EXTRA_EMPLOYEE_NAME);
        String sessionId = intent.getStringExtra(RestAlarmReceiver.EXTRA_SESSION_ID);

        if (action == null || action.isEmpty() || employeeId == null || employeeId.isEmpty()) {
            return;
        }

        // Clear the extras from the intent so rotation doesn't re-trigger
        intent.removeExtra(RestAlarmReceiver.EXTRA_REST_ACTION);

        long nowMs = System.currentTimeMillis();
        SharedPreferences prefs = getSharedPreferences(RestAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        try {
            String rawEvents = prefs.getString(RestAlarmReceiver.KEY_PENDING_EVENTS, "[]");
            JSONArray events = new JSONArray(rawEvents);
            JSONObject ev = new JSONObject();
            ev.put("eventId", "act_" + action + "_" + employeeId + "_" + nowMs);
            ev.put("action", action);
            ev.put("employeeId", employeeId);
            ev.put("employeeName", employeeName != null ? employeeName : "موظف");
            ev.put("sessionId", sessionId != null ? sessionId : employeeId);
            ev.put("timestampMs", nowMs);
            events.put(ev);
            prefs.edit().putString(RestAlarmReceiver.KEY_PENDING_EVENTS, events.toString()).apply();
        } catch (Exception ignored) {}

        SmartMorningNativePlugin.dispatchRestActionToWebView(
            action,
            employeeId,
            sessionId != null ? sessionId : employeeId,
            nowMs
        );
    }
}
