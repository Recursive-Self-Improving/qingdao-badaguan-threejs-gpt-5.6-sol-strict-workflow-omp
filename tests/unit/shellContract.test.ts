import { describe, expect, it } from 'vitest';

import {
  applyShellPresentation,
  getShellPresentation,
  type ShellElement,
  type ShellElements,
} from '../../src/ui/shellContract';

class ObservableElement implements ShellElement {
  textContent: string | null = null;
  hidden = false;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

function createShell(): ShellElements & {
  readonly root: ObservableElement & { readonly dataset: DOMStringMap };
  readonly canvas: ObservableElement;
  readonly status: ObservableElement;
  readonly controls: ObservableElement;
} {
  const root = Object.assign(new ObservableElement(), { dataset: {} as DOMStringMap });
  const canvas = new ObservableElement();
  const status = new ObservableElement();
  const controls = new ObservableElement();

  canvas.setAttribute('tabindex', '0');
  controls.setAttribute('aria-live', 'polite');
  controls.setAttribute('aria-busy', 'true');

  return { root, canvas, status, controls };
}

describe('shell presentation contract', () => {
  it('renders a ready shell with one status channel and no dead canvas focus stop', () => {
    const shell = createShell();

    applyShellPresentation(shell, getShellPresentation('ready'));

    expect(shell.root.dataset.appState).toBe('ready');
    expect(shell.status.textContent).toMatch(/ready/i);
    expect(shell.status.hidden).toBe(false);
    expect(shell.status.attributes.get('role')).toBe('status');
    expect(shell.status.attributes.get('aria-live')).toBe('polite');
    expect(shell.canvas.attributes.has('tabindex')).toBe(false);
    expect(shell.controls.attributes.has('aria-live')).toBe(false);
    expect(shell.controls.attributes.has('aria-busy')).toBe(false);
  });

  it('makes the disabled explanation authoritative without creating another live region', () => {
    const shell = createShell();
    const disabled = getShellPresentation('disabled');

    applyShellPresentation(shell, disabled);

    expect(shell.root.dataset.appState).toBe('disabled');
    expect(disabled.disabledExplanation).toMatch(/JavaScript is disabled/i);
    expect(shell.status.textContent).toBeNull();
    expect(shell.status.hidden).toBe(true);
    expect(shell.canvas.attributes.has('tabindex')).toBe(false);
    expect(shell.controls.attributes.has('aria-live')).toBe(false);
    expect(disabled.liveRegion).toBe('status');
  });
});
