/**
 * DevToolbar - Visual development toolbar for React TopoViewer
 *
 * Provides quick access to dev utilities like topology switching,
 * mode changes, latency simulation, and split view toggling.
 */

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import type { DevStateManager } from '../mock/DevState';
import type { LatencySimulator, LatencyProfile } from '../mock/LatencySimulator';
import type { SplitViewPanel } from '../mock/SplitViewPanel';
import type { MessageHandler } from '../mock/MessageHandler';

// ============================================================================
// Types
// ============================================================================

export interface DevToolbarProps {
  stateManager: DevStateManager;
  latencySimulator: LatencySimulator;
  splitViewPanel: SplitViewPanel;
  messageHandler: MessageHandler;
  loadTopology: (name: TopologyName) => void;
}

type TopologyName =
  | 'sample'
  | 'sampleWithAnnotations'
  | 'annotated'
  | 'network'
  | 'empty'
  | 'large'
  | 'large100'
  | 'large1000';

// ============================================================================
// Component
// ============================================================================

export function DevToolbar({
  stateManager,
  latencySimulator,
  splitViewPanel,
  loadTopology
}: DevToolbarProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState(stateManager.getMode());
  const [deploymentState, setDeploymentState] = useState(stateManager.getDeploymentState());
  const [latencyProfile, setLatencyProfile] = useState<LatencyProfile>(latencySimulator.getProfile());
  const [splitViewOpen, setSplitViewOpen] = useState(splitViewPanel.getIsOpen());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = stateManager.subscribe(state => {
      setMode(state.mode);
      setDeploymentState(state.deploymentState);
      setSplitViewOpen(state.splitViewOpen);
    });
    return unsubscribe;
  }, [stateManager]);

  // Subscribe to latency profile changes
  useEffect(() => {
    const unsubscribe = latencySimulator.onProfileChange(profile => {
      setLatencyProfile(profile);
    });
    return unsubscribe;
  }, [latencySimulator]);

  // Handlers
  const handleTopologyChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    loadTopology(e.target.value as TopologyName);
  }, [loadTopology]);

  const handleModeChange = useCallback((newMode: 'edit' | 'view') => {
    stateManager.setMode(newMode);
    window.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode: newMode === 'view' ? 'viewer' : 'editor',
        deploymentState: stateManager.getDeploymentState()
      }
    }, '*');
  }, [stateManager]);

  const handleDeploymentChange = useCallback((newState: 'deployed' | 'undeployed' | 'unknown') => {
    stateManager.setDeploymentState(newState);
    window.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode: stateManager.getMode() === 'view' ? 'viewer' : 'editor',
        deploymentState: newState
      }
    }, '*');
  }, [stateManager]);

  const handleLatencyChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    latencySimulator.setProfile(e.target.value as LatencyProfile);
  }, [latencySimulator]);

  const handleToggleSplitView = useCallback(() => {
    splitViewPanel.toggle();
  }, [splitViewPanel]);

  const handleExportYaml = useCallback(() => {
    const yaml = splitViewPanel.getYaml();
    console.log(yaml);
    splitViewPanel.copyYamlToClipboard();
  }, [splitViewPanel]);

  const handleExportAnnotations = useCallback(() => {
    const json = splitViewPanel.getAnnotationsJson();
    console.log(json);
    splitViewPanel.copyAnnotationsToClipboard();
  }, [splitViewPanel]);

  return (
    <div className="fixed bottom-4 right-4 z-[10000] font-sans text-sm">
      {/* Collapsed button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg
          ${isExpanded ? 'rounded-b-none' : ''}
          bg-gray-900 text-white border border-gray-700
          hover:bg-gray-800 transition-colors
        `}
      >
        <span className="text-pink-400 font-bold">DEV</span>
        <span className="text-gray-400">{isExpanded ? '\u25BC' : '\u25B6'}</span>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="bg-gray-900 border border-t-0 border-gray-700 rounded-b-lg rounded-tl-lg p-3 shadow-lg min-w-[280px]">
          {/* Topology selector */}
          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">Topology</label>
            <select
              onChange={handleTopologyChange}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm"
            >
              <option value="">Select topology...</option>
              <option value="sample">Sample (no annotations)</option>
              <option value="sampleWithAnnotations">Sample (with positions)</option>
              <option value="annotated">Annotated (full)</option>
              <option value="network">Network nodes</option>
              <option value="empty">Empty canvas</option>
              <option value="large">Large (25 nodes)</option>
              <option value="large100">Large (100 nodes)</option>
              <option value="large1000">Large (1000 nodes)</option>
            </select>
          </div>

          {/* Mode controls */}
          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange('edit')}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  mode === 'edit'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => handleModeChange('view')}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  mode === 'view'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                View
              </button>
            </div>
          </div>

          {/* Deployment state */}
          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">Deployment State</label>
            <div className="flex gap-1">
              <button
                onClick={() => handleDeploymentChange('deployed')}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  deploymentState === 'deployed'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Deployed
              </button>
              <button
                onClick={() => handleDeploymentChange('undeployed')}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  deploymentState === 'undeployed'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Undeployed
              </button>
            </div>
          </div>

          {/* Latency profile */}
          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">Latency Profile</label>
            <select
              value={latencyProfile}
              onChange={handleLatencyChange}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm"
            >
              <option value="instant">Instant (0ms)</option>
              <option value="fast">Fast (50-100ms)</option>
              <option value="normal">Normal (150-300ms)</option>
              <option value="slow">Slow (500-1000ms)</option>
            </select>
          </div>

          {/* Split view toggle */}
          <div className="mb-3">
            <button
              onClick={handleToggleSplitView}
              className={`w-full px-2 py-1 rounded text-xs font-medium transition-colors ${
                splitViewOpen
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {splitViewOpen ? 'Close Split View' : 'Open Split View'}
            </button>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleExportYaml}
              className="flex-1 px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              Export YAML
            </button>
            <button
              onClick={handleExportAnnotations}
              className="flex-1 px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              Export JSON
            </button>
          </div>

          {/* Info */}
          <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
            <p>Console: <code className="text-gray-400">__DEV__.*</code></p>
          </div>
        </div>
      )}
    </div>
  );
}
