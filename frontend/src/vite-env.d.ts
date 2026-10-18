/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin; unset means same origin (the dev proxy). */
  readonly VITE_API_BASE_URL?: string;
}
