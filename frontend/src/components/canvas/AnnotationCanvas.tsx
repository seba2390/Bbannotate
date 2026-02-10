import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stage,
  Layer,
  FastLayer,
  Image as KonvaImage,
  Rect,
  Transformer,
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

interface AnnotationCanvasProps {
  imageUrl: string | null;
  annotations: Annotation[];
  selectedId: string | null;
  toolMode: ToolMode;
  bboxColorMode: BoundingBoxColorMode;
  customBboxColor: string;
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
  onMarkDone,
  onLabelChange,
}: AnnotationCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

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

  // For auto-pan during drawing
  const autoPanRef = useRef<number | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

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

        setBaseScale(newBaseScale);
        setScale(newBaseScale * zoom);
        setStageSize({
          width: containerWidth,
          height: containerHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [image, zoom]);

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
    setStagePosition({ x: 0, y: 0 });
  }, []);

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

  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (selectedId && toolMode === 'select') {
      const selectedNode = stageRef.current.findOne(`#${selectedId}`);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedId, toolMode, annotations]);

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
      return {
        x: (rect.x + rect.width / 2) / image.width,
        y: (rect.y + rect.height / 2) / image.height,
        width: Math.abs(rect.width) / image.width,
        height: Math.abs(rect.height) / image.height,
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

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (!stage) return;

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
    if (!imagePos) return;

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
        if (!prev) return prev;
        return {
          ...prev,
          width: prev.width - dx / scale,
          height: prev.height - dy / scale,
        };
      });

      // Continue animation
      autoPanRef.current = requestAnimationFrame(runAutoPan);
    } else {
      stopAutoPan();
    }
  }, [isDrawing, drawingRect, calculateAutoPanDelta, stopAutoPan, scale]);

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

    // Handle drawing
    if (!isDrawing || !drawingRect) return;

    const imagePos = getImagePosition(stage);
    if (!imagePos) return;

    // Update drawing rect
    setDrawingRect({
      ...drawingRect,
      width: imagePos.x - drawingRect.x,
      height: imagePos.y - drawingRect.y,
    });

    // Check if we need to auto-pan
    startAutoPanIfNeeded(screenPos);
  };

  const handleMouseUp = useCallback((): void => {
    // Stop any auto-pan in progress
    stopAutoPan();
    lastMousePosRef.current = null;

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
    const minSize = 10;
    if (Math.abs(drawingRect.width) > minSize && Math.abs(drawingRect.height) > minSize) {
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
  }, [isPanning, isDrawing, drawingRect, image, stopAutoPan, onAddAnnotation]);

  // Listen for mouseup on window to catch releases outside the canvas
  useEffect(() => {
    if (isDrawing || isPanning) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDrawing, isPanning, handleMouseUp]);

  const handleRectClick = (e: Konva.KonvaEventObject<MouseEvent | Event>, id: string): void => {
    if (toolMode === 'select') {
      e.cancelBubble = true;
      onSelectAnnotation(id);
    }
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>, annotationId: string): void => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and apply to width/height
    node.scaleX(1);
    node.scaleY(1);

    const rect: DrawingRect = {
      x: node.x(),
      y: node.y(),
      width: node.width() * scaleX,
      height: node.height() * scaleY,
    };

    const bbox = rectToBbox(rect);
    onUpdateBbox(annotationId, bbox);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>, annotationId: string): void => {
    const node = e.target;
    const rect: DrawingRect = {
      x: node.x(),
      y: node.y(),
      width: node.width(),
      height: node.height(),
    };

    const bbox = rectToBbox(rect);
    onUpdateBbox(annotationId, bbox);
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    // Deselect when clicking on empty area
    if (e.target === e.target.getStage()) {
      onSelectAnnotation(null);
    }
  };

  // Get cursor style based on current tool
  const getCursor = (): string => {
    switch (toolMode) {
      case 'pan':
        return isPanning ? 'grabbing' : 'grab';
      case 'draw':
        return 'crosshair';
      case 'select':
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
        {/* Tool buttons */}
        <button
          onClick={() => onToolModeChange('select')}
          className={`p-2 rounded-md transition-colors ${
            toolMode === 'select'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Select (S)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
            />
          </svg>
        </button>
        <button
          onClick={() => onToolModeChange('draw')}
          className={`p-2 rounded-md transition-colors ${
            toolMode === 'draw'
              ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Draw Box (D)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"
            />
          </svg>
        </button>
        <button
          onClick={() => onToolModeChange('pan')}
          className={`p-2 rounded-md transition-colors ${
            toolMode === 'pan'
              ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Pan (Space)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
            />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* Zoom controls */}
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Zoom Out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
            />
          </svg>
        </button>
        <button
          onClick={handleZoomReset}
          className="px-2 py-1 min-w-[48px] text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Zoom In"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
        </button>

        {/* Separator */}
        {labels.length > 0 && (
          <>
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Label selector */}
            <select
              value={currentLabel}
              onChange={(e) => onLabelChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              title="Select label (1-9)"
            >
              {labels.map((label, idx) => (
                <option key={label} value={label}>
                  {idx + 1}. {label}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

        <div className="flex items-center gap-1.5">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Box
          </span>
          <div className="flex items-center rounded-md border border-gray-300 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-700/60">
            {(['auto', 'label', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onBboxColorModeChange(mode)}
                className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
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
              className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700"
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
                className="h-4 w-4 rounded-sm border border-white/70 shadow-sm"
                style={{ backgroundColor: customBboxColor }}
              />
            </label>
          )}
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
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleStageClick}
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
          {renderedAnnotations.map(({ annotation, rect, color, selected }) => (
            <Group key={annotation.id}>
              {selected && (
                <>
                  <Rect
                    x={rect.x - 3}
                    y={rect.y - 3}
                    width={rect.width + 6}
                    height={rect.height + 6}
                    stroke="rgba(255, 255, 255, 0.98)"
                    strokeWidth={2}
                    dash={[10, 7]}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                  <Rect
                    x={rect.x - 4}
                    y={rect.y - 4}
                    width={rect.width + 8}
                    height={rect.height + 8}
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
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                stroke={color}
                strokeWidth={selected ? 4 : 2}
                fill={selected ? `${color}35` : `${color}1d`}
                draggable={toolMode === 'select'}
                shadowColor={selected ? color : undefined}
                shadowBlur={selected ? 16 : 0}
                shadowOpacity={selected ? 0.55 : 0}
                perfectDrawEnabled={false}
                onClick={(e) => handleRectClick(e, annotation.id)}
                onTap={(e) => handleRectClick(e, annotation.id)}
                onDragEnd={(e) => handleDragEnd(e, annotation.id)}
                onTransformEnd={(e) => handleTransformEnd(e, annotation.id)}
              />
              <Text
                x={rect.x}
                y={rect.y - 19}
                text={annotation.label}
                fontSize={13}
                fill={selected ? '#f8fafc' : color}
                fontStyle="bold"
                stroke={selected ? 'rgba(15, 23, 42, 0.7)' : undefined}
                strokeWidth={selected ? 0.8 : 0}
              />
            </Group>
          ))}
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
            />
          )}
          {/* Transformer for resizing */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit minimum size
              if (newBox.width < 10 || newBox.height < 10) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>

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
