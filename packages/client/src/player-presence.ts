export const OFFLINE_AVATAR_FILTER = 'grayscale(100%) brightness(72%) contrast(128%)';

/** The local avatar remains present while its profile subscription hydrates.
 * A remote avatar is live only when authority explicitly says so. */
export function worldPlayerIsOffline(local: boolean, profileOnline: boolean | undefined): boolean {
  return !local && profileOnline !== true;
}

export function worldPlayerParticipatesInCollision(
  local: boolean,
  profileOnline: boolean | undefined,
): boolean {
  return !worldPlayerIsOffline(local, profileOnline);
}
