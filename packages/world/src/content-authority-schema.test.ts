import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function slice(start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe('live content authority schema and reducers', () => {
  it('adds public atomic heads/definitions and private revision, grant, and draft tables', () => {
    const tables = slice(
      '// --- docs/55 lane 55-C: additive live-content authority tables ---',
      '// --- end docs/55 lane 55-C tables ---',
    );
    expect(tables).toContain("name: 'content_head', public: true");
    expect(tables).toContain("name: 'content_definition',\n    public: true");
    expect(tables).toContain("accessor: 'by_kind'");
    expect(tables).toContain("name: 'content_revision'");
    expect(tables).toContain("name: 'content_editor_grant'");
    expect(tables).toContain("name: 'content_draft'");
    expect(tables).toContain('revision: t.u64().primaryKey()');
    expect(tables).toContain("accessor: 'by_client_mutation'");
  });

  it('checks idempotency before CAS and writes definitions, head, revision, and audit atomically', () => {
    const reducers = slice(
      '// --- docs/55 lane 55-C: live content reducers ---',
      '// --- end docs/55 lane 55-C live content reducers ---',
    );
    const publish = slice('export const publishContentChangeSet', 'export const restoreContentRevision');
    expect(publish.indexOf('contentMutationAlreadyApplied')).toBeLessThan(publish.indexOf('commitContentPublication'));
    expect(reducers).toContain('requireContentEditor(ctx)');
    const kernel = slice(
      '// --- docs/55 lane 55-C: bounded content publication kernel ---',
      '// --- end docs/55 lane 55-C publication kernel ---',
    );
    expect(kernel).toContain('assertContentRevision(head.revision, expectedRevision)');
    expect(kernel).toContain('planContentPublication(contentDefinitionRows(ctx)');
    expect(kernel).toContain('ctx.db.content_definition.id.update(row)');
    expect(kernel).toContain('ctx.db.content_head.packId.update(nextHead)');
    expect(kernel).toContain('ctx.db.content_revision.insert({');
    expect(kernel).toContain('insertLegacyAdminAudit(ctx, {');
  });

  it('restores through a new publication and never mutates immutable history', () => {
    const restore = slice('export const restoreContentRevision', 'export const grantContentEditor');
    expect(restore).toContain('revision.inverseChangeSetJson');
    expect(restore).toContain("'restore_content_revision'");
    expect(restore).not.toContain('content_revision.revision.update');
    expect(restore).not.toContain('content_revision.revision.delete');
  });

  it('seeds only empty additive content tables on init and first reconnect', () => {
    const seed = slice('function ensureContentRegistrySeed', 'function requireContentEditor');
    expect(seed).toContain("if (existingRows.length > 0) throw new SenderError('content_head_missing')");
    expect(seed).not.toContain('.clear(');
    expect(seed).not.toContain('.delete(');
    expect(source).toMatch(/export const init = spacetimedb\.init\(\(ctx\) => \{\n {2}ensureContentRegistrySeed\(ctx\);/u);
    const connection = slice('function prepareConnection', 'export const onConnect');
    expect(connection).toContain('ensureContentRegistrySeed(ctx)');
  });

  it('keeps drafts/grants/history private behind caller-aware views', () => {
    expect(source).toContain("name: 'own_content_editor_grant', public: true");
    expect(source).toContain("name: 'own_content_draft', public: true");
    expect(source).toContain("name: 'own_content_revisions', public: true");
    expect(source).toContain('contentEditorAuthorized(');
  });
});
