/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base for the API, e.g. `https://api.example.com/api/v1`.
   * Unset in development, where the Vite proxy serves `/api/v1` on the same origin.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
