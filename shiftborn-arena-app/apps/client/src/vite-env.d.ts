/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_BUILD_ID?: string;
  readonly VITE_SURVEY_URL?: string;
  readonly VITE_SURVEY_CODE_FIELD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
