/**
 * Generic form state hook for editor panels
 * Provides formData, updateField, hasChanges, and resetInitialData
 */
import type React from 'react';
import { useState, useEffect, useCallback } from 'react';

interface UseGenericFormStateOptions<T> {
  /** Calculate isNew based on data */
  getIsNew?: (data: T | null) => boolean;
  /** Transform data before setting formData (e.g., deep clone nested objects) */
  transformData?: (data: T) => T;
}

interface UseGenericFormStateReturn<T> {
  formData: T | null;
  updateField: <K extends keyof T>(field: K, value: T[K]) => void;
  hasChanges: boolean;
  resetInitialData: () => void;
  isNew: boolean;
  setFormData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Generic form state hook with change tracking
 * @param data The initial data to populate the form
 * @param options Optional configuration
 */
export function useGenericFormState<T extends { id: string }>(
  data: T | null,
  options: UseGenericFormStateOptions<T> = {}
): UseGenericFormStateReturn<T> {
  const { getIsNew, transformData } = options;

  const [formData, setFormData] = useState<T | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      const transformed = transformData ? transformData(data) : { ...data };
      setFormData(transformed);
      setInitialData(JSON.stringify(data));
    }
  }, [data, transformData]);

  const updateField = useCallback(<K extends keyof T>(
    field: K,
    value: T[K]
  ) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const resetInitialData = useCallback(() => {
    if (formData) setInitialData(JSON.stringify(formData));
  }, [formData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;
  const isNew = getIsNew ? getIsNew(data) : false;

  return { formData, updateField, hasChanges, resetInitialData, isNew, setFormData };
}

interface UseEditorHandlersOptions<T> {
  formData: T | null;
  onSave: (data: T) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  resetInitialData: () => void;
  /** Validation function - if returns false, save is blocked */
  canSave?: (data: T) => boolean;
}

interface UseEditorHandlersReturn {
  handleApply: () => void;
  handleSaveAndClose: () => void;
  handleDelete: () => void;
}

/**
 * Creates standard editor panel handlers (Apply, Save & Close, Delete)
 */
export function useEditorHandlers<T extends { id: string }>(
  options: UseEditorHandlersOptions<T>
): UseEditorHandlersReturn {
  const { formData, onSave, onClose, onDelete, resetInitialData, canSave } = options;

  const handleApply = useCallback(() => {
    if (formData && (!canSave || canSave(formData))) {
      onSave(formData);
      resetInitialData();
    }
  }, [formData, onSave, resetInitialData, canSave]);

  const handleSaveAndClose = useCallback(() => {
    if (formData && (!canSave || canSave(formData))) {
      onSave(formData);
      onClose();
    }
  }, [formData, onSave, onClose, canSave]);

  const handleDelete = useCallback(() => {
    if (formData && onDelete) {
      onDelete(formData.id);
      onClose();
    }
  }, [formData, onDelete, onClose]);

  return { handleApply, handleSaveAndClose, handleDelete };
}
