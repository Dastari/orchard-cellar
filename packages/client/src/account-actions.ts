export type AccountPointerAction = 'enter-world' | 'sign-out' | 'sign-in' | 'register' | 'recover';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const accountButtonRects = {
  enterWorld: { x: 151, y: 146, width: 178, height: 24 },
  signOut: { x: 190, y: 179, width: 100, height: 16 },
  signIn: { x: 101, y: 141, width: 132, height: 24 },
  register: { x: 247, y: 141, width: 132, height: 24 },
  recover: { x: 151, y: 175, width: 178, height: 18 },
} as const satisfies Record<string, Rect>;

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function accountPointerAction(authenticated: boolean, x: number, y: number): AccountPointerAction | null {
  if (authenticated) {
    if (contains(accountButtonRects.enterWorld, x, y)) return 'enter-world';
    if (contains(accountButtonRects.signOut, x, y)) return 'sign-out';
    return null;
  }
  if (contains(accountButtonRects.signIn, x, y)) return 'sign-in';
  if (contains(accountButtonRects.register, x, y)) return 'register';
  if (contains(accountButtonRects.recover, x, y)) return 'recover';
  return null;
}
