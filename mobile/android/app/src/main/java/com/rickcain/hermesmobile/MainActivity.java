package com.rickcain.hermesmobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TermuxLifecyclePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
