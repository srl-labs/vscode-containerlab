/**
 * useDockerImages - Hook to access docker images for image/version dropdowns
 *
 * Docker images are loaded by the extension and passed via window.__DOCKER_IMAGES__
 * Updates are received via the 'docker-images-updated' custom event
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { log } from '../../utils/logger';

// Extend Window to include docker images
declare global {
  interface Window {
    __DOCKER_IMAGES__?: string[];
  }
}

interface ImageVersionMap {
  baseImages: string[];
  versionsByImage: Map<string, string[]>;
}

interface UseDockerImagesResult {
  dockerImages: string[];
  baseImages: string[];
  getVersionsForImage: (baseImage: string) => string[];
  parseImageString: (fullImage: string) => { base: string; version: string };
  combineImageVersion: (base: string, version: string) => string;
  isLoaded: boolean;
  hasImages: boolean;
}

/**
 * Sort versions (latest first, then reverse alphanumeric)
 */
function sortVersions(versions: string[]): void {
  versions.sort((a, b) => {
    if (a === 'latest') return -1;
    if (b === 'latest') return 1;
    return b.localeCompare(a);
  });
}

/**
 * Sort base images (Nokia first, then alphabetical)
 */
function sortBaseImages(images: string[]): string[] {
  return images.sort((a, b) => {
    const aIsNokia = a.includes('nokia');
    const bIsNokia = b.includes('nokia');
    if (aIsNokia && !bIsNokia) return -1;
    if (!aIsNokia && bIsNokia) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Parse a single docker image string into base and version
 */
function parseImageTag(image: string, versionsByImage: Map<string, string[]>): void {
  const lastColonIndex = image.lastIndexOf(':');
  if (lastColonIndex > 0) {
    const baseImage = image.substring(0, lastColonIndex);
    const version = image.substring(lastColonIndex + 1);
    if (!versionsByImage.has(baseImage)) {
      versionsByImage.set(baseImage, []);
    }
    versionsByImage.get(baseImage)!.push(version);
  } else if (!versionsByImage.has(image)) {
    versionsByImage.set(image, ['latest']);
  }
}

/**
 * Parse docker images into base images and versions map
 */
function parseDockerImages(images: string[]): ImageVersionMap {
  const versionsByImage = new Map<string, string[]>();

  for (const image of images) {
    parseImageTag(image, versionsByImage);
  }

  for (const versions of versionsByImage.values()) {
    sortVersions(versions);
  }

  const baseImages = sortBaseImages(Array.from(versionsByImage.keys()));
  return { baseImages, versionsByImage };
}

/**
 * Hook to access docker images with base/version parsing
 */
// eslint-disable-next-line aggregate-complexity/aggregate-complexity
export function useDockerImages(): UseDockerImagesResult {
  const [dockerImages, setDockerImages] = useState<string[]>(() => window.__DOCKER_IMAGES__ || []);

  useEffect(() => {
    const handleUpdate = (event: CustomEvent<string[]>) => {
      log.info(`[useDockerImages] Received update with ${event.detail.length} images`);
      setDockerImages(event.detail);
    };
    window.addEventListener('docker-images-updated', handleUpdate as EventListener);
    return () => window.removeEventListener('docker-images-updated', handleUpdate as EventListener);
  }, []);

  const { baseImages, versionsByImage } = useMemo(() => parseDockerImages(dockerImages), [dockerImages]);

  const getVersionsForImage = useCallback(
    (baseImage: string): string[] => versionsByImage.get(baseImage) || ['latest'],
    [versionsByImage]
  );

  const parseImageString = useCallback((fullImage: string): { base: string; version: string } => {
    if (!fullImage) return { base: baseImages[0] || '', version: 'latest' };
    const lastColonIndex = fullImage.lastIndexOf(':');
    if (lastColonIndex > 0) {
      return { base: fullImage.substring(0, lastColonIndex), version: fullImage.substring(lastColonIndex + 1) };
    }
    return { base: fullImage, version: 'latest' };
  }, [baseImages]);

  const combineImageVersion = useCallback(
    (base: string, version: string): string => (base ? `${base}:${version || 'latest'}` : ''),
    []
  );

  return {
    dockerImages,
    baseImages,
    getVersionsForImage,
    parseImageString,
    combineImageVersion,
    isLoaded: dockerImages.length > 0 || typeof window.__DOCKER_IMAGES__ !== 'undefined',
    hasImages: baseImages.length > 0
  };
}
