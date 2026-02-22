import { useCallback, useEffect, useRef } from "react";

interface AnnotationWithId {
  id: string;
}

interface UseAnnotationPreviewCommitParams<T extends AnnotationWithId> {
  annotation: T | null;
  formData: T | null;
  readOnly: boolean;
  onPreview?: (annotation: T) => boolean;
  onPreviewDelete?: (id: string) => void;
  onSave: (annotation: T) => void;
  discardChanges: () => void;
  snapshot: (annotation: T) => T;
}

interface UseAnnotationPreviewCommitResult<T extends AnnotationWithId> {
  saveWithCommit: (next: T) => void;
  discardWithRevert: () => void;
}

export function useAnnotationPreviewCommit<T extends AnnotationWithId>(
  params: UseAnnotationPreviewCommitParams<T>
): UseAnnotationPreviewCommitResult<T> {
  const previewRef = useRef(params.onPreview);
  previewRef.current = params.onPreview;
  const previewDeleteRef = useRef(params.onPreviewDelete);
  previewDeleteRef.current = params.onPreviewDelete;
  const initialAnnotationRef = useRef<T | null>(null);
  const initialSerializedRef = useRef<string | null>(null);
  const hasPreviewRef = useRef(false);
  const previewCreatedRef = useRef(false);

  useEffect(() => {
    if (!params.annotation) {
      initialAnnotationRef.current = null;
      initialSerializedRef.current = null;
      hasPreviewRef.current = false;
      previewCreatedRef.current = false;
      return;
    }

    const snapshot = params.snapshot(params.annotation);
    initialAnnotationRef.current = snapshot;
    initialSerializedRef.current = JSON.stringify(snapshot);
    hasPreviewRef.current = false;
    previewCreatedRef.current = false;
  }, [params.annotation, params.snapshot]);

  useEffect(() => {
    if (params.readOnly || !params.formData || !initialAnnotationRef.current) return;
    if (!previewRef.current) return;

    const snapshot = params.snapshot(params.formData);
    const serialized = JSON.stringify(snapshot);
    if (serialized === initialSerializedRef.current) return;

    const existedBeforePreview = previewRef.current(snapshot);
    if (existedBeforePreview === false) {
      previewCreatedRef.current = true;
    }
    hasPreviewRef.current = true;
  }, [params.formData, params.readOnly, params.snapshot]);

  // Revert live preview when closing editor without apply/save.
  useEffect(() => {
    return () => {
      if (!hasPreviewRef.current || !initialAnnotationRef.current) return;
      if (previewCreatedRef.current) {
        previewDeleteRef.current?.(initialAnnotationRef.current.id);
        return;
      }
      previewRef.current?.(initialAnnotationRef.current);
    };
  }, []);

  const saveWithCommit = useCallback(
    (next: T) => {
      hasPreviewRef.current = false;
      previewCreatedRef.current = false;
      const snapshot = params.snapshot(next);
      initialAnnotationRef.current = snapshot;
      initialSerializedRef.current = JSON.stringify(snapshot);
      params.onSave(next);
    },
    [params.onSave, params.snapshot]
  );

  const discardWithRevert = useCallback(() => {
    params.discardChanges();
    if (previewCreatedRef.current && initialAnnotationRef.current) {
      previewDeleteRef.current?.(initialAnnotationRef.current.id);
      hasPreviewRef.current = false;
      previewCreatedRef.current = false;
      return;
    }
    if (initialAnnotationRef.current) {
      previewRef.current?.(initialAnnotationRef.current);
    }
    hasPreviewRef.current = false;
    previewCreatedRef.current = false;
  }, [params.discardChanges]);

  return { saveWithCommit, discardWithRevert };
}
