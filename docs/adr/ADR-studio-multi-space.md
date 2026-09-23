# ADR: indexed area pages and a shared space registry

Date: 2026-09-23. Status: accepted for implementation.

The Studio area procedure currently stops after scanning 2,048 rows across a
whole space. Client-side slicing cannot recover rows that were never returned.
Space lists also duplicate dimensions and omit dynamically allocated interiors.

Use a shared structural registry over authoritative definitions and instance
rows. Project private rogue metadata through admin authorization. Add bounded
keyset pages using chunk/id indexes, retaining the old array procedure for older
clients. Cursors bind to the request and record the last scanned key so dense
chunks and selective filters remain resumable.

Offset pagination was rejected because later pages rescan preceding populations.
Publishing rogue tables was rejected because run economics and membership remain
private. Reviving retired farm parcels was rejected because homesteads are the
active farm authority. Additional indexes cost storage and migration review;
they do not change row shapes or access permissions. Pages reflect live state,
not a frozen multi-call snapshot, so moved entities may change between pages.
