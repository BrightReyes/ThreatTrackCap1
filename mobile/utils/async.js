/**
 * [QA-FIX] New shared helper (added during the pre-build QA pass).
 *
 * Resolves with the promise's value, or with `fallbackValue` if it hasn't
 * settled within `ms`. Used where waiting forever is worse than a sensible
 * default: GPS fixes, reverse geocoding, and Firestore writes on logout
 * (Firestore write promises don't settle while the device is offline).
 *
 * The original promise is not cancelled; its late result is ignored, and a
 * late rejection is swallowed so it can't surface as an unhandled rejection.
 */
export const withTimeout = (promise, ms, fallbackValue = null) => {
  let timer = null;
  const guarded = Promise.resolve(promise).catch((error) => {
    throw error;
  });
  guarded.catch(() => {});

  return Promise.race([
    guarded,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallbackValue), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};
