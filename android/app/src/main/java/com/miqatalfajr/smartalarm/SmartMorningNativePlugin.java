package com.miqatalfajr.smartalarm;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "SmartMorningNative")
public class SmartMorningNativePlugin extends Plugin {
    private static SmartMorningNativePlugin activeInstance;
    private static MediaPlayer activeMediaPlayer;
    private static Handler fadeHandler = new Handler(Looper.getMainLooper());
    private static Runnable fadeRunnable;
    private static Runnable autoStopRunnable;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        RestAlarmReceiver.ensureNotificationChannel(getContext());
    }

    public static void dispatchRestActionToWebView(
        String action,
        String employeeId,
        String sessionId,
        long timestampMs
    ) {
        if (activeInstance != null) {
            JSObject data = new JSObject();
            data.put("action", action);
            data.put("employeeId", employeeId);
            data.put("sessionId", sessionId);
            data.put("timestampMs", timestampMs);
            activeInstance.notifyListeners("nativeRestAction", data, true);
        }
    }

    public static synchronized void stopActiveMediaPlayerStatic() {
        if (fadeRunnable != null) {
            fadeHandler.removeCallbacks(fadeRunnable);
            fadeRunnable = null;
        }
        if (autoStopRunnable != null) {
            fadeHandler.removeCallbacks(autoStopRunnable);
            autoStopRunnable = null;
        }
        if (activeMediaPlayer != null) {
            try {
                if (activeMediaPlayer.isPlaying()) {
                    activeMediaPlayer.stop();
                }
            } catch (Exception ignored) {}
            try {
                activeMediaPlayer.release();
            } catch (Exception ignored) {}
            activeMediaPlayer = null;
        }
    }

    // =========================================================================
    // SECTION 1: REAL ANDROID SYSTEM RINGTONE PICKER (RingtoneManager)
    // =========================================================================
    @PluginMethod
    public void pickSystemAlarmRingtone(PluginCall call) {
        try {
            String existingUriStr = call.getString("existingUri");
            Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "اختر نغمة المنبه من الهاتف");

            Uri defaultAlarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (defaultAlarmUri != null) {
                intent.putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, defaultAlarmUri);
            }

            if (existingUriStr != null && !existingUriStr.trim().isEmpty()) {
                try {
                    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(existingUriStr));
                } catch (Exception ignored) {}
            } else if (defaultAlarmUri != null) {
                intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, defaultAlarmUri);
            }

            startActivityForResult(call, intent, "handleRingtonePicked");
        } catch (Exception e) {
            call.reject("تعذر فتح منتقي نغمات أندرويد: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleRingtonePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Intent data = result.getData();
        Uri pickedUri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pickedUri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri.class);
        } else {
            pickedUri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        }

        if (pickedUri == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        String title = "نغمة منبه النظام";
        try {
            Ringtone ringtone = RingtoneManager.getRingtone(getContext(), pickedUri);
            if (ringtone != null) {
                String resolved = ringtone.getTitle(getContext());
                if (resolved != null && !resolved.trim().isEmpty()) {
                    title = resolved.trim();
                }
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("cancelled", false);
        ret.put("uri", pickedUri.toString());
        ret.put("title", title);
        ret.put("source", "phone_ringtone");
        call.resolve(ret);
    }

    // =========================================================================
    // SECTION 2: IMPORT AUDIO SONG FROM DEVICE & SAFE APP-PRIVATE STORAGE
    // =========================================================================
    @PluginMethod
    public void pickAudioFileFromDevice(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("audio/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "audio/mpeg",
                "audio/mp4",
                "audio/x-m4a",
                "audio/mp3",
                "audio/wav",
                "audio/x-wav",
                "audio/aac",
                "audio/ogg",
                "application/ogg",
                "audio/*"
            });
            intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            );
            startActivityForResult(call, intent, "handleAudioFilePicked");
        } catch (Exception e) {
            call.reject("تعذر فتح منتقي الملفات الصوتية: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleAudioFilePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Uri sourceUri = result.getData().getData();
        if (sourceUri == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Context ctx = getContext();
        ContentResolver resolver = ctx.getContentResolver();

        // Take persistable permission if supported by the document provider
        try {
            resolver.takePersistableUriPermission(sourceUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {}

        String displayName = "ملف صوتي";
        long sizeBytes = 0L;
        String mimeType = resolver.getType(sourceUri);
        if (mimeType == null) mimeType = "audio/mpeg";

        try (Cursor cursor = resolver.query(sourceUri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIdx >= 0 && !cursor.isNull(nameIdx)) {
                    displayName = cursor.getString(nameIdx);
                }
                int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                    sizeBytes = cursor.getLong(sizeIdx);
                }
            }
        } catch (Exception ignored) {}

        // Copy file safely into app-private storage (files/imported_songs/) so it never expires
        String songId = "song_" + System.currentTimeMillis();
        String safeExt = ".mp3";
        int dotIdx = displayName.lastIndexOf('.');
        if (dotIdx > 0 && dotIdx < displayName.length() - 1) {
            String extCandidate = displayName.substring(dotIdx).toLowerCase();
            if (extCandidate.matches("\\.(mp3|m4a|wav|aac|ogg|flac|mp4)")) {
                safeExt = extCandidate;
            }
        }

        File songsDir = new File(ctx.getFilesDir(), "imported_songs");
        if (!songsDir.exists()) {
            songsDir.mkdirs();
        }
        File destFile = new File(songsDir, songId + safeExt);

        long copiedBytes = 0L;
        try (InputStream in = resolver.openInputStream(sourceUri);
             FileOutputStream out = new FileOutputStream(destFile)) {
            if (in == null) {
                call.reject("تعذر قراءة الملف الصوتي المختار.");
                return;
            }
            byte[] buf = new byte[8192];
            int read;
            while ((read = in.read(buf)) != -1) {
                out.write(buf, 0, read);
                copiedBytes += read;
            }
            out.flush();
        } catch (Exception e) {
            call.reject("فشل حفظ نسخة آمنة من الأغنية داخل التطبيق: " + e.getMessage());
            return;
        }

        if (sizeBytes <= 0L) {
            sizeBytes = copiedBytes;
        }

        int durationSeconds = 0;
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(destFile.getAbsolutePath());
            String durStr = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (durStr != null) {
                durationSeconds = Math.max(1, Math.round(Long.parseLong(durStr) / 1000f));
            }
        } catch (Exception ignored) {
        } finally {
            try {
                mmr.release();
            } catch (Exception ignored) {}
        }

        String cleanName = displayName;
        if (dotIdx > 0) {
            cleanName = displayName.substring(0, dotIdx);
        }

        JSObject ret = new JSObject();
        ret.put("cancelled", false);
        ret.put("id", songId);
        ret.put("name", cleanName);
        ret.put("fileName", displayName);
        ret.put("uri", Uri.fromFile(destFile).toString());
        ret.put("originalContentUri", sourceUri.toString());
        ret.put("mimeType", mimeType);
        ret.put("sizeBytes", sizeBytes);
        ret.put("durationSeconds", durationSeconds);
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteImportedAudioFile(PluginCall call) {
        String uriStr = call.getString("uri");
        JSObject ret = new JSObject();
        if (uriStr == null || uriStr.isEmpty()) {
            ret.put("deleted", false);
            call.resolve(ret);
            return;
        }

        try {
            Uri uri = Uri.parse(uriStr);
            if ("file".equalsIgnoreCase(uri.getScheme()) && uri.getPath() != null) {
                File f = new File(uri.getPath());
                File songsDir = new File(getContext().getFilesDir(), "imported_songs");
                // Security check: only delete files inside our app-private imported_songs folder
                if (f.getCanonicalPath().startsWith(songsDir.getCanonicalPath()) && f.exists()) {
                    boolean deleted = f.delete();
                    ret.put("deleted", deleted);
                    call.resolve(ret);
                    return;
                }
            }
        } catch (Exception ignored) {}

        ret.put("deleted", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void verifyToneUri(PluginCall call) {
        String uriStr = call.getString("uri");
        JSObject ret = new JSObject();
        if (uriStr == null || uriStr.trim().isEmpty()) {
            ret.put("valid", false);
            call.resolve(ret);
            return;
        }

        boolean isValid = isUriAccessible(getContext(), uriStr);
        ret.put("valid", isValid);
        call.resolve(ret);
    }

    public static boolean isUriAccessible(Context context, String uriStr) {
        if (uriStr == null || uriStr.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(uriStr);
            if ("file".equalsIgnoreCase(uri.getScheme()) && uri.getPath() != null) {
                File f = new File(uri.getPath());
                return f.exists() && f.canRead() && f.length() > 0;
            }
            try (InputStream is = context.getContentResolver().openInputStream(uri)) {
                return is != null;
            }
        } catch (Exception e) {
            return false;
        }
    }

    // =========================================================================
    // NATIVE AUDIO PLAYBACK FOR SYSTEM RINGTONES & IMPORTED SONGS
    // =========================================================================
    @PluginMethod
    public void playNativeAudio(PluginCall call) {
        String uriStr = call.getString("uri");
        boolean loop = Boolean.TRUE.equals(call.getBoolean("loop", true));
        int gradualFadeSeconds = call.getInt("gradualFadeSeconds", 0);
        int maxDurationSeconds = call.getInt("maxDurationSeconds", 0);

        stopActiveMediaPlayerStatic();

        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("لم يتم تحديد رابط النغمة (URI).");
            return;
        }

        try {
            Uri uri = Uri.parse(uriStr);
            MediaPlayer mp = new MediaPlayer();
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            mp.setAudioAttributes(attrs);
            mp.setDataSource(getContext(), uri);
            mp.setLooping(loop);

            final float startVol = gradualFadeSeconds > 0 ? 0.08f : 1.0f;
            mp.setVolume(startVol, startVol);
            mp.prepare();
            mp.start();
            activeMediaPlayer = mp;

            if (gradualFadeSeconds > 0) {
                final int steps = 20;
                final long stepDelayMs = Math.max(100L, (gradualFadeSeconds * 1000L) / steps);
                final int[] currentStep = {0};
                fadeRunnable = new Runnable() {
                    @Override
                    public void run() {
                        if (activeMediaPlayer == null) return;
                        currentStep[0]++;
                        float vol = Math.min(1.0f, startVol + ((1.0f - startVol) * currentStep[0]) / steps);
                        try {
                            activeMediaPlayer.setVolume(vol, vol);
                        } catch (Exception ignored) {}
                        if (currentStep[0] < steps) {
                            fadeHandler.postDelayed(this, stepDelayMs);
                        }
                    }
                };
                fadeHandler.postDelayed(fadeRunnable, stepDelayMs);
            }

            if (maxDurationSeconds > 0) {
                autoStopRunnable = () -> stopActiveMediaPlayerStatic();
                fadeHandler.postDelayed(autoStopRunnable, maxDurationSeconds * 1000L);
            }

            JSObject ret = new JSObject();
            ret.put("playing", true);
            call.resolve(ret);
        } catch (Exception e) {
            stopActiveMediaPlayerStatic();
            JSObject ret = new JSObject();
            ret.put("playing", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopNativeAudio(PluginCall call) {
        stopActiveMediaPlayerStatic();
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    // =========================================================================
    // SECTION 3: EXACT EMPLOYEE REST SCHEDULING & NATIVE NOTIFICATION SYNC
    // =========================================================================
    @PluginMethod
    public void scheduleNativeRestAlarm(PluginCall call) {
        String employeeId = call.getString("employeeId");
        String employeeName = call.getString("employeeName", "موظف");
        String sessionId = call.getString("sessionId", employeeId);
        Long startedAtMs = call.getLong("startedAtMs", System.currentTimeMillis());
        Long targetEndMs = call.getLong("targetEndMs", 0L);
        Integer allocatedMinutes = call.getInt("allocatedMinutes", 15);

        if (employeeId == null || employeeId.isEmpty() || targetEndMs == null || targetEndMs <= 0L) {
            call.reject("بيانات جدولة الاستراحة غير مكتملة.");
            return;
        }

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(RestAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        try {
            JSONObject activeMap = new JSONObject(prefs.getString(RestAlarmReceiver.KEY_ACTIVE_SESSIONS, "{}"));
            JSONObject item = new JSONObject();
            item.put("employeeId", employeeId);
            item.put("employeeName", employeeName);
            item.put("sessionId", sessionId);
            item.put("startedAtMs", startedAtMs);
            item.put("targetEndMs", targetEndMs);
            item.put("allocatedMinutes", allocatedMinutes);
            activeMap.put(employeeId, item);
            prefs.edit().putString(RestAlarmReceiver.KEY_ACTIVE_SESSIONS, activeMap.toString()).apply();
        } catch (Exception ignored) {}

        scheduleExactOrAllowIdleRestAlarm(
            ctx,
            employeeId,
            employeeName,
            sessionId,
            startedAtMs,
            targetEndMs,
            allocatedMinutes
        );

        JSObject ret = new JSObject();
        ret.put("scheduled", true);
        ret.put("notificationId", RestAlarmReceiver.computeStableId(employeeId));
        call.resolve(ret);
    }

    public static void scheduleExactOrAllowIdleRestAlarm(
        Context context,
        String employeeId,
        String employeeName,
        String sessionId,
        long startedAtMs,
        long targetEndMs,
        int allocatedMinutes
    ) {
        RestAlarmReceiver.ensureNotificationChannel(context);

        // Cancel any existing notification for this employee before scheduling the new one
        RestAlarmReceiver.cancelNotificationAndAlarm(context, employeeId);

        int reqCode = RestAlarmReceiver.computeStableId(employeeId);
        Intent intent = new Intent(context, RestAlarmReceiver.class);
        intent.setAction(RestAlarmReceiver.ACTION_REST_EXPIRED);
        intent.putExtra(RestAlarmReceiver.EXTRA_EMPLOYEE_ID, employeeId);
        intent.putExtra(RestAlarmReceiver.EXTRA_EMPLOYEE_NAME, employeeName);
        intent.putExtra(RestAlarmReceiver.EXTRA_SESSION_ID, sessionId);
        intent.putExtra(RestAlarmReceiver.EXTRA_STARTED_AT_MS, startedAtMs);
        intent.putExtra(RestAlarmReceiver.EXTRA_TARGET_END_MS, targetEndMs);
        intent.putExtra(RestAlarmReceiver.EXTRA_ALLOCATED_MINUTES, allocatedMinutes);

        if (targetEndMs <= System.currentTimeMillis()) {
            context.sendBroadcast(intent);
            return;
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(context, reqCode, intent, flags);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetEndMs, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetEndMs, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetEndMs, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, targetEndMs, pi);
            }
        } catch (SecurityException se) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetEndMs, pi);
        }
    }

    @PluginMethod
    public void cancelNativeRestAlarm(PluginCall call) {
        String employeeId = call.getString("employeeId");
        String sessionId = call.getString("sessionId");
        if (employeeId != null && !employeeId.isEmpty()) {
            Context ctx = getContext();
            SharedPreferences prefs = ctx.getSharedPreferences(RestAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            RestAlarmReceiver.removeActiveSessionFromPrefs(prefs, employeeId);
            if (sessionId != null && !sessionId.isEmpty()) {
                RestAlarmReceiver.markSessionHandled(prefs, sessionId);
            }
            RestAlarmReceiver.cancelNotificationAndAlarm(ctx, employeeId);
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void consumePendingNativeRestEvents(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(RestAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        String rawEvents = prefs.getString(RestAlarmReceiver.KEY_PENDING_EVENTS, "[]");
        prefs.edit().putString(RestAlarmReceiver.KEY_PENDING_EVENTS, "[]").apply();

        JSArray jsEvents = new JSArray();
        try {
            JSONArray arr = new JSONArray(rawEvents);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.optJSONObject(i);
                if (obj != null) {
                    JSObject item = new JSObject();
                    item.put("eventId", obj.optString("eventId"));
                    item.put("action", obj.optString("action"));
                    item.put("employeeId", obj.optString("employeeId"));
                    item.put("employeeName", obj.optString("employeeName"));
                    item.put("sessionId", obj.optString("sessionId"));
                    item.put("timestampMs", obj.optLong("timestampMs", System.currentTimeMillis()));
                    jsEvents.put(item);
                }
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("events", jsEvents);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkExactAlarmCapability(PluginCall call) {
        boolean canScheduleExact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                canScheduleExact = am.canScheduleExactAlarms();
            }
        }
        JSObject ret = new JSObject();
        ret.put("canScheduleExact", canScheduleExact);
        call.resolve(ret);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
