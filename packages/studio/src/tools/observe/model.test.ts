import { describe, expect, it } from 'vitest';
import { MockObserveApi, ObserveModel } from './model.js';

describe('ObserveModel', () => {
  it('refreshes bounded audit, connection, client-error, presence, telemetry and validation surfaces together', async () => {
    const model = new ObserveModel(new MockObserveApi());
    await model.refresh({}, 'identity-bea');
    expect(model.snapshot()).toMatchObject({
      loading: false, error: null, audit: [{ operation: 'unstick' }],
      connections: [{ identity: 'identity-bea', active: true }],
      clientErrors: [{ kind: 'connection', route: '/play' }],
      presence: [{ displayName: 'Bea Bramble' }],
      telemetry: { tick: { authorityTick: '42' } },
      validation: { reportId: 'report-clean', issues: [] },
    });
  });

  it('pages audit, connections and client errors to termination without duplicates in request order', async () => {
    const model = new ObserveModel(new MockObserveApi()); await model.refresh();
    await model.moreAudit(); await model.moreConnections(); await model.moreClientErrors();
    expect(model.snapshot()).toMatchObject({ auditCursor: null, connectionCursor: null, clientErrorCursor: null });
    expect(model.snapshot().audit.map(({ id }) => id)).toEqual(['audit-0', 'audit-page-2']);
    expect(model.snapshot().connections.map(({ connectionId }) => connectionId)).toEqual(['connection-0', 'connection-page-2']);
    expect(model.snapshot().clientErrors.map(({ id }) => id)).toEqual(['client-error-0', 'client-error-client-error-0']);
  });
});
