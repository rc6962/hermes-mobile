import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.rickcain.hermesmobile",
  appName: "Hermes Mobile",
  webDir: "dist",
  server: {
    // Hermes is intentionally loopback-only during local Termux operation.
    // The Android network-security config below limits cleartext to loopback hosts.
    cleartext: true,
  },
};

export default config;
