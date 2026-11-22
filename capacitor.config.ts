import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.sahva.mobile",
  appName: "Sahva",
  webDir: "dist",
  server: { androidScheme: "https", hostname: "localhost" },
};
export default config;
