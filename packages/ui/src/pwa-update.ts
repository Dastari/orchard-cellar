export type PwaUpdateStatus = 'unsupported' | 'current' | 'checking' | 'available' | 'updating' | 'error';

export function pwaUpdateLabel(status: PwaUpdateStatus): string {
  if (status === 'available') return 'UPDATE';
  if (status === 'checking') return 'CHECKING';
  if (status === 'updating') return 'UPDATING';
  if (status === 'current') return 'CHECK UPDATE';
  if (status === 'error') return 'RETRY UPDATE';
  return 'UPDATE UNAVAILABLE';
}
