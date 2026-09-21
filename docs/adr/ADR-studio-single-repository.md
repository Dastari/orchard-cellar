# ADR: Integrate reviewed Studio into the shared repository

Date: 2026-09-21
Status: Accepted by owner instruction to integrate and deploy.

The reviewed Studio source was isolated to protect it from the retired renderer
in the main repository. Releases combine that snapshot with current shared code
through an overlay script. The snapshot is not itself a Git checkout, and its
copies of assets and shared packages have drifted.

Integrate the reviewed kit and Studio into this repository. Keep shared source
packages and independently build/deploy Studio on its existing origin/service.
Separate any Studio-specific adapter from the game's implementation where their
contracts differ. Retain the prebuild guard as a normal regression check.

Keeping the external snapshot requires continuing two-source synchronization.
Copying every snapshot package would regress newer gameplay code. Combining game
and editor into one frontend would couple release and loading behavior. These
alternatives do not satisfy the requested source sharing and independent builds.

The integration adds the kit and its tests to normal CI. It simplifies releases
and agent workflows, but requires careful compatibility checks on shared packages.
Retain the old source and installed artifact in a private verified rollback archive
before retiring their operational paths. No database/content migration is involved.
