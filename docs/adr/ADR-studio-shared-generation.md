# ADR: semantic generation shared by Studio and gameplay

Date: 2026-09-21
Status: Accepted

Studio currently exposes low-level terrain modes and a sandbox before live login.
It also hides dense live resources at overview zoom. The requested editor needs
material and height editing while retaining production authority and rendering.

Use the existing semantic terrain compiler, registered tileset role tables and
minimum footprint planner. Keep active tool, material and height separate.
Resolve connected object presentation from cardinal same-family, same-level
neighbors in shared code. Persist authored overrides, not player-selected join art.

A separate editor autotiler would drift from game collision and presentation.
Baking every derived sprite into runtime state would make removal and neighbor
updates fragile. Shared resolution instead requires complete masks and tests for
each supported source family. Art with missing roles must retain an explicit
fallback and remain visible in the inventory.

Studio is a live authenticated application. Test fixtures may still instantiate
isolated models, but the browser entrypoint cannot offer sandbox editing.
