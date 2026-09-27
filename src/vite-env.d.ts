/// <reference types="vite/client" />

/** `package.json`'s version, injected by `define` in `vite.config.ts` (#226). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** The feedback form's access key (#226): `.env` locally, an Actions secret on deploy. */
  readonly VITE_FEEDBACK_ACCESS_KEY?: string;
}
