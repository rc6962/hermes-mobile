package com.rickcain.hermesmobile;

import android.content.ComponentName;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.List;

@CapacitorPlugin(name = "TermuxLifecycle")
public class TermuxLifecyclePlugin extends Plugin {
    private static final String TERMUX_PACKAGE = "com.termux";
    private static final String RUN_COMMAND_SERVICE = "com.termux.app.RunCommandService";
    private static final String RUN_COMMAND_ACTION = "com.termux.RUN_COMMAND";
    private static final String RUN_COMMAND_PATH = "com.termux.RUN_COMMAND_PATH";
    private static final String RUN_COMMAND_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS";
    private static final String RUN_COMMAND_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR";
    private static final String RUN_COMMAND_BACKGROUND = "com.termux.RUN_COMMAND_BACKGROUND";
    private static final String RUN_COMMAND_SESSION_ACTION = "com.termux.RUN_COMMAND_SESSION_ACTION";
    private static final String SCRIPT_PATH = "/data/data/com.termux/files/home/.hermes/mobile-lifecycle.sh";
    private static final String WORKDIR = "/data/data/com.termux/files/home";
    private static final List<String> ALLOWED_ACTIONS = Arrays.asList(
            "start", "stop", "restart", "doctor", "update"
    );

    @PluginMethod
    public void run(PluginCall call) {
        String action = call.getString("action");
        if (action == null || !ALLOWED_ACTIONS.contains(action)) {
            call.reject("Unsupported lifecycle action");
            return;
        }

        Intent intent = new Intent(RUN_COMMAND_ACTION);
        intent.setComponent(new ComponentName(TERMUX_PACKAGE, RUN_COMMAND_SERVICE));
        intent.putExtra(RUN_COMMAND_PATH, SCRIPT_PATH);
        intent.putExtra(RUN_COMMAND_ARGUMENTS, new String[]{action});
        intent.putExtra(RUN_COMMAND_WORKDIR, WORKDIR);
        intent.putExtra(RUN_COMMAND_BACKGROUND, true);
        intent.putExtra(RUN_COMMAND_SESSION_ACTION, "0");

        try {
            getContext().startService(intent);
            JSObject result = new JSObject();
            result.put("accepted", true);
            result.put("action", action);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Termux is unavailable or RUN_COMMAND permission is not granted");
        }
    }
}
