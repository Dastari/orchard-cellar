# ADR: Evidence-based atlas audit and local joining rules

Date: 2026-09-22. Status: Accepted. Author: BoldEagle.

The user reports missing paving edges and duplicate palette tiles. Similar-looking
sprites can also be deliberate animation, season or object-state variants.

Inventory registry assets, all available source sheets and actual frame pixels
before changing registrations. Keep stable IDs; fix palette enumeration/grouping
without deleting referenced atlas entries. Produce reproducible native-art contact
sheets and adjacency examples, with unverified mappings labelled as gaps.

Deleting visually similar registrations was rejected because saved objects and
different state/season semantics can refer to them. AI-invented joining images were
rejected because they would not prove the shipped asset coverage. Whole-map repair
was rejected because invalid geometry is allowed and the user wants local authoring
assistance. The trade-off is a larger evidence catalogue and explicit unresolved
source mappings rather than a deceptively compact but incomplete inventory.
