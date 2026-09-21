import { buildStudioRailModel, type StudioRailModel } from '@orchard/ui/studio';
import { firstAccessibleStudioMode, studioModeAccess } from './access.js';
import { StudioLayoutManager } from './layouts.js';
import { StudioBottomDock, StudioCommandPalette, StudioInspectorKernel, StudioTableKernel, StudioValidationPanel } from './kernels.js';
import { StudioNotifications } from './notifications.js';
import { buildLiveOutliner, buildWorldOutliner, type StudioDraftWorld, type StudioOutlinerNode } from './outliners.js';
import { StudioSelectionBus } from './selection.js';
import { StudioSessionState, type StudioEnvironment } from './session.js';
import { registerBuiltinStudioTools, StudioToolRegistry, type StudioToolRoute } from './tool-registry.js';
import type { StudioLiveAdapter } from './studio-connection.js';

export type StudioConnectionFactory = (
  environment: Exclude<StudioEnvironment, 'sandbox'>,
  onChanged: () => void,
) => Promise<StudioLiveAdapter>;

export type StudioConnectionPreparation = (
  environment: Exclude<StudioEnvironment, 'sandbox'>,
) => Promise<'ready' | 'redirecting'>;

const EMPTY_DRAFT: StudioDraftWorld = Object.freeze({ spaces: [{ id: 0, label: 'Topside', layers: [
  { id: 'terrain', label: 'Terrain', objectIds: [] },
  { id: 'objects', label: 'Objects', objectIds: ['Marlow Camp', 'Estate'] },
] }] });

export class StudioShellController {
  readonly session = new StudioSessionState();
  readonly tools = new StudioToolRegistry();
  readonly layouts: StudioLayoutManager;
  readonly selection = new StudioSelectionBus();
  readonly notifications = new StudioNotifications();
  readonly validation = new StudioValidationPanel();
  readonly inspector = new StudioInspectorKernel();
  readonly table = new StudioTableKernel();
  readonly bottomDock = new StudioBottomDock();
  readonly palette = new StudioCommandPalette();
  #worldOutliner = buildWorldOutliner(EMPTY_DRAFT);
  #worldDraftKey = 'shell-default';
  #adapter: StudioLiveAdapter | null = null;
  #activePath = '/build/map';
  #gridVisible = true;

  constructor(
    private readonly createConnection: StudioConnectionFactory,
    storage?: ConstructorParameters<typeof StudioLayoutManager>[0],
    private readonly onChanged: () => void = () => undefined,
    private readonly prepareConnection: StudioConnectionPreparation = async () => 'ready',
  ) {
    this.layouts = new StudioLayoutManager(storage);
    registerBuiltinStudioTools(this.tools);
    this.refreshPalette();
  }

  activeRoute(): StudioToolRoute {
    const role = this.session.snapshot().role;
    return this.tools.resolve(this.#activePath, role)
      ?? this.tools.routes(role).find(({ tool }) => tool.mode === firstAccessibleStudioMode(role))!;
  }

  navigate(path: string): boolean {
    const route = this.tools.resolve(path, this.session.snapshot().role);
    if (route === null) return false;
    this.#activePath = path;
    this.session.setMode(route.tool.mode);
    this.refreshPalette();
    this.onChanged();
    return true;
  }

  chooseEnvironment(environment: StudioEnvironment): void { this.session.chooseEnvironment(environment); this.onChanged(); }

  async connectExplicit(): Promise<void> {
    const environment = this.session.snapshot().environment;
    if (environment === 'sandbox') throw new Error('live_environment_required');
    if (this.session.snapshot().phase === 'connecting') return;
    this.#adapter?.disconnect();
    this.#adapter = null;
    this.session.beginConnect();
    this.onChanged();
    try {
      if (await this.prepareConnection(environment) === 'redirecting') {
        this.onChanged();
        return;
      }
      this.#adapter = await this.createConnection(environment, () => this.reconcileConnection());
      this.#adapter.connect();
    } catch (error: unknown) {
      this.#adapter = null;
      this.session.failed(error instanceof Error ? error.message : String(error));
      this.onChanged();
      throw error;
    }
  }

  disconnect(): void {
    this.#adapter?.disconnect();
    this.#adapter = null;
    this.session.disconnected();
    if (studioModeAccess(null, this.activeRoute().tool.mode) === 'hidden') this.navigate('/build/map');
    this.onChanged();
  }

  liveOutliner(): readonly StudioOutlinerNode[] {
    return this.#adapter === null ? [] : buildLiveOutliner(this.#adapter.view().rows);
  }

  worldOutliner(): readonly StudioOutlinerNode[] { return this.#worldOutliner; }
  setWorldDraft(key: string, draft: StudioDraftWorld): boolean {
    if (this.#worldDraftKey === key) return false;
    this.#worldDraftKey = key;
    this.#worldOutliner = buildWorldOutliner(draft);
    return true;
  }

  liveAdapter(): StudioLiveAdapter | null { return this.#adapter; }

  /** One display preference shared by every canvas tool. Tools which draw their
   * own grid query this alongside the shell-owned alpha-grid nodes. */
  gridVisible(): boolean { return this.#gridVisible; }
  toggleGrid(): boolean {
    this.#gridVisible = !this.#gridVisible;
    this.onChanged();
    return this.#gridVisible;
  }

  readonly #toolState = new Map<string, unknown>();
  toolState<T>(id: string, create: () => T): T {
    if (!this.#toolState.has(id)) this.#toolState.set(id, create());
    return this.#toolState.get(id) as T;
  }

  /** Evicts exactly the retained state owned by a departing tool lifecycle.
   * The identity check prevents a stale disposer from deleting a newer mount. */
  releaseToolState(id: string, expected: unknown): boolean {
    if (this.#toolState.get(id) !== expected) return false;
    return this.#toolState.delete(id);
  }

  rail(expanded = true): StudioRailModel {
    const session = this.session.snapshot();
    return buildStudioRailModel({
      expanded, activeMode: session.activeMode,
      session: {
        environment: session.phase === 'connected' && session.environment !== 'sandbox'
          ? session.environment : 'anonymous',
        identity: session.identity, role: session.role,
        contentRevision: session.contentRevision, mapRevision: session.mapRevision,
        connected: session.phase === 'connected',
      },
      modeBadges: {
        build: this.validation.errorCount() > 0 ? ['validation'] : ['draft'],
        ...(session.phase === 'connecting' ? { operate: ['sync'] as const } : {}),
        ...(session.error === null ? {} : { observe: ['conflict'] as const }),
      },
    });
  }


  private reconcileConnection(): void {
    const view = this.#adapter?.view();
    if (view === undefined) return;
    if (view.connected && view.identity !== null && view.role !== null) {
      this.session.connected({ identity: view.identity, role: view.role, contentRevision: view.contentRevision, mapRevision: view.mapRevision });
    } else if (!view.connected && this.session.snapshot().phase === 'connected') this.session.failed(view.error ?? 'Connection lost. Reconnect to continue editing the live map.');
    else if (view.error !== null) this.session.failed(view.error);
    else if (view.connected && !view.synchronizing && view.identity !== null) this.session.failed('studio_role_required');
    this.onChanged();
  }

  private refreshPalette(): void {
    const role = this.session.snapshot().role;
    const routes = this.tools.routes(role);
    const seen = new Set<string>();
    const openCommands = routes.flatMap(({ tool }) => {
      if (seen.has(tool.id)) return [];
      seen.add(tool.id);
      return [{
        id: `tool.open:${tool.id}`,
        label: `Open ${tool.label}`,
        keywords: [tool.id, tool.mode, ...tool.routes],
      }];
    });
    this.palette.setCommands([...openCommands, ...routes.flatMap(({ tool }) => tool.commands)]);
  }

  routeForCommand(commandId: string): string | null {
    const routes = this.tools.routes(this.session.snapshot().role);
    if (commandId.startsWith('tool.open:')) {
      const toolId = commandId.slice('tool.open:'.length);
      return routes.find(({ tool }) => tool.id === toolId)?.path ?? null;
    }
    return routes.find(({ tool }) => tool.commands.some(({ id }) => id === commandId))?.path ?? null;
  }
}
