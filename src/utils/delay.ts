/**
 * Random delay utility for human-like browsing behavior.
 * Supports a speed multiplier for fast mode.
 */

/** Global speed multiplier (1.0 = normal, 0.25 = fast) */
let speedMultiplier = 1.0;

/**
 * Set the global speed multiplier.
 * @param multiplier - 1.0 = normal speed, 0.25 = 4x faster
 */
export function setSpeed(multiplier: number): void {
  speedMultiplier = Math.max(0.1, Math.min(1.0, multiplier));
}

/**
 * Wait for a random duration between min and max ms, scaled by speed multiplier.
 */
export function randomDelay(min = 2000, max = 5000): Promise<void> {
  const scaledMin = Math.floor(min * speedMultiplier);
  const scaledMax = Math.floor(max * speedMultiplier);
  const ms = Math.floor(Math.random() * (scaledMax - scaledMin + 1)) + scaledMin;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Short delay for minor actions (scrolling, typing). */
export function shortDelay(): Promise<void> {
  return randomDelay(500, 1500);
}

/** Medium delay for page transitions. */
export function mediumDelay(): Promise<void> {
  return randomDelay(2000, 4000);
}

/** Long delay for heavy operations. */
export function longDelay(): Promise<void> {
  return randomDelay(4000, 7000);
}
