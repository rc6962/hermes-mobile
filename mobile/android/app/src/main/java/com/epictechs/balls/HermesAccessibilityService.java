package com.epictechs.balls;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

public class HermesAccessibilityService extends AccessibilityService {
    private static volatile HermesAccessibilityService instance;

    static boolean isConnected() {
        return instance != null;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Status-only milestone: do not read, retain, or forward screen content yet.
    }

    @Override
    public void onInterrupt() {
        // No in-flight action executor exists in this milestone.
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }
}
