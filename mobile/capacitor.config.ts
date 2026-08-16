import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.epictechs.balls",
  appName: "Balls",
  webDir: "dist",
  loggingBehavior: "none",
  server: {
    // Balls is intentionally loopback-only during local Termux operation.
    // The Android network-security config below limits cleartext to loopback hosts.
    cleartext: true,
  },
};

export default config;
