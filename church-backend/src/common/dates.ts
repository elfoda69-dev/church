/** "Today" as a UTC-midnight Date, computed in the church's timezone (Africa/Cairo). */
export function todayDate(tz = 'Africa/Cairo'): Date {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  return new Date(`${s}T00:00:00.000Z`);
}
