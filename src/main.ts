import { applyShellPresentation, getShellPresentation, type ShellElements } from './ui/shellContract';

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

function collectShellElements(): ShellElements {
  return {
    root: requireElement('#app', HTMLElement),
    canvas: requireElement('#app-canvas', HTMLCanvasElement),
    status: requireElement('#app-status', HTMLElement),
    controls: requireElement('#app-controls', HTMLElement),
  };
}

function renderReadyShell(elements: ShellElements): void {
  applyShellPresentation(elements, getShellPresentation('ready'));
}

function bootstrap(): void {
  renderReadyShell(collectShellElements());
}

bootstrap();
