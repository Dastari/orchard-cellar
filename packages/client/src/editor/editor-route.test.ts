import { describe, expect, it } from 'vitest';
import { clientEntryRoute } from './editor-route.js';

describe('offline editor route', () => {
  it('opens the component lab from a public route without an account route', () => {
    expect(clientEntryRoute('/ui-lab')).toEqual({ kind: 'ui_lab' });
    expect(clientEntryRoute('/ui-lab/')).toEqual({ kind: 'ui_lab' });
    expect(clientEntryRoute('/ui')).toEqual({ kind: 'ui_lab' });
  });

  it('opens the procedural editor from its canonical pathname without an account route', () => {
    expect(clientEntryRoute('/editor')).toEqual({
      kind: 'offline_editor', mapId: 'procedural-world',
    });
    expect(clientEntryRoute('/editor/', '?seed=orchard-sanctuary-20')).toEqual({
      kind: 'offline_editor', mapId: 'procedural-world',
    });
  });

  it('selects named offline maps from path segments rather than query parameters', () => {
    expect(clientEntryRoute('/editor/offline/terrain-lab')).toEqual({
      kind: 'offline_editor', mapId: 'terrain-lab',
    });
    expect(clientEntryRoute('/editor', '?map=terrain-lab&source=live')).toEqual({
      kind: 'offline_editor', mapId: 'procedural-world',
    });
  });

  it('opens reusable layout authoring on its own authentication-free route', () => {
    expect(clientEntryRoute('/editor/design')).toEqual({
      kind: 'offline_design_editor', stampId: 'untitled-layout',
    });
    expect(clientEntryRoute('/editor/design/orchard-camp')).toEqual({
      kind: 'offline_design_editor', stampId: 'orchard-camp',
    });
    expect(clientEntryRoute('/editor/design/../../secret')).toEqual({ kind: 'standard' });
  });

  it('does not grant an authentication bypass to a live editor source', () => {
    expect(clientEntryRoute('/editor/live')).toEqual({ kind: 'standard' });
    expect(clientEntryRoute('/editor/live', '?mode=editor&source=offline&map=terrain-lab')).toEqual({
      kind: 'standard',
    });
    expect(clientEntryRoute('/', '?mode=editor&source=live&map=island')).toEqual({ kind: 'standard' });
  });

  it('keeps the old query URL as a sanitized compatibility alias', () => {
    expect(clientEntryRoute('/', '?mode=editor&source=offline&map=terrain-lab')).toEqual({
      kind: 'offline_editor', mapId: 'terrain-lab',
    });
    expect(clientEntryRoute('/', '?mode=editor&source=offline&map=../../secret')).toEqual({
      kind: 'offline_editor', mapId: 'terrain-lab',
    });
  });
});
