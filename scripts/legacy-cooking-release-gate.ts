import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseFrameDefinition } from '../packages/sim/src/content/frame-definition.js';

// Exact archived production schema. This gate proves candidate compatibility,
// never an empty live table. Ingredients in this private escrow stay in place.
const RETAINED_ESCROW = `table(
  { name: 'player_cooking_job', indexes: [
    { accessor: 'by_target', algorithm: 'btree', columns: ['targetId'] },
  ] },
  { identity: t.identity().primaryKey(), targetKind: t.string(), targetId: t.u64(),
    spaceId: t.u16(), recipeId: t.string(), inputKind: t.string(), outputKind: t.string(),
    quantity: t.u8(), startedTick: t.u64(), readyTick: t.u64() },
)`;
const RESOLUTION_RECEIPT = `table({ name: 'player_process_job_receipt' }, {
  identity: t.identity().primaryKey(), targetKind: t.string(), targetId: t.u64(),
  spaceId: t.u16(), recipeId: t.string(), inputKind: t.string(), outputKind: t.string(),
  quantity: t.u8(), startedTick: t.u64(), readyTick: t.u64(), action: t.string(),
  resolvedTick: t.u64(), grantedKind: t.string(), farmingExperience: t.u32(),
})`;
const parse = (source: string) => ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);

/** Ignore formatting, comments and trailing commas; retain ordered schema tokens. */
function tokens(source: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  const result: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.CommaToken) continue;
    result.push(token === ts.SyntaxKind.StringLiteral ? JSON.stringify(scanner.getTokenValue()) : scanner.getTokenText());
  }
  return JSON.stringify(result);
}
function variableInitializer(file: ts.SourceFile, name: string): string {
  let result: string | undefined;
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      if (result !== undefined || node.initializer === undefined) throw new Error(`cooking_duplicate_or_missing:${name}`);
      result = node.initializer.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (result === undefined) throw new Error(`cooking_missing:${name}`);
  return result;
}
export interface CookingCompatibilitySources {
  readonly world: string;
  readonly claim: string;
  readonly frames: string;
  readonly frameHandler: string;
  readonly spaces: string;
  readonly rejoin: string;
  readonly worldFiles: Readonly<Record<string, string>>;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function assertCookingClaimCapability(sources: CookingCompatibilitySources): void {
  const rawFrames: unknown = JSON.parse(sources.frames);
  if (!Array.isArray(rawFrames)) throw new Error('cooking_frames_invalid');
  const frames = rawFrames.map((frame: unknown) => parseFrameDefinition(frame)).filter((frame) => frame.retired !== true);
  const inventory = frames.filter((frame) => frame.presentation?.surface === 'inventory'
    && frame.buttons?.some((button) => button.onInvoke !== undefined
      && 'claimProcessJob' in button.onInvoke && button.onInvoke.claimProcessJob === 'cancel'));
  const collect = frames.filter((frame) => frame.presentation?.surface === 'entity'
    && frame.buttons?.some((button) => button.onInvoke !== undefined
      && 'claimProcessJob' in button.onInvoke && button.onInvoke.claimProcessJob === 'collect'));
  if (inventory.length !== 1 || collect.length === 0) throw new Error('cooking_authored_claim_callback_missing');
  const handlerAnchors = ['export function frameActionHandlerRegistrations(',
    'frame.retired !== true', "'claimProcessJob' in button.onInvoke",
    '? { claimProcessJob: { action: button.onInvoke.claimProcessJob } }', "eventType: 'frameAction'",
    'event.frameId === frame.id && event.actionId === button.interaction',
    'effectsResult([effect])'];
  if (handlerAnchors.some((anchor) => !sources.frameHandler.includes(anchor))) {
    throw new Error('cooking_authored_claim_handler_missing');
  }
  const adapterAnchors = ['frameActionHandlerRegistrations(content.registry.frames.values())',
    "type: 'frameAction'", "frame.presentation?.surface === 'inventory'",
    'const invocation = authoredFrameAction(frame, actionId)?.onInvoke',
    "'claimProcessJob' in invocation", "invocation.claimProcessJob === 'cancel'",
    'permittedProcessClaim === undefined', 'effect.claimProcessJob.action !== permittedProcessClaim',
    '++processClaimCount !== 1', '(processClaimCount > 0 || containerSealCount > 0) && effectCount !== 1',
    'claimProcessJobBehaviour(ctx, permittedProcessClaim, processJobClaimDependencies, false)',
    'claimProcessJobBehaviour(ctx, action, processJobClaimDependencies)',
    "if ('claimProcessJob' in button.onInvoke)", 'button.onInvoke.claimProcessJob,'];
  if (adapterAnchors.some((anchor) => !sources.world.includes(anchor))) {
    throw new Error('cooking_authored_claim_adapter_missing');
  }
  const target = variableInitializer(parse(sources.world), 'processJobClaimDependencies');
  const targetAnchors = ['ctx.db.world_campfire_state.id.find(job.targetId)',
    'runtimeLandmarkCampfirePlans(registry).some((plan) => plan.runtimeId === job.targetId',
    'plan.spaceId === job.spaceId', 'plan.objectDefinitionId === runtime?.object.id',
    'placeable.id !== job.targetId', 'position.spaceId !== job.spaceId',
    'campfireWithinReach(position.x, position.y, placeable)', '!placeable.lit', '!landmark.lit'];
  if (targetAnchors.some((anchor) => !target.includes(anchor))) throw new Error('cooking_legacy_target_adapter_missing');
  // Archived landmark jobs use the same numeric ID as the authored materialized
  // cooking placeable, at the original location. No ID reinterpretation allowed.
  const spaces: unknown = JSON.parse(sources.spaces);
  let preservedLandmark = false;
  function visit(value: unknown, spaceId?: number): void {
    if (Array.isArray(value)) { for (const child of value) visit(child, spaceId); return; }
    if (!record(value)) return;
    const space = typeof value.spaceId === 'number' ? value.spaceId : spaceId;
    if (record(value.placeable) && value.placeable.runtimeId === '3000000004'
      && value.placeable.object === 'object:camp_cooking_fire'
      && space === 0 && value.tileX === 336 && value.tileY === 356) preservedLandmark = true;
    for (const child of Object.values(value)) visit(child, space);
  }
  visit(spaces);
  if (!preservedLandmark) throw new Error('cooking_legacy_landmark_alias_changed');
}
export function assertRetainedCookingEscrow(sources: CookingCompatibilitySources): void {
  const world = parse(sources.world);
  if (tokens(variableInitializer(world, 'player_cooking_job')) !== tokens(RETAINED_ESCROW)) {
    throw new Error('cooking_escrow_schema_changed');
  }
  if (tokens(variableInitializer(world, 'player_process_job_receipt')) !== tokens(RESOLUTION_RECEIPT)) {
    throw new Error('cooking_resolution_receipt_schema_changed');
  }
  const registered = variableInitializer(world, 'spacetimedb');
  if (!/\bplayer_cooking_job\b/u.test(registered) || !/\bplayer_process_job_receipt\b/u.test(registered)) {
    throw new Error('cooking_escrow_schema_registration_missing');
  }
  if (!variableInitializer(world, 'ownCookingJob').includes('ctx.db.player_cooking_job.identity.find(ctx.sender)')) {
    throw new Error('cooking_escrow_caller_view_missing');
  }
  if (!sources.rejoin.includes("accessor: 'ownCookingJob'")) throw new Error('cooking_escrow_rejoin_parity_missing');
  const writes: { file: string; call: string }[] = [];
  const receiptWrites: { file: string; call: string }[] = [];
  for (const [name, source] of Object.entries(sources.worldFiles)) {
    // The AST checks below match these literal names in getText(). A source
    // without either substring cannot match; comments and strings still go
    // through the AST checks. Reuse only this invocation's exact world text.
    if (!source.includes('player_cooking_job') && !source.includes('player_process_job_receipt')) continue;
    const file = source === sources.world ? world : parse(source);
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const call = node.expression.getText(file);
        if (/\bplayer_cooking_job\b/u.test(call) && /\.(?:insert|update|delete|clear)$/u.test(call)) {
          writes.push({ file: name, call: node.getText(file) });
        }
        if (/\bplayer_process_job_receipt\b/u.test(call) && /\.(?:insert|update|delete|clear)$/u.test(call)) {
          receiptWrites.push({ file: name, call });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  if (writes.length !== 1 || writes[0]!.file !== 'behaviour/process-jobs.ts'
    || tokens(writes[0]!.call) !== tokens('ctx.db.player_cooking_job.identity.delete(ctx.sender)')) {
    throw new Error('cooking_escrow_unreviewed_writer');
  }
  if (receiptWrites.length !== 1 || receiptWrites[0]!.file !== 'behaviour/process-jobs.ts'
    || receiptWrites[0]!.call !== 'ctx.db.player_process_job_receipt.insert') {
    throw new Error('cooking_resolution_receipt_unreviewed_writer');
  }
  const anchors = ['dependencies.authorize(ctx)', 'job.identity.isEqual(ctx.sender)',
    'dependencies.prepareInventoryGrant(ctx, plan)', 'grant()',
    'ctx.db.player_process_job_receipt.insert(', 'ctx.db.player_cooking_job.identity.delete(ctx.sender)'];
  const offsets = anchors.map((anchor) => sources.claim.indexOf(anchor));
  if (!sources.claim.includes('export function claimProcessJobBehaviour(')
    || offsets.some((offset, index) => offset < 0 || (index > 0 && offset <= offsets[index - 1]!))) {
    throw new Error('cooking_escrow_claim_custody_missing');
  }
}
export function loadCookingCompatibilitySources(repository: string): CookingCompatibilitySources {
  if (!isAbsolute(repository)) throw new Error('cooking_repository_must_be_absolute');
  const read = (path: string) => readFileSync(join(repository, path), 'utf8');
  const worldFiles: Record<string, string> = {};
  const directory = join(repository, 'packages/world/src');
  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('cooking_source_symlink');
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        worldFiles[relative(directory, target)] = readFileSync(target, 'utf8');
      }
    }
  }
  visit(directory);
  return { world: read('packages/world/src/index.ts'), claim: read('packages/world/src/behaviour/process-jobs.ts'),
    frames: read('packages/assets/content/frames.json'), spaces: read('packages/assets/content/spaces.json'),
    frameHandler: read('packages/sim/src/behaviour/handlers/frame-actions.ts'),
    rejoin: read('scripts/world-rejoin-snapshot.ts'), worldFiles };
}
export function legacyCookingReleaseGate(repository: string): void {
  const sources = loadCookingCompatibilitySources(repository);
  assertRetainedCookingEscrow(sources);
  assertCookingClaimCapability(sources);
  const fixtures = [
    'packages/world/src/behaviour/process-jobs.test.ts',
    'packages/sim/src/behaviour/handlers/frame-actions.test.ts',
    'packages/sim/src/content/process-legacy-job.test.ts',
    'scripts/cooking-content-continuity.test.ts',
  ];
  // Vitest accepts a filter matching zero files when another filter succeeds;
  // require every named fixture before invoking the candidate's local runner.
  for (const fixture of fixtures) {
    if (readFileSync(join(repository, fixture), 'utf8').trim() === '') throw new Error('cooking_claim_fixture_missing');
  }
  execFileSync(process.execPath, [join(repository, 'node_modules/vitest/vitest.mjs'), 'run', ...fixtures],
  { cwd: repository, timeout: 60_000, stdio: 'inherit' });
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: legacy-cooking-release-gate /absolute/candidate-repository');
    legacyCookingReleaseGate(process.argv[2]!);
    process.stdout.write('Cooking compatibility gate passed: retained escrow, authored claims and fixtures verified; no live rows queried or changed.\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'legacy_cooking_gate_failed'}\n`);
    process.exitCode = 1;
  }
}
