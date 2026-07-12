import './ui/styles.css';

interface AppShellElements {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly controls: HTMLElement;
}

class ShellBootstrapError extends Error {
  constructor(selector: string) {
    super(`Required application element is missing or invalid: ${selector}`);
    this.name = 'ShellBootstrapError';
  }
}

function requireElement<T extends Element>(
  selector: string,
  expectedType: abstract new (...args: never[]) => T,
): T {
  const element = document.querySelector(selector);

  if (element === null || !(element instanceof expectedType)) {
    throw new ShellBootstrapError(selector);
  }

  return element;
}

function collectShellElements(): AppShellElements {
  return {
    root: requireElement('#app', HTMLElement),
    canvas: requireElement('#app-canvas', HTMLCanvasElement),
    status: requireElement('#app-status', HTMLElement),
    controls: requireElement('#app-controls', HTMLElement),
  };
}

function renderReadyShell({ root, canvas, status, controls }: AppShellElements): void {
  root.dataset.appState = 'ready';
  canvas.tabIndex = 0;
  status.textContent = 'The application shell is ready. The interactive landscape will begin here.';
  controls.setAttribute('aria-busy', 'false');
}

function bootstrap(): void {
  renderReadyShell(collectShellElements());
}

bootstrap();
