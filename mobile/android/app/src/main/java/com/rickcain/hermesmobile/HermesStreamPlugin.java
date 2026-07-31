package com.rickcain.hermesmobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@CapacitorPlugin(name = "HermesStream")
public class HermesStreamPlugin extends Plugin {
    private static final int HERMES_PORT = 8642;
    private static final Set<String> ALLOWED_HOSTS = Set.of("127.0.0.1", "localhost", "10.0.2.2");

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, Future<?>> streams = new ConcurrentHashMap<>();
    private final Map<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();

    @PluginMethod
    public void start(PluginCall call) {
        String streamId = call.getString("streamId");
        String rawUrl = call.getString("url");
        JSObject headers = call.getObject("headers");

        if (streamId == null || streamId.isBlank() || rawUrl == null || !isAllowedStreamUrl(rawUrl)) {
            call.reject("Hermes stream URL is not allowed");
            return;
        }

        String authorization = headers == null ? null : headers.getString("Authorization");
        if (authorization == null && headers != null) {
            authorization = headers.getString("authorization");
        }
        if (authorization == null || authorization.isBlank()) {
            call.reject("Hermes stream authentication is required");
            return;
        }

        cancelled.remove(streamId);
        JSObject result = new JSObject();
        result.put("streamId", streamId);
        call.resolve(result);

        final String bearer = authorization;
        Future<?> future = executor.submit(() -> runStream(streamId, rawUrl, bearer));
        streams.put(streamId, future);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String streamId = call.getString("streamId");
        if (streamId == null || streamId.isBlank()) {
            call.reject("Hermes stream id is required");
            return;
        }

        cancelled.add(streamId);
        HttpURLConnection connection = connections.remove(streamId);
        if (connection != null) {
            connection.disconnect();
        }
        Future<?> future = streams.remove(streamId);
        if (future != null) {
            future.cancel(true);
        }
        call.resolve();
    }

    private void runStream(String streamId, String rawUrl, String authorization) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(rawUrl).openConnection();
            connections.put(streamId, connection);
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(0);
            connection.setRequestProperty("Authorization", authorization);
            connection.setRequestProperty("Accept", "text/event-stream");
            connection.setRequestProperty("Cache-Control", "no-cache");

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                notifyError(streamId, "Hermes event stream failed", status);
                return;
            }

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (!cancelled.contains(streamId)
                        && !Thread.currentThread().isInterrupted()
                        && (line = reader.readLine()) != null) {
                    JSObject event = new JSObject();
                    event.put("streamId", streamId);
                    event.put("chunk", line + "\n");
                    notifyListeners("streamChunk", event);
                }
            }

            if (!cancelled.contains(streamId) && !Thread.currentThread().isInterrupted()) {
                JSObject event = new JSObject();
                event.put("streamId", streamId);
                notifyListeners("streamComplete", event);
            }
        } catch (IOException error) {
            if (!cancelled.contains(streamId) && !Thread.currentThread().isInterrupted()) {
                notifyError(streamId, "Hermes event stream connection failed", null);
            }
        } finally {
            connections.remove(streamId, connection);
            streams.remove(streamId);
            cancelled.remove(streamId);
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void notifyError(String streamId, String message, Integer status) {
        JSObject event = new JSObject();
        event.put("streamId", streamId);
        event.put("message", message);
        if (status != null) {
            event.put("status", status);
        }
        notifyListeners("streamError", event);
    }

    static boolean isAllowedStreamUrl(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl);
            String host = uri.getHost();
            int port = uri.getPort();
            String path = uri.getPath();
            return "http".equalsIgnoreCase(uri.getScheme())
                    && host != null
                    && ALLOWED_HOSTS.contains(host.toLowerCase())
                    && port == HERMES_PORT
                    && path != null
                    && path.matches("/v1/runs/[^/]+/events")
                    && uri.getQuery() == null
                    && uri.getFragment() == null;
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
