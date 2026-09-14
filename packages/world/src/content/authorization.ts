export interface ContentMembershipState {
  readonly role: string;
  readonly blocked: boolean;
  readonly revokedAt: unknown;
}

export interface ContentEditorGrantState {
  readonly revokedAt: unknown;
}

/** Authentication/audience validation remains at the world boundary; this
 * policy handles the independently revocable content-editor capability. */
export function contentEditorAuthorized(
  membership: ContentMembershipState | null,
  grant: ContentEditorGrantState | null,
): boolean {
  if (membership === null || membership.blocked || membership.revokedAt !== undefined) return false;
  if (membership.role === 'owner' || membership.role === 'admin') return true;
  return grant !== null && grant.revokedAt === undefined;
}
