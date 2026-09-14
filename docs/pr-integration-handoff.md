# Gameplay PR integration — 0.7.0

Integrates PRs [#3](https://github.com/Dastari/orchard-cellar/pull/3),
[#4](https://github.com/Dastari/orchard-cellar/pull/4) and
[#5](https://github.com/Dastari/orchard-cellar/pull/5), preserving each branch's
commit history. The user authorized committing remaining work and merging all
open PRs on 2026-09-15. Merge the integration PR through GitHub with a merge commit
so the original PR heads become reachable from main and close automatically.

The combined workspace version is 0.7.0; the standalone world 0.6.1 XP patch is
included. Combined authored content is 896 definitions, hash `34de4fe6`.
Mining payout/depletion XP belongs to Farming; historical XP remains unchanged.
Silver durability is 1,500 with unchanged repair cost and other stats.
Harvest and cellar progression changes are preserved alongside wall mining skills.

Local Git rules, the installed GitX skill (including its referenced files), and
its lockfile are included at the user's commit request. The licensed `references`
symlink is a local test fixture and must not be committed.

Validation and merge state will be updated after the combined checks finish.
No gameplay deployment is authorized by this merge request. Release world,
client, bindings and reviewed content together through the established process;
preserve the Studio prebuild guard and use its reviewed release source.
