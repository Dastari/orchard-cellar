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
