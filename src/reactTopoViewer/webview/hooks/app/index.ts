/**
 * App hooks barrel export
 *
 * All hooks extracted from App.tsx to reduce complexity.
 */

// Annotation layer props
export {
  useAnnotationLayerProps,
  type AnnotationLayerPropsConfig,
  type AnnotationLayerPropsReturn
} from './useAnnotationLayerProps';

// Clipboard handlers
export {
  useClipboardHandlers,
  type ClipboardHandlersConfig,
  type ClipboardHandlersReturn
} from './useClipboardHandlers';

// Keyboard shortcuts
export {
  useAppKeyboardShortcuts,
  type AppKeyboardShortcutsConfig
} from './useAppKeyboardShortcuts';

// Graph creation
export {
  useGraphCreation,
  type GraphCreationConfig,
  type GraphCreationReturn
} from './useGraphCreation';

// App helpers (original hooks)
export {
  useCustomNodeCommands,
  useNavbarCommands,
  useShapeLayer,
  useTextLayer,
  useE2ETestingExposure,
  useGeoCoordinateSync,
  type CustomNodeCommands,
  type NavbarCommands,
  type UseShapeLayerReturn,
  type UseTextLayerReturn,
  type E2ETestingConfig,
  type GeoCoordinateSyncConfig
} from './useAppHelpers';
