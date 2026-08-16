package com.epictechs.balls;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "BallsBridge")
public class BallsBridgePlugin extends Plugin {
    private static final String PROTOCOL_VERSION = "0.1";
    private static final String[] ALL_CAPABILITIES = {
            "bridge.status",
            "accessibility.status",
            "screen.read",
            "node.find",
            "node.tap",
            "input.type",
            "system.back",
            "system.home",
            "screen.capture"
    };

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean accessibilityEnabled = isAccessibilityEnabled();
        boolean serviceConnected = BallsAccessibilityService.isConnected();
        JSArray capabilities = new JSArray();
        capabilities.put("bridge.status");
        capabilities.put("accessibility.status");

        JSArray disabledCapabilities = new JSArray();
        for (int index = 2; index < ALL_CAPABILITIES.length; index++) {
            disabledCapabilities.put(ALL_CAPABILITIES[index]);
        }

        JSObject result = new JSObject();
        result.put("protocolVersion", PROTOCOL_VERSION);
        result.put("platformAvailable", true);
        result.put("bridge", serviceConnected ? "ready" : accessibilityEnabled ? "disconnected" : "disabled");
        result.put("accessibilityEnabled", accessibilityEnabled);
        result.put("serviceConnected", serviceConnected);
        result.put("androidApiLevel", Build.VERSION.SDK_INT);
        result.put("capabilities", capabilities);
        result.put("disabledCapabilities", disabledCapabilities);
        call.resolve(result);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("accepted", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to open Android Accessibility settings");
        }
    }

    private boolean isAccessibilityEnabled() {
        AccessibilityManager manager = (AccessibilityManager) getContext()
                .getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null) {
            return false;
        }

        List<AccessibilityServiceInfo> services = manager.getEnabledAccessibilityServiceList(
                AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        for (AccessibilityServiceInfo service : services) {
            ResolveInfo resolveInfo = service.getResolveInfo();
            if (resolveInfo == null || resolveInfo.serviceInfo == null) {
                continue;
            }
            if (getContext().getPackageName().equals(resolveInfo.serviceInfo.packageName)
                    && BallsAccessibilityService.class.getName().equals(resolveInfo.serviceInfo.name)) {
                return true;
            }
        }
        return false;
    }
}
