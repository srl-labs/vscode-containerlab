// file: managerImageHandler.ts

import { log } from "../logging/logger";
import { createFilterableDropdown } from "./utilities/filterableDropdown";
import type { NodeProperties } from "./managerTabContent";

// Element IDs
const ID_NODE_VERSION_DROPDOWN = "node-version-dropdown-container" as const;
const ID_NODE_VERSION_FILTER_INPUT = "node-version-dropdown-container-filter-input" as const;
const ID_NODE_IMAGE_DROPDOWN = "node-image-dropdown-container" as const;
const ID_NODE_IMAGE_FILTER_INPUT = "node-image-dropdown-container-filter-input" as const;
const ID_NODE_IMAGE_FALLBACK_INPUT = "node-image-fallback-input" as const;
const ID_NODE_VERSION_FALLBACK_INPUT = "node-version-fallback-input" as const;

// CSS classes
const CLASS_INPUT_FIELD =
  "bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5" as const;

// Placeholders
const PH_SEARCH_IMAGE = "Search for image..." as const;
const PH_SELECT_VERSION = "Select version..." as const;
const PH_IMAGE_EXAMPLE = "e.g., ghcr.io/nokia/srlinux" as const;
const PH_VERSION_EXAMPLE = "e.g., latest" as const;

/**
 * Interface for form utilities needed from the parent manager
 */
/* eslint-disable no-unused-vars */
export interface ImageFormUtilities {
  markFieldInheritance: (fieldId: string, inherited: boolean) => void;
  computeActualInheritedProps: (extraData: any) => string[];
}
/* eslint-enable no-unused-vars */

/**
 * ImageManager handles Docker image selection:
 * - Parsing docker images into base images and versions
 * - Managing image and version dropdowns
 * - Collecting image values from the form
 */
export class ImageManager {
  private imageVersionMap: Map<string, string[]> = new Map();
  private formUtils: ImageFormUtilities;

  constructor(formUtils: ImageFormUtilities) {
    this.formUtils = formUtils;
  }

  /**
   * Handle docker images updated from extension
   */
  public handleDockerImagesUpdated(
    images: string[],
    panel: HTMLElement | null,
    currentNodeExtraData: any | null
  ): void {
    (window as any).dockerImages = images;
    if (!panel || panel.style.display === "none") {
      return;
    }
    if (!currentNodeExtraData) {
      return;
    }
    const actualInherited = this.formUtils.computeActualInheritedProps(currentNodeExtraData);
    this.setupImageFields(currentNodeExtraData, actualInherited);
  }

  /**
   * Parse docker images to extract base images and their versions
   */
  public parseDockerImages(dockerImages: string[]): void {
    this.imageVersionMap.clear();

    for (const image of dockerImages) {
      // Split by colon to separate repository from tag
      const lastColonIndex = image.lastIndexOf(":");
      if (lastColonIndex > 0) {
        const baseImage = image.substring(0, lastColonIndex);
        const version = image.substring(lastColonIndex + 1);

        if (!this.imageVersionMap.has(baseImage)) {
          this.imageVersionMap.set(baseImage, []);
        }
        this.imageVersionMap.get(baseImage)!.push(version);
      } else {
        // No version tag, treat whole thing as base image with 'latest' as version
        if (!this.imageVersionMap.has(image)) {
          this.imageVersionMap.set(image, ["latest"]);
        }
      }
    }

    // Sort versions for each base image
    for (const versions of this.imageVersionMap.values()) {
      versions.sort((a, b) => {
        // Put 'latest' first
        if (a === "latest") return -1;
        if (b === "latest") return 1;
        // Then sort alphanumerically
        return b.localeCompare(a); // Reverse order to put newer versions first
      });
    }
  }

  /**
   * Handle base image change and update version dropdown
   */
  public handleBaseImageChange(selectedBaseImage: string): void {
    const versions = this.imageVersionMap.get(selectedBaseImage);

    if (versions && versions.length > 0) {
      // We have known versions for this image
      createFilterableDropdown(
        ID_NODE_VERSION_DROPDOWN,
        versions,
        versions[0] || "latest",
        () => {},
        "Select version...",
        true // Allow free text for custom versions
      );
      log.debug(
        `Base image changed to ${selectedBaseImage}, available versions: ${versions.join(", ")}`
      );
    } else {
      // Unknown image - allow free text version entry
      createFilterableDropdown(
        ID_NODE_VERSION_DROPDOWN,
        ["latest"],
        "latest",
        () => {},
        "Enter version...",
        true // Allow free text
      );
      log.debug(
        `Base image changed to custom image ${selectedBaseImage}, allowing free text version entry`
      );
    }
  }

  /**
   * Setup image fields based on available docker images
   */
  public setupImageFields(extraData: Record<string, any>, actualInherited: string[]): void {
    const dockerImages = (window as any).dockerImages as string[] | undefined;
    const imageInitial = extraData.image || "";
    this.formUtils.markFieldInheritance(
      ID_NODE_IMAGE_DROPDOWN,
      actualInherited.includes("image")
    );

    if (this.shouldUseImageDropdowns(dockerImages)) {
      this.setupImageDropdowns(dockerImages!, imageInitial);
    } else {
      this.setupFallbackImageInputs(imageInitial);
    }
  }

  /**
   * Check if we should use image dropdowns or fallback inputs
   */
  public shouldUseImageDropdowns(dockerImages: string[] | undefined): boolean {
    return Array.isArray(dockerImages) && dockerImages.some((img) => img && img.trim() !== "");
  }

  /**
   * Setup image and version dropdowns when docker images are available
   */
  public setupImageDropdowns(dockerImages: string[], imageInitial: string): void {
    this.parseDockerImages(dockerImages);
    const baseImages = Array.from(this.imageVersionMap.keys()).sort((a, b) => {
      const aIsNokia = a.includes("nokia");
      const bIsNokia = b.includes("nokia");
      if (aIsNokia && !bIsNokia) return -1;
      if (!aIsNokia && bIsNokia) return 1;
      return a.localeCompare(b);
    });

    const { base: initialBaseImage, version: initialVersion } = this.splitImageName(
      imageInitial,
      baseImages
    );

    createFilterableDropdown(
      ID_NODE_IMAGE_DROPDOWN,
      baseImages,
      initialBaseImage,
      (selectedBaseImage: string) => this.handleBaseImageChange(selectedBaseImage),
      PH_SEARCH_IMAGE,
      true
    );

    const versions = this.imageVersionMap.get(initialBaseImage) || ["latest"];
    const versionToSelect = initialVersion || versions[0] || "latest";
    createFilterableDropdown(
      ID_NODE_VERSION_DROPDOWN,
      versions,
      versionToSelect,
      () => {},
      PH_SELECT_VERSION,
      true
    );
  }

  /**
   * Split image name into base and version components
   */
  public splitImageName(
    imageInitial: string,
    baseImages: string[]
  ): { base: string; version: string } {
    let base = "";
    let version = "latest";
    if (imageInitial) {
      const lastColonIndex = imageInitial.lastIndexOf(":");
      if (lastColonIndex > 0) {
        base = imageInitial.substring(0, lastColonIndex);
        version = imageInitial.substring(lastColonIndex + 1);
      } else {
        base = imageInitial;
      }
      // If the image isn't in our known list, keep the user-provided base and
      // version so the dropdown shows the custom image
      if (!this.imageVersionMap.has(base)) {
        return { base, version };
      }
    } else if (baseImages.length > 0) {
      base = baseImages[0];
    }
    return { base, version };
  }

  /**
   * Setup fallback text inputs when no docker images are available
   */
  public setupFallbackImageInputs(imageInitial: string): void {
    const container = document.getElementById(ID_NODE_IMAGE_DROPDOWN);
    if (container) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = `${CLASS_INPUT_FIELD} w-full`;
      input.placeholder = PH_IMAGE_EXAMPLE;
      input.id = ID_NODE_IMAGE_FALLBACK_INPUT;
      input.value = imageInitial.includes(":")
        ? imageInitial.substring(0, imageInitial.lastIndexOf(":"))
        : imageInitial;
      container.appendChild(input);
    }

    const versionContainer = document.getElementById(ID_NODE_VERSION_DROPDOWN);
    if (versionContainer) {
      const versionInput = document.createElement("input");
      versionInput.type = "text";
      versionInput.className = `${CLASS_INPUT_FIELD} w-full`;
      versionInput.placeholder = PH_VERSION_EXAMPLE;
      versionInput.id = ID_NODE_VERSION_FALLBACK_INPUT;
      const colon = imageInitial.lastIndexOf(":");
      versionInput.value = colon > 0 ? imageInitial.substring(colon + 1) : "latest";
      versionContainer.appendChild(versionInput);
    }
  }

  /**
   * Collect image value from form fields
   */
  public collectImage(nodeProps: NodeProperties): void {
    const dockerImages = (window as any).dockerImages as string[] | undefined;
    const hasDockerImages =
      Array.isArray(dockerImages) &&
      dockerImages.length > 0 &&
      dockerImages.some((img) => img && img.trim() !== "");
    if (hasDockerImages) {
      const baseImg =
        (document.getElementById(ID_NODE_IMAGE_FILTER_INPUT) as HTMLInputElement | null)?.value ||
        "";
      const version =
        (document.getElementById(ID_NODE_VERSION_FILTER_INPUT) as HTMLInputElement | null)?.value ||
        "latest";
      if (baseImg) {
        nodeProps.image = `${baseImg}:${version}`;
      }
    } else {
      const baseImg =
        (document.getElementById(ID_NODE_IMAGE_FALLBACK_INPUT) as HTMLInputElement | null)?.value ||
        "";
      const version =
        (document.getElementById(ID_NODE_VERSION_FALLBACK_INPUT) as HTMLInputElement | null)
          ?.value || "latest";
      if (baseImg) {
        nodeProps.image = `${baseImg}:${version}`;
      }
    }
  }

  /**
   * Get the image version map (for external access if needed)
   */
  public getImageVersionMap(): Map<string, string[]> {
    return this.imageVersionMap;
  }
}
