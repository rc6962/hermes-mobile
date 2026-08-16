package com.epictechs.balls;

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Capacitor bridge for the embedded Chaquopy runtime, hosted by
 * NativeHostService. Mirrors the TermuxLifecycle contract so the TS side
 * can treat "managed" and "termux" runtimes interchangeably.
 */
@CapacitorPlugin(name = "ManagedRuntime")
public class ManagedRuntimePlugin extends Plugin {
    private static final String TAG = "ManagedRuntime";
    private static final String HERMES_HOME_DIR = "hermes-home";

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
