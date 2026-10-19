// ARCHITECTURE §5.5: use the documented defaults when no client .env exists.
export const clientEnv = {
  serverUrl: import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567',
  buildId: import.meta.env.VITE_BUILD_ID ?? 'dev',
  surveyUrl: import.meta.env.VITE_SURVEY_URL ?? '',
  surveyCodeField: import.meta.env.VITE_SURVEY_CODE_FIELD ?? '',
} as const;
