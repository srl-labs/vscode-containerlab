/**
 * useSchema - Hook to access containerlab schema data for kind/type options
 *
 * Schema data is loaded by the extension and passed via window.__SCHEMA_DATA__
 */
import { useState, useEffect, useMemo, useCallback } from "react";

import { log } from "../../utils/logger";

/**
 * SROS component types for nokia_srsim nodes
 */
export interface SrosComponentTypes {
  sfm: string[];
  cpm: string[];
  card: string[];
  mda: string[];
  xiom: string[];
  xiomMda: string[];
}

// Extend Window to include schema data
declare global {
  interface Window {
    __SCHEMA_DATA__?: {
      kinds: string[];
      typesByKind: Record<string, string[]>;
      srosComponentTypes?: SrosComponentTypes;
    };
  }
}

const EMPTY_SROS_TYPES: SrosComponentTypes = {
  sfm: [],
  cpm: [],
  card: [],
  mda: [],
  xiom: [],
  xiomMda: [],
};

interface SchemaData {
  kinds: string[];
  typesByKind: Map<string, string[]>;
  kindsWithTypeSupport: Set<string>;
  srosComponentTypes: SrosComponentTypes;
  isLoaded: boolean;
  error: string | null;
}

interface UseSchemaResult extends SchemaData {
  getTypesForKind: (kind: string) => string[];
  kindSupportsType: (kind: string) => boolean;
}

/**
 * Hook to access containerlab schema data
 */
export function useSchema(): UseSchemaResult {
  const [schemaData, setSchemaData] = useState<SchemaData>({
    kinds: [],
    typesByKind: new Map(),
    kindsWithTypeSupport: new Set(),
    srosComponentTypes: EMPTY_SROS_TYPES,
    isLoaded: false,
    error: null,
  });

  // Load schema data from window on mount
  useEffect(() => {
    const data = window.__SCHEMA_DATA__;

    if (!data) {
      log.warn("Schema data not available");
      setSchemaData((prev) => ({ ...prev, isLoaded: true }));
      return;
    }

    const kinds = data.kinds;
    const typesByKind = new Map<string, string[]>();
    const kindsWithTypeSupport = new Set<string>();

    // Convert Record to Map and build kindsWithTypeSupport set
    for (const [kind, types] of Object.entries(data.typesByKind)) {
      typesByKind.set(kind, types);
      kindsWithTypeSupport.add(kind);
    }

    // Get SROS component types
    const srosComponentTypes = data.srosComponentTypes ?? EMPTY_SROS_TYPES;

    log.info(
      `Schema loaded: ${kinds.length} kinds, ${typesByKind.size} kinds with type options, SROS types: sfm=${srosComponentTypes.sfm.length}, cpm=${srosComponentTypes.cpm.length}, card=${srosComponentTypes.card.length}, mda=${srosComponentTypes.mda.length}`
    );

    setSchemaData({
      kinds,
      typesByKind,
      kindsWithTypeSupport,
      srosComponentTypes,
      isLoaded: true,
      error: null,
    });
  }, []);

  // Get types for a specific kind
  const getTypesForKind = useCallback(
    (kind: string): string[] => {
      return schemaData.typesByKind.get(kind) ?? [];
    },
    [schemaData.typesByKind]
  );

  // Check if a kind supports type field
  const kindSupportsType = useCallback(
    (kind: string): boolean => {
      return schemaData.kindsWithTypeSupport.has(kind);
    },
    [schemaData.kindsWithTypeSupport]
  );

  return useMemo(
    () => ({
      ...schemaData,
      getTypesForKind,
      kindSupportsType,
    }),
    [schemaData, getTypesForKind, kindSupportsType]
  );
}
