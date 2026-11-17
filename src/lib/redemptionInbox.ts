export function isPendingRedemption(status: string | null): boolean {
  return status !== 'completed' && status !== 'fulfilled' && status !== 'cancelled';
}

export function scopeRedemptions<T extends { user_id: string }>(rows: T[], studentIds: string[]): T[] {
  const ids = new Set(studentIds);
  return rows.filter(row => ids.has(row.user_id));
}