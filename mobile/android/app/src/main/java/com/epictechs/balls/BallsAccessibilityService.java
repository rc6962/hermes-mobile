package com.epictechs.balls;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Bounded READ-ONLY accessibility bridge (phase 2).
 *
 * Builds a capped, redacted snapshot of the active window's accessibility
 * tree on demand. Nothing is retained beyond the latest snapshot, no
 * actions/gestures are performed, and every node passes through the
 * documented limits (maxNodes/maxDepth/text cap/password redaction).
 */
public class BallsAccessibilityService extends AccessibilityService {
    private static final int MAX_NODES = 256;
    private static final int MAX_DEPTH = 16;
    private static final int MAX_TEXT_LENGTH = 512;
    private static final long SNAPSHOT_TTL_MS = 60_000L;
    private static final long MIN_SNAPSHOT_INTERVAL_MS = 500L;

    private static volatile BallsAccessibilityService instance;
    private static volatile JSONObject cachedSnapshot;
    private static volatile long cachedAtMs;
    private static volatile long lastSnapshotMs;

    private final Handler serviceHandler = new Handler(Looper.getMainLooper());

    static boolean isConnected() {
        return instance != null;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        BallsAccessibilityServer.start();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Read-only phase: window changes only invalidate the cache so a
        // later on-demand snapshot is fresh; no data is retained here.
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            cachedSnapshot = null;
        }
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
        cachedSnapshot = null;
        BallsAccessibilityServer.stop();
        super.onDestroy();
    }

    /**
     * Returns the current bounded snapshot as JSON, taken on the service's
     * own thread (AccessibilityNodeInfo must only be touched there).
     */
    static JSONObject snapshot(boolean fresh) {
        long now = System.currentTimeMillis();
        if (!fresh && cachedSnapshot != null && now - cachedAtMs < SNAPSHOT_TTL_MS) {
            return cachedSnapshot;
        }
        if (now - lastSnapshotMs < MIN_SNAPSHOT_INTERVAL_MS && cachedSnapshot != null) {
            return cachedSnapshot;
        }
        BallsAccessibilityService service = instance;
        if (service == null) {
            return snapshotError("accessibility service not connected");
        }
        lastSnapshotMs = now;
        final JSONObject[] resultHolder = new JSONObject[1];
        service.serviceHandler.post(() -> resultHolder[0] = buildSnapshot(service));
        long deadline = System.currentTimeMillis() + 1500;
        while (resultHolder[0] == null && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(5);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        if (resultHolder[0] == null) {
            return snapshotError("snapshot timed out");
        }
        cachedSnapshot = resultHolder[0];
        cachedAtMs = System.currentTimeMillis();
        return cachedSnapshot;
    }

    private static JSONObject snapshotError(String message) {
        JSONObject error = new JSONObject();
        try {
            error.put("ok", false);
            error.put("error", message);
        } catch (Exception ignored) {
            // JSON failure on the error path is unrecoverable; keep the object empty.
        }
        return error;
    }

    private static JSONObject buildSnapshot(BallsAccessibilityService service) {
        JSONObject result = new JSONObject();
        try {
            AccessibilityNodeInfo root = service.getRootInActiveWindow();
            if (root == null) {
                return snapshotError("no active window");
            }
            JSONArray nodes = new JSONArray();
            int[] counters = new int[1];
            walk(root, "/0", 0, nodes, counters);
            root.recycle();
            result.put("ok", true);
            result.put("truncated", counters[0] >= MAX_NODES);
            result.put("nodes", nodes);
            return result;
        } catch (Exception error) {
            return snapshotError("snapshot failed: " + error.getMessage());
        }
    }

    private static void walk(AccessibilityNodeInfo node, String path, int depth,
                             JSONArray out, int[] counters) {
        if (node == null || counters[0] >= MAX_NODES || depth > MAX_DEPTH) {
            return;
        }
        counters[0] += 1;
        out.put(nodeToJson(node, path));
        int childCount = Math.min(node.getChildCount(), MAX_NODES - counters[0]);
        for (int i = 0; i < childCount; i += 1) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                walk(child, path + "/" + i, depth + 1, out, counters);
                child.recycle();
            }
        }
    }

    private static JSONObject nodeToJson(AccessibilityNodeInfo node, String path) {
        JSONObject json = new JSONObject();
        try {
            boolean password = node.isPassword();
            CharSequence nodeText = node.getText();
            CharSequence contentDesc = node.getContentDescription();
            String text = nodeText == null ? "" : nodeText.toString();
            String desc = contentDesc == null ? "" : contentDesc.toString();
            boolean textTruncated = text.length() > MAX_TEXT_LENGTH;
            if (textTruncated) {
                text = text.substring(0, MAX_TEXT_LENGTH);
            }
            json.put("path", path);
            json.put("role", node.getClassName() == null ? "" : node.getClassName().toString());
            json.put("text", password ? "" : text);
            json.put("textTruncated", textTruncated);
            json.put("contentDesc", password ? "" : desc);
            json.put("contentDescRedacted", password);
            json.put("password", password);
            android.graphics.Rect bounds = new android.graphics.Rect();
            node.getBoundsInScreen(bounds);
            JSONObject boundsJson = new JSONObject();
            boundsJson.put("left", bounds.left);
            boundsJson.put("top", bounds.top);
            boundsJson.put("right", bounds.right);
            boundsJson.put("bottom", bounds.bottom);
            json.put("boundsInScreen", boundsJson);
            json.put("clickable", node.isClickable());
            json.put("longClickable", node.isLongClickable());
            json.put("editable", node.isEditable());
            json.put("scrollable", node.isScrollable());
        } catch (Exception ignored) {
            // A single malformed node must not sink the whole snapshot.
        }
        return json;
    }
}
