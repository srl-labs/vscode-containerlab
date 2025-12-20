/**
 * Hook for integrating free shape annotations into App.tsx
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { FreeShapeAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import { useFreeShapeAnnotations } from './useFreeShapeAnnotations';
import { subscribeToWebviewMessages } from '../../utils/webviewMessageBus';

interface InitialData {
  freeShapeAnnotations?: unknown[];
}

interface TopologyDataMessage {
  type: string;
  data?: {
    freeShapeAnnotations?: FreeShapeAnnotation[];
  };
}

interface UseAppFreeShapeAnnotationsOptions {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction: () => void;
  /** Groups for auto-assigning groupId when creating annotations inside groups */
  groups?: GroupStyleAnnotation[];
}

export function useAppFreeShapeAnnotations(options: UseAppFreeShapeAnnotationsOptions) {
  const { cyInstance, mode, isLocked, onLockedAction, groups } = options;

  const freeShapeAnnotations = useFreeShapeAnnotations({
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction,
    groups
  });

  const { loadAnnotations } = freeShapeAnnotations;

  React.useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    if (initialData?.freeShapeAnnotations?.length) {
      loadAnnotations(initialData.freeShapeAnnotations as FreeShapeAnnotation[]);
    }

    const handleMessage = (event: MessageEvent<TopologyDataMessage>) => {
      const message = event.data;
      if (message?.type === 'topology-data') {
        // Always load to clear old annotations if empty
        loadAnnotations(message.data?.freeShapeAnnotations || []);
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === 'topology-data');
  }, [loadAnnotations]);

  return freeShapeAnnotations;
}
