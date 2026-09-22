# Studio live camp path rendering

Marlow's T-shaped camp path is not a `worldSurface` row. The game draws it in a
separate `drawInsetGround` pass from the active island landmark's `pathAreas`,
filtered by the `automated_campfire` role. Studio drew the terrain cache and
animated terrain but omitted this pass entirely.

Studio now draws the same verified live landmark paths with the same shared
inset fill and blob47 grass fringe function, before depth-sorted objects. The
pass belongs to Generated Base, so hiding Generated Base hides it and restoring
the layer restores it. Player-Owned visibility does not govern the camp path.
Unverified content, retired island definitions and offline maps get no live path
fallback. Paths are cached by immutable content registry identity.

This is a Studio display correction. It does not create editable cells, mutate
the map, change collision, write live rows or publish the world. Homestead entry
paths and farm soil remain separate runtime ground systems outside this scoped
camp-path correction.

Tests compare actual Studio draw calls with the game's shared pass, including
frame selection and scale, and cover hide/show and missing/retired content.
