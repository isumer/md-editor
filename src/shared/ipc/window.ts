export const WINDOW_CHANNELS = {
  toggleFullScreen: "window:toggle-full-screen",
} as const;

export type ToggleFullScreenRequest = Record<never, never>;

function isEmptyRequest(value: unknown): value is ToggleFullScreenRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Reflect.ownKeys(value).length === 0;
  } catch {
    return false;
  }
}

export const windowContracts = {
  toggleFullScreen: {
    channel: WINDOW_CHANNELS.toggleFullScreen,
    validate: isEmptyRequest,
  },
} as const;
