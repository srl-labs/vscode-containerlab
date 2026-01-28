/**
 * AnnotationLayers - Renders all annotation layers (groups, text, shapes)
 *
 * Encapsulates the annotation layer components.
 * Uses React.ComponentProps to match actual component prop types.
 */
import React from "react";

import { GroupLayer } from "./annotations/GroupLayer";
import { FreeTextLayer } from "./annotations/FreeTextLayer";
import { FreeShapeLayer } from "./annotations/FreeShapeLayer";

/** Props passed directly to GroupLayer */
type GroupLayerPassthroughProps = React.ComponentProps<typeof GroupLayer>;

/** Props passed directly to FreeTextLayer */
type FreeTextLayerPassthroughProps = React.ComponentProps<typeof FreeTextLayer>;

/** Props passed directly to FreeShapeLayer */
type FreeShapeLayerPassthroughProps = React.ComponentProps<typeof FreeShapeLayer>;

export interface AnnotationLayersProps {
  /** GroupLayer props */
  groupLayerProps: GroupLayerPassthroughProps;
  /** FreeTextLayer props */
  freeTextLayerProps: FreeTextLayerPassthroughProps;
  /** FreeShapeLayer props */
  freeShapeLayerProps: FreeShapeLayerPassthroughProps;
}

/**
 * Renders all annotation layers in the correct z-order
 */
export const AnnotationLayers: React.FC<AnnotationLayersProps> = ({
  groupLayerProps,
  freeTextLayerProps,
  freeShapeLayerProps
}) => {
  return (
    <>
      <GroupLayer {...groupLayerProps} />
      <FreeTextLayer {...freeTextLayerProps} />
      <FreeShapeLayer {...freeShapeLayerProps} />
    </>
  );
};
