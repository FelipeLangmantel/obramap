import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const FALLBACK_PUBLIC_ENV = {
  VITE_SUPABASE_URL: "https://zcsoudhbfeiszutasead.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjc291ZGhiZmVpc3p1dGFzZWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMjk5MzUsImV4cCI6MjA4MDYwNTkzNX0.hYYTUW0pb_qinBNIFPjy6vm_HaUbudNt9w_n1ldiz90",
  VITE_SUPABASE_PROJECT_ID: "zcsoudhbfeiszutasead",
} as const;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const publicEnv = {
    VITE_SUPABASE_URL:
      env.VITE_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      FALLBACK_PUBLIC_ENV.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      FALLBACK_PUBLIC_ENV.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PROJECT_ID:
      env.VITE_SUPABASE_PROJECT_ID ||
      process.env.VITE_SUPABASE_PROJECT_ID ||
      FALLBACK_PUBLIC_ENV.VITE_SUPABASE_PROJECT_ID,
  };

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicEnv.VITE_SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(publicEnv.VITE_SUPABASE_PROJECT_ID),
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        // Capacitor plugins só existem em build nativo (Android/iOS).
        // No build web são importados dinamicamente e devem ser tratados como externos.
        external: [/^@capacitor\//],
        onwarn(warning, warn) {
          if (
            warning.code === "UNRESOLVED_IMPORT" &&
            typeof warning.message === "string" &&
            warning.message.includes("@capacitor/")
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
    optimizeDeps: {
      exclude: ["@capacitor/core", "@capacitor/camera"],
    },
  };
});
