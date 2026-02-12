/**
 * Components Tab for Node Editor - Nokia SROS component management
 * Handles CPM, Card, SFM, MDA, XIOM configuration for nokia_srsim nodes
 */
import React, { useCallback, useState } from "react";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Hub as HubIcon,
  Storage as StorageIcon
} from "@mui/icons-material";
import { Box, Button, Chip, Collapse, Divider, IconButton, Paper, Typography } from "@mui/material";

import { InputField, SelectField } from "../../ui/form";
import { useSchema, type SrosComponentTypes } from "../../../hooks/editor";

import type { TabProps, SrosComponent, SrosMda, SrosXiom } from "./types";
import { INTEGRATED_SROS_TYPES } from "./types";

const ACTION_HOVER_BG = "action.hover";

/** Check if type is integrated mode (simpler chassis) */
const isIntegratedType = (type: string | undefined): boolean => {
  if (!type) return false;
  return INTEGRATED_SROS_TYPES.has(type.toLowerCase());
};

/** Check if slot is a CPM slot (A or B) */
const isCpmSlot = (slot: string | number | undefined): boolean => {
  if (slot === undefined) return false;
  const s = String(slot).trim().toUpperCase();
  return s === "A" || s === "B";
};

/** Convert string array to select options */
const toSelectOptions = (types: string[]): Array<{ value: string; label: string }> => {
  return [{ value: "", label: "Select type..." }, ...types.map((t) => ({ value: t, label: t }))];
};

// ============================================================================
// MDA Entry Component
// ============================================================================

interface MdaEntryProps {
  mda: SrosMda;
  index: number;
  mdaTypes: string[];
  onUpdate: (index: number, updates: Partial<SrosMda>) => void;
  onRemove: (index: number) => void;
  slotPrefix?: string;
}

const MdaEntry: React.FC<MdaEntryProps> = ({
  mda,
  index,
  mdaTypes,
  onUpdate,
  onRemove,
  slotPrefix = ""
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1,
      py: 1,
      px: 1.5,
      bgcolor: ACTION_HOVER_BG,
      borderRadius: 1,
      border: 1,
      borderColor: "divider"
    }}
  >
    {slotPrefix && <Chip label={slotPrefix} size="small" />}
    <Box sx={{ width: 60 }}>
      <InputField
        id={`mda-slot-${index}`}
        type="number"
        value={String(mda.slot ?? "")}
        onChange={(v) => onUpdate(index, { slot: v ? parseInt(v, 10) : undefined })}
        placeholder="Slot"
        min={1}
      />
    </Box>
    <Box sx={{ flex: 1 }}>
      <SelectField
        id={`mda-type-${index}`}
        value={mda.type || ""}
        onChange={(v) => onUpdate(index, { type: v })}
        options={toSelectOptions(mdaTypes)}
      />
    </Box>
    <IconButton size="small" onClick={() => onRemove(index)} color="error" title="Remove MDA">
      <DeleteIcon fontSize="small" />
    </IconButton>
  </Box>
);

// ============================================================================
// MDA List Section - Shared component for rendering MDA lists
// ============================================================================

interface MdaListSectionProps {
  mdas: SrosMda[];
  mdaTypes: string[];
  slotPrefix?: string;
  onUpdate: (index: number, updates: Partial<SrosMda>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

const MdaListSection: React.FC<MdaListSectionProps> = ({
  mdas,
  mdaTypes,
  slotPrefix,
  onUpdate,
  onRemove,
  onAdd
}) => (
  <>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {mdas.map((mda, mdaIdx) => (
        <MdaEntry
          key={mdaIdx}
          mda={mda}
          index={mdaIdx}
          mdaTypes={mdaTypes}
          slotPrefix={slotPrefix}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </Box>
    <Button size="small" startIcon={<AddIcon />} onClick={onAdd} sx={{ mt: 1 }}>
      Add MDA
    </Button>
  </>
);

// ============================================================================
// MDA Section Wrapper - Generic MDA list wrapper with subsection
// ============================================================================

interface MdaSectionWrapperProps {
  mdas: SrosMda[];
  mdaTypes: string[];
  slotPrefix: string;
  parentIndex: number;
  onAddMda: (parentIndex: number) => void;
  onUpdateMda: (parentIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveMda: (parentIndex: number, mdaIndex: number) => void;
}

const MdaSectionWrapper: React.FC<MdaSectionWrapperProps> = ({
  mdas,
  mdaTypes,
  slotPrefix,
  parentIndex,
  onAddMda,
  onUpdateMda,
  onRemoveMda
}) => (
  <>
    <Divider sx={{ mt: 2 }} />
    <Box sx={{ pt: 2 }}>
      <Typography variant="caption" sx={{ fontWeight: 500, display: "block", mb: 1 }}>
        MDA Modules
      </Typography>
      <MdaListSection
        mdas={mdas}
        mdaTypes={mdaTypes}
        slotPrefix={slotPrefix}
        onUpdate={(idx, updates) => onUpdateMda(parentIndex, idx, updates)}
        onRemove={(idx) => onRemoveMda(parentIndex, idx)}
        onAdd={() => onAddMda(parentIndex)}
      />
    </Box>
  </>
);

// ============================================================================
// XIOM Entry Component
// ============================================================================

interface XiomEntryProps {
  xiom: SrosXiom;
  index: number;
  cardSlot: string | number;
  srosTypes: SrosComponentTypes;
  onUpdate: (index: number, updates: Partial<SrosXiom>) => void;
  onRemove: (index: number) => void;
  onAddMda: (xiomIndex: number) => void;
  onUpdateMda: (xiomIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveMda: (xiomIndex: number, mdaIndex: number) => void;
}

const XiomEntry: React.FC<XiomEntryProps> = ({
  xiom,
  index,
  cardSlot,
  srosTypes,
  onUpdate,
  onRemove,
  onAddMda,
  onUpdateMda,
  onRemoveMda
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const slotLabel = `${cardSlot}/x${xiom.slot ?? index + 1}`;
  const mdaCount = xiom.mda?.length || 0;

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          bgcolor: ACTION_HOVER_BG,
          cursor: "pointer"
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          <Chip label={slotLabel} size="small" />
          <Typography variant="body2">XIOM</Typography>
          {mdaCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              ({mdaCount} MDA{mdaCount !== 1 ? "s" : ""})
            </Typography>
          )}
        </Box>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(index);
          }}
          color="error"
          title="Remove XIOM"
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>

      <Collapse in={isExpanded}>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <SelectField
              id={`xiom-slot-${index}`}
              label="Slot"
              value={String(xiom.slot ?? 1)}
              onChange={(v) => onUpdate(index, { slot: parseInt(v, 10) })}
              options={[
                { value: "1", label: "x1" },
                { value: "2", label: "x2" }
              ]}
            />
            <SelectField
              id={`xiom-type-${index}`}
              label="Type"
              value={xiom.type || ""}
              onChange={(v) => onUpdate(index, { type: v })}
              options={toSelectOptions(srosTypes.xiom)}
            />
          </Box>

          <MdaSectionWrapper
            mdas={xiom.mda || []}
            mdaTypes={srosTypes.xiomMda}
            slotPrefix={`${slotLabel}/`}
            parentIndex={index}
            onAddMda={onAddMda}
            onUpdateMda={onUpdateMda}
            onRemoveMda={onRemoveMda}
          />
        </Box>
      </Collapse>
    </Paper>
  );
};

// ============================================================================
// Component Entry (CPM or Card)
// ============================================================================

// Shared callback types for component operations
interface ComponentCallbacks {
  onAddMda: (compIndex: number) => void;
  onUpdateMda: (compIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveMda: (compIndex: number, mdaIndex: number) => void;
  onAddXiom: (compIndex: number) => void;
  onUpdateXiom: (compIndex: number, xiomIndex: number, updates: Partial<SrosXiom>) => void;
  onRemoveXiom: (compIndex: number, xiomIndex: number) => void;
  onAddXiomMda: (compIndex: number, xiomIndex: number) => void;
  onUpdateXiomMda: (
    compIndex: number,
    xiomIndex: number,
    mdaIndex: number,
    updates: Partial<SrosMda>
  ) => void;
  onRemoveXiomMda: (compIndex: number, xiomIndex: number, mdaIndex: number) => void;
}

interface ComponentEntryProps extends ComponentCallbacks {
  component: SrosComponent;
  index: number;
  srosTypes: SrosComponentTypes;
  onUpdate: (index: number, updates: Partial<SrosComponent>) => void;
  onRemove: (index: number) => void;
}

/** Component header with expand/collapse toggle */
const ComponentHeader: React.FC<{
  slot: string | number | undefined;
  isCpm: boolean;
  mdaCount: number;
  xiomCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}> = ({ slot, isCpm, mdaCount, xiomCount, isExpanded, onToggle, onRemove }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      px: 1.5,
      py: 1,
      bgcolor: ACTION_HOVER_BG,
      cursor: "pointer"
    }}
    onClick={onToggle}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      <Chip label={slot} size="small" />
      <Typography variant="body2">
        {isCpm ? "Control Processing Module" : "Line Card"}
      </Typography>
      {!isCpm && (mdaCount > 0 || xiomCount > 0) && (
        <Typography variant="caption" color="text.secondary">
          ({mdaCount} MDA, {xiomCount} XIOM)
        </Typography>
      )}
    </Box>
    <IconButton
      size="small"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      color="error"
      title="Remove component"
    >
      <DeleteIcon fontSize="small" />
    </IconButton>
  </Box>
);

/** MDA section for a component */
const ComponentMdaSection: React.FC<
  {
    component: SrosComponent;
    index: number;
    srosTypes: SrosComponentTypes;
  } & Pick<ComponentCallbacks, "onAddMda" | "onUpdateMda" | "onRemoveMda">
> = ({ component, index, srosTypes, onAddMda, onUpdateMda, onRemoveMda }) => (
  <MdaSectionWrapper
    mdas={component.mda || []}
    mdaTypes={srosTypes.mda}
    slotPrefix={`${component.slot}/`}
    parentIndex={index}
    onAddMda={onAddMda}
    onUpdateMda={onUpdateMda}
    onRemoveMda={onRemoveMda}
  />
);

/** XIOM section for a component */
const ComponentXiomSection: React.FC<
  {
    component: SrosComponent;
    index: number;
    srosTypes: SrosComponentTypes;
  } & Pick<
    ComponentCallbacks,
    | "onAddXiom"
    | "onUpdateXiom"
    | "onRemoveXiom"
    | "onAddXiomMda"
    | "onUpdateXiomMda"
    | "onRemoveXiomMda"
  >
> = ({
  component,
  index,
  srosTypes,
  onAddXiom,
  onUpdateXiom,
  onRemoveXiom,
  onAddXiomMda,
  onUpdateXiomMda,
  onRemoveXiomMda
}) => (
  <>
    <Divider sx={{ mt: 2 }} />
    <Box sx={{ pt: 2 }}>
      <Typography variant="caption" sx={{ fontWeight: 500, display: "block", mb: 1 }}>
        XIOM Extension Modules
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {(component.xiom || []).map((xiom, xiomIdx) => (
          <XiomEntry
            key={xiomIdx}
            xiom={xiom}
            index={xiomIdx}
            cardSlot={component.slot ?? ""}
            srosTypes={srosTypes}
            onUpdate={(idx, updates) => onUpdateXiom(index, idx, updates)}
            onRemove={(idx) => onRemoveXiom(index, idx)}
            onAddMda={(xIdx) => onAddXiomMda(index, xIdx)}
            onUpdateMda={(xIdx, mIdx, updates) => onUpdateXiomMda(index, xIdx, mIdx, updates)}
            onRemoveMda={(xIdx, mIdx) => onRemoveXiomMda(index, xIdx, mIdx)}
          />
        ))}
      </Box>
      {(component.xiom?.length ?? 0) < 2 && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => onAddXiom(index)} sx={{ mt: 1 }}>
          Add XIOM
        </Button>
      )}
    </Box>
  </>
);

// ============================================================================
// Component Section - Shared component for CPM and Card sections
// ============================================================================

interface ComponentSectionProps {
  title: string;
  description: string;
  filteredComponents: SrosComponent[];
  allComponents: SrosComponent[];
  srosTypes: SrosComponentTypes;
  updateComponent: (index: number, updates: Partial<SrosComponent>) => void;
  removeComponent: (index: number) => void;
  addMda: (compIndex: number) => void;
  updateMda: (compIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  removeMda: (compIndex: number, mdaIndex: number) => void;
  addXiom: (compIndex: number) => void;
  updateXiom: (compIndex: number, xiomIndex: number, updates: Partial<SrosXiom>) => void;
  removeXiom: (compIndex: number, xiomIndex: number) => void;
  addXiomMda: (compIndex: number, xiomIndex: number) => void;
  updateXiomMda: (
    compIndex: number,
    xiomIndex: number,
    mdaIndex: number,
    updates: Partial<SrosMda>
  ) => void;
  removeXiomMda: (compIndex: number, xiomIndex: number, mdaIndex: number) => void;
  addButtonLabel: string;
  onAdd: () => void;
  addDisabled?: boolean;
  addDisabledTitle?: string;
}

const ComponentSection: React.FC<ComponentSectionProps> = ({
  title,
  description,
  filteredComponents,
  allComponents,
  srosTypes,
  updateComponent,
  removeComponent,
  addMda,
  updateMda,
  removeMda,
  addXiom,
  updateXiom,
  removeXiom,
  addXiomMda,
  updateXiomMda,
  removeXiomMda,
  addButtonLabel,
  onAdd,
  addDisabled,
  addDisabledTitle
}) => (
  <>
    <Divider />
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
      <Typography variant="panelHeading">{title}</Typography>
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={onAdd}
        disabled={addDisabled}
        title={addDisabled ? addDisabledTitle : undefined}
        sx={{ py: 0 }}
      >
        {addButtonLabel}
      </Button>
    </Box>
    <Divider />
    <Box sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        {description}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {filteredComponents.map((comp) => {
          const realIndex = allComponents.indexOf(comp);
          return (
            <ComponentEntry
              key={realIndex}
              component={comp}
              index={realIndex}
              srosTypes={srosTypes}
              onUpdate={updateComponent}
              onRemove={removeComponent}
              onAddMda={addMda}
              onUpdateMda={updateMda}
              onRemoveMda={removeMda}
              onAddXiom={addXiom}
              onUpdateXiom={updateXiom}
              onRemoveXiom={removeXiom}
              onAddXiomMda={addXiomMda}
              onUpdateXiomMda={updateXiomMda}
              onRemoveXiomMda={removeXiomMda}
            />
          );
        })}
      </Box>
    </Box>
  </>
);

const ComponentEntry: React.FC<ComponentEntryProps> = (props) => {
  const { component, index, srosTypes, onUpdate, onRemove } = props;
  const [isExpanded, setIsExpanded] = useState(true);
  const isCpm = isCpmSlot(component.slot);
  const mdaCount = component.mda?.length || 0;
  const xiomCount = component.xiom?.length || 0;

  // Get the right type options based on slot type
  const typeOptions = isCpm ? srosTypes.cpm : srosTypes.card;

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <ComponentHeader
        slot={component.slot}
        isCpm={isCpm}
        mdaCount={mdaCount}
        xiomCount={xiomCount}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        onRemove={() => onRemove(index)}
      />

      <Collapse in={isExpanded}>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <InputField
              id={`comp-slot-${index}`}
              label="Slot"
              value={String(component.slot ?? "")}
              onChange={(v) => onUpdate(index, { slot: v })}
              placeholder={isCpm ? "A or B" : "1, 2, ..."}
            />
            <SelectField
              id={`comp-type-${index}`}
              label="Type"
              value={component.type || ""}
              onChange={(v) => onUpdate(index, { type: v })}
              options={toSelectOptions(typeOptions)}
            />
          </Box>

          {!isCpm && <ComponentMdaSection {...props} />}
          {!isCpm && <ComponentXiomSection {...props} />}
        </Box>
      </Collapse>
    </Paper>
  );
};

// ============================================================================
// Integrated Mode - simpler MDA-only configuration
// ============================================================================

interface IntegratedModeSectionProps {
  components: SrosComponent[];
  srosTypes: SrosComponentTypes;
  onChange: (components: SrosComponent[]) => void;
}

const IntegratedModeSection: React.FC<IntegratedModeSectionProps> = ({
  components,
  srosTypes,
  onChange
}) => {
  const integratedComp = components.find((c) => c.slot === undefined || c.slot === "") || {
    mda: []
  };
  const mdas = integratedComp.mda || [];

  const updateMda = (index: number, updates: Partial<SrosMda>) => {
    const newMdas = [...mdas];
    newMdas[index] = { ...newMdas[index], ...updates };
    onChange([{ ...integratedComp, mda: newMdas }]);
  };

  const removeMda = (index: number) => {
    const newMdas = mdas.filter((_, i) => i !== index);
    onChange([{ ...integratedComp, mda: newMdas }]);
  };

  const addMda = () => {
    const nextSlot = mdas.length > 0 ? Math.max(...mdas.map((m) => m.slot ?? 0)) + 1 : 1;
    onChange([{ ...integratedComp, mda: [...mdas, { slot: nextSlot }] }]);
  };

  return (
    <>
      <Divider />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
        <Typography variant="panelHeading">MDA Configuration</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addMda} sx={{ py: 0 }}>
          Add MDA
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Configure MDA modules directly for integrated chassis
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {mdas.map((mda, mdaIdx) => (
            <MdaEntry
              key={mdaIdx}
              mda={mda}
              index={mdaIdx}
              mdaTypes={srosTypes.mda}
              onUpdate={updateMda}
              onRemove={removeMda}
            />
          ))}
        </Box>
      </Box>
    </>
  );
};

// ============================================================================
// Distributed Mode - full CPM/Card/SFM/MDA/XIOM configuration
// ============================================================================

interface DistributedModeSectionProps {
  components: SrosComponent[];
  sfmValue: string;
  srosTypes: SrosComponentTypes;
  onComponentsChange: (components: SrosComponent[]) => void;
  onSfmChange: (sfm: string) => void;
}

const DistributedModeSection: React.FC<DistributedModeSectionProps> = ({
  components,
  sfmValue,
  srosTypes,
  onComponentsChange,
  onSfmChange
}) => {
  const cpmComponents = components.filter((c) => isCpmSlot(c.slot));
  const cardComponents = components.filter(
    (c) => !isCpmSlot(c.slot) && c.slot !== undefined && c.slot !== ""
  );

  const updateComponent = useCallback(
    (index: number, updates: Partial<SrosComponent>) => {
      const newComponents = [...components];
      newComponents[index] = { ...newComponents[index], ...updates };
      onComponentsChange(newComponents);
    },
    [components, onComponentsChange]
  );

  const removeComponent = useCallback(
    (index: number) => {
      onComponentsChange(components.filter((_, i) => i !== index));
    },
    [components, onComponentsChange]
  );

  const addCpm = () => {
    const usedSlots = cpmComponents.map((c) => String(c.slot).toUpperCase());
    let newSlot: string | null = null;
    if (!usedSlots.includes("A")) {
      newSlot = "A";
    } else if (!usedSlots.includes("B")) {
      newSlot = "B";
    }
    if (newSlot) {
      onComponentsChange([...components, { slot: newSlot }]);
    }
  };

  const addCard = () => {
    const usedSlots = cardComponents.map((c) => Number(c.slot)).filter((n) => !isNaN(n));
    const newSlot = usedSlots.length > 0 ? Math.max(...usedSlots) + 1 : 1;
    onComponentsChange([...components, { slot: newSlot }]);
  };

  // MDA operations
  const addMda = (compIndex: number) => {
    const comp = components[compIndex];
    const mdas = comp.mda || [];
    const nextSlot = mdas.length > 0 ? Math.max(...mdas.map((m) => m.slot ?? 0)) + 1 : 1;
    updateComponent(compIndex, { mda: [...mdas, { slot: nextSlot }] });
  };

  const updateMda = (compIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => {
    const comp = components[compIndex];
    const mdas = [...(comp.mda || [])];
    mdas[mdaIndex] = { ...mdas[mdaIndex], ...updates };
    updateComponent(compIndex, { mda: mdas });
  };

  const removeMda = (compIndex: number, mdaIndex: number) => {
    const comp = components[compIndex];
    updateComponent(compIndex, { mda: (comp.mda || []).filter((_, i) => i !== mdaIndex) });
  };

  // XIOM operations
  const addXiom = (compIndex: number) => {
    const comp = components[compIndex];
    const xioms = comp.xiom || [];
    const usedSlots = xioms.map((x) => x.slot ?? 0);
    const nextSlot = usedSlots.includes(1) && !usedSlots.includes(2) ? 2 : 1;
    updateComponent(compIndex, { xiom: [...xioms, { slot: nextSlot }] });
  };

  const updateXiom = (compIndex: number, xiomIndex: number, updates: Partial<SrosXiom>) => {
    const comp = components[compIndex];
    const xioms = [...(comp.xiom || [])];
    xioms[xiomIndex] = { ...xioms[xiomIndex], ...updates };
    updateComponent(compIndex, { xiom: xioms });
  };

  const removeXiom = (compIndex: number, xiomIndex: number) => {
    const comp = components[compIndex];
    updateComponent(compIndex, { xiom: (comp.xiom || []).filter((_, i) => i !== xiomIndex) });
  };

  // XIOM MDA operations
  const addXiomMda = (compIndex: number, xiomIndex: number) => {
    const comp = components[compIndex];
    const xiom = (comp.xiom || [])[xiomIndex];
    if (!xiom) return;
    const mdas = xiom.mda || [];
    const nextSlot = mdas.length > 0 ? Math.max(...mdas.map((m) => m.slot ?? 0)) + 1 : 1;
    const newXioms = [...(comp.xiom || [])];
    newXioms[xiomIndex] = { ...xiom, mda: [...mdas, { slot: nextSlot }] };
    updateComponent(compIndex, { xiom: newXioms });
  };

  const updateXiomMda = (
    compIndex: number,
    xiomIndex: number,
    mdaIndex: number,
    updates: Partial<SrosMda>
  ) => {
    const comp = components[compIndex];
    const xiom = (comp.xiom || [])[xiomIndex];
    if (!xiom) return;
    const mdas = [...(xiom.mda || [])];
    mdas[mdaIndex] = { ...mdas[mdaIndex], ...updates };
    const newXioms = [...(comp.xiom || [])];
    newXioms[xiomIndex] = { ...xiom, mda: mdas };
    updateComponent(compIndex, { xiom: newXioms });
  };

  const removeXiomMda = (compIndex: number, xiomIndex: number, mdaIndex: number) => {
    const comp = components[compIndex];
    const xiom = (comp.xiom || [])[xiomIndex];
    if (!xiom) return;
    const newXioms = [...(comp.xiom || [])];
    newXioms[xiomIndex] = { ...xiom, mda: (xiom.mda || []).filter((_, i) => i !== mdaIndex) };
    updateComponent(compIndex, { xiom: newXioms });
  };

  // Common props for both CPM and Card sections
  const commonSectionProps = {
    allComponents: components,
    srosTypes,
    updateComponent,
    removeComponent,
    addMda,
    updateMda,
    removeMda,
    addXiom,
    updateXiom,
    removeXiom,
    addXiomMda,
    updateXiomMda,
    removeXiomMda
  };

  return (
    <>
      {/* CPM Components */}
      <ComponentSection
        {...commonSectionProps}
        title="Control Processing Modules (CPM)"
        description="Slots A and B represent the chassis control processors"
        filteredComponents={cpmComponents}
        addButtonLabel="Add CPM"
        onAdd={addCpm}
        addDisabled={cpmComponents.length >= 2}
        addDisabledTitle="CPM slots A and B are already defined"
      />

      {/* Card Components */}
      <ComponentSection
        {...commonSectionProps}
        title="Line Cards"
        description="Define card slots and attach IOM/XCM, MDA, and XIOM components"
        filteredComponents={cardComponents}
        addButtonLabel="Add Card"
        onAdd={addCard}
      />

      {/* SFM Configuration */}
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="panelHeading">Switch Fabric Module (SFM)</Typography>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Override the default SFM type for all components
        </Typography>
        <SelectField
          id="sfm-type"
          label="SFM Type"
          value={sfmValue}
          onChange={onSfmChange}
          options={toSelectOptions(srosTypes.sfm)}
          clearable
        />
      </Box>
    </>
  );
};

// ============================================================================
// Main ComponentsTab
// ============================================================================

/**
 * ComponentsTab - Main component for SROS component configuration
 * Only visible for nokia_srsim nodes
 */
export const ComponentsTab: React.FC<TabProps> = ({ data, onChange }) => {
  const { srosComponentTypes } = useSchema();
  const isIntegrated = isIntegratedType(data.type);
  const components = data.components || [];

  // Extract shared SFM value from first component that has it
  const sfmValue = components.find((c) => c.sfm)?.sfm || "";

  const handleComponentsChange = (newComponents: SrosComponent[]) => {
    onChange({ components: newComponents });
  };

  const handleSfmChange = (sfm: string) => {
    // Apply SFM to all components
    const newComponents = components.map((c) => ({ ...c, sfm: sfm || undefined }));
    onChange({ components: newComponents.length > 0 ? newComponents : [{ sfm }] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Mode indicator */}
      <Box sx={{ p: 2 }}>
        <Paper
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1.5,
            bgcolor: ACTION_HOVER_BG
          }}
        >
          {isIntegrated ? (
            <StorageIcon color="primary" />
          ) : (
            <HubIcon color="primary" />
          )}
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {isIntegrated ? "Integrated Chassis" : "Distributed Chassis"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isIntegrated
                ? `Simplified MDA configuration for ${data.type}`
                : "Full component configuration with CPM, Cards, MDA, and XIOM"}
            </Typography>
          </Box>
        </Paper>
      </Box>

      {isIntegrated ? (
        <IntegratedModeSection
          components={components}
          srosTypes={srosComponentTypes}
          onChange={handleComponentsChange}
        />
      ) : (
        <DistributedModeSection
          components={components}
          sfmValue={sfmValue}
          srosTypes={srosComponentTypes}
          onComponentsChange={handleComponentsChange}
          onSfmChange={handleSfmChange}
        />
      )}
    </Box>
  );
};
