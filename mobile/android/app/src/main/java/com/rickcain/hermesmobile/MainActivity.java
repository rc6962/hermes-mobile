package com.rickcain.hermesmobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // BridgeActivity consumes these registrations during super.onCreate().
        registerPlugin(TermuxLifecyclePlugin.class);
        registerPlugin(SecureCredentialsPlugin.class);
        registerPlugin(HermesStreamPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
