export const DEFAULT_MAX_DEVICE_PIXEL_RATIO = 2;
export const DEFAULT_MAX_DRAWING_BUFFER_PIXELS = 4_100_000;

export interface ViewportRenderTarget {
  setPixelRatio(pixelRatio: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
}

export interface ViewportCameraTarget {
  aspect: number;
  updateProjectionMatrix(): void;
}

export interface ViewportMeasurement {
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  bufferWidth: number;
  bufferHeight: number;
}

export interface ViewportLimits {
  maxDevicePixelRatio?: number;
  maxDrawingBufferPixels?: number;
}

export interface ViewportObserverOptions extends ViewportLimits {
  window?: Window;
  ResizeObserver?: typeof ResizeObserver;
  onChange?: (measurement: ViewportMeasurement) => void;
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function computeViewport(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  limits: ViewportLimits = {},
): ViewportMeasurement | null {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) {
    return null;
  }

  const width = Math.max(1, Math.round(cssWidth));
  const height = Math.max(1, Math.round(cssHeight));
  const maxDevicePixelRatio = positiveFinite(
    limits.maxDevicePixelRatio ?? DEFAULT_MAX_DEVICE_PIXEL_RATIO,
    DEFAULT_MAX_DEVICE_PIXEL_RATIO,
  );
  const maxDrawingBufferPixels = positiveFinite(
    limits.maxDrawingBufferPixels ?? DEFAULT_MAX_DRAWING_BUFFER_PIXELS,
    DEFAULT_MAX_DRAWING_BUFFER_PIXELS,
  );
  const requestedPixelRatio = Math.min(
    positiveFinite(devicePixelRatio, 1),
    maxDevicePixelRatio,
  );
  const pixelRatio = Math.min(
    requestedPixelRatio,
    Math.sqrt(maxDrawingBufferPixels / (width * height)),
  );
  const bufferWidth = Math.max(1, Math.floor(width * pixelRatio));
  const bufferHeight = Math.max(1, Math.floor(height * pixelRatio));

  return {
    cssWidth: width,
    cssHeight: height,
    pixelRatio,
    bufferWidth,
    bufferHeight,
  };
}

function measurementsEqual(
  left: ViewportMeasurement | null,
  right: ViewportMeasurement,
): boolean {
  return left !== null &&
    left.cssWidth === right.cssWidth &&
    left.cssHeight === right.cssHeight &&
    left.pixelRatio === right.pixelRatio &&
    left.bufferWidth === right.bufferWidth &&
    left.bufferHeight === right.bufferHeight;
}

function hasResizeObserver(target: Window): target is Window & { ResizeObserver: typeof ResizeObserver } {
  return "ResizeObserver" in target && typeof target.ResizeObserver === "function";
}

export class ViewportObserver {
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: ViewportRenderTarget;
  readonly #camera: ViewportCameraTarget;
  readonly #window: Window;
  readonly #ResizeObserver: typeof ResizeObserver | undefined;
  readonly #limits: ViewportLimits;
  readonly #onChange: ((measurement: ViewportMeasurement) => void) | undefined;
  readonly #handleViewportChange = (): void => {
    this.update();
  };
  #resizeObserver: ResizeObserver | null = null;
  #measurement: ViewportMeasurement | null = null;
  #started = false;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: ViewportRenderTarget,
    camera: ViewportCameraTarget,
    options: ViewportObserverOptions = {},
  ) {
    this.#canvas = canvas;
    this.#renderer = renderer;
    this.#camera = camera;
    this.#window = options.window ?? window;
    this.#ResizeObserver = options.ResizeObserver ??
      (hasResizeObserver(this.#window) ? this.#window.ResizeObserver : undefined);
    this.#limits = {
      ...(options.maxDevicePixelRatio === undefined
        ? {}
        : { maxDevicePixelRatio: options.maxDevicePixelRatio }),
      ...(options.maxDrawingBufferPixels === undefined
        ? {}
        : { maxDrawingBufferPixels: options.maxDrawingBufferPixels }),
    };
    this.#onChange = options.onChange;
  }

  get measurement(): ViewportMeasurement | null {
    return this.#measurement === null ? null : { ...this.#measurement };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;

    if (this.#ResizeObserver !== undefined) {
      this.#resizeObserver = new this.#ResizeObserver(this.#handleViewportChange);
      this.#resizeObserver.observe(this.#canvas);
    }
    this.#window.addEventListener('resize', this.#handleViewportChange);
    this.#window.visualViewport?.addEventListener('resize', this.#handleViewportChange);
    this.#window.visualViewport?.addEventListener('scroll', this.#handleViewportChange);
    this.update();
  }

  update(): ViewportMeasurement | null {
    if (!this.#started) return this.measurement;

    const next = computeViewport(
      this.#canvas.clientWidth,
      this.#canvas.clientHeight,
      this.#window.devicePixelRatio,
      this.#limits,
    );
    if (next === null || measurementsEqual(this.#measurement, next)) return this.measurement;

    this.#renderer.setPixelRatio(next.pixelRatio);
    this.#renderer.setSize(next.cssWidth, next.cssHeight, false);
    this.#camera.aspect = next.cssWidth / next.cssHeight;
    this.#camera.updateProjectionMatrix();
    this.#measurement = next;
    this.#onChange?.({ ...next });
    return { ...next };
  }

  dispose(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#window.removeEventListener('resize', this.#handleViewportChange);
    this.#window.visualViewport?.removeEventListener('resize', this.#handleViewportChange);
    this.#window.visualViewport?.removeEventListener('scroll', this.#handleViewportChange);
  }
}

export type InteractionViewportChangeReason =
  | 'resize'
  | 'orientation'
  | 'visual-viewport-resize'
  | 'visual-viewport-scroll';

export interface InteractionViewportMeasurement {
  readonly viewportLeft: number;
  readonly viewportTop: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly visibleLeft: number;
  readonly visibleTop: number;
  readonly visibleRight: number;
  readonly visibleBottom: number;
  readonly visibleWidth: number;
  readonly visibleHeight: number;
  readonly orientation: 'portrait' | 'landscape';
}

interface RectLike { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
interface VisualViewportLike extends EventTarget { readonly offsetLeft: number; readonly offsetTop: number; readonly width: number; readonly height: number }
interface InteractionWindow extends EventTarget { readonly innerWidth: number; readonly innerHeight: number; readonly visualViewport?: VisualViewportLike | null }

export function computeInteractionViewport(
  containerRect: RectLike,
  layoutViewport: Readonly<{ width: number; height: number }>,
  visualViewport?: Readonly<{ offsetLeft: number; offsetTop: number; width: number; height: number }> | null,
): InteractionViewportMeasurement {
  const viewportLeft = Number.isFinite(visualViewport?.offsetLeft) ? visualViewport!.offsetLeft : 0;
  const viewportTop = Number.isFinite(visualViewport?.offsetTop) ? visualViewport!.offsetTop : 0;
  const viewportWidth = positiveFinite(visualViewport?.width ?? layoutViewport.width, positiveFinite(layoutViewport.width, 1));
  const viewportHeight = positiveFinite(visualViewport?.height ?? layoutViewport.height, positiveFinite(layoutViewport.height, 1));
  const containerWidth = Math.max(0, Number.isFinite(containerRect.width) ? containerRect.width : 0);
  const containerHeight = Math.max(0, Number.isFinite(containerRect.height) ? containerRect.height : 0);
  const left = Math.max(containerRect.left, viewportLeft);
  const top = Math.max(containerRect.top, viewportTop);
  const right = Math.min(containerRect.left + containerWidth, viewportLeft + viewportWidth);
  const bottom = Math.min(containerRect.top + containerHeight, viewportTop + viewportHeight);
  const visibleLeft = Math.max(0, left - containerRect.left);
  const visibleTop = Math.max(0, top - containerRect.top);
  const visibleRight = Math.max(visibleLeft, right - containerRect.left);
  const visibleBottom = Math.max(visibleTop, bottom - containerRect.top);
  return {
    viewportLeft, viewportTop, viewportWidth, viewportHeight,
    visibleLeft, visibleTop, visibleRight, visibleBottom,
    visibleWidth: Math.max(0, visibleRight - visibleLeft),
    visibleHeight: Math.max(0, visibleBottom - visibleTop),
    orientation: viewportWidth >= viewportHeight ? 'landscape' : 'portrait',
  };
}

export interface InteractionViewportObserverOptions {
  readonly window?: InteractionWindow;
  readonly onChange: (measurement: InteractionViewportMeasurement) => void;
  readonly onInterrupt: (reason: InteractionViewportChangeReason) => void;
}

export class InteractionViewportObserver {
  readonly #container: HTMLElement;
  readonly #window: InteractionWindow;
  readonly #onChange: (measurement: InteractionViewportMeasurement) => void;
  readonly #onInterrupt: (reason: InteractionViewportChangeReason) => void;
  #measurement: InteractionViewportMeasurement | null = null;
  #started = false;

  constructor(container: HTMLElement, options: InteractionViewportObserverOptions) {
    this.#container = container;
    this.#window = options.window ?? window;
    this.#onChange = options.onChange;
    this.#onInterrupt = options.onInterrupt;
  }

  get measurement(): InteractionViewportMeasurement | null {
    return this.#measurement === null ? null : { ...this.#measurement };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#window.addEventListener('resize', this.#resize);
    this.#window.addEventListener('orientationchange', this.#orientation);
    this.#window.visualViewport?.addEventListener('resize', this.#visualResize);
    this.#window.visualViewport?.addEventListener('scroll', this.#visualScroll);
    this.update();
  }

  update(): InteractionViewportMeasurement | null {
    if (!this.#started) return this.measurement;
    const next = computeInteractionViewport(
      this.#container.getBoundingClientRect(),
      { width: this.#window.innerWidth, height: this.#window.innerHeight },
      this.#window.visualViewport,
    );
    if (this.#measurement !== null && JSON.stringify(this.#measurement) === JSON.stringify(next)) return this.measurement;
    this.#measurement = next;
    this.#onChange({ ...next });
    return { ...next };
  }

  dispose(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#window.removeEventListener('resize', this.#resize);
    this.#window.removeEventListener('orientationchange', this.#orientation);
    this.#window.visualViewport?.removeEventListener('resize', this.#visualResize);
    this.#window.visualViewport?.removeEventListener('scroll', this.#visualScroll);
  }

  readonly #interrupt = (reason: InteractionViewportChangeReason): void => {
    this.#onInterrupt(reason);
    this.update();
  };
  readonly #resize = (): void => this.#interrupt('resize');
  readonly #orientation = (): void => this.#interrupt('orientation');
  readonly #visualResize = (): void => this.#interrupt('visual-viewport-resize');
  readonly #visualScroll = (): void => this.#interrupt('visual-viewport-scroll');
}
