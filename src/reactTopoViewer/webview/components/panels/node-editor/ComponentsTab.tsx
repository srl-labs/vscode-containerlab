/**
 * Components Tab for Node Editor - Nokia SROS component management
 * Handles CPM, Card, SFM, MDA, XIOM configuration for nokia_srsim nodes
 */
import React, { useCallback, useState } from 'react';

import { FormField, InputField, SelectField, Section } from '../../shared/form';
import { useSchema, type SrosComponentTypes } from '../../../hooks/data/useSchema';

import { TabProps, SrosComponent, SrosMda, SrosXiom, INTEGRATED_SROS_TYPES } from './types';

/** Check if type is integrated mode (simpler chassis) */
const isIntegratedType = (type: string | undefined): boolean => {
  if (!type) return false;
  return INTEGRATED_SROS_TYPES.has(type.toLowerCase());
};

/** Check if slot is a CPM slot (A or B) */
const isCpmSlot = (slot: string | number | undefined): boolean => {
  if (slot === undefined) return false;
  const s = String(slot).trim().toUpperCase();
  return s === 'A' || s === 'B';
};

/** Convert string array to select options */
const toSelectOptions = (types: string[]): Array<{ value: string; label: string }> => {
  return [
    { value: '', label: 'Select type...' },
    ...types.map(t => ({ value: t, label: t }))
  ];
};

// ============================================================================
// Shared Component Styles
// ============================================================================

const cardStyles = {
  container: 'bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-md overflow-hidden',
  header: 'flex items-center justify-between px-3 py-2 bg-[var(--vscode-sideBar-background)] cursor-pointer select-none hover:bg-[var(--vscode-list-hoverBackground)] transition-colors',
  headerTitle: 'flex items-center gap-2 font-medium text-sm',
  body: 'p-3 space-y-3 border-t border-[var(--vscode-panel-border)]',
  deleteBtn: 'flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-errorForeground)] transition-colors',
  addBtn: 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  subSection: 'mt-3 pt-3 border-t border-[var(--vscode-panel-border)]',
  subSectionTitle: 'text-xs font-medium text-[var(--vscode-foreground)] mb-2',
  badge: 'px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]',
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

const MdaEntry: React.FC<MdaEntryProps> = ({ mda, index, mdaTypes, onUpdate, onRemove, slotPrefix = '' }) => (
  <div className="flex items-center gap-2 py-2 px-2 rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]">
    {slotPrefix && (
      <span className={cardStyles.badge}>{slotPrefix}</span>
    )}
    <div className="w-14">
      <InputField
        id={`mda-slot-${index}`}
        type="number"
        value={String(mda.slot ?? '')}
        onChange={(v) => onUpdate(index, { slot: v ? parseInt(v, 10) : undefined })}
        placeholder="Slot"
        min={1}
      />
    </div>
    <div className="flex-1">
      <SelectField
        id={`mda-type-${index}`}
        value={mda.type || ''}
        onChange={(v) => onUpdate(index, { type: v })}
        options={toSelectOptions(mdaTypes)}
      />
    </div>
    <button
      type="button"
      onClick={() => onRemove(index)}
      className={cardStyles.deleteBtn}
      title="Remove MDA"
    >
      <i className="fas fa-trash" />
    </button>
  </div>
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
  xiom, index, cardSlot, srosTypes, onUpdate, onRemove, onAddMda, onUpdateMda, onRemoveMda
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const slotLabel = `${cardSlot}/x${xiom.slot ?? index + 1}`;
  const mdaCount = xiom.mda?.length || 0;

  return (
    <div className={cardStyles.container}>
      <div className={cardStyles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={cardStyles.headerTitle}>
          <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-xs`} />
          <span className={cardStyles.badge}>{slotLabel}</span>
          <span>XIOM</span>
          {mdaCount > 0 && (
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">
              ({mdaCount} MDA{mdaCount !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className={cardStyles.deleteBtn}
          title="Remove XIOM"
        >
          <i className="fas fa-trash" />
        </button>
      </div>

      {isExpanded && (
        <div className={cardStyles.body}>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Slot">
              <SelectField
                id={`xiom-slot-${index}`}
                value={String(xiom.slot ?? 1)}
                onChange={(v) => onUpdate(index, { slot: parseInt(v, 10) })}
                options={[
                  { value: '1', label: 'x1' },
                  { value: '2', label: 'x2' }
                ]}
              />
            </FormField>
            <FormField label="Type">
              <SelectField
                id={`xiom-type-${index}`}
                value={xiom.type || ''}
                onChange={(v) => onUpdate(index, { type: v })}
                options={toSelectOptions(srosTypes.xiom)}
              />
            </FormField>
          </div>

          <div className={cardStyles.subSection}>
            <div className={cardStyles.subSectionTitle}>MDA Modules</div>
            <div className="space-y-2">
              {(xiom.mda || []).map((mda, mdaIdx) => (
                <MdaEntry
                  key={mdaIdx}
                  mda={mda}
                  index={mdaIdx}
                  mdaTypes={srosTypes.xiomMda}
                  slotPrefix={`${slotLabel}/`}
                  onUpdate={(idx, updates) => onUpdateMda(index, idx, updates)}
                  onRemove={(idx) => onRemoveMda(index, idx)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onAddMda(index)}
              className={`${cardStyles.addBtn} mt-2`}
            >
              <i className="fas fa-plus" />
              Add MDA
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Component Entry (CPM or Card)
// ============================================================================

interface ComponentEntryProps {
  component: SrosComponent;
  index: number;
  srosTypes: SrosComponentTypes;
  onUpdate: (index: number, updates: Partial<SrosComponent>) => void;
  onRemove: (index: number) => void;
  onAddMda: (compIndex: number) => void;
  onUpdateMda: (compIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveMda: (compIndex: number, mdaIndex: number) => void;
  onAddXiom: (compIndex: number) => void;
  onUpdateXiom: (compIndex: number, xiomIndex: number, updates: Partial<SrosXiom>) => void;
  onRemoveXiom: (compIndex: number, xiomIndex: number) => void;
  onAddXiomMda: (compIndex: number, xiomIndex: number) => void;
  onUpdateXiomMda: (compIndex: number, xiomIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveXiomMda: (compIndex: number, xiomIndex: number, mdaIndex: number) => void;
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
  <div className={cardStyles.header} onClick={onToggle}>
    <div className={cardStyles.headerTitle}>
      <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-xs`} />
      <span className={cardStyles.badge}>{slot}</span>
      <span>{isCpm ? 'Control Processing Module' : 'Line Card'}</span>
      {!isCpm && (mdaCount > 0 || xiomCount > 0) && (
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          ({mdaCount} MDA, {xiomCount} XIOM)
        </span>
      )}
    </div>
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className={cardStyles.deleteBtn}
      title="Remove component"
    >
      <i className="fas fa-trash" />
    </button>
  </div>
);

/** MDA section for a component */
const ComponentMdaSection: React.FC<{
  component: SrosComponent;
  index: number;
  srosTypes: SrosComponentTypes;
  onAddMda: (compIndex: number) => void;
  onUpdateMda: (compIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveMda: (compIndex: number, mdaIndex: number) => void;
}> = ({ component, index, srosTypes, onAddMda, onUpdateMda, onRemoveMda }) => (
  <div className={cardStyles.subSection}>
    <div className={cardStyles.subSectionTitle}>MDA Modules</div>
    <div className="space-y-2">
      {(component.mda || []).map((mda, mdaIdx) => (
        <MdaEntry
          key={mdaIdx}
          mda={mda}
          index={mdaIdx}
          mdaTypes={srosTypes.mda}
          slotPrefix={`${component.slot}/`}
          onUpdate={(idx, updates) => onUpdateMda(index, idx, updates)}
          onRemove={(idx) => onRemoveMda(index, idx)}
        />
      ))}
    </div>
    <button type="button" onClick={() => onAddMda(index)} className={`${cardStyles.addBtn} mt-2`}>
      <i className="fas fa-plus" />
      Add MDA
    </button>
  </div>
);

/** XIOM section for a component */
const ComponentXiomSection: React.FC<{
  component: SrosComponent;
  index: number;
  srosTypes: SrosComponentTypes;
  onAddXiom: (compIndex: number) => void;
  onUpdateXiom: (compIndex: number, xiomIndex: number, updates: Partial<SrosXiom>) => void;
  onRemoveXiom: (compIndex: number, xiomIndex: number) => void;
  onAddXiomMda: (compIndex: number, xiomIndex: number) => void;
  onUpdateXiomMda: (compIndex: number, xiomIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => void;
  onRemoveXiomMda: (compIndex: number, xiomIndex: number, mdaIndex: number) => void;
}> = ({ component, index, srosTypes, onAddXiom, onUpdateXiom, onRemoveXiom, onAddXiomMda, onUpdateXiomMda, onRemoveXiomMda }) => (
  <div className={cardStyles.subSection}>
    <div className={cardStyles.subSectionTitle}>XIOM Extension Modules</div>
    <div className="space-y-2">
      {(component.xiom || []).map((xiom, xiomIdx) => (
        <XiomEntry
          key={xiomIdx}
          xiom={xiom}
          index={xiomIdx}
          cardSlot={component.slot ?? ''}
          srosTypes={srosTypes}
          onUpdate={(idx, updates) => onUpdateXiom(index, idx, updates)}
          onRemove={(idx) => onRemoveXiom(index, idx)}
          onAddMda={(xIdx) => onAddXiomMda(index, xIdx)}
          onUpdateMda={(xIdx, mIdx, updates) => onUpdateXiomMda(index, xIdx, mIdx, updates)}
          onRemoveMda={(xIdx, mIdx) => onRemoveXiomMda(index, xIdx, mIdx)}
        />
      ))}
    </div>
    {(component.xiom?.length ?? 0) < 2 && (
      <button type="button" onClick={() => onAddXiom(index)} className={`${cardStyles.addBtn} mt-2`}>
        <i className="fas fa-plus" />
        Add XIOM
      </button>
    )}
  </div>
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
    <div className={cardStyles.container}>
      <ComponentHeader
        slot={component.slot}
        isCpm={isCpm}
        mdaCount={mdaCount}
        xiomCount={xiomCount}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        onRemove={() => onRemove(index)}
      />

      {isExpanded && (
        <div className={cardStyles.body}>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Slot">
              <InputField
                id={`comp-slot-${index}`}
                value={String(component.slot ?? '')}
                onChange={(v) => onUpdate(index, { slot: v })}
                placeholder={isCpm ? 'A or B' : '1, 2, ...'}
              />
            </FormField>
            <FormField label="Type">
              <SelectField
                id={`comp-type-${index}`}
                value={component.type || ''}
                onChange={(v) => onUpdate(index, { type: v })}
                options={toSelectOptions(typeOptions)}
              />
            </FormField>
          </div>

          {!isCpm && <ComponentMdaSection {...props} />}
          {!isCpm && <ComponentXiomSection {...props} />}
        </div>
      )}
    </div>
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

const IntegratedModeSection: React.FC<IntegratedModeSectionProps> = ({ components, srosTypes, onChange }) => {
  const integratedComp = components.find(c => c.slot === undefined || c.slot === '') || { mda: [] };
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
    const nextSlot = mdas.length > 0 ? Math.max(...mdas.map(m => m.slot ?? 0)) + 1 : 1;
    onChange([{ ...integratedComp, mda: [...mdas, { slot: nextSlot }] }]);
  };

  return (
    <Section title="MDA Configuration">
      <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
        Configure MDA modules directly for integrated chassis
      </p>
      <div className="space-y-2">
        {mdas.map((mda, idx) => (
          <MdaEntry
            key={idx}
            mda={mda}
            index={idx}
            mdaTypes={srosTypes.mda}
            onUpdate={updateMda}
            onRemove={removeMda}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={addMda}
        className={`${cardStyles.addBtn} mt-3`}
      >
        <i className="fas fa-plus" />
        Add MDA
      </button>
    </Section>
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
  components, sfmValue, srosTypes, onComponentsChange, onSfmChange
}) => {
  const cpmComponents = components.filter(c => isCpmSlot(c.slot));
  const cardComponents = components.filter(c => !isCpmSlot(c.slot) && c.slot !== undefined && c.slot !== '');

  const updateComponent = useCallback((index: number, updates: Partial<SrosComponent>) => {
    const newComponents = [...components];
    newComponents[index] = { ...newComponents[index], ...updates };
    onComponentsChange(newComponents);
  }, [components, onComponentsChange]);

  const removeComponent = useCallback((index: number) => {
    onComponentsChange(components.filter((_, i) => i !== index));
  }, [components, onComponentsChange]);

  const addCpm = () => {
    const usedSlots = cpmComponents.map(c => String(c.slot).toUpperCase());
    let newSlot: string | null = null;
    if (!usedSlots.includes('A')) {
      newSlot = 'A';
    } else if (!usedSlots.includes('B')) {
      newSlot = 'B';
    }
    if (newSlot) {
      onComponentsChange([...components, { slot: newSlot }]);
    }
  };

  const addCard = () => {
    const usedSlots = cardComponents.map(c => Number(c.slot)).filter(n => !isNaN(n));
    const newSlot = usedSlots.length > 0 ? Math.max(...usedSlots) + 1 : 1;
    onComponentsChange([...components, { slot: newSlot }]);
  };

  // MDA operations
  const addMda = (compIndex: number) => {
    const comp = components[compIndex];
    const mdas = comp.mda || [];
    const nextSlot = mdas.length > 0 ? Math.max(...mdas.map(m => m.slot ?? 0)) + 1 : 1;
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
    const usedSlots = xioms.map(x => x.slot ?? 0);
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
    const nextSlot = mdas.length > 0 ? Math.max(...mdas.map(m => m.slot ?? 0)) + 1 : 1;
    const newXioms = [...(comp.xiom || [])];
    newXioms[xiomIndex] = { ...xiom, mda: [...mdas, { slot: nextSlot }] };
    updateComponent(compIndex, { xiom: newXioms });
  };

  const updateXiomMda = (compIndex: number, xiomIndex: number, mdaIndex: number, updates: Partial<SrosMda>) => {
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

  return (
    <>
      {/* SFM Configuration */}
      <Section title="Switch Fabric Module (SFM)">
        <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-2">
          Override the default SFM type for all components
        </p>
        <FormField label="SFM Type">
          <SelectField
            id="sfm-type"
            value={sfmValue}
            onChange={onSfmChange}
            options={toSelectOptions(srosTypes.sfm)}
          />
        </FormField>
      </Section>

      {/* CPM Components */}
      <Section title="Control Processing Modules (CPM)">
        <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
          Slots A and B represent the chassis control processors
        </p>
        <div className="space-y-2">
          {cpmComponents.map((comp) => {
            const realIndex = components.indexOf(comp);
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
        </div>
        <button
          type="button"
          onClick={addCpm}
          disabled={cpmComponents.length >= 2}
          className={`${cardStyles.addBtn} mt-3`}
          title={cpmComponents.length >= 2 ? 'CPM slots A and B are already defined' : 'Add CPM slot'}
        >
          <i className="fas fa-plus" />
          Add CPM
        </button>
      </Section>

      {/* Card Components */}
      <Section title="Line Cards" hasBorder={false}>
        <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
          Define card slots and attach IOM/XCM, MDA, and XIOM components
        </p>
        <div className="space-y-2">
          {cardComponents.map((comp) => {
            const realIndex = components.indexOf(comp);
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
        </div>
        <button
          type="button"
          onClick={addCard}
          className={`${cardStyles.addBtn} mt-3`}
        >
          <i className="fas fa-plus" />
          Add Card
        </button>
      </Section>
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
  const sfmValue = components.find(c => c.sfm)?.sfm || '';

  const handleComponentsChange = (newComponents: SrosComponent[]) => {
    onChange({ components: newComponents });
  };

  const handleSfmChange = (sfm: string) => {
    // Apply SFM to all components
    const newComponents = components.map(c => ({ ...c, sfm: sfm || undefined }));
    onChange({ components: newComponents.length > 0 ? newComponents : [{ sfm }] });
  };

  return (
    <div className="space-y-3">
      {/* Mode indicator */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--vscode-textBlockQuote-background)] border border-[var(--vscode-textBlockQuote-border)]">
        <i className={`fas ${isIntegrated ? 'fa-server' : 'fa-network-wired'} text-[var(--vscode-textLink-foreground)]`} />
        <div>
          <div className="text-sm font-medium">
            {isIntegrated ? 'Integrated Chassis' : 'Distributed Chassis'}
          </div>
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">
            {isIntegrated
              ? `Simplified MDA configuration for ${data.type}`
              : 'Full component configuration with CPM, Cards, MDA, and XIOM'}
          </div>
        </div>
      </div>

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
    </div>
  );
};
