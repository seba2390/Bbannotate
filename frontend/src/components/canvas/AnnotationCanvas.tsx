import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stage,
  Layer,
  FastLayer,
  Image as KonvaImage,
  Rect,
  Circle,
  Group,
  Text,
  Line,
} from 'react-konva';
import type Konva from 'konva';
import type { Annotation, BoundingBox, BoundingBoxColorMode, DrawingRect, ToolMode } from '@/types';
import { getLabelColor } from '@/lib/constants';

/** Edge pan threshold in pixels (distance from edge to trigger auto-pan) */
const EDGE_PAN_THRESHOLD = 15;
/** Auto-pan speed in pixels per frame */
const EDGE_PAN_SPEED = 4;
/** Minimum corner accent size for image outline */
const IMAGE_FRAME_MIN_CORNER = 18;
/** Maximum corner accent size for image outline */
const IMAGE_FRAME_MAX_CORNER = 44;
/** Dynamic corner sizing factor based on shortest image side */
const IMAGE_FRAME_CORNER_RATIO = 0.08;

const IMAGE_FRAME_COLORS = {
  outer: 'rgba(14, 165, 233, 0.55)', // primary-500
  inner: 'rgba(248, 250, 252, 0.72)', // slate-50
  corner: 'rgba(236, 72, 153, 0.75)', // pink-500
} as const;

const AUTO_CONTRAST_COLOR_PALETTE = [
  '#22c55e',
  '#0ea5e9',
  '#f97316',
  '#e11d48',
  '#2563eb',
  '#14b8a6',
  '#f59e0b',
  '#9333ea',
] as const;
const AUTO_CONTRAST_SAMPLE_LIMIT = 256;
const CROSSHAIR_ARM_LENGTH_MIN = 8;
const CROSSHAIR_ARM_LENGTH_MAX = 96;
const CROSSHAIR_STROKE_WIDTH_MIN = 0.5;
const CROSSHAIR_STROKE_WIDTH_MAX = 4;
const CROSSHAIR_CENTER_GAP = 2;
const CROSSHAIR_PADDING = 2;
const CROSSHAIR_OUTER_COLOR = '#0f172a';
const CROSSHAIR_INNER_COLOR = '#f8fafc';
const MIN_ANNOTATION_SIZE_PX = 10;
const ANNOTATION_STROKE_WIDTH = 2;
const ANNOTATION_HIT_STROKE_WIDTH = 12;
const SELECT_HIT_PADDING_SCREEN_PX = 6;
const RESIZE_HANDLE_RADIUS_SCREEN_PX = 5;
const RESIZE_HANDLE_STROKE_SCREEN_PX = 1.5;
const RESIZE_HANDLE_HIT_RADIUS_SCREEN_PX = 12;
const RESIZE_HANDLE_FILL = '#ffffff';
const RESIZE_HANDLE_STROKE = 'rgba(15, 23, 42, 0.95)';

type ResizeHandle =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-right'
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'middle-left';

const RESIZE_HANDLES: ReadonlyArray<ResizeHandle> = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'bottom-right',
  'bottom-center',
  'bottom-left',
  'middle-left',
];

interface LuminanceIntegralMap {
  width: number;
  height: number;
  integral: Float32Array;
}

interface RenderAnnotation {
  annotation: Annotation;
  rect: DrawingRect;
  color: string;
  selected: boolean;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const AUTO_PALETTE_LUMINANCE = AUTO_CONTRAST_COLOR_PALETTE.map((color) =>
  getRelativeLuminance(color)
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseHexColor(hex: string): RgbColor {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const sixDigit =
    normalized.length === 3
      ? `${normalized[0]}${normalized[0]}${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}`
      : normalized;
  const intValue = Number.parseInt(sixDigit, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function linearizeChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(hexColor: string): number {
  const rgb = parseHexColor(hexColor);
  const r = linearizeChannel(rgb.r);
  const g = linearizeChannel(rgb.g);
  const b = linearizeChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(luminanceA: number, luminanceB: number): number {
  const light = Math.max(luminanceA, luminanceB);
  const dark = Math.min(luminanceA, luminanceB);
  return (light + 0.05) / (dark + 0.05);
}

function normalizeRect(rect: DrawingRect): DrawingRect {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function constrainRectToImageBounds(
  rect: DrawingRect,
  imageWidth: number,
  imageHeight: number,
  minSizePx = 0
): DrawingRect {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const normalized = normalizeRect(rect);
  const minWidth = Math.min(Math.max(minSizePx, 0), imageWidth);
  const minHeight = Math.min(Math.max(minSizePx, 0), imageHeight);

  const x = clamp(normalized.x, 0, Math.max(0, imageWidth - minWidth));
  const y = clamp(normalized.y, 0, Math.max(0, imageHeight - minHeight));
  const width = clamp(normalized.width, minWidth, imageWidth - x);
  const height = clamp(normalized.height, minHeight, imageHeight - y);

  return { x, y, width, height };
}

function resizeRectFromHandle(
  rect: DrawingRect,
  handle: ResizeHandle,
  pointer: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  minSizePx: number
): DrawingRect {
  const maxX = Math.max(0, imageWidth);
  const maxY = Math.max(0, imageHeight);
  const clampedPointerX = clamp(pointer.x, 0, maxX);
  const clampedPointerY = clamp(pointer.y, 0, maxY);

  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle === 'top-left' || handle === 'middle-left' || handle === 'bottom-left') {
    left = Math.min(clampedPointerX, right - minSizePx);
  }
  if (handle === 'top-right' || handle === 'middle-right' || handle === 'bottom-right') {
    right = Math.max(clampedPointerX, left + minSizePx);
  }
  if (handle === 'top-left' || handle === 'top-center' || handle === 'top-right') {
    top = Math.min(clampedPointerY, bottom - minSizePx);
  }
  if (handle === 'bottom-left' || handle === 'bottom-center' || handle === 'bottom-right') {
    bottom = Math.max(clampedPointerY, top + minSizePx);
  }

  return constrainRectToImageBounds(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    imageWidth,
    imageHeight,
    minSizePx
  );
}

function getResizeHandlePosition(rect: DrawingRect, handle: ResizeHandle): { x: number; y: number } {
  const left = rect.x;
  const centerX = rect.x + rect.width / 2;
  const right = rect.x + rect.width;
  const top = rect.y;
  const centerY = rect.y + rect.height / 2;
  const bottom = rect.y + rect.height;

  switch (handle) {
    case 'top-left':
      return { x: left, y: top };
    case 'top-center':
      return { x: centerX, y: top };
    case 'top-right':
      return { x: right, y: top };
    case 'middle-right':
      return { x: right, y: centerY };
    case 'bottom-right':
      return { x: right, y: bottom };
    case 'bottom-center':
      return { x: centerX, y: bottom };
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'middle-left':
      return { x: left, y: centerY };
    default:
      return { x: centerX, y: centerY };
  }
}

function getResizeHandleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case 'top-left':
    case 'bottom-right':
      return 'nwse-resize';
    case 'top-right':
    case 'bottom-left':
      return 'nesw-resize';
    case 'top-center':
    case 'bottom-center':
      return 'ns-resize';
    case 'middle-left':
    case 'middle-right':
      return 'ew-resize';
    default:
      return 'default';
  }
}

function getResizeHandleAtPosition(
  rect: DrawingRect,
  position: { x: number; y: number },
  maxDistance: number
): ResizeHandle | null {
  if (maxDistance <= 0) {
    return null;
  }

  let nearestHandle: ResizeHandle | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const handle of RESIZE_HANDLES) {
    const handlePosition = getResizeHandlePosition(rect, handle);
    const dx = position.x - handlePosition.x;
    const dy = position.y - handlePosition.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= maxDistance && distance < nearestDistance) {
      nearestHandle = handle;
      nearestDistance = distance;
    }
  }

  return nearestHandle;
}

function formatCrosshairStrokeWidth(value: number): string {
  const rounded = Number.parseFloat(value.toFixed(2));
  return String(rounded);
}

function buildCrosshairCursor(armLength: number, strokeWidth: number): string {
  const safeArmLength = Math.round(
    clamp(armLength, CROSSHAIR_ARM_LENGTH_MIN, CROSSHAIR_ARM_LENGTH_MAX)
  );
  const safeStrokeWidth = clamp(
    strokeWidth,
    CROSSHAIR_STROKE_WIDTH_MIN,
    CROSSHAIR_STROKE_WIDTH_MAX
  );
  const outerStrokeWidth = safeStrokeWidth + 1.6;
  const size = safeArmLength * 2 + CROSSHAIR_PADDING * 2 + 1;
  const center = Math.floor(size / 2);
  const lineStart = CROSSHAIR_PADDING;
  const lineEnd = size - CROSSHAIR_PADDING;
  const leftEnd = Math.max(lineStart, center - CROSSHAIR_CENTER_GAP);
  const rightStart = Math.min(lineEnd, center + CROSSHAIR_CENTER_GAP);
  const topEnd = Math.max(lineStart, center - CROSSHAIR_CENTER_GAP);
  const bottomStart = Math.min(lineEnd, center + CROSSHAIR_CENTER_GAP);

  const segments = [
    `<line x1='${lineStart}' y1='${center}' x2='${leftEnd}' y2='${center}'/>`,
    `<line x1='${rightStart}' y1='${center}' x2='${lineEnd}' y2='${center}'/>`,
    `<line x1='${center}' y1='${lineStart}' x2='${center}' y2='${topEnd}'/>`,
    `<line x1='${center}' y1='${bottomStart}' x2='${center}' y2='${lineEnd}'/>`,
  ].join('');

  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}' fill='none' shape-rendering='geometricPrecision'>
      <g stroke='${CROSSHAIR_OUTER_COLOR}' stroke-width='${outerStrokeWidth}' stroke-linecap='round'>${segments}</g>
      <g stroke='${CROSSHAIR_INNER_COLOR}' stroke-width='${safeStrokeWidth}' stroke-linecap='round'>${segments}</g>
    </svg>
  `
    .trim()
    .replace(/\s+/g, ' ');

  const encodedSvg = encodeURIComponent(svg);
  return `url("data:image/svg+xml,${encodedSvg}") ${center} ${center}, crosshair`;
}

function getCenteredStagePosition(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
  scale: number
): { x: number; y: number } {
  return {
    x: (stageWidth - imageWidth * scale) / 2,
    y: (stageHeight - imageHeight * scale) / 2,
  };
}

interface AnnotationCanvasProps {
  imageUrl: string | null;
  annotations: Annotation[];
  selectedId: string | null;
  toolMode: ToolMode;
  bboxColorMode: BoundingBoxColorMode;
  customBboxColor: string;
  crosshairArmLength: number;
  crosshairStrokeWidth: number;
  currentLabel: string;
  currentClassId: number;
  labels: string[];
  isCurrentImageDone: boolean;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (rect: DrawingRect, imageWidth: number, imageHeight: number) => void;
  onUpdateBbox: (annotationId: string, bbox: BoundingBox) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onToolModeChange: (mode: ToolMode) => void;
  onBboxColorModeChange: (mode: BoundingBoxColorMode) => void;
  onCustomBboxColorChange: (color: string) => void;
  onCrosshairArmLengthChange: (length: number) => void;
  onCrosshairStrokeWidthChange: (width: number) => void;
  onMarkDone: () => void;
  onLabelChange: (label: string) => void;
}

/**
 * Canvas component for displaying images and drawing/editing bounding boxes.
 */
export function AnnotationCanvas({
  imageUrl,
  annotations,
  selectedId,
  toolMode,
  bboxColorMode,
  customBboxColor,
  crosshairArmLength,
  crosshairStrokeWidth,
  currentLabel,
  labels,
  isCurrentImageDone,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateBbox,
  onDeleteAnnotation: _onDeleteAnnotation, // Used externally via keyboard shortcuts in App.tsx
  onToolModeChange,
  onBboxColorModeChange,
  onCustomBboxColorChange,
  onCrosshairArmLengthChange,
  onCrosshairStrokeWidthChange,
  onMarkDone,
  onLabelChange,
}: AnnotationCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingRect, setDrawingRect] = useState<DrawingRect | null>(null);
  const [luminanceMap, setLuminanceMap] = useState<LuminanceIntegralMap | null>(null);

  // Canvas zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });
  const [isCursorOverlayVisible, setIsCursorOverlayVisible] = useState(false);
  const [isZoomPanelOpen, setIsZoomPanelOpen] = useState(false);
  const [isCrosshairLengthPanelOpen, setIsCrosshairLengthPanelOpen] = useState(false);
  const [isCrosshairWidthPanelOpen, setIsCrosshairWidthPanelOpen] = useState(false);
  const [hoveredResizeHandle, setHoveredResizeHandle] = useState<ResizeHandle | null>(null);
  const [resizeSession, setResizeSession] = useState<{
    annotationId: string;
    handle: ResizeHandle;
    startRect: DrawingRect;
  } | null>(null);
  const [resizePreviewRect, setResizePreviewRect] = useState<DrawingRect | null>(null);

  // For auto-pan during drawing
  const autoPanRef = useRef<number | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const zoomRef = useRef(zoom);
  const cursorOverlayRef = useRef<HTMLDivElement>(null);
  const zoomToolbarRef = useRef<HTMLDivElement>(null);
  const crosshairToolbarRef = useRef<HTMLDivElement>(null);

  // Load image when URL changes
  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      setImage(img);
    };
  }, [imageUrl]);

  // Build luminance integral map once per image for O(1) bbox contrast lookup
  useEffect(() => {
    if (!image) {
      setLuminanceMap(null);
      return;
    }

    const sampleWidth = Math.max(1, Math.min(AUTO_CONTRAST_SAMPLE_LIMIT, image.width));
    const sampleHeight = Math.max(1, Math.min(AUTO_CONTRAST_SAMPLE_LIMIT, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      setLuminanceMap(null);
      return;
    }

    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
    const pixels = imageData.data;
    const stride = sampleWidth + 1;
    const integral = new Float32Array((sampleWidth + 1) * (sampleHeight + 1));

    for (let y = 1; y <= sampleHeight; y += 1) {
      let rowSum = 0;
      for (let x = 1; x <= sampleWidth; x += 1) {
        const offset = ((y - 1) * sampleWidth + (x - 1)) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        rowSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const previousIntegral = integral[(y - 1) * stride + x] ?? 0;
        integral[y * stride + x] = previousIntegral + rowSum;
      }
    }

    setLuminanceMap({
      width: sampleWidth,
      height: sampleHeight,
      integral,
    });
  }, [image]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Resize stage to fit container
  useEffect(() => {
    const updateSize = (): void => {
      if (containerRef.current && image) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;

        // Calculate scale to fit image in container
        const scaleX = containerWidth / image.width;
        const scaleY = containerHeight / image.height;
        const newBaseScale = Math.min(scaleX, scaleY, 1); // Don't scale up

        const nextScale = newBaseScale * zoomRef.current;
        setBaseScale(newBaseScale);
        setScale(nextScale);
        setStageSize({
          width: containerWidth,
          height: containerHeight,
        });
        setStagePosition(
          getCenteredStagePosition(
            containerWidth,
            containerHeight,
            image.width,
            image.height,
            nextScale
          )
        );
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [image]);

  // Update scale when zoom changes
  useEffect(() => {
    setScale(baseScale * zoom);
  }, [zoom, baseScale]);

  // Zoom handlers
  const handleZoomIn = useCallback((): void => {
    setZoom((prev) => Math.min(prev * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback((): void => {
    setZoom((prev) => Math.max(prev / 1.25, 0.25));
  }, []);

  const handleZoomReset = useCallback((): void => {
    setZoom(1);
    if (!image) return;
    setStagePosition(
      getCenteredStagePosition(
        stageSize.width,
        stageSize.height,
        image.width,
        image.height,
        baseScale
      )
    );
  }, [image, stageSize, baseScale]);

  // Handle mouse wheel for zooming
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>): void => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      // Use delta-proportional zoom for smooth trackpad pinch-to-zoom
      // Clamp deltaY to avoid extreme zoom jumps from fast scroll wheels
      const deltaY = Math.abs(e.evt.deltaY);
      const scaleBy = 1 + Math.min(deltaY, 100) * 0.002;
      const oldZoom = zoom;
      const pointer = stage.getPointerPosition();

      if (!pointer) return;

      const newZoom =
        e.evt.deltaY < 0 ? Math.min(oldZoom * scaleBy, 5) : Math.max(oldZoom / scaleBy, 0.25);

      // Calculate new position to zoom toward pointer
      const mousePointTo = {
        x: (pointer.x - stagePosition.x) / (baseScale * oldZoom),
        y: (pointer.y - stagePosition.y) / (baseScale * oldZoom),
      };

      const newPos = {
        x: pointer.x - mousePointTo.x * baseScale * newZoom,
        y: pointer.y - mousePointTo.y * baseScale * newZoom,
      };

      setZoom(newZoom);
      setStagePosition(newPos);
    },
    [zoom, baseScale, stagePosition]
  );

  useEffect(() => {
    if (toolMode !== 'select' || !selectedId) {
      setHoveredResizeHandle(null);
      setResizeSession(null);
      setResizePreviewRect(null);
    }
  }, [toolMode, selectedId]);

  // Stop auto-pan animation
  const stopAutoPan = useCallback((): void => {
    if (autoPanRef.current !== null) {
      cancelAnimationFrame(autoPanRef.current);
      autoPanRef.current = null;
    }
  }, []);

  // Handle Escape to cancel drawing (other keys handled in App.tsx)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isDrawing) {
        setIsDrawing(false);
        setDrawingRect(null);
        stopAutoPan();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing, stopAutoPan]);

  // Cleanup auto-pan on unmount
  useEffect(() => {
    return () => stopAutoPan();
  }, [stopAutoPan]);

  // Close floating toolbar panels when clicking outside their controls
  useEffect(() => {
    if (!isZoomPanelOpen && !isCrosshairLengthPanelOpen && !isCrosshairWidthPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const zoomToolbarNode = zoomToolbarRef.current;
      if (isZoomPanelOpen && zoomToolbarNode && !zoomToolbarNode.contains(target)) {
        setIsZoomPanelOpen(false);
      }

      const crosshairToolbarNode = crosshairToolbarRef.current;
      if (
        (isCrosshairLengthPanelOpen || isCrosshairWidthPanelOpen) &&
        crosshairToolbarNode &&
        !crosshairToolbarNode.contains(target)
      ) {
        setIsCrosshairLengthPanelOpen(false);
        setIsCrosshairWidthPanelOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isZoomPanelOpen, isCrosshairLengthPanelOpen, isCrosshairWidthPanelOpen]);

  // Convert annotation bbox to pixel coordinates (in image space, Stage handles scaling)
  const bboxToRect = useCallback(
    (bbox: BoundingBox): DrawingRect => {
      if (!image) return { x: 0, y: 0, width: 0, height: 0 };
      return {
        x: (bbox.x - bbox.width / 2) * image.width,
        y: (bbox.y - bbox.height / 2) * image.height,
        width: bbox.width * image.width,
        height: bbox.height * image.height,
      };
    },
    [image]
  );

  // Convert pixel rect to normalized bbox
  const rectToBbox = useCallback(
    (rect: DrawingRect): BoundingBox => {
      if (!image) return { x: 0, y: 0, width: 0, height: 0 };
      const constrainedRect = constrainRectToImageBounds(rect, image.width, image.height);
      return {
        x: (constrainedRect.x + constrainedRect.width / 2) / image.width,
        y: (constrainedRect.y + constrainedRect.height / 2) / image.height,
        width: constrainedRect.width / image.width,
        height: constrainedRect.height / image.height,
      };
    },
    [image]
  );

  const getRectAverageLuminance = useCallback(
    (rect: DrawingRect): number => {
      if (!image || !luminanceMap) return 0.5;
      const sampleWidth = luminanceMap.width;
      const sampleHeight = luminanceMap.height;
      if (sampleWidth <= 0 || sampleHeight <= 0) return 0.5;

      const x1 = clamp(Math.floor((rect.x / image.width) * sampleWidth), 0, sampleWidth - 1);
      const y1 = clamp(Math.floor((rect.y / image.height) * sampleHeight), 0, sampleHeight - 1);
      const x2 = clamp(
        Math.ceil(((rect.x + rect.width) / image.width) * sampleWidth),
        x1 + 1,
        sampleWidth
      );
      const y2 = clamp(
        Math.ceil(((rect.y + rect.height) / image.height) * sampleHeight),
        y1 + 1,
        sampleHeight
      );

      const stride = sampleWidth + 1;
      const integral = luminanceMap.integral;
      const area = (x2 - x1) * (y2 - y1);
      if (area <= 0) return 0.5;

      const sum =
        (integral[y2 * stride + x2] ?? 0) -
        (integral[y1 * stride + x2] ?? 0) -
        (integral[y2 * stride + x1] ?? 0) +
        (integral[y1 * stride + x1] ?? 0);

      return sum / area;
    },
    [image, luminanceMap]
  );

  const getAutoContrastColor = useCallback(
    (rect: DrawingRect): string => {
      const backgroundLuminance = getRectAverageLuminance(rect);
      let bestColor: string = AUTO_CONTRAST_COLOR_PALETTE[0];
      let bestContrast = 0;

      for (let i = 0; i < AUTO_CONTRAST_COLOR_PALETTE.length; i += 1) {
        const paletteColor = AUTO_CONTRAST_COLOR_PALETTE[i] ?? AUTO_CONTRAST_COLOR_PALETTE[0];
        const colorLuminance = AUTO_PALETTE_LUMINANCE[i] ?? 0;
        const contrast = getContrastRatio(colorLuminance, backgroundLuminance);
        if (contrast > bestContrast) {
          bestContrast = contrast;
          bestColor = paletteColor;
        }
      }

      return bestColor;
    },
    [getRectAverageLuminance]
  );

  const resolveAnnotationColor = useCallback(
    (annotation: Annotation, rect: DrawingRect): string => {
      if (bboxColorMode === 'custom') {
        return customBboxColor;
      }
      if (bboxColorMode === 'auto') {
        return getAutoContrastColor(rect);
      }
      return getLabelColor(annotation.label);
    },
    [bboxColorMode, customBboxColor, getAutoContrastColor]
  );

  const drawingPreviewColor = useMemo((): string => {
    if (!drawingRect) {
      return '#22c55e';
    }

    if (bboxColorMode === 'custom') {
      return customBboxColor;
    }

    if (bboxColorMode === 'label') {
      const activeLabel = currentLabel || labels[0] || 'default';
      return getLabelColor(activeLabel);
    }

    return getAutoContrastColor(normalizeRect(drawingRect));
  }, [drawingRect, bboxColorMode, customBboxColor, currentLabel, labels, getAutoContrastColor]);

  const renderedAnnotations = useMemo<RenderAnnotation[]>(() => {
    return annotations.map((annotation) => {
      const rect = bboxToRect(annotation.bbox);
      return {
        annotation,
        rect,
        color: resolveAnnotationColor(annotation, rect),
        selected: annotation.id === selectedId,
      };
    });
  }, [annotations, bboxToRect, resolveAnnotationColor, selectedId]);

  const selectedAnnotationForResize = useMemo(() => {
    if (!selectedId) return null;
    return renderedAnnotations.find(({ annotation }) => annotation.id === selectedId) ?? null;
  }, [renderedAnnotations, selectedId]);

  const selectedRectForResize = useMemo(() => {
    if (!selectedAnnotationForResize) {
      return null;
    }
    if (
      resizeSession &&
      resizePreviewRect &&
      resizeSession.annotationId === selectedAnnotationForResize.annotation.id
    ) {
      return resizePreviewRect;
    }
    return selectedAnnotationForResize.rect;
  }, [selectedAnnotationForResize, resizeSession, resizePreviewRect]);

  const drawCursor = useMemo(
    (): string => buildCrosshairCursor(crosshairArmLength, crosshairStrokeWidth),
    [crosshairArmLength, crosshairStrokeWidth]
  );
  const crosshairSegmentLength = Math.max(1, crosshairArmLength - CROSSHAIR_CENTER_GAP);
  const crosshairOuterStrokeWidth = crosshairStrokeWidth + 1.6;
  const resizeHandleScale = Math.max(scale, 0.0001);
  const resizeHandleRadius = RESIZE_HANDLE_RADIUS_SCREEN_PX / resizeHandleScale;
  const resizeHandleStrokeWidth = RESIZE_HANDLE_STROKE_SCREEN_PX / resizeHandleScale;
  const resizeHandleHitRadius = RESIZE_HANDLE_HIT_RADIUS_SCREEN_PX / resizeHandleScale;

  // Convert pointer position from stage space to image space
  const getImagePosition = useCallback(
    (stage: Konva.Stage): { x: number; y: number } | null => {
      const pos = stage.getPointerPosition();
      if (!pos) return null;

      // Account for stage position (pan) and scale (zoom)
      return {
        x: (pos.x - stagePosition.x) / scale,
        y: (pos.y - stagePosition.y) / scale,
      };
    },
    [scale, stagePosition]
  );

  const isWithinImageBounds = useCallback(
    (position: { x: number; y: number }): boolean => {
      if (!image) return false;
      return (
        position.x >= 0 &&
        position.x <= image.width &&
        position.y >= 0 &&
        position.y <= image.height
      );
    },
    [image]
  );

  const clampToImageBounds = useCallback(
    (position: { x: number; y: number }): { x: number; y: number } => {
      if (!image) return position;
      return {
        x: clamp(position.x, 0, image.width),
        y: clamp(position.y, 0, image.height),
      };
    },
    [image]
  );

  const updateCursorOverlayPosition = useCallback((screenPos: { x: number; y: number }): void => {
    const overlayNode = cursorOverlayRef.current;
    if (!overlayNode) return;
    overlayNode.style.left = `${screenPos.x}px`;
    overlayNode.style.top = `${screenPos.y}px`;
  }, []);

  const getAnnotationIdAtPosition = useCallback(
    (position: { x: number; y: number }): string | null => {
      if (renderedAnnotations.length === 0) {
        return null;
      }

      const hitPadding = SELECT_HIT_PADDING_SCREEN_PX / Math.max(scale, 0.0001);
      const candidates = renderedAnnotations
        .map((entry, index) => ({
          ...entry,
          index,
          area: entry.rect.width * entry.rect.height,
        }))
        .filter(({ rect }) => {
          return (
            position.x >= rect.x - hitPadding &&
            position.x <= rect.x + rect.width + hitPadding &&
            position.y >= rect.y - hitPadding &&
            position.y <= rect.y + rect.height + hitPadding
          );
        });

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => {
        if (a.area !== b.area) {
          return a.area - b.area;
        }
        return b.index - a.index;
      });

      return candidates[0]?.annotation.id ?? null;
    },
    [renderedAnnotations, scale]
  );

  useEffect(() => {
    if (toolMode !== 'draw') {
      setIsCursorOverlayVisible(false);
    }
  }, [toolMode]);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (!stage) return;

    const target = e.target;
    if (toolMode === 'select') {
      const imagePos = getImagePosition(stage);
      if (
        imagePos &&
        selectedAnnotationForResize &&
        selectedRectForResize &&
        isWithinImageBounds(imagePos)
      ) {
        const activeHandle = getResizeHandleAtPosition(
          selectedRectForResize,
          imagePos,
          resizeHandleHitRadius
        );
        if (activeHandle) {
          setHoveredResizeHandle(activeHandle);
          setResizeSession({
            annotationId: selectedAnnotationForResize.annotation.id,
            handle: activeHandle,
            startRect: selectedRectForResize,
          });
          setResizePreviewRect(selectedRectForResize);
          return;
        }
      }

      const targetId = target.id?.() ?? '';
      if (selectedId && targetId === selectedId) {
        return;
      }

      // Only background clicks should trigger geometric selection.
      if (target !== stage) {
        return;
      }

      if (!imagePos || !isWithinImageBounds(imagePos)) {
        onSelectAnnotation(null);
        return;
      }

      onSelectAnnotation(getAnnotationIdAtPosition(imagePos));
      return;
    }

    const screenPos = stage.getPointerPosition();
    if (!screenPos) return;

    // Handle pan mode
    if (toolMode === 'pan') {
      setIsPanning(true);
      setLastPanPosition({ x: screenPos.x, y: screenPos.y });
      return;
    }

    // Handle draw mode
    if (toolMode !== 'draw' || !image) return;

    const imagePos = getImagePosition(stage);
    if (!imagePos || !isWithinImageBounds(imagePos)) return;

    setIsDrawing(true);
    setDrawingRect({
      x: imagePos.x,
      y: imagePos.y,
      width: 0,
      height: 0,
    });
    onSelectAnnotation(null);
  };

  // Calculate auto-pan direction based on screen position
  const calculateAutoPanDelta = useCallback(
    (screenPos: { x: number; y: number }): { dx: number; dy: number } => {
      let dx = 0;
      let dy = 0;

      // Left edge
      if (screenPos.x < EDGE_PAN_THRESHOLD) {
        dx = EDGE_PAN_SPEED;
      }
      // Right edge
      if (screenPos.x > stageSize.width - EDGE_PAN_THRESHOLD) {
        dx = -EDGE_PAN_SPEED;
      }
      // Top edge (accounting for toolbar area)
      if (screenPos.y < EDGE_PAN_THRESHOLD + 60) {
        dy = EDGE_PAN_SPEED;
      }
      // Bottom edge
      if (screenPos.y > stageSize.height - EDGE_PAN_THRESHOLD) {
        dy = -EDGE_PAN_SPEED;
      }

      return { dx, dy };
    },
    [stageSize]
  );

  // Auto-pan animation frame
  const runAutoPan = useCallback((): void => {
    const mousePos = lastMousePosRef.current;
    if (!mousePos || !isDrawing || !drawingRect) {
      stopAutoPan();
      return;
    }

    const { dx, dy } = calculateAutoPanDelta(mousePos);

    if (dx !== 0 || dy !== 0) {
      // Update stage position (pan the view)
      setStagePosition((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));

      // Update drawing rect to follow the pan (keep visual position constant)
      // We need to adjust the rect's size to compensate for the pan
      setDrawingRect((prev) => {
        if (!prev || !image) return prev;
        const proposedEndX = prev.x + (prev.width - dx / scale);
        const proposedEndY = prev.y + (prev.height - dy / scale);
        const clampedEndX = clamp(proposedEndX, 0, image.width);
        const clampedEndY = clamp(proposedEndY, 0, image.height);
        const nextWidth = clampedEndX - prev.x;
        const nextHeight = clampedEndY - prev.y;

        if (nextWidth === prev.width && nextHeight === prev.height) {
          return prev;
        }

        return {
          ...prev,
          width: nextWidth,
          height: nextHeight,
        };
      });

      // Continue animation
      autoPanRef.current = requestAnimationFrame(runAutoPan);
    } else {
      stopAutoPan();
    }
  }, [isDrawing, drawingRect, calculateAutoPanDelta, stopAutoPan, scale, image]);

  // Start auto-pan if needed
  const startAutoPanIfNeeded = useCallback(
    (screenPos: { x: number; y: number }): void => {
      lastMousePosRef.current = screenPos;
      const { dx, dy } = calculateAutoPanDelta(screenPos);

      if ((dx !== 0 || dy !== 0) && autoPanRef.current === null) {
        autoPanRef.current = requestAnimationFrame(runAutoPan);
      } else if (dx === 0 && dy === 0) {
        stopAutoPan();
      }
    },
    [calculateAutoPanDelta, runAutoPan, stopAutoPan]
  );

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (!stage) return;

    const screenPos = stage.getPointerPosition();
    if (!screenPos) return;

    if (resizeSession) {
      updateResizePreviewFromStage(stage);
      return;
    }

    // Handle panning
    if (isPanning && toolMode === 'pan') {
      const dx = screenPos.x - lastPanPosition.x;
      const dy = screenPos.y - lastPanPosition.y;
      setStagePosition((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      setLastPanPosition({ x: screenPos.x, y: screenPos.y });
      return;
    }

    const imagePos = getImagePosition(stage);
    if (toolMode === 'select') {
      const nextHandle =
        imagePos && selectedRectForResize
          ? getResizeHandleAtPosition(selectedRectForResize, imagePos, resizeHandleHitRadius)
          : null;
      setHoveredResizeHandle((current) => (current === nextHandle ? current : nextHandle));
    }
    const shouldShowOverlay = toolMode === 'draw' && !!imagePos && isWithinImageBounds(imagePos);

    if (shouldShowOverlay) {
      updateCursorOverlayPosition(screenPos);
    }
    setIsCursorOverlayVisible((prev) => (prev === shouldShowOverlay ? prev : shouldShowOverlay));

    // Handle drawing
    if (!isDrawing || !drawingRect) return;

    if (!imagePos) return;
    const clampedImagePos = clampToImageBounds(imagePos);

    // Update drawing rect while keeping endpoint constrained to image bounds
    setDrawingRect((prev) => {
      if (!prev) return prev;
      const nextWidth = clampedImagePos.x - prev.x;
      const nextHeight = clampedImagePos.y - prev.y;

      if (nextWidth === prev.width && nextHeight === prev.height) {
        return prev;
      }

      return {
        ...prev,
        width: nextWidth,
        height: nextHeight,
      };
    });

    // Check if we need to auto-pan
    startAutoPanIfNeeded(screenPos);
  };

  const handleMouseLeave = useCallback((): void => {
    setIsCursorOverlayVisible(false);
    if (!resizeSession) {
      setHoveredResizeHandle(null);
    }
  }, [resizeSession]);

  const handleMouseUp = useCallback((): void => {
    // Stop any auto-pan in progress
    stopAutoPan();
    lastMousePosRef.current = null;

    if (resizeSession) {
      if (!image) {
        return;
      }
      const finalRect = constrainRectToImageBounds(
        resizePreviewRect ?? resizeSession.startRect,
        image.width,
        image.height,
        MIN_ANNOTATION_SIZE_PX
      );
      onUpdateBbox(resizeSession.annotationId, rectToBbox(finalRect));
      setResizeSession(null);
      setResizePreviewRect(null);
      setHoveredResizeHandle(null);
      return;
    }

    // Handle pan end
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawing || !drawingRect || !image) {
      setIsDrawing(false);
      setDrawingRect(null);
      return;
    }

    // Only create annotation if box is large enough (in image space)
    if (
      Math.abs(drawingRect.width) > MIN_ANNOTATION_SIZE_PX &&
      Math.abs(drawingRect.height) > MIN_ANNOTATION_SIZE_PX
    ) {
      // Normalize rectangle (handle negative dimensions) - already in image space
      const normalizedRect: DrawingRect = {
        x: drawingRect.width < 0 ? drawingRect.x + drawingRect.width : drawingRect.x,
        y: drawingRect.height < 0 ? drawingRect.y + drawingRect.height : drawingRect.y,
        width: Math.abs(drawingRect.width),
        height: Math.abs(drawingRect.height),
      };

      onAddAnnotation(normalizedRect, image.width, image.height);
    }

    setIsDrawing(false);
    setDrawingRect(null);
  }, [
    stopAutoPan,
    resizeSession,
    image,
    resizePreviewRect,
    onUpdateBbox,
    rectToBbox,
    isPanning,
    isDrawing,
    drawingRect,
    onAddAnnotation,
  ]);

  // Listen for mouseup on window to catch releases outside the canvas
  useEffect(() => {
    if (isDrawing || isPanning || !!resizeSession) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDrawing, isPanning, resizeSession, handleMouseUp]);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>, annotationId: string): void => {
    if (!image) return;
    const node = e.target;
    const draggedRect: DrawingRect = {
      x: node.x(),
      y: node.y(),
      width: node.width(),
      height: node.height(),
    };

    const constrainedRect = constrainRectToImageBounds(draggedRect, image.width, image.height);
    node.x(constrainedRect.x);
    node.y(constrainedRect.y);

    const bbox = rectToBbox(constrainedRect);
    onUpdateBbox(annotationId, bbox);
  };

  const updateResizePreviewFromStage = useCallback(
    (stage: Konva.Stage): void => {
      if (!resizeSession || !image) {
        return;
      }
      const pointer = getImagePosition(stage);
      if (!pointer) {
        return;
      }

      const nextRect = resizeRectFromHandle(
        resizeSession.startRect,
        resizeSession.handle,
        pointer,
        image.width,
        image.height,
        MIN_ANNOTATION_SIZE_PX
      );
      setResizePreviewRect(nextRect);
    },
    [resizeSession, image, getImagePosition]
  );

  // Get cursor style based on current tool
  const getCursor = (): string => {
    switch (toolMode) {
      case 'pan':
        return isPanning ? 'grabbing' : 'grab';
      case 'draw':
        return isCursorOverlayVisible ? 'none' : drawCursor;
      case 'select': {
        const activeHandle = resizeSession?.handle ?? hoveredResizeHandle;
        return activeHandle ? getResizeHandleCursor(activeHandle) : 'default';
      }
      default:
        return 'default';
    }
  };

  if (!imageUrl) {
    return (
      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
      >
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-2">No image selected</p>
          <p className="text-sm">Upload images to get started</p>
        </div>
      </div>
    );
  }

  const imageWidth = image?.width ?? 0;
  const imageHeight = image?.height ?? 0;
  const cornerLength = Math.max(
    IMAGE_FRAME_MIN_CORNER,
    Math.min(IMAGE_FRAME_MAX_CORNER, Math.min(imageWidth, imageHeight) * IMAGE_FRAME_CORNER_RATIO)
  );

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center bg-gray-800 dark:bg-gray-900 overflow-hidden"
    >
      {/* Canvas Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg bg-white dark:bg-gray-800 p-1 shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Tool controls */}
        <div className="flex flex-col gap-0.5">
          <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Controls
          </span>
          <div className="flex h-7 items-stretch gap-1 rounded-md border border-gray-300 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-700/60">
            <button
              type="button"
              onClick={() => onToolModeChange('select')}
              className={`flex h-full w-7 items-center justify-center rounded-md transition-colors ${
                toolMode === 'select'
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              title="Select (S)"
              aria-label="Select tool"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onToolModeChange('draw')}
              className={`flex h-full w-7 items-center justify-center rounded-md transition-colors ${
                toolMode === 'draw'
                  ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              title="Draw Box (D)"
              aria-label="Draw tool"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onToolModeChange('pan')}
              className={`flex h-full w-7 items-center justify-center rounded-md transition-colors ${
                toolMode === 'pan'
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              title="Pan (Space)"
              aria-label="Pan tool"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* Zoom controls */}
        <div ref={zoomToolbarRef} className="relative flex flex-col gap-0.5">
          <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Zoom
          </span>
          <div className="flex h-7 items-stretch rounded-md border border-gray-300 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-700/60">
            <button
              type="button"
              onClick={() => {
                setIsZoomPanelOpen((prev) => !prev);
                setIsCrosshairLengthPanelOpen(false);
                setIsCrosshairWidthPanelOpen(false);
              }}
              className={`flex h-full w-7 items-center justify-center rounded-md transition-colors ${
                isZoomPanelOpen
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              title="Zoom settings"
              aria-label="Toggle zoom settings"
              aria-expanded={isZoomPanelOpen}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35m1.35-5.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                />
              </svg>
            </button>
          </div>
          {isZoomPanelOpen && (
            <div className="absolute left-0 top-full mt-1 flex w-44 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Zoom
              </h3>
              <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="flex h-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  title="Zoom Out"
                  aria-label="Zoom out"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 12h12"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  className="h-7 rounded-md border border-gray-300 bg-gray-50 px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600"
                  title="Reset Zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="flex h-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  title="Zoom In"
                  aria-label="Zoom in"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v12m-6-6h12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        {labels.length > 0 && (
          <>
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Label selector */}
            <div className="flex flex-col gap-0.5">
              <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Label
              </span>
              <select
                value={currentLabel}
                onChange={(e) => onLabelChange(e.target.value)}
                className="h-7 rounded-md border border-gray-300 bg-white px-2 py-0 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                title="Select label (1-9)"
              >
                {labels.map((label, idx) => (
                  <option key={label} value={label}>
                    {idx + 1}. {label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Box
            </span>
            <div className="flex h-7 items-center gap-1">
              <div className="flex h-7 items-stretch rounded-md border border-gray-300 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-700/60">
                {(['auto', 'label', 'custom'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onBboxColorModeChange(mode)}
                    className={`flex items-center rounded px-1.5 text-[11px] font-medium capitalize transition-colors ${
                      bboxColorMode === mode
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100'
                        : 'text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white'
                    }`}
                    title={`Bounding box color mode: ${mode}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {bboxColorMode === 'custom' && (
                <label
                  className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700"
                  title="Choose custom bounding box color"
                >
                  <input
                    type="color"
                    value={customBboxColor}
                    onChange={(e) => onCustomBboxColorChange(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Custom bounding box color"
                  />
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-white/70 shadow-sm"
                    style={{ backgroundColor: customBboxColor }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="h-9 w-px bg-gray-300 dark:bg-gray-600" />

          <div ref={crosshairToolbarRef} className="relative flex flex-col gap-0.5">
            <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Cursor
            </span>
            <div className="flex h-7 items-stretch gap-1 rounded-md border border-gray-300 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-700/60">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsZoomPanelOpen(false);
                    setIsCrosshairLengthPanelOpen((prev) => !prev);
                    setIsCrosshairWidthPanelOpen(false);
                  }}
                  className={`flex h-full w-7 items-center justify-center rounded-md transition-colors ${
                    isCrosshairLengthPanelOpen
                      ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  title="Arm length settings"
                  aria-label="Toggle arm length settings"
                  aria-expanded={isCrosshairLengthPanelOpen}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 12h16m-13-3l-3 3 3 3m10-6l3 3-3 3"
                    />
                  </svg>
                </button>
                {isCrosshairLengthPanelOpen && (
                  <div className="absolute left-0 top-full mt-1 flex w-44 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Arm Length
                    </h3>
                    <label
                      className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700/60"
                      title="Crosshair arm length"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                          Length
                        </span>
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                          {crosshairArmLength}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={CROSSHAIR_ARM_LENGTH_MIN}
                        max={CROSSHAIR_ARM_LENGTH_MAX}
                        step={1}
                        value={crosshairArmLength}
                        onChange={(e) =>
                          onCrosshairArmLengthChange(Number.parseInt(e.target.value, 10))
                        }
                        className="h-1.5 w-full accent-primary-500"
                        aria-label="Crosshair arm length"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsZoomPanelOpen(false);
                    setIsCrosshairWidthPanelOpen((prev) => !prev);
                    setIsCrosshairLengthPanelOpen(false);
                  }}
                  className={`flex h-full w-7 items-center justify-center rounded-md transition-colors ${
                    isCrosshairWidthPanelOpen
                      ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  title="Arm width settings"
                  aria-label="Toggle arm width settings"
                  aria-expanded={isCrosshairWidthPanelOpen}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 8h12M4 12h16M6 16h12"
                    />
                  </svg>
                </button>
                {isCrosshairWidthPanelOpen && (
                  <div className="absolute right-0 top-full mt-1 flex w-44 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Arm Width
                    </h3>
                    <label
                      className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700/60"
                      title="Crosshair stroke width"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                          Width
                        </span>
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                          {formatCrosshairStrokeWidth(crosshairStrokeWidth)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={CROSSHAIR_STROKE_WIDTH_MIN}
                        max={CROSSHAIR_STROKE_WIDTH_MAX}
                        step={0.25}
                        value={crosshairStrokeWidth}
                        onChange={(e) =>
                          onCrosshairStrokeWidthChange(Number.parseFloat(e.target.value))
                        }
                        className="h-1.5 w-full accent-primary-500"
                        aria-label="Crosshair stroke width"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        x={stagePosition.x}
        y={stagePosition.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: getCursor() }}
      >
        <FastLayer listening={false}>
          {image && (
            <>
              <KonvaImage image={image} listening={false} />
              {/* Dual-tone frame improves edge visibility on light and dark images */}
              <Rect
                x={0}
                y={0}
                width={imageWidth}
                height={imageHeight}
                stroke={IMAGE_FRAME_COLORS.outer}
                strokeWidth={2}
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
                listening={false}
              />
              <Rect
                x={0}
                y={0}
                width={imageWidth}
                height={imageHeight}
                stroke={IMAGE_FRAME_COLORS.inner}
                strokeWidth={1}
                strokeScaleEnabled={false}
                dash={[8, 6]}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
                listening={false}
              />
              {/* Corner accents keep edges readable even when backgrounds are busy */}
              <Line
                points={[0, 0, cornerLength, 0]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[0, 0, 0, cornerLength]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[imageWidth - cornerLength, 0, imageWidth, 0]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[imageWidth, 0, imageWidth, cornerLength]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[0, imageHeight - cornerLength, 0, imageHeight]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[0, imageHeight, cornerLength, imageHeight]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[imageWidth - cornerLength, imageHeight, imageWidth, imageHeight]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
              <Line
                points={[imageWidth, imageHeight - cornerLength, imageWidth, imageHeight]}
                stroke={IMAGE_FRAME_COLORS.corner}
                strokeWidth={2}
                lineCap="round"
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                listening={false}
              />
            </>
          )}
        </FastLayer>
        <Layer>
          {renderedAnnotations.map(({ annotation, rect, color, selected }) => {
            const displayRect =
              selected && selectedRectForResize ? selectedRectForResize : rect;

            return (
              <Group key={annotation.id}>
              {selected && (
                <>
                  <Rect
                    x={displayRect.x - 3}
                    y={displayRect.y - 3}
                    width={displayRect.width + 6}
                    height={displayRect.height + 6}
                    stroke="rgba(255, 255, 255, 0.98)"
                    strokeWidth={2}
                    dash={[10, 7]}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                  <Rect
                    x={displayRect.x - 4}
                    y={displayRect.y - 4}
                    width={displayRect.width + 8}
                    height={displayRect.height + 8}
                    stroke="rgba(15, 23, 42, 0.9)"
                    strokeWidth={1}
                    dash={[10, 7]}
                    dashOffset={8}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                </>
              )}
              <Rect
                id={annotation.id}
                name={`annotation-${annotation.id}`}
                x={displayRect.x}
                y={displayRect.y}
                width={displayRect.width}
                height={displayRect.height}
                stroke={color}
                strokeWidth={ANNOTATION_STROKE_WIDTH}
                hitStrokeWidth={selected ? 0 : ANNOTATION_HIT_STROKE_WIDTH}
                fill={selected ? `${color}35` : `${color}1d`}
                listening={toolMode === 'select' && selected}
                draggable={toolMode === 'select' && selected && !resizeSession}
                dragBoundFunc={(position) => ({
                  x: clamp(position.x, 0, Math.max(0, imageWidth - displayRect.width)),
                  y: clamp(position.y, 0, Math.max(0, imageHeight - displayRect.height)),
                })}
                shadowColor={selected ? color : undefined}
                shadowBlur={selected ? 16 : 0}
                shadowOpacity={selected ? 0.55 : 0}
                onDragEnd={(e) => handleDragEnd(e, annotation.id)}
              />
              <Text
                x={displayRect.x}
                y={displayRect.y - 19}
                text={annotation.label}
                fontSize={13}
                fill={selected ? '#f8fafc' : color}
                fontStyle="bold"
                stroke={selected ? 'rgba(15, 23, 42, 0.7)' : undefined}
                strokeWidth={selected ? 0.8 : 0}
                listening={false}
              />
              </Group>
            );
          })}
          {/* Drawing rectangle */}
          {drawingRect && (
            <Rect
              x={drawingRect.x}
              y={drawingRect.y}
              width={drawingRect.width}
              height={drawingRect.height}
              stroke={drawingPreviewColor}
              strokeWidth={2}
              dash={[5, 5]}
              fill={`${drawingPreviewColor}20`}
              perfectDrawEnabled={false}
              listening={false}
            />
          )}
          {toolMode === 'select' && selectedAnnotationForResize && selectedRectForResize && (
            <>
              {RESIZE_HANDLES.map((handle) => {
                const position = getResizeHandlePosition(selectedRectForResize, handle);
                return (
                  <Circle
                    key={`${selectedAnnotationForResize.annotation.id}-${handle}`}
                    x={position.x}
                    y={position.y}
                    radius={resizeHandleRadius}
                    fill={RESIZE_HANDLE_FILL}
                    stroke={RESIZE_HANDLE_STROKE}
                    strokeWidth={resizeHandleStrokeWidth}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                );
              })}
            </>
          )}
        </Layer>
      </Stage>

      {toolMode === 'draw' && (
        <div
          ref={cursorOverlayRef}
          className={`pointer-events-none absolute left-0 top-0 z-20 ${
            isCursorOverlayVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ width: 0, height: 0 }}
        >
          <span
            className="absolute rounded-full"
            style={{
              left: -crosshairArmLength,
              top: -crosshairOuterStrokeWidth / 2,
              width: crosshairSegmentLength,
              height: crosshairOuterStrokeWidth,
              backgroundColor: CROSSHAIR_OUTER_COLOR,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              left: CROSSHAIR_CENTER_GAP,
              top: -crosshairOuterStrokeWidth / 2,
              width: crosshairSegmentLength,
              height: crosshairOuterStrokeWidth,
              backgroundColor: CROSSHAIR_OUTER_COLOR,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              left: -crosshairOuterStrokeWidth / 2,
              top: -crosshairArmLength,
              width: crosshairOuterStrokeWidth,
              height: crosshairSegmentLength,
              backgroundColor: CROSSHAIR_OUTER_COLOR,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              left: -crosshairOuterStrokeWidth / 2,
              top: CROSSHAIR_CENTER_GAP,
              width: crosshairOuterStrokeWidth,
              height: crosshairSegmentLength,
              backgroundColor: CROSSHAIR_OUTER_COLOR,
            }}
          />

          <span
            className="absolute rounded-full"
            style={{
              left: -crosshairArmLength,
              top: -crosshairStrokeWidth / 2,
              width: crosshairSegmentLength,
              height: crosshairStrokeWidth,
              backgroundColor: CROSSHAIR_INNER_COLOR,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              left: CROSSHAIR_CENTER_GAP,
              top: -crosshairStrokeWidth / 2,
              width: crosshairSegmentLength,
              height: crosshairStrokeWidth,
              backgroundColor: CROSSHAIR_INNER_COLOR,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              left: -crosshairStrokeWidth / 2,
              top: -crosshairArmLength,
              width: crosshairStrokeWidth,
              height: crosshairSegmentLength,
              backgroundColor: CROSSHAIR_INNER_COLOR,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              left: -crosshairStrokeWidth / 2,
              top: CROSSHAIR_CENTER_GAP,
              width: crosshairStrokeWidth,
              height: crosshairSegmentLength,
              backgroundColor: CROSSHAIR_INNER_COLOR,
            }}
          />
        </div>
      )}

      {/* Done button overlay - upper right corner */}
      {imageUrl && (
        <button
          onClick={onMarkDone}
          className={`absolute right-4 top-4 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-colors ${
            isCurrentImageDone
              ? 'border border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/50 dark:text-green-400 dark:hover:bg-green-900/70'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isCurrentImageDone ? 'Image marked as done (click to undo)' : 'Mark image as done'}
        >
          {isCurrentImageDone ? (
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Done
            </span>
          ) : (
            'Mark Done'
          )}
        </button>
      )}
    </div>
  );
}
