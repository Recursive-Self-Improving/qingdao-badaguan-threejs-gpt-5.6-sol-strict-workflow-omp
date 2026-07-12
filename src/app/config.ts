export const APP_COPY = {
  boot: 'Preparing the Badaguan experience…',
  loading: 'Checking whether this browser can run the Badaguan 3D experience…',
  onboarding:
    'Explore Badaguan in Qingdao. Move with WASD or the arrow keys, look with the mouse or drag/touch, and press Escape to pause or release the mouse.',
  exploringLocked: 'Press Escape to release',
  exploringDrag:
    'Mouse lock is unavailable. Drag and use the keyboard, or use touch, to explore Badaguan.',
  paused: 'Exploration paused. Resume when you are ready.',
  degraded:
    'The Badaguan experience is running in a reduced mode. Retry to check capabilities again.',
  contextLost:
    'The graphics context was lost. Retry to check capabilities and restart the experience.',
  unsupported:
    'This browser cannot run the Badaguan 3D experience. You can retry after changing browser or device settings.',
  fatal: 'The Badaguan experience could not continue. Retry to start again.',
} as const;

export const APP_CONFIG = {
  placeName: 'Badaguan',
  lockedInstruction: APP_COPY.exploringLocked,
  fallbackInstruction: APP_COPY.exploringDrag,
} as const;
