import './shell/shell.css';

const initialParameters = new URLSearchParams(location.search);
const hasInitialOidcCallback = initialParameters.has('code') || initialParameters.has('error');
let callbackCompleted = false;
let callbackError: string | null = null;
if (hasInitialOidcCallback) {
  try {
    const { completeStudioOidcCallback } = await import('./shell/auth.js');
    callbackCompleted = await completeStudioOidcCallback();
  } catch (error: unknown) {
    callbackError = error instanceof Error ? error.message : String(error);
  }
}

const {
  StudioShellApp,
  StudioShellController,
  defaultStudioCanvasToolRegistry,
  registerBuiltinStudioCanvasTools,
} = await import('./shell/index.js');

const studioRoot = document.querySelector<HTMLCanvasElement>('#studio');
if (studioRoot === null) throw new Error('Missing Orchard Studio canvas');

let app: InstanceType<typeof StudioShellApp> | null = null;
registerBuiltinStudioCanvasTools(defaultStudioCanvasToolRegistry);
const controller = new StudioShellController(
  async (environment, onChanged) => {
    const { StudioConnection } = await import('./shell/studio-connection.js');
    return new StudioConnection(environment, onChanged);
  },
  undefined,
  () => app?.render(),
  async (environment) => {
    const { prepareStudioOidcConnection } = await import('./shell/auth.js');
    return prepareStudioOidcConnection(environment);
  },
);
app = new StudioShellApp(studioRoot, controller);
app.mount();

if (callbackError !== null) {
  controller.session.failed(callbackError);
  app.render();
} else if (callbackCompleted) {
  controller.chooseEnvironment('production');
  void controller.connectExplicit().catch(() => undefined);
}
