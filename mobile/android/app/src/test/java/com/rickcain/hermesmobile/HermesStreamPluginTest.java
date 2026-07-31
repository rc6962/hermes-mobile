package com.rickcain.hermesmobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class HermesStreamPluginTest {
    @Test
    public void allowsOnlyLoopbackHermesEventStreams() {
        assertTrue(HermesStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8642/v1/runs/run-1/events"));
        assertTrue(HermesStreamPlugin.isAllowedStreamUrl(
                "http://localhost:8642/v1/runs/run-1/events"));
        assertTrue(HermesStreamPlugin.isAllowedStreamUrl(
                "http://10.0.2.2:8642/v1/runs/run-1/events"));
    }

    @Test
    public void rejectsRemoteOrUnexpectedStreamTargets() {
        assertFalse(HermesStreamPlugin.isAllowedStreamUrl(
                "https://127.0.0.1:8642/v1/runs/run-1/events"));
        assertFalse(HermesStreamPlugin.isAllowedStreamUrl(
                "http://192.168.1.50:8642/v1/runs/run-1/events"));
        assertFalse(HermesStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8643/v1/runs/run-1/events"));
        assertFalse(HermesStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8642/v1/runs/run-1/events?token=secret"));
        assertFalse(HermesStreamPlugin.isAllowedStreamUrl(
                "http://127.0.0.1:8642/api/sessions"));
    }
}
