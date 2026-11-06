export function formatRecovery(hrs) {
  if (hrs >= 96) return 'FRESH';
  if (hrs >= 48) return `${Math.round(hrs / 24)}d`;
  return `${hrs}h`;
}
