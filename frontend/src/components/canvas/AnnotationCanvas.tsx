import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group, Text } from 'react-konva';
import type Konva from 'konva';
import type { Annotation, BoundingBox, DrawingRect, ToolMode } from '@/types';

/** Color palette for different labels */
const LABEL_COLORS: Record<string, string> = {
  product: '#22c55e',
  price: '#3b82f6',
  brand: '#f59e0b',
  promo: '#ef4444',
  default: '#8b5cf6',
};

function getLabelColor(label: string): string {
  return LABEL_COLORS[label.toLowerCase()] ?? LABEL_COLORS['default'] ?? '#8b5cf6';
}

/** Canvas tool modes including pan */
type CanvasTool = 'select' | 'draw' | 'pan';

interface AnnotationCanvasProps {
  imageUrl: string | null;
  annotations: Annotation[];
  selectedId: string | null;
  toolMode: ToolMode;
  currentLabel: string;
  currentClassId: number;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (rect: DrawingRect, imageWidth: number, imageHeight: number) => void;
  onUpdateBbox: (annotationId: string, bbox: BoundingBox) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

/**
 * Canvas component for displaying images and drawing/editing bounding boxes.
 */
export function AnnotationCanvas({
  imageUrl,
  annotations,
  selectedId,
  toolMode,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateBbox,
  onDeleteAnnotation,
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

  // Canvas-specific tool and zoom state
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('draw');
  const [zoom, setZoom] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });

  // Sync canvas tool with parent tool mode
  useEffect(() => {
    if (toolMode === 'draw') {
      setCanvasTool('draw');
    } else if (toolMode === 'select') {
      setCanvasTool('select');
    }
  }, [toolMode]);

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

      const scaleBy = 1.1;
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

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          onDeleteAnnotation(selectedId);
        }
      } else if (e.key === 'Escape') {
        onSelectAnnotation(null);
        setIsDrawing(false);
        setDrawingRect(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, onDeleteAnnotation, onSelectAnnotation]);

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
    if (canvasTool === 'pan') {
      setIsPanning(true);
      setLastPanPosition({ x: screenPos.x, y: screenPos.y });
      return;
    }

    // Handle draw mode
    if (canvasTool !== 'draw' || !image) return;

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

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (!stage) return;

    const screenPos = stage.getPointerPosition();
    if (!screenPos) return;

    // Handle panning
    if (isPanning && canvasTool === 'pan') {
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

    setDrawingRect({
      ...drawingRect,
      width: imagePos.x - drawingRect.x,
      height: imagePos.y - drawingRect.y,
    });
  };

  const handleMouseUp = (): void => {
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
  };

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
    switch (canvasTool) {
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

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center bg-gray-800 dark:bg-gray-900 overflow-hidden"
    >
      {/* Canvas Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg bg-white dark:bg-gray-800 p-1 shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Tool buttons */}
        <button
          onClick={() => setCanvasTool('select')}
          className={`p-2 rounded-md transition-colors ${
            canvasTool === 'select'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Select (V)"
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
          onClick={() => setCanvasTool('draw')}
          className={`p-2 rounded-md transition-colors ${
            canvasTool === 'draw'
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
          onClick={() => setCanvasTool('pan')}
          className={`p-2 rounded-md transition-colors ${
            canvasTool === 'pan'
              ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Pan (Space + Drag)"
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
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleStageClick}
        style={{ cursor: getCursor() }}
      >
        <Layer>{image && <KonvaImage image={image} />}</Layer>
        <Layer>
          {annotations.map((ann) => {
            const rect = bboxToRect(ann.bbox);
            const color = getLabelColor(ann.label);
            const isSelected = ann.id === selectedId;

            return (
              <Group key={ann.id}>
                <Rect
                  id={ann.id}
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                  fill={`${color}20`}
                  draggable={toolMode === 'select'}
                  onClick={(e) => handleRectClick(e, ann.id)}
                  onTap={(e) => handleRectClick(e, ann.id)}
                  onDragEnd={(e) => handleDragEnd(e, ann.id)}
                  onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                />
                <Text
                  x={rect.x}
                  y={rect.y - 18}
                  text={ann.label}
                  fontSize={14}
                  fill={color}
                  fontStyle="bold"
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
              stroke="#22c55e"
              strokeWidth={2}
              dash={[5, 5]}
              fill="rgba(34, 197, 94, 0.1)"
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
    </div>
  );
}
