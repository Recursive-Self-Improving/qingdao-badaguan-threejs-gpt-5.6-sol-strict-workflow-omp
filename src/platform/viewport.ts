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
