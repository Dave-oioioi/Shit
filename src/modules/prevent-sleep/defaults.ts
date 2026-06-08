export const preventSleepState = {
  enabled: false,
  status: "待命",
  lastActionAt: null as string | null,
  lastPulseAt: null as string | null,
  runtimeError: null as string | null,
};

export const preventSleepSettings = {
  idleThresholdSeconds: 150,
};
