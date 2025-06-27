// vscodeHtmlTemplate.ts

import { log } from '../../../topoViewer/backend/logger';

export function getHTMLTemplate(
  cssUri: string,
  jsUri: string,
  schemaUri: string,
  imagesUri: string,
  jsonFileUrlDataCytoMarshall: string,
  jsonFileUrlDataEnvironment: string,
  isVscodeDeployment: boolean,
  jsOutDir: string,
  allowedHostname: string,
  useSocket: boolean,
  socketAssignedPort: number
): string {

  log.info(`allowedHostname in vscodeHtmlTemplate.ts: ${allowedHostname}`);


  return `
<!DOCTYPE html>
<html lang="en" id="root">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TopoViewer</title>
  <link rel="stylesheet" href="${jsUri}/library/bulma-1-0-2.min.css?ver=1">

  <!-- CSS Assets -->
  <link rel="stylesheet" href="${cssUri}/style.css?ver=1" />

  <link rel="stylesheet" href="${cssUri}/leaflet.css" />
  <link rel="stylesheet" href="${cssUri}/cytoscape-leaflet.css?ver=1" />

  <!-- Quill CSS (Snow theme) -->
  <!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css"> -->
  <!-- <link rel="stylesheet" href="${cssUri}/quill.css?ver=1" /> -->

  <!-- highlight.js style -->
  <link rel="stylesheet" href="${cssUri}/atom-one-dark.min.css">

  <!-- JS Assets -->
  <script src="${jsUri}/library/fontawesome-6-7-2.min.js?ver=1"></script>
  <script src="${jsUri}/library/bulma-slider.min.js?ver=1"></script>
  <script src="${jsUri}/library/bulma-toast.min.js?ver=1"></script>
</head>

<body>

  <nav class="navbar is-fixed-top has-background-4a px-3 py-1" role="navigation" aria-label="main navigation">
    <!-- left side: logo + title -->
    <div class="navbar-brand">
      <div class="pt-1 pr-2">
        <a href="https://containerlab.dev/" target="_blank" rel="noopener noreferrer">
          <img id="nokia-logo-img" src="${imagesUri}/containerlab.svg" alt="Containerlab Logo" class="logo-image" />
        </a>
      </div>
      <div class="p-0 is-flex is-flex-direction-column">
        <p class="title is-4 m-0 is-unselectable has-text-weight-normal has-text-white">
          containerlab
        </p>
        <p class="subtitle is-6 m-0 has-text-weight-light has-text-white" id="ClabSubtitle">
          Editor ::: Topology name: Königsberger Brücken
        </p>
      </div>
    </div>

    <!-- right side: burger dropdown always on the right edge -->
    <div class="navbar-end">
      <div class="dropdown is-hoverable is-right">
        <div class="dropdown-trigger">
          <button class="button is-medium navbar-element-4a button-no-outline">
              <span class="icon">
                <i class="fas fa-bars" aria-hidden="true"></i>
              </span>
          </button>
        </div>
        <div class="dropdown-menu" id="dropdown-menu" role="menu">
          <div class="dropdown-content">
            <button id="about" title="" onclick="window.topoViewerEditorEngine.viewportPanels.panelAbout();" class="dropdown-item is-small">
              About
            </button>
            <!-- 
            <hr class="dropdown-divider py-0" />
            …other items… 
            -->
          </div>
        </div>
      </div>
    </div>

  </nav>

  <div id="root-div">

    <div id="cy-leaflet"></div>

    <div id="cy"></div>
    <div id="loading-spinner-global" class="loading" style="display: none;">
      <button id="loading-spinner-global-button" class="button is-loading is-large">
        <span class="icon is-large">
          <svg class="svg-inline--fa fa-italic" aria-hidden="true" focusable="false" data-prefix="fas"
            data-icon="italic" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" data-fa-i2svg="">
            <path fill="currentColor"
              d="M128 64c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H293.3L160 416h64c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H90.7L224 96H160c-17.7 0-32-14.3-32-32z">
            </path>
          </svg>
        </span>
      </button>
    </div>

    <div id="viewport-buttons" class="box p-2 is-flex" style="display: block; height: auto;">
      <div class="is-flex is-flex-direction-column is-justify-content-space-evenly">
        <p class="control p-0">
          <button id="viewport-zoom-to-fit" title="Fit to Viewport"
            onclick="window.topoViewerEditorEngine.viewportButtons.viewportButtonsZoomToFit(window.topoViewerEditorEngine.cy); return false;"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fas fa-expand"></i>
            </span>
          </button>
        </p>

        <p class="control p-0">
          <button id="viewport-add-clab-node" title="Add Containerlab Node"
            onclick="window.topoViewerEditorEngine.viewportButtons.viewportButtonsAddContainerlabNode(window.topoViewerEditorEngine.cy, event); return false;"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-plus"></i>
            </span>
          </button>
        </p>

         
        <p class="control p-0">
          <button id="viewport-layout" title="Layout Manager" onclick="viewportButtonsLayoutAlgo(event)"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fas fa-circle-nodes"></i>
            </span>
          </button>
        </p>
        
        <!-- 
        <p class="control p-0">
          <button id="viewport-topology-overview" title="Find Node" onclick="viewportButtonsTopologyOverview(event)"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-binoculars"></i>
            </span>
          </button>
        </p>
        -->
       
        
        <p class="control p-0">
          <button id="viewport-label-endpoint" title="Toggle Endpoint Label"
            onclick="window.topoViewerEditorEngine.viewportButtons.viewportButtonsLabelEndpoint(window.topoViewerEditorEngine.cy); return false;"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fas fa-tag"></i>
            </span>
          </button>
        </p>

        <!-- aarafat-tag: vs-code  

                <p class="control p-0">
                  <a  id="viewport-container-status-visibility" href="#" onclick="viewportButtonContainerStatusVisibility()"class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fab fa-docker"></i> 
                  </span>
                  </a>
                </p>

                <p class="control p-0">
                  <a  id="viewport-topology-capture" href="#" onclick="viewportButtonsTopologyCapture(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fas fa-camera"></i> 
                  </span>
                  </a>
                </p>
               
                <p class="control p-0">
                  <a  id="viewport-clab-editor" href="#" onclick="viewportButtonsClabEditor(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </span>
                  </a>
                </p>

                <p class="control p-0">
                  <a  id="viewport-multi-layer" href="#" onclick="viewportButtonsMultiLayerViewPortToggle(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                    <span class="icon is-small">
                      <i class="fa-solid fa-layer-group"></i>
                    </span>
                  </a>
                </p>
        -->

        <p class="control p-0">
          <button id="viewport-add-group" title="Add Group" 
            onclick="window.topoViewerEditorEngine.groupManager.createNewParent(window.topoViewerEditorEngine.cy, {createDummyChild: true}); return false;"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-notes-medical"></i>
            </span>
          </button>
        </p>

        <!-- <p class="control p-0">
          <button id="viewport-capture-viewport" title="Capture Viewport as SVG" onclick="viewportButtonsCaptureViewportAsSvg(cy)"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-camera"></i>
            </span>
          </button>
        </p> -->

        <p class="control p-0">
          <button id="viewport-reload-topo" title="Reload TopoViewer"
            onclick="window.topoViewerEditorEngine.viewportButtons.viewportButtonsReloadTopo(window.topoViewerEditorEngine.cy); return false;"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-arrow-rotate-right"></i>
            </span>
          </button>
        </p>

        <p class="control p-0">
          <button id="viewport-save-topo" title="Save TopoViewer"
            onclick="window.topoViewerEditorEngine.viewportButtons.viewportButtonsSaveTopo(window.topoViewerEditorEngine.cy); return false;"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-floppy-disk"></i>
            </span>
          </button>
        </p>

        <!-- <p class="control p-0">
          <button id="viewport-add-node-texbox" title="Add Texbox" onclick="viewportButtonsAddNodeTextbox(cy)"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-pen-to-square"></i>
            </span>
          </button>
        </p> -->

        <!-- <p class="control p-0">
          <button id="viewport-save-topo" title="Toggle Link Operational State" onclick="viewportButtonsLinkOperState(cy)"
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-diagram-project"></i>
            </span>
          </button>
        </p> -->

        <!-- <p class="control p-0">
          <button id="viewport-test-call-backend" title="Test Call to Backend" onclick="viewportButtonsReloadTopo()" 
            class="button px-4 py-4 is-smallest-element" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-phone"></i>
            </span>
          </button>
        </p> -->

        <hr id="viewport-geo-map-divider" class="my-1 viewport-geo-map is-hidden"
          style="border-top: 1px solid #dbdbdb;">

        <p class="control p-0">
          <button id="viewport-geo-map-pan" href="#" onclick="viewportButtonsGeoMapPan(event)"
            class="button px-4 py-4 is-smallest-element viewport-geo-map is-hidden is-inverted" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-hand"></i>
            </span>
          </button>
        </p>

        <p class="control p-0">
          <button id="viewport-geo-map-edit" href="#" onclick="viewportButtonsGeoMapEdit(event)"
            class="button px-4 py-4 is-smallest-element viewport-geo-map is-hidden is-inverted" style="outline: none;">
            <span class="icon is-small">
              <i class="fa-solid fa-arrow-pointer"></i>
            </span>
          </button>
        </p>


      </div>
    </div>
    
    <div id="viewport-drawer-layout" class="panel p-1 is-1 viewport-drawer" style="display: none;">
      <div class="panel-block p-0 pb-4">
        <div class="column p-0 is-flex-direction-column">
          <div class="column pb-0 is-12">
            <label class="label is-size-7 has-text-weight-semibold px-auto">Layout</label>
          </div>
          <div class="column pb-0 is-12">
            <div class="content p-0 mb-2 is-small">
              <p>
                This panel allows computing new coordinates to nodes of the graph.
              </p>
            </div>
            <div class="select is-small">
              <select id="select-layout-algo" onchange="layoutAlgoChange(event)">
                <option disabled selected>Select Layout Algorithm</option>
                <option>Force Directed Radial</option>
                <option>Vertical</option>
                <option>Horizontal</option>
                <option>Preset</option>
                <option>Geo Positioning</option>
              </select>
            </div>

          </div>
        </div>
      </div>

      <force-directed-drawer class="panel-block layout-algo p-0" id="viewport-drawer-force-directed" style="display: none;">
        <div class="column my-auto is-11">
          <div class="panel-content">
            <div class="columns py-auto">
              <div class="column is-5">
                <label class="label is-size-7 has-text-right px-auto">Link Lenght</label>
              </div>
              <div class="column pb-1 is-5">
                <input id="force-directed-slider-link-lenght" class="slider" step="1" min="1" max="1000" type="range"
                  style="width: 130px;">
              </div>
            </div>
            <div class="columns">
              <div class="column is-5">
                <label class="label is-size-7 has-text-right px-auto">Node Gap</label>
              </div>
              <div class="column is-5">
                <input id="force-directed-slider-node-gap" class="slider" step="1" min="1" max="10" type="range"
                  style="width: 130px;">
              </div>
            </div>
          </div>
        </div>
      </force-directed-drawer>
      <force-directed-button class="panel-block layout-algo p-0 pb-4" id="viewport-drawer-force-directed-reset-start"
        style="display: none;">
        <div class="column p-0 is-flex-direction-column">
          <div class="column p-0 is-12 is-flex is-justify-content-flex-end">
            <div class="buttons">
              <button href="#" onclick="viewportDrawerLayoutForceDirected(event)"
                class="button is-link is-outlined is-small">Enable</button>
            </div>
          </div>
        </div>
      </force-directed-button>

      <force-directed-radial-drawer class="panel-block layout-algo" id="viewport-drawer-force-directed-radial" style="display: none;">
        <div class="panel-content is-flex is-flex-direction-column is-align-items-center is-fullwidth px-3">
          <div class="columns is-vcentered is-mobile is-multiline is-fullwidth" style="max-width: 100%;">
            <div class="column is-5 has-text-right">
              <label class="label is-size-7 mb-0">Link Length</label>
            </div>
            <div class="column is-7">
              <input id="force-directed-radial-slider-link-lenght" class="slider is-fullwidth" step="1" min="1" max="500" type="range">
            </div>
          </div>
          <div class="columns is-vcentered is-mobile is-multiline is-fullwidth" style="max-width: 100%;">
            <div class="column is-5 has-text-right">
              <label class="label is-size-7 mb-0">Node Gap</label>
            </div>
            <div class="column is-7">
              <input id="force-directed-radial-slider-node-gap" class="slider is-fullwidth" step="1" min="1" max="500" type="range">
            </div>
          </div>
        </div>
      </force-directed-radial-drawer>


      <force-directed-radial-button class="panel-block layout-algo py-0" id="viewport-drawer-force-directed-radial-reset-start" style="display: none;">
        <div class="panel-content is-flex is-flex-direction-column is-align-items-end is-fullwidth px-3">
          <div class="column is-12 is-flex is-justify-content-flex-end">
            <div class="buttons">
              <button href="#" onclick="viewportDrawerLayoutForceDirectedRadial(event)"
                class="button is-link is-outlined is-small">Enable</button>
            </div>
          </div>
        </div>
      </force-directed-radial-button>

      <dc-vertical-drawer class="panel-block layout-algo" id="viewport-drawer-dc-vertical" style="display: none;">
        <div class="panel-content is-flex is-flex-direction-column is-align-items-center is-fullwidth px-3">
          <div class="columns is-vcentered is-mobile is-multiline is-fullwidth" style="max-width: 100%;">
            <div class="column is-5 has-text-right">
              <label class="label is-size-7 mb-0">Node v-Gap</label>
            </div>
            <div class="column is-7">
              <input id="vertical-layout-slider-node-v-gap" class="slider is-fullwidth" step="1" min="1" max="10" type="range">
            </div>
          </div>
          <div class="columns is-vcentered is-mobile is-multiline is-fullwidth" style="max-width: 100%;">
            <div class="column is-5 has-text-right">
              <label class="label is-size-7 mb-0">Group v-Gap</label>
            </div>
            <div class="column is-7">
              <input id="vertical-layout-slider-group-v-gap" class="slider is-fullwidth" step="1" min="1" max="100" type="range">
            </div>
          </div>
        </div>
      </dc-vertical-drawer>
      <dc-vertical-button class="panel-block layout-algo py-0" id="viewport-drawer-dc-vertical-reset-start" style="display: none;">
        <div class="panel-content is-flex is-flex-direction-column is-align-items-end is-fullwidth px-3">
          <div class="column is-12 is-flex is-justify-content-flex-end">
            <div class="buttons">
              <button href="#" onclick="viewportDrawerLayoutVertical(event)"
                class="button is-link is-outlined is-small">Enable</button>
            </div>
          </div>
        </div>
      </dc-vertical-button>

      <dc-horizontal-drawer class="panel-block layout-algo" id="viewport-drawer-dc-horizontal" style="display: none;">
        <div class="panel-content is-flex is-flex-direction-column is-align-items-center is-fullwidth px-3">
          <div class="columns is-vcentered is-mobile is-multiline is-fullwidth" style="max-width: 100%;">
            <div class="column is-5 has-text-right">
              <label class="label is-size-7 mb-0">Node h-Gap</label>
            </div>
            <div class="column is-7">
              <input id="horizontal-layout-slider-node-h-gap" class="slider is-fullwidth" step="1" min="1" max="10" type="range">
            </div>
          </div>
          <div class="columns is-vcentered is-mobile is-multiline is-fullwidth" style="max-width: 100%;">
            <div class="column is-5 has-text-right">
              <label class="label is-size-7 mb-0">Group h-Gap</label>
            </div>
            <div class="column is-7">
              <input id="horizontal-layout-slider-group-h-gap" class="slider is-fullwidth" step="1" min="1" max="100" type="range">
            </div>
          </div>
        </div>
      </dc-horizontal-drawer>

      <dc-horizontal-button class="panel-block layout-algo py-0" id="viewport-drawer-dc-horizontal-reset-start" style="display: none;">
        <div class="panel-content is-flex is-flex-direction-column is-align-items-end is-fullwidth px-3">
          <div class="column is-12 is-flex is-justify-content-flex-end">
            <div class="buttons">
              <button href="#" onclick="viewportDrawerLayoutHorizontal(event)"
                class="button is-link is-outlined is-small">Enable</button>
            </div>
          </div>
        </div>
      </dc-horizontal-button>

      <div class="panel-block layout-algo p-0" id="viewport-drawer-geo-map-content-01" style="display: none;">
        <div class="column my-auto is-11">

          <!-- aarafat-gat: vs-code

                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Enable</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <label class="checkbox is-size-7">
                        <input class="checkbox-input" type="checkbox" value="option01">
                        </label>
                      </div>
                    </div>
                  </div>         
          -->

        </div>
      </div>
      <div class="panel-block layout-algo p-0" id="viewport-drawer-geo-map" style="display: none;">
        <div class="column my-auto is-11">
          <div class="panel-content">
            <div class="content p-0 mb-2 is-small">
              <div class="px-0 py-0" style="max-height: 100px; overflow-y: auto;">
                <div class="content is-small pb-2">
                  <p>
                    <strong>Hint:</strong><br>

                    <!-- aarafat-gat: vs-code
                            Check the enable checkbox to activate Geo Positioning layout algorithm.
                            -->
                  </p>
                  <p>
                    Click the <i class="fa-solid fa-hand"></i> <strong>Pan</strong> icon to navigate the map,
                    or the <i class="fa-solid fa-arrow-pointer"></i> <strong>Edit</strong> icon to interact
                    with nodes and edges. Both icons are located in the viewport buttons.
                  </p>

                  <!-- aarafat-tag: vs-code
                          <p>
                            Note that Pan and Edit modes are mutually exclusive, and Edit mode is active by default. 
                          </p>	
                          <p>
                            To switch to a different layout, first turn off the Geo Positioning layout by uncheck the enable checkbox.  
                          </p>	
                  -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>


    <div id="viewport-drawer-topology-overview" class="panel p-1 is-1 viewport-drawer" style="display: none; ">
      <div class="panel-block p-0 pb-2">
        <div class="column p-0 is-flex-direction-column">
          <div class="column pb-0 is-12">
            <label class="label is-size-7 has-text-weight-semibold px-auto">Topology Overview</label>
          </div>
          <div class="column pb-0 is-12">
            <div class="content p-0 mb-2 is-small">
              <p>
                This panel allows to search node in the topology.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div class="panel-block layout-algo p-0" id="viewport-drawer-topology-overview-content" style="display: block;">
        <div class="column my-auto is-11">
          <div class="panel-content">
            <div class="columns py-auto">
              <div class="column">
                <div class="control has-icons-left">
                  <input class="input is-small" type="text" id="viewport-drawer-topology-overview-content-edit"
                    placeholder="Search for nodes ..." />
                  <span class="icon is-flex is-align-self-auto pl-2" style="display: block; height: 25px; width: 20px;">
                    <i class="fas fa-search" aria-hidden="true"></i>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="panel-content">
            <div class="columns py-auto">
              <div class="column">
                <button class="button is-link is-outlined is-small" onclick="viewportNodeFindEvent()">Search
                  Node</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>


    <div id="viewport-drawer-capture-sceenshoot" class="panel p-1 is-1 viewport-drawer" style="display: none; ">
      <div class="panel-block p-0 pb-2">
        <div class="column p-0 is-flex-direction-column">
          <div class="column pb-0 is-12">
            <label class="label is-size-7 has-text-weight-semibold px-auto">Capture Screenshot</label>
          </div>
          <div class="column pb-0 is-12">
            <div class="content p-0 mb-2 is-small">
              <p>
                This panel allows to capture the topology screenshoot.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div id="viewport-drawer-capture-sceenshoot-content" class="panel-block layout-algo p-0" style="display: none;">
        <div class="column my-auto is-11">
          <div class="panel-content">
            <div class="columns py-auto">
              <div class="column is-5">
                <label class="label is-size-7 has-text-right px-auto">PNG</label>
              </div>
              <div class="column pb-1 is-5">
                <label class="checkbox is-size-7">
                  <input class="checkbox-input" type="checkbox" value="option01">
                </label>
              </div>
            </div>
            <div class="columns">
              <div class="column is-5">
                <label class="label is-size-7 has-text-right px-auto">Draw.IO</label>
              </div>
              <div class="column is-5">
                <label class="checkbox is-size-7">
                  <input class="checkbox-input" type="checkbox" value="option02">
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel-block layout-algo p-0 pb-2" id="viewport-drawer-capture-sceenshoot-button"
        style="display: block;">
        <div class="column p-0 is-flex-direction-column">
          <div class="column is-12 is-flex is-justify-content-flex-end">
            <div class="buttons">
              <button href="#" onclick="viewportDrawerCaptureFunc(event)"
                class="button is-link is-outlined is-small">Capture</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="viewport-drawer-clab-editor" class="panel p-1 is-1 viewport-drawer" style="display: none; ">
      <div class="panel-block p-0 pb-2">
        <div class="column p-0 is-flex-direction-column">
          <div class="column pb-0 is-12">
            <label class="label is-size-7 has-text-weight-semibold px-auto">Containerlab Editor</label>
          </div>
          <div class="column pb-0 is-12">
            <div class="content p-0 mb-2 is-small">
              <p>
                This panel allows to enable Containerlab Editor.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div id="viewport-drawer-clab-editor-content-01" class="panel-block  layout-algo p-0" style="display: none;">
        <div class="column my-auto is-11">
          <div class="panel-content">
            <div class="columns py-auto">
              <div class="column is-5">
                <label class="label is-size-7 has-text-right px-auto">Enable</label>
              </div>
              <div class="column pb-1 is-5">
                <label class="checkbox is-size-7">
                  <input class="checkbox-input" type="checkbox" value="option01">
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="viewport-drawer-clab-editor-content-02" class="panel-block layout-algo p-0" style="display: none;">
        <div class="column pb-0 is-12">
          <div class="content p-0 mb-2 is-small">
            <div class="px-0 py-0" style="max-height: 125px; overflow-y: auto;">
              <div class="content is-small pb-2">
                <p>
                  <strong>Hint:</strong><br>
                  (Shift + Click) on the viewport to add a node, or on the source-node and then click the target-node to
                  create a link.
                </p>
                <p>
                  (Alt + Click) on a node to delete the node and its reference edges, or on a link to delete the link.
                </p>
                <p>
                  Drag an orphan node onto a group node to include it as part of the group.
                </p>
                <p>
                  Control + Click on a child node within a group to make it an orphan node.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel is-link" id="panel-clab-editor" style="display: none;">
      <p class="panel-heading is-size-7">Containerlab YAML Editor</p>
      <div class="panel-tabContainer">
        <div class="panel-block p-0">
          <div class="column px-0">
            <div class="column my-auto">
              <div class="panel-content">
                <div class="field">
                  <div class="control">
                    <input type="file" id="panel-clab-editor-file-input" class="file-input">
                    <button class="button is-link is-outlined is-small" id="panel-clab-editor-copy-button" ;
                      onclick="clabEditorCopyYamlContent(event);">Copy to Clipboard</button>
                    <button class="button is-link is-outlined is-small" id="panel-clab-editor-close-button" ;
                      onclick="closePanelContainerlabEditor(event)">Close</button>
                  </div>
                </div>
                <div id="panel-clab-editor-text-area" style="width:100%; height:600px;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Node Properties Panel with Improved Semantic Markup & Responsive Design -->
    <section class="panel panel-overlay is-link" id="panel-node" aria-labelledby="node-panel-heading"
      style="display: none;">
      <header class="panel-heading is-size-7" id="node-panel-heading">
        Node Properties
      </header>
      <div class="panel-tabContainer">
        <div class="panel-block p-0">
          <div class="column px-0">
            <!-- Grouping the content into responsive columns -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Node Name</label></div>
                  <div class="column is-8 p-1 pl-3">
                    <label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-name">node-name-placeholder</label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions Dropdown (as an example, kept within its own block) -->
            <div class="column is-full-mobile is-half-tablet my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1">
                    <!-- Using an empty label if needed for alignment -->
                    <label class="label is-size-7 has-text-right has-text-weight-medium px-auto"></label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <div class="dropdown is-hoverable">
                      <div class="dropdown-trigger">
                        <button class="button label has-text-weight-normal is-small py-0" aria-haspopup="true"
                          aria-controls="dropdown-menu">
                          <span>Actions</span>
                          <span class="icon is-small">
                            <i class="fas fa-angle-down" aria-hidden="true"></i>
                          </span>
                        </button>
                      </div>
                      <div class="dropdown-menu" id="panel-node-action-dropdown-menu" role="menu">
                        <div class="dropdown-content">
                          <a onclick="nodeActionConnectToSSH(event);"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="panel-node-action-ssh-web-based">Connect to SSH
                          </a>
                          <a onclick="nodeActionAttachShell(event);"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="panel-node-action-ssh-web-based">Attach Shell
                          </a>
                          <a onclick="nodeActionViewLogs(event);"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="panel-node-action-ssh-web-based">View Logs
                          </a>
                          <a onclick="nodeActionRemoveFromParent(event);"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="panel-node-action-ssh-web-based">Release From Group
                          </a>

                          <!--   aarafat-tag: vs-code

                                  <a onclick="sshCliCommandCopy(event);" class="dropdown-item label has-text-weight-normal is-small py-0" id="panel-node-action-ssh-copy-cli-command">SSH - Copy to Clipboard</a>
                                  <hr class="dropdown-divider" />
                                  <a onclick="backupRestoreNodeConfig(event);" class="dropdown-item label has-text-weight-normal is-small py-0"> Backup-Restore Config </a>
                                  <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0"> Reboot </a>
                          -->
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="panel-block p-0">
          <div class="column px-0">
            <!-- Kind -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Kind</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-kind">node-kind-placeholder</label></div>
                </div>
              </div>
            </div>
            <!-- Image -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Image</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-image">node-image-placeholder</label></div>
                </div>
              </div>
            </div>
            <!-- State -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">State</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-state">node-state-placeholder</label></div>
                </div>
              </div>
            </div>
            <!-- Management IPv4 -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Management IPv4</label>
                  </div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-mgmtipv4">node-mgmtipv4-placeholder</label></div>
                </div>
              </div>
            </div>
            <!-- Management IPv6 -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Management IPv6</label>
                  </div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-mgmtipv6">node-mgmtipv6-placeholder</label></div>
                </div>
              </div>
            </div>
            <!-- FQDN -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">FQDN</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-fqdn">node-fqdn-placeholder</label></div>
                </div>
              </div>
            </div>
            <!-- Group -->
            <!-- <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Group</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-group">node-group-placeholder</label></div>
                </div>
              </div>
            </div> -->
            <!-- TopoViewer Role -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Icon</label>
                  </div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-topoviewerrole">node-topoviewerrole-placeholder</label></div>
                </div>
              </div>
            </div>
          </div> <!-- End .columns -->
        </div> <!-- End .panel-block -->
      </div> <!-- End .panel-tabContainer -->
    </section>



    <!-- Node Parent Properties Editor Panel with Improved Semantic Markup & Responsive Design -->
    <section class="panel panel-overlay is-link" id="panel-node-editor-parent" aria-labelledby="node-panel-heading"
      style="display: none;">
      <header class="panel-heading is-size-7" id="node-panel-heading">
        Group Properties
      </header>
      <div class="panel-tabContainer">
        <div class="panel-block p-0">
          <div class="column px-0">
            <!-- Group Id -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Id</label>
                  </div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-editor-parent-graph-group-id">group-id-placeholder</label>
                  </div>
                </div>
              </div>
            </div>
          </div> <!-- End .columns -->
        </div> <!-- End .panel-block -->

        <div class="panel-block p-0">
          <div class="column px-0">

            <!-- Label Position -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline">
                  <div class="column is-4 p-1">
                    <label class="label is-size-7 has-text-right has-text-weight-medium px-auto">
                      Label Position
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <!-- Dropdown Markup -->
                    <div class="dropdown" id="panel-node-editor-parent-label-dropdown">
                      <div class="dropdown-trigger">
                        <button class="button is-size-7 is-fullwidth" aria-haspopup="true"
                          aria-controls="panel-node-editor-parent-label-dropdown-menu"
                          onclick="window.topoViewerEditorEngine.groupManager.panelNodeEditorParentToggleDropdown()"
                          <span id="panel-node-editor-parent-label-dropdown-button-text">Select Position</span>
                          <span class="icon is-small">
                            <i class="fas fa-angle-down" aria-hidden="true"></i>
                          </span>
                        </button>
                      </div>
                      <div class="dropdown-menu is-fullwidth" id="panel-node-editor-parent-label-dropdown-menu"
                        role="menu">
                        <div class="dropdown-content" style="max-height: 5rem; overflow-y: auto;">
                          <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0">top-center</a>
                          <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0">top-left</a>
                          <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0">top-right</a>
                          <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0">bottom-center</a>
                          <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0">bottom-left</a>
                          <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0">bottom-right</a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Graph Group -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Graph Group</label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-editor-parent-graph-group">
                    </input>
                  </div>
                </div>
              </div>
            </div>
            <!-- Graph Level -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Graph Level</label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-node-editor-parent-graph-level">
                    </input>
                  </div>
                </div>
              </div>
            </div>


          </div> <!-- End .columns -->
        </div> <!-- End .panel-block -->

        <div class="panel-block p-0">
          <div class="column px-0">
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">

                  <!-- 
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label class="label is-size-7 has-text-right has-text-weight-medium"></label>
                  </div>
                  
                  
                  <div class="column is-8 p-1 pl-3">
                    <div class="field is-grouped is-grouped-right">
                      <div class="control">
                        <input type="file" id="panel-clab-editor-file-input" class="file-input">
                        <button class="button is-link is-outlined is-small" id="panel-node-editor-parent-delete-button"
                          onclick="window.topoViewerEditorEngine.groupManager.nodeParentRemoval(window.topoViewerEditorEngine.cy)">Remove 
                        </button>
                        <button class="button is-link is-outlined is-small" id="panel-node-editor-parent-close-button"
                          onclick="viewportButtonsAddGroup.nodeParentPropertiesUpdateClose()">Close
                        </button>
                        <button class="button is-link is-outlined is-small"
                          onclick="window.topoViewerEditorEngine.groupManager.nodeParentPropertiesUpdate(window.topoViewerEditorEngine.cy)">Update 
                        </button>
                      </div>
                    </div>
                  </div>
                  -->

                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label class="label is-size-7 has-text-right has-text-weight-medium"></label>
                  </div>
                  <div class="column is-8 p-1">
                    <div class="field is-grouped is-grouped-right p-0 pr-5">
                      <div class="control">
                        <input type="file" id="panel-clab-editor-file-input" class="file-input" aria-label="File input">
                      </div>
                      <div class="control">
                        <button type="button" class="button is-link is-outlined is-small" id="panel-node-editor-parent-close-update-button"
                          onclick="window.topoViewerEditorEngine.groupManager.nodeParentPropertiesUpdate(window.topoViewerEditorEngine.cy)"> 
                          Save
                        </button>
                      </div>

                     
                      <div class="control">
                        <button type="button" class="button is-link is-outlined is-small" id="panel-node-editor-parent-remove-button"
                          onclick="window.topoViewerEditorEngine.groupManager.nodeParentRemoval(window.topoViewerEditorEngine.cy)">
                          Delete
                        </button>
                      </div>
                     
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div> <!-- End .columns -->
        </div> <!-- End .panel-block -->
      </div> <!-- End .panel-tabContainer -->
    </section>


    <!-- node Properties Editor Panel with Improved Semantic Markup & Responsive Design -->
    <section class="panel panel-overlay is-link" id="panel-node-editor" aria-labelledby="node-editor-heading" style="display: none;">
      <header class="panel-heading is-size-7" id="node-editor-heading">
        Node Properties Editor
      </header>
      <form class="panel-tabContainer" novalidate>
        <div class="panel-block p-0">
          <div class="column px-0">
            <!-- Id (read-only) -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-editor-id" class="label is-size-7 has-text-right has-text-weight-medium">
                      Id
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <output id="panel-node-editor-id"
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal"></output>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-block p-0">
          <div class="column px-0">

            <!-- Node Name -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-editor-name" class="label is-size-7 has-text-right has-text-weight-medium">
                      Node Name
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input type="text" id="panel-node-editor-name"
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal" />
                  </div>
                </div>
              </div>
            </div>


            <!-- Kind Dropdown -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-kind-dropdown" class="label is-size-7 has-text-right has-text-weight-medium">
                      Kind
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <div class="dropdown is-hoverable" id="panel-node-kind-dropdown">
                      <div class="dropdown-trigger">
                        <button class="button is-size-7" type="button" aria-haspopup="true"
                          aria-controls="dropdown-menu">
                          <span>Select Kind</span>
                          <span class="icon is-small">
                            <i class="fas fa-angle-down" aria-hidden="true"></i>
                          </span>
                        </button>
                      </div>
                      <div class="dropdown-menu" id="dropdown-menu" role="menu">
                        <div class="dropdown-content" id="panel-node-kind-dropdown-content">
                          <!-- Dropdown items go here -->
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Image -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-editor-image" class="label is-size-7 has-text-right has-text-weight-medium">
                      Image
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input type="text" id="panel-node-editor-image"
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Type Dropdown -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-type-dropdown" class="label is-size-7 has-text-right has-text-weight-medium">
                      Type
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <div class="dropdown is-hoverable" id="panel-node-type-dropdown">
                      <div class="dropdown-trigger">
                        <button class="button is-size-7" type="button" aria-haspopup="true" aria-controls="dropdown-menu">
                          <span>Select Type</span>
                          <span class="icon is-small">
                            <i class="fas fa-angle-down" aria-hidden="true"></i>
                          </span>
                        </button>
                      </div>
                      <div class="dropdown-menu" id="dropdown-menu" role="menu">
                        <div class="dropdown-content" id="panel-node-type-dropdown-content">
                          <!-- Dropdown items go here -->
                        </div>
                      </div>
                    </div>
                    <input type="text" id="panel-node-editor-type-input" class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal" style="display:none;" />
                  </div>
                </div>
              </div>
            </div>

            <!-- TopoViewer Role or Icons Dropdown -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-topoviewerrole-dropdown"
                      class="label is-size-7 has-text-right has-text-weight-medium">
                      Icons
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <div class="dropdown is-hoverable" id="panel-node-topoviewerrole-dropdown">
                      <div class="dropdown-trigger">
                        <button class="button is-size-7" type="button" aria-haspopup="true"
                          aria-controls="dropdown-menu-topoviewerrole">
                          <span>Select Icons</span>
                          <span class="icon is-small">
                            <i class="fas fa-angle-down" aria-hidden="true"></i>
                          </span>
                        </button>
                      </div>
                      <div class="dropdown-menu" id="dropdown-menu-topoviewerrole" role="menu">
                        <div class="dropdown-content" id="panel-node-topoviewerrole-dropdown-content">
                          <!-- Dropdown items go here -->
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Group -->
            <!--
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-node-editor-group" class="label is-size-7 has-text-right has-text-weight-medium">
                      Group
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input type="text" id="panel-node-editor-group"
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal" />
                  </div>
                </div>
              </div>
            </div>
            -->
          </div>
        </div>

        <div class="panel-block p-0">
          <div class="column px-0">

            <!-- File Input and Action Buttons -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <!-- Empty label for alignment -->
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label class="label is-size-7 has-text-right has-text-weight-medium"></label>
                  </div>
                  <div class="column is-8 p-1">
                    <div class="field is-grouped is-grouped-right p-0 pr-5">
                      <div class="control">
                        <input type="file" id="panel-clab-editor-file-input" class="file-input" aria-label="File input">
                      </div>
                      <div class="control">
                        <button type="button" class="button is-link is-outlined is-small" id="panel-node-editor-save-button">
                          Save
                        </button>
                      </div>
                      <!--
                      <div class="control">
                        <button type="button" class="button is-link is-outlined is-small" id="panel-node-editor-close-button">
                          Close
                        </button>
                      </div>
                      -->
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </form>
    </section>

    <!-- link Properties Editor Panel with Improved Semantic Markup & Responsive Design -->
    <section class="panel panel-overlay is-link" id="panel-link-editor" aria-labelledby="link-editor-heading" style="display: none;">
      <header class="panel-heading is-size-7" id="link-editor-heading">
        Link Properties Editor
      </header>
      <form class="panel-tabContainer" novalidate>
        <div class="panel-block p-0">
          <div class="column px-0">
            <!-- Id (read-only) -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-link-editor-id" class="label is-size-7 has-text-right has-text-weight-medium">
                      Id
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <output id="panel-link-editor-id"
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal"></output>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-block p-0">
          <div class="column px-0">

            <!-- source Endpoint Label -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-link-editor-source-endpoint"
                      class="label is-size-7 has-text-right has-text-weight-medium">
                      Source Endpoint
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input type="text" id="panel-link-editor-source-endpoint"
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal" />
                  </div>
                </div>
              </div>
            </div>

            <!-- target Endpoint Label -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label for="panel-link-editor-target-endpoint"
                      class="label is-size-7 has-text-right has-text-weight-medium">
                      Target Endpoint
                    </label>
                  </div>
                  <div class="column is-8 p-1 pl-3">
                    <input type="text" id="panel-link-editor-target-endpoint"
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal" />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="panel-block p-0">
          <div class="column px-0">

            <!-- File Input and Action Buttons -->
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <!-- Empty label for alignment -->
                  <div class="column is-full-mobile is-half-tablet is-4 p-1">
                    <label class="label is-size-7 has-text-right has-text-weight-medium"></label>
                  </div>
                  <div class="column is-8 p-1">
                    <div class="field is-grouped is-grouped-right p-0 pr-5">
                      <div class="control">
                        <input type="file" id="panel-clab-editor-file-input" class="file-input" aria-label="File input">
                      </div>
                      <div class="control">
                        <button type="button" class="button is-link is-outlined is-small" id="panel-link-editor-save-button">
                          Save
                        </button>
                      </div>
                       <!--
                      <div class="control">
                        <button type="button" class="button is-link is-outlined is-small" id="panel-link-editor-close-button">
                          Close
                        </button>
                      </div>
                      -->
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </section>

    <!-- About Panel with Improved Semantic Markup & Responsive Design -->
    <aside id="panel-topoviewer-about" class="panel panel-overlay is-link" role="complementary" aria-labelledby="about-heading" style="display: none;">
      <header class="panel-heading is-size-7" id="about-heading">
        About TopoViewer
      </header>

      <div class="panel-block py-2">
        <article class="content is-small px-2" style="max-height: 280px; overflow-y: auto;">
          <section class="mb-4">
            <p>
              TopoViewer is a powerful, interactive network-topology visualization framework that makes it easy to explore
              your infrastructure.
              In this vscode-Containerlab extension, it is customized to provide an intuitive view of your Containerlab
              topologies.
            </p>

            <p><strong>Author</strong></p>
            <p>
              Designed and developed by
              <strong><a href="https://www.linkedin.com/in/asadarafat/" target="_blank" rel="noopener">Asad
                  Arafat</a></strong>
            </p>

            <p><strong>Key Features</p>
            <ul>
              <li>Effortlessly visualize your Containerlab topologies with an intuitive interface.</li>
              <li>Click on nodes and links to explore detailed attributes on demand.</li>
              <li>Full GUI to create and edit Containerlab topology files.</li>
            </ul>

            <p><strong>Getting Started</strong></p>
            <ul>
              <li>Click on nodes and links to explore your network.</li>
              <li>Use the layout feature to fine-tune your topology view.</li>
              <li>Right click on nodes and links to perform action in editor mode.</li>
            </ul>

            <p><strong>Viewer Shortcuts</strong></p>
            <ul>
              <li><strong>Ctrl + Click:</strong> Connect to node via SSH</li>
              <li><strong>Shift + Click:</strong> Create/reassign group</li>
              <li><strong>Alt + Click:</strong> Release node/remove empty group</li>
              <li><strong>Drag + Drop:</strong> Assign node to group</li>
            </ul>

            <p><strong>Editor Shortcuts</strong></p>
            <ul>
              <li><strong>Shift + Click (canvas):</strong> Add node at pointer</li>
              <li><strong>Shift + Click (node):</strong> Begin link creation</li>
              <li><strong>Alt + Click (node):</strong> Delete node</li>
              <li><strong>Alt + Click (link):</strong> Delete link</li>
            </ul>

            <p><strong>Repositories</strong></p>
            <ul>
              <li>
                <strong>VSCode Containerlab extension:</strong>
                <a href="https://github.com/srl-labs/vscode-containerlab/" target="_blank" rel="noopener">
                  github.com/srl-labs/vscode-containerlab
                </a>
              </li>
              <li>
                <strong>Original TopoViewer repo:</strong>
                <a href="https://github.com/asadarafat/topoViewer" target="_blank" rel="noopener">
                  github.com/asadarafat/topoViewer
                </a>
              </li>
            </ul>

            <p><strong>Special Thanks</strong></p>
            <ul>
              <li><strong><a href="https://www.linkedin.com/in/rdodin/" target="_blank" rel="noopener">Roman
                    Dodin</a></strong> – Early-stage guidance</li>
              <li><strong><a href="https://www.linkedin.com/in/siva19susi/" target="_blank" rel="noopener">Siva
                    Sivakumar</a></strong> – Bulma CSS integration</li>
              <li><strong><a href="https://www.linkedin.com/in/gatot-susilo-b073166/" target="_blank" rel="noopener">Gatot
                    Susilo</a></strong> – Komodo2 integration</li>
              <li><strong><a href="https://www.linkedin.com/in/gusman-dharma-putra-1b955117/" target="_blank"
                    rel="noopener">Gusman Dharma Putra</a></strong> – Komodo2 contributions</li>
              <li><strong><a href="https://www.linkedin.com/in/sven-wisotzky-44788333/" target="_blank" rel="noopener">Sven
                    Wisotzky</a></strong> – Full-stack optimizations</li>
              <li><strong><a href="https://linkedin.com/in/florian-schwarz-812a34145" target="_blank" rel="noopener">Florian
                    Schwarz</a></strong> – VSCode plugin integration</li>
              <li><strong><a href="https://linkedin.com/in/kaelem-chandra" target="_blank" rel="noopener">Kaelem
                    Chandra</a></strong> – Plugin maintenance & support</li>
            </ul>
          </section>
        </article>
      </div>
    </aside>

    <!-- Link Properties Panel with Improved Semantic Markup & Responsive Design -->
    <!-- Link Properties Panel with Improved Semantic Markup & Responsive Design -->
    <section class="panel panel-overlay is-link" id="panel-link" style="display: none;">
      <p class="panel-heading is-size-7">Link Properties</p>
      <div class="panel-tabContainer">
        <div class="panel-block p-0">
          <div class="column px-0">
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Link Name</label></div>
                  <div class="column is-8 p-1 pl-3">
                    <label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-name">link-name-placeholder</label>
                  </div>
                </div>
              </div>
            </div>

            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto"></label></div>
                  <div class="column is-8 p-1 pl-3">
                    <div class="dropdown is-hoverable">
                      <div class="dropdown-trigger">
                        <button class="button label has-text-weight-normal is-small py-0" aria-haspopup="true"
                          aria-controls="dropdown-menu">
                          <span>Actions</span>
                          <span class="icon is-small">
                            <i class="fas fa-angle-down" aria-hidden="true"></i>
                          </span>
                        </button>
                      </div>

                      <div class="dropdown-menu" id="panel-link-action-dropdown-menu" role="menu">
                        <div class="dropdown-content" id="panel-link-action-dropdown-menu-dropdown-content">

                          <!-- <a onclick="linkImpairmentClab(event, 'bidirectional');"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="panel-link-action-impairment-B->A">Apply Impairment</a>
                          <hr class="dropdown-divider" /> -->

                          <a onclick="linkWireshark(event, 'edgeSharkInterface', 'source', null);"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="endpoint-a-edgeshark">Capture E.Point-A (Edgeshark)</a>

                          <a class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-a-top"></a>

                          <!-- aarafat-tag: vscode
                                  <a onclick="linkWireshark(event, 'copy', 'source');" class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-a-clipboard">Capture E.Point-A Clipboard</a>
                                  -->

                          <a class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="endpoint-a-bottom"></a>
                          <hr class="dropdown-divider" />
                          <a onclick="linkWireshark(event, 'edgeSharkInterface', 'target');"
                            class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="endpoint-b-edgeshark">Capture E.Point-B (Edgeshark)</a>

                          <a class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-b-top"></a>

                          <!-- aarafat-tag: vscode
                                  <a onclick="linkWireshark(event, 'copy', 'target');" class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-b-clipboard">Capture E.Point-B Clipboard</a>
                                  -->

                          <a class="dropdown-item label has-text-weight-normal is-small py-0"
                            id="endpoint-b-bottom"></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="panel-block p-0" id="panel-link-endpoint-a">
          <div class="column px-0">
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Endpoint-A</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-a-name">link-endpoint-a-name-placeholder</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">MAC address</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-a-mac-address">link-mac-address</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">MTU</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-a-mtu">getting-link-mtu</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Type</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-a-type">getting-link-type</label></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="panel-block p-0" id="panel-link-endpoint-b">
          <div class="column px-0">
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Endpoint-B</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-b-name">link-endpoint-b-name-placeholder</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">MAC address</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-b-mac-address">getting-link-mac-address</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">MTU</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-b-mtu">getting-link-mtu</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Type</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      id="panel-link-endpoint-b-type">getting-link-type</label></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- <panel-block-impairment-a-b class="panel-block p-0" id="panel-block-impairment-a-b">
          <div class="column px-0">
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Impairment</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left has-text-weight-medium px-auto">A >>> B</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Delay (ms)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-a-delay" value="link-delay-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Jitter (ms)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-a-jitter" value="link-jitter-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Rate (kpbs)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-a-rate" value="link-rate-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Loss (%)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-a-loss" value="link-loss-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Corruption (%)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-a-corruption" value="link-corruption-placeholder" /></div>
                </div>
              </div>
            </div>
          </div>
        </panel-block-impairment-a-b>

        <panel-block-impairment-b-a class="panel-block p-0" id="panel-block-impairment-b-a">
          <div class="column px-0">
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Impairment</label></div>
                  <div class="column is-8 p-1 pl-3"><label
                      class="label is-size-7 has-text-left has-text-weight-medium px-auto">B >>> A</label></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Delay (ms)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-b-delay" value="link-delay-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Jitter (ms)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-b-jitter" value="link-jitter-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Rate (kpbs)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-b-rate" value="link-rate-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Loss (%)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-b-loss" value="link-loss-placeholder" /></div>
                </div>
              </div>
            </div>
            <div class="column my-auto is-11">
              <div class="panel-content">
                <div class="columns is-mobile is-multiline py-auto">
                  <div class="column is-4 p-1"><label
                      class="label is-size-7 has-text-right has-text-weight-medium px-auto">Corruption (%)</label></div>
                  <div class="column is-8 p-1 pl-3"><input
                      class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"
                      type="text" id="panel-link-endpoint-b-corruption" value="link-corruption-placeholder" /></div>
                </div>
              </div>
            </div>
          </div>
        </panel-block-impairment-b-a>  -->

      </div>
    </section>

    <div class="panel panel-overlay is-link" id="panel-backup-restore" style="display: none;">
      <p class="panel-heading is-size-7" id="diff-panel-title">Diff</p>
      <div>
        <div class="columns m-0 p-0" style="height: 100%; width: 100%;">
          <div class="column is-one-fifth" id="file-browser">
            <div class="columns m-0 p-0" style="height: 100%; width: 100%;">
              <div class="column p-0 is-flex is-justify-content-left is-flex-direction-column">
                <h3 class="label is-size-7" id="file-browser-title">Config Files</h3>
                <div class="panel is-link is-size-7" id="panel-file-browser">
                  <div>
                    <p class="control has-icons-left">
                      <input class="input is-link is-size-7" type="text" placeholder="Search" id="search-input">
                      <span class="icon is-flex is-align-self-auto pl-2"
                        style="display: block; height: 25px; width: 20px;">
                        <svg class="svg-inline--fa fa-magnifying-glass" aria-hidden="true" focusable="false"
                          data-prefix="fas" data-icon="magnifying-glass" role="img" xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 512 512" data-fa-i2svg="">
                          <path fill="currentColor"
                            d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z">
                          </path>
                        </svg>
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="column p-0 is-two-third" style="height: 100%; width: 100%;">
            <div class="columns m-0 p-0" style="height: 100%; width: 100%;">
              <div class="column is-flex is-justify-content-left is-flex-direction-column">
                <div class="label is-size-7">Saved Config</div>
                <p class="control is-flex">
                  <button class="button is-small is-link is-outlined" id="buttonRestoreConfig">
                    <span>Restore</span>
                    <span class="icon is-small">
                      <i class="fa-solid fa-arrow-right"></i>
                    </span>
                  </button>
                </p>
              </div>
              <div class="column is-flex is-justify-content-left is-flex-direction-column">
                <div class="label label is-size-7">Running Config</div>
                <p class="buttons is-flex">
                  <button class="button is-small is-link is-outlined" id="buttonBackupConfig">
                    <span>Backup</span>
                    <span class="icon is-small">
                      <i class="fa-solid fa-arrow-left"></i>
                    </span>
                  </button>
                </p>
              </div>
            </div>
            <div class="column pt-0" id="editor-container"></div>
          </div>
        </div>
        <div id="loading-spinner" class="loading" style="display: none;">
          <button id="loading-spinner-global-button" class="button is-loading is-large is-dark">
            <span class="icon is-small">
              <svg class="svg-inline--fa fa-italic" aria-hidden="true" focusable="false" data-prefix="fas"
                data-icon="italic" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" data-fa-i2svg="">
                <path fill="currentColor"
                  d="M128 64c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H293.3L160 416h64c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H90.7L224 96H160c-17.7 0-32-14.3-32-32z">
                </path>
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
    <div class="panel is-link" id="panel-log-messages" style="display: none;">
      <p class="panel-heading is-size-7">Log Messages</p>
      <div class="panel-block py-2 px-2">
        <textarea class="textarea is-small is-outlined is-expanded" id="notificationTextarea" rows="12"></textarea>
      </div>
      <div class="panel-block py-2 px-2">
        <div class="is-justify-content-space-between">
          <button id="copyToClipboardButton" class="button is-smallest-element">Copy to Clipboard</button>
          <button id="panel-log-messages-close-button" class="button is-smallest-element">Close</button>
        </div>
      </div>
    </div>
    <div class="panel panel-overlay is-link" id="panel-topoviewer-helper" style="display: none;">
      <p class="panel-heading is-size-7">TopoViewer Helper App</p>
      <div id="tabContainer-" class="panel-tabContainer">
        <div id="panelBlock-tabContainer-" class="panel-block py-2">
          <div id="panelBlock-tabContainer--divPanelBlock" class="column p-0">
            <div class="px-2" style="max-height: 280px; overflow-y: auto;">
              <div class="content is-small pb-2" id="panel-topoviewer-helper-content">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel panel-overlay is-link" id="panel-topoviewer-about-old" style="display: none;">
      <p class="panel-heading is-size-7">TopoViewer About</p>
      <div id="tabContainer-" class="panel-tabContainer">
        <div id="panelBlock-tabContainer-" class="panel-block py-2">
          <div id="panelBlock-tabContainer--divPanelBlock" class="column p-0">
            <div class="px-2" style="max-height: 280px; overflow-y: auto;">
              <div class="content is-small pb-2" id="panel-topoviewer-about-content">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal" id="wiresharkModal">
      <div class="modal-background"></div>
      <div class="modal-content">
        <div class="box">
          <h2 class="title is-4">Launch Wireshark</h2>
          <div class="field">
            <label class="label" for="subInterfaceId">Sub Interface ID:</label>
            <div class="control">
              <input class="input" type="text" id="subInterfaceId" placeholder="Enter Sub Interface ID">
            </div>
          </div>
          <div class="field">
            <label class="label" for="containerName">Container Name:</label>
            <div class="control">
              <div class="select">
                <select id="containerName"></select>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="label" for="networkInterface">Network Interface:</label>
            <div class="control">
              <div class="select">
                <select id="networkInterface"></select>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="label">URL Preview:</label>
            <div id="urlPreview" class="content has-background-light p-2"></div>
          </div>
          <div class="buttons">
            <button class="button is-success" id="launchButton">Launch</button>
            <button class="button is-danger" id="customCloseModal">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <script src="${jsUri}/library/leaflet.js"></script>

    <script src="${jsUri}/library/highlight-11-9-0.min.js"></script>
    <!-- 3) Quill (v2 beta) -->
    <script src="${jsUri}/library/quill-2-0-3.js"></script>

    <!-- <script src="${jsUri}/library/lodash.min.js?ver=1"></script> -->

    <!-- <script src="${jsUri}/library/cola.min.js?ver=1"></script>
    <script src="${jsUri}/library/popper.min.js?ver=1"></script>
    <script src="${jsUri}/library/tippy.min.js?ver=1"></script>
    <script src="${jsUri}/library/cytoscape.min.js?ver=1"></script>
    <script src="${jsUri}/library/jquery-3.6.0.min.js"></script> -->
    <script src="${jsUri}/library/cytoscape-leaflet.min.js?ver=1"></script>
    <!-- <script src="${jsUri}/library/cytoscape-cola.min.js?ver=1"></script>
    <script src="${jsUri}/library/cytoscape-popper.min.js?ver=1"></script>
    <script src="${jsUri}/library/cytoscape-grid-guide.min.js?ver=1"></script>
    <script src="${jsUri}/library/cytoscape-edgehandles.min.js?ver=1"></script>
    <script src="${jsUri}/library/cytoscape-expand-collapse.min.js"></script> -->
    <!-- cytoscape svg-->
    <script src="${jsUri}/library/cytoscape-svg.min.js"></script>

    <!-- custom textbox with rich text editor -->

    <script src="${jsUri}/library/quill-2-0-3.js"></script>
    <script src="${jsUri}/managerCyTextBox.js?ver=1"></script>

    <!-- <script src="${jsUri}/library/socket.io.min.js?ver=1"></script> -->

    <script src="${jsUri}/library/core@1.5.0.js"></script>
    <script src="${jsUri}/library/dom@1.5.3.js"></script>

    <script src="${jsUri}/library/js-yaml.min.js?ver=1"></script>
    <script src="${jsUri}/library/monaco-loader.js?ver=1"></script>

    <!-- Inject jsUri as a global variable -->
    <script> window.jsUrl = "${jsUri}"; </script>
    <!-- Inject schemaUri as a global variable -->
    <script> window.schemaUrl = "${schemaUri}"; </script>

    <!-- Inject imagesUri as a global variable -->
    <script> window.imagesUrl = "${imagesUri}"; </script>

    <!-- Inject JSON dataCytoMarshall.json as a global variable -->
    <script> window.jsonFileUrlDataCytoMarshall = "${jsonFileUrlDataCytoMarshall}"; </script>

    <!-- Inject JSON environment.json as a global variable -->
    <script> window.jsonFileUrlDataEnvironment = "${jsonFileUrlDataEnvironment}"; </script>

    <!-- Inject isVscodeDeployment boolean as a global variable -->
    <script> window.isVscodeDeployment = "${isVscodeDeployment}"; </script>

    <!-- Inject allowedHostname string as a global variable -->
    <script> window.allowedHostname = "${allowedHostname}"; </script>

    <!-- Inject useSocket boolean as a global variable -->
    <script> window.useSocket = "${useSocket}"; </script>

    <!-- Inject socketAssignedPort number as a global variable -->
    <script> window.socketAssignedPort = "${socketAssignedPort}"; </script>

    <script src="${jsOutDir}/topoViewerEditorEngine.js?ver=1"></script>

    <!-- 
    <script src="${jsUri}/common.js?ver=1"></script>
    <script src="${jsUri}/dev.js?ver=1"></script> -->

    <!-- clabTreeProviderData provided to below script using socket.io -->
    <!-- <script src="${jsUri}/managerOnChangeFramework.js?ver=1"></script>
    <script src="${jsUri}/managerSocketDataEnrichment.js?ver=1"></script> -->

    <!-- <script src="${jsUri}/managerVscodeWebview.js?ver=1"></script>
    <script src="${jsUri}/managerSvg.js?ver=1"></script>
    <script src="${jsUri}/managerLayoutAlgo.js?ver=1"></script>
    <script src="${jsUri}/managerGroupManagement.js?ver=1"></script> -->

    <!--
    <script src="${jsUri}/backupRestore.js?ver=1"></script>
    <script src="${jsUri}/managerClabEditor.js?ver=1"></script> -->

  </div>
</body>

</html>
`;
}