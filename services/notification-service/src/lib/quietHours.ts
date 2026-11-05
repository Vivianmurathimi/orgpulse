// Is `time` inside quiet hours? All times are "HH:mm", which compare correctly as text.
// Quiet hours can run past midnight, e.g. 22:00 to 07:00.
export function isQuietTime(
  quietFrom: string | null,
  quietTo: string | null,
  time: string,
): boolean {
  if (!quietFrom || !quietTo || quietFrom === quietTo) return false;

  if (quietFrom < quietTo) {
    return quietFrom <= time && time < quietTo;
  }
  return time >= quietFrom || time < quietTo;
}
