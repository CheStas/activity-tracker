/** package.json version, set by vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Umami website id; without it no usage stats are sent (src/analytics.ts). */
  readonly VITE_UMAMI_ID?: string;
  /** The Umami script URL; Umami Cloud's by default. */
  readonly VITE_UMAMI_SRC?: string;
}
