package com.epictechs.balls;

import android.util.Log;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Tiny loopback HTTP responder serving the bounded accessibility snapshot.
 *
 * Bound to 127.0.0.1:7071 — app-private loopback only. Routes:
 *   GET /health                          → {ok, connected}
 *   GET /v1/accessibility/snapshot[?fresh=1] → bounded tree JSON
 *
 * Read-only by construction: no action/gesture routes exist.
 */
public final class BallsAccessibilityServer {
    public static final int PORT = 7071;
    private static final ExecutorService POOL = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "balls-a11y-http");
        t.setDaemon(true);
        return t;
    });

    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private static ServerSocket server;

    private BallsAccessibilityServer() {}

    public static synchronized void start() {
        if (RUNNING.get()) {
            return;
        }
        try {
            server = new ServerSocket(PORT, 8, InetAddress.getByName("127.0.0.1"));
            RUNNING.set(true);
            Thread acceptor = new Thread(BallsAccessibilityServer::acceptLoop, "balls-a11y-accept");
            acceptor.setDaemon(true);
            acceptor.start();
        } catch (IOException e) {
            // Port busy or bind failed — the bridge degrades to status-only.
            Log.d("BallsA11y", "server start failed: " + e.getMessage());
        }
    }

    public static synchronized void stop() {
        RUNNING.set(false);
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
            }
            server = null;
        }
    }

    private static void acceptLoop() {
        while (RUNNING.get()) {
            try {
                Socket client = server.accept();
                POOL.submit(() -> handle(client));
            } catch (IOException e) {
                if (RUNNING.get()) {
                    // transient accept failure — keep serving
                }
            }
        }
    }

    private static void handle(Socket client) {
        try {
            client.setSoTimeout(5000);
            byte[] request = new byte[2048];
            int read = client.getInputStream().read(request);
            String head = new String(request, 0, Math.max(read, 0), StandardCharsets.UTF_8);
            String path = head.split(" ").length > 1 ? head.split(" ")[1] : "/";
            boolean fresh = path.contains("fresh=1");
            String body;
            int status = 200;
            try {
                if (path.startsWith("/health")) {
                    JSONObject out = new JSONObject();
                    out.put("ok", true);
                    out.put("connected", BallsAccessibilityService.isConnected());
                    body = out.toString();
                } else if (path.startsWith("/v1/accessibility/snapshot")) {
                    JSONObject snap = BallsAccessibilityService.snapshot(fresh);
                    body = snap.toString();
                    if (snap.optString("error", null) != null) {
                        status = 503;
                    }
                } else {
                    status = 404;
                    body = "{\"error\":\"not found\"}";
                }
            } catch (Exception e) {
                status = 500;
                body = "{\"error\":\"server error\"}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            OutputStream out = client.getOutputStream();
            String header = "HTTP/1.1 " + status + " " + (status == 200 ? "OK" : status == 404 ? "Not Found" : "Service Unavailable") + "\r\n"
                    + "Content-Type: application/json\r\n"
                    + "Content-Length: " + bytes.length + "\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(header.getBytes(StandardCharsets.UTF_8));
            out.write(bytes);
            out.flush();
        } catch (IOException ignored) {
            // client disconnected mid-read
        } finally {
            try {
                client.close();
            } catch (IOException ignored) {
            }
        }
    }
}
