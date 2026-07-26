import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.rickcain.hermesmobile",
  appName: "Hermes Mobile",
  webDir: "dist",
  server: {
    cleartext: false,
  },
};

export default config;
