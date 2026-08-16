package com.epictechs.balls;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BallsStreamPluginTest {
    @Test
    public void allowsOnlyLoopbackBallsEventStreams() {
        assertTrue(BallsStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8642/v1/runs/run-1/events"));
        assertTrue(BallsStreamPlugin.isAllowedStreamUrl(
                "http://localhost:8642/v1/runs/run-1/events"));
        assertTrue(BallsStreamPlugin.isAllowedStreamUrl(
                "http://10.0.2.2:8642/v1/runs/run-1/events"));
    }

    @Test
    public void rejectsRemoteOrUnexpectedStreamTargets() {
        assertFalse(BallsStreamPlugin.isAllowedStreamUrl(
                "https://127.0.0.1:8642/v1/runs/run-1/events"));
        assertFalse(BallsStreamPlugin.isAllowedStreamUrl(
                "http://192.168.1.50:8642/v1/runs/run-1/events"));
        assertFalse(BallsStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8643/v1/runs/run-1/events"));
        assertFalse(BallsStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8642/v1/runs/run-1/events?token=secret"));
        assertFalse(BallsStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8642/api/sessions"));
    }
}
