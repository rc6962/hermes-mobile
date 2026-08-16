package com.epictechs.balls;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Foreground service hosting the embedded Chaquopy Python runtime. Boots
 * balls_runtime.start_runtime() on a background thread and exposes the
 * outcome (ok/error) through static accessors for ManagedRuntimePlugin.
 * Every Python call is guarded so a runtime failure never crashes the
 * service or the app.
 */
public class NativeHostService extends Service {
    private static final String TAG = "NativeHostService";

    public static final String EXTRA_HERMES_HOME = "hermesHome";
    public static final String EXTRA_API_KEY = "apiKey";
    public static final String EXTRA_PROVIDER_JSON = "providerJson";

    private static final String CHANNEL_ID = "balls_runtime";
    private static final int NOTIFICATION_ID = 8642;
    private static final int DEFAULT_PORT = 8642;

    private static final Object START_LOCK = new Object();
    private static volatile boolean sStarting = false;
    private static volatile boolean sRunning = false;
    private static volatile String sLastError = null;

    private PyObject pyModule;

    public static boolean isRunning() {
        return sRunning;
    }

    public static String getLastError() {
        return sLastError;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        enterForeground(NOTIFICATION_ID, buildNotification());

        String hermesHome = intent != null ? intent.getStringExtra(EXTRA_HERMES_HOME) : null;
        String apiKey = intent != null ? intent.getStringExtra(EXTRA_API_KEY) : null;
        String providerJson = intent != null ? intent.getStringExtra(EXTRA_PROVIDER_JSON) : null;

        if (hermesHome == null || apiKey == null || apiKey.isEmpty()) {
            sRunning = false;
            sLastError = "Missing runtime extras (hermesHome/apiKey)";
            Log.e(TAG, sLastError);
            stopSelf();
            return START_NOT_STICKY;
        }

        Thread worker = new Thread(() -> startRuntime(hermesHome, apiKey, providerJson), "balls-runtime-start");
        worker.start();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopRuntime();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Balls runtime", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Embedded local AI engine");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Balls runtime")
                .setContentText("Local AI engine is ready")
                .setOngoing(true)
                .build();
    }

    private void enterForeground(int id, Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(id, notification, 0);
        } else {
            startForeground(id, notification);
        }
    }

    private void startRuntime(String hermesHome, String apiKey, String providerJson) {
        synchronized (START_LOCK) {
            if (sStarting) {
                return;
            }
            sStarting = true;
        }
        try {
            Python.start(new AndroidPlatform(this));
            Python py = Python.getInstance();
            pyModule = py.getModule("balls_runtime");
            PyObject result = pyModule.callAttr("start_runtime", hermesHome, apiKey, DEFAULT_PORT, providerJson);
            JSONObject status = parseResult(py, result);
            boolean ok = status.optBoolean("ok", false);
            sRunning = ok;
            sLastError = ok ? null : status.optString("error", "Embedded runtime failed to start");
            if (ok) {
                Log.i(TAG, "Embedded runtime is up on port " + DEFAULT_PORT);
            } else {
                Log.e(TAG, "balls_runtime.start_runtime failed: " + sLastError);
            }
        } catch (Throwable error) {
            // A Python/runtime failure must never crash the service.
            sRunning = false;
            sLastError = error.getMessage() != null ? error.getMessage() : error.getClass().getSimpleName();
            Log.e(TAG, "Failed to start the embedded runtime", error);
        } finally {
            synchronized (START_LOCK) {
                sStarting = false;
            }
        }
    }

    private JSONObject parseResult(Python py, PyObject result) throws Exception {
        try {
            return new JSONObject(result.toString());
        } catch (JSONException ignored) {
            // Python's str(dict) repr is not strict JSON; serialize properly.
            return new JSONObject(py.getModule("json").callAttr("dumps", result).toString());
        }
    }

    private void stopRuntime() {
        sRunning = false;
        if (pyModule == null) {
            return;
        }
        try {
            pyModule.callAttr("stop_runtime");
        } catch (Throwable error) {
            Log.w(TAG, "stop_runtime failed", error);
        }
    }
}
