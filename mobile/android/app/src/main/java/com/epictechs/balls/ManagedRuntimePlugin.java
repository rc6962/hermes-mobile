package com.epictechs.balls;

import android.content.Intent;
import android.util.Log;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.net.HttpURLConnection;

/**
 * Capacitor bridge for the embedded Chaquopy runtime, hosted by
 * NativeHostService. Mirrors the TermuxLifecycle contract so the TS side
 * can treat "managed" and "termux" runtimes interchangeably.
 */
@CapacitorPlugin(name = "ManagedRuntime")
public class ManagedRuntimePlugin extends Plugin {
    private static final String TAG = "ManagedRuntime";
    private static final String HERMES_HOME_DIR = "balls-home";

    /** Local Podule model: Qwen3 0.6B 8-bit (decided fallback tier). */
    private static final String LOCAL_MODEL_FILE = "Qwen3-0.6B-Q8_0.gguf";
    private static final String LOCAL_MODEL_URL =
            "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf";

    @PluginMethod
    public void start(PluginCall call) {
        try {
            if (NativeHostService.isRunning()) {
                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
                return;
            }

            // The embedded runtime is self-contained: it uses its own
            // Keystore-generated key (created on first use), never the
            // Termux pairing key — so everyday users never see a pairing
            // wall in embedded mode.
            String apiKey = SecureCredentialsPlugin.ensureEmbeddedApiKey(getContext());
            if (apiKey == null) {
                call.reject("Unable to create the embedded runtime key");
                return;
            }

            String providerJson = SecureCredentialsPlugin.readProviderConfig(getContext());
            Intent intent = new Intent(getContext(), NativeHostService.class);
            intent.putExtra(NativeHostService.EXTRA_HERMES_HOME,
                    new File(getContext().getFilesDir(), HERMES_HOME_DIR).getAbsolutePath());
            intent.putExtra(NativeHostService.EXTRA_API_KEY, apiKey);
            if (providerJson != null) {
                intent.putExtra(NativeHostService.EXTRA_PROVIDER_JSON, providerJson);
            }

            getContext().startForegroundService(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            Log.e(TAG, "start failed", error);
            call.reject("Unable to start the embedded runtime");
        }
    }

    @PluginMethod
    public void getEmbeddedApiKey(PluginCall call) {
        try {
            String key = SecureCredentialsPlugin.ensureEmbeddedApiKey(getContext());
            if (key == null) {
                call.reject("Embedded API key generation failed");
                return;
            }
            JSObject result = new JSObject();
            result.put("apiKey", key);
            call.resolve(result);
        } catch (Exception error) {
            Log.e(TAG, "getEmbeddedApiKey failed", error);
            call.reject("Unable to read the embedded API key");
        }
    }

    @PluginMethod
    public void startLocal(PluginCall call) {
        String ggufPath = call.getString("ggufPath");
        if (ggufPath == null || ggufPath.isEmpty()) {
            call.reject("missing ggufPath");
            return;
        }
        try {
            Python py = Python.getInstance();
            PyObject mod = py.getModule("balls_runtime");
            PyObject result = mod.callAttr("start_local_model", ggufPath);
            JSObject out = new JSObject(result.toString());
            call.resolve(out);
        } catch (Exception e) {
            Log.e("BallsRuntime", "startLocal failed: " + e.getMessage());
            call.reject("Balls could not start the local engine: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopLocal(PluginCall call) {
        try {
            Python py = Python.getInstance();
            PyObject mod = py.getModule("balls_runtime");
            PyObject result = mod.callAttr("stop_local_model");
            call.resolve(new JSObject(result.toString()));
        } catch (Exception e) {
            Log.e("BallsRuntime", "stopLocal failed: " + e.getMessage());
            call.reject("Balls could not stop the local engine: " + e.getMessage());
        }
    }

    @PluginMethod
    public void localStatus(PluginCall call) {
        try {
            Python py = Python.getInstance();
            PyObject mod = py.getModule("balls_runtime");
            PyObject result = mod.callAttr("local_model_status");
            call.resolve(new JSObject(result.toString()));
        } catch (Exception e) {
            Log.e("BallsRuntime", "localStatus failed: " + e.getMessage());
            call.reject("Balls could not check the local engine: " + e.getMessage());
        }
    }

    @PluginMethod
    public void hasLocalModel(PluginCall call) {
        File models = new File(getContext().getFilesDir(), "models");
        File gguf = new File(models, LOCAL_MODEL_FILE);
        JSObject out = new JSObject();
        out.put("present", gguf.isFile() && gguf.length() > 1_000_000L);
        out.put("path", gguf.getAbsolutePath());
        out.put("size", gguf.isFile() ? gguf.length() : 0L);
        call.resolve(out);
    }

    @PluginMethod
    public void downloadLocalModel(PluginCall call) {
        final String url = LOCAL_MODEL_URL;
        getContext().getMainExecutor().execute(() -> {
            try {
                File models = new File(getContext().getFilesDir(), "models");
                if (!models.exists() && !models.mkdirs()) {
                    call.reject("Balls could not create the models folder.");
                    return;
                }
                File tmp = new File(models, LOCAL_MODEL_FILE + ".part");
                File dest = new File(models, LOCAL_MODEL_FILE);
                HttpURLConnection conn = (HttpURLConnection) new java.net.URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                int code = conn.getResponseCode();
                if (code != 200) {
                    call.reject("Model download refused (" + code + ").");
                    return;
                }
                try (java.io.InputStream in = conn.getInputStream();
                     java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    long total = 0;
                    while ((read = in.read(buffer)) > 0) {
                        out.write(buffer, 0, read);
                        total += read;
                    }
                }
                if (tmp.length() < 1_000_000L) {
                    call.reject("Model download landed too small — try again.");
                    return;
                }
                if (!tmp.renameTo(dest)) {
                    call.reject("Balls could not move the model into place.");
                    return;
                }
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("path", dest.getAbsolutePath());
                call.resolve(out);
            } catch (Exception e) {
                Log.e("BallsRuntime", "downloadLocalModel failed: " + e.getMessage());
                call.reject("Model download failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getDeviceId(PluginCall call) {
        try {
            String deviceId = SecureCredentialsPlugin.getOrCreateDeviceId(getContext());
            JSObject result = new JSObject();
            result.put("deviceId", deviceId);
            call.resolve(result);
        } catch (Exception error) {
            Log.e(TAG, "getDeviceId failed", error);
            call.reject("Unable to read the device ID");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), NativeHostService.class));
            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to stop the embedded runtime");
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", NativeHostService.isRunning());
        String error = NativeHostService.getLastError();
        if (error != null) {
            result.put("error", error);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void setProviderConfig(PluginCall call) {
        String providerJson = call.getString("providerJson");
        if (providerJson == null || providerJson.trim().isEmpty()) {
            call.reject("providerJson is required");
            return;
        }
        try {
            SecureCredentialsPlugin.writeProviderConfig(getContext(), providerJson.trim());
            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to store the provider configuration");
        }
    }
}
