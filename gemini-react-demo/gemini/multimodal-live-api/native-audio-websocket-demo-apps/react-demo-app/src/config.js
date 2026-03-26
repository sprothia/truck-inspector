const env = import.meta.env;

const vol = parseInt(String(env.VITE_VOLUME ?? "80"), 10);

export const APP_CONFIG = {
  proxyUrl: env.VITE_PROXY_URL ?? "",
  projectId: env.VITE_PROJECT_ID ?? "",
  model: env.VITE_MODEL ?? "gemini-live-2.5-flash-native-audio",
  voice: env.VITE_VOICE ?? "Puck",
  volume: Number.isFinite(vol) ? Math.min(100, Math.max(0, vol)) : 80,
};
