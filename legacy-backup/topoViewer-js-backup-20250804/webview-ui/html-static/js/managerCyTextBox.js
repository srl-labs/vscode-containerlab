// We'll keep references to all textbox overlays here if needed:
const textboxOverlays = {};

/**
* Create a new Cytoscape node with topoViewerRole="textbox"
* and link it to a custom overlay with Quill.
*
* @param {Object} cy The Cytoscape instance
* @param {string} nodeId A unique ID for this new node (e.g. "textbox123")
* @param {Object} position The (x, y) coordinates for the new node
* @returns {Object} The newly created node
*/
// export function createTextboxNode(cy, nodeId, position = { x: 150, y: 100 }) {
function createTextboxNode(cy, nodeId, position = { x: 20, y: 20 }) {

  // 1) Add the node to Cytoscape
  const newNode = cy.add({
    group: "nodes",
    data: {
      id: nodeId,
      topoViewerRole: "textbox",
      label: "",
      textBoxData: "",
    },
    position,
  });

  // 2) Create the overlay for this node
  const overlay = createTextboxOverlay(cy, newNode);

  // 3) Optionally store the overlay reference
  textboxOverlays[nodeId] = overlay;

  return newNode;
}



/**
* Build the HTML overlay + Quill editor for a "textbox" node.
* Has logic for resizing, editing, saving/canceling, etc.
*
* @param {Object} cy The Cytoscape instance
* @param {Object} node The Cytoscape node for which we want an overlay
* @returns {{section: HTMLElement, quill: Quill}} Some references
*/
function createTextboxOverlay(cy, node) {
  // Make a unique DOM container with the node's ID
  const section = document.createElement("div");
  section.className = "html-label columns is-mobile is-multiline";
  section.id = `overlay-${node.id()}`; // e.g. "overlay-textbox123"

  // Unique IDs for child elements
  const toolbarId = `toolbar-${node.id()}`;
  const editorId = `editor-${node.id()}`;
  const editBtnId = `editBtn-${node.id()}`;
  const saveBtnId = `saveBtn-${node.id()}`;
  const cancelBtnId = `cancelBtn-${node.id()}`;
  const closeBtnId = `closeBtnId-${node.id()}`;


  // Insert the HTML (Quill toolbar, resize handles, etc.)
  section.innerHTML = `
  <!-- Buttons row -->
  <div>
    <p class="control">
      <button id="${closeBtnId}" class="button is-text is-small is-pulled-left is-flex" style="display: block; pointer-events: auto;">
        <span class="icon is-small">
          <i class="fa-solid fa-circle-xmark"></i>
        </span>
      </button>
      <button id="${editBtnId}" class="button is-text is-small is-pulled-right is-flex" style="display: block; pointer-events: auto;">
        <span class="icon is-small is-flex">
          <i class="fa-solid fa-pen"></i>
        </span>
      </button>
    </p>
  </div>

  <!-- Quill toolbar container -->
  <div id="${toolbarId}" style="display: none; pointer-events: auto; margin: 0.5rem;">

    <span class="ql-formats">
      <select class="ql-font"></select>
      <select class="ql-size"></select>
    </span>
    <span class="ql-formats">
      <button class="ql-bold"></button>
      <button class="ql-italic"></button>
      <button class="ql-underline"></button>
      <button class="ql-strike"></button>
    </span>
    <span class="ql-formats">
      <select class="ql-color"></select>
      <select class="ql-background"></select>
    </span>
    <span class="ql-formats">
      <button class="ql-script" value="sub"></button>
      <button class="ql-script" value="super"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-blockquote"></button>
      <button class="ql-code-block"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-list" value="ordered"></button>
      <button class="ql-list" value="bullet"></button>
      <button class="ql-indent" value="-1"></button>
      <button class="ql-indent" value="+1"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-direction" value="rtl"></button>
      <select class="ql-align"></select>
    </span>
    <span class="ql-formats">
      <button class="ql-link"></button>
      <button class="ql-image"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-clean"></button>
    </span>
  </div>

  <!-- Editor area -->
  <div id="${editorId}" style="
        flex: 1; overflow: auto;
        border: 1px solid #ccc;
        border-radius: 4px;
        margin: 0.5rem;">

  </div>

  <!-- Resize handles -->
  <div class="resize-handle bottom-right"></div>
  <div class="resize-handle bottom-center"></div>
  <div class="resize-handle right-center"></div>

  <!-- Buttons row -->
  <div class="is-flex" style="margin: 0.5rem;">
    <button id="${saveBtnId}" class="button button-quill is-outlined is-white is-small mr-2" style="display: none;">Save</button>
    <button id="${cancelBtnId}" class="button button-quill is-outlined is-white is-small mr-2" style="display: none;">Cancel</button>
  </div>
  `;

  // Append to document body
  document.body.appendChild(section);

  // Initialize Quill
  const quill = new Quill(`#${editorId}`, {
    theme: "snow",
    syntax: true,
    modules: {
      toolbar: `#${toolbarId}`,
      syntax: {
        highlight: (text) => hljs.highlightAuto(text).value,
      },
    },
    readOnly: true,
  });

  // Set some initial content (optional)
  const Delta = Quill.import("delta");
  quill.setContents(
    new Delta()
      .insert(' Every success has its network! ',
        {
          'color': '#ffffff',
          'size': 'huge',
          'background': '#6b24b2'
        })
      .insert('\n')

  );

  // Grab references
  const toolbarEl = section.querySelector(`#${toolbarId}`);
  const editBtn = section.querySelector(`#${editBtnId}`);
  const saveBtn = section.querySelector(`#${saveBtnId}`);
  const cancelBtn = section.querySelector(`#${cancelBtnId}`);
  const resizeHandles = section.querySelectorAll(".resize-handle");
  const editorDiv = section.querySelector(`#${editorId}`);




  function updateOverlay() {
    const pos = node.renderedPosition();
    const cyRect = cy.container().getBoundingClientRect();
    const overlayWidth = section.offsetWidth;
    const overlayHeight = section.offsetHeight;


    // Expand the node so it is visually behind the overlay
    const paddingInPx = 10;
    const zoomLevel = cy.zoom() * 0.5;
    node.style({
      width: (overlayWidth + paddingInPx) * (zoomLevel * 0.10),
      height: (overlayHeight + paddingInPx) * (zoomLevel * 0.10),
      // width: (overlayWidth + paddingInPx),
      // height: (overlayHeight + paddingInPx)
    });

    // Center overlay on the node
    section.style.left = `${cyRect.left + pos.x - overlayWidth / 2}px`;
    section.style.top = `${cyRect.top + pos.y - overlayHeight / 2}px`;


    // Adjust editor height
    const toolbarHeight = toolbarEl.offsetHeight;
    editorDiv.style.height = `calc(100% - ${toolbarHeight + 60}px)`;

    section.style.transformOrigin = "center center";
    section.style.transform = `scale(${zoomLevel * 0.5})`;
  }



  let updateTimeout = null;
  function debounceUpdateOverlay() {
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateOverlay, 0);
  }

  // Reposition on relevant events
  cy.on("zoom pan resize", debounceUpdateOverlay);

  // updateOverlayZoom()

  node.on("position", debounceUpdateOverlay);
  window.addEventListener("resize", debounceUpdateOverlay);

  updateOverlay(); // initial

  // Resizing logic
  let isResizing = false;
  let initialX, initialY, initialWidth, initialHeight;

  resizeHandles.forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      isResizing = true;
      initialX = e.clientX;
      initialY = e.clientY;
      initialWidth = section.offsetWidth;
      initialHeight = section.offsetHeight;
      document.body.classList.add("no-select");
      e.stopPropagation();
    });
  });

  document.addEventListener(
    "mousemove",
    throttle((e) => {
      if (isResizing) {
        const deltaX = e.clientX - initialX;
        const deltaY = e.clientY - initialY;
        const newWidth = initialWidth + deltaX;
        const newHeight = initialHeight + deltaY;
        if (newWidth >= 40 && newHeight >= 40) {
          section.style.width = `${newWidth}px`;
          section.style.height = `${newHeight}px`;
          updateOverlay();
        }
      }
    }, 16)
  );

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      document.body.classList.remove("no-select");
      isResizing = false;
    }
  });

  function throttle(func, limit) {
    let lastFunc, lastRan;
    return function () {
      const context = this;
      const args = arguments;
      if (!lastRan) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(() => {
          if (Date.now() - lastRan >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - lastRan));
      }
    };
  }

  // Edit/Save/Cancel
  let savedDelta = null;
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    quill.enable(true);

    saveBtn.classList.add("is-flex"); // flex is added to align middle
    cancelBtn.classList.add("is-flex");

    toolbarEl.style.display = "block";
    editBtn.style.display = "none";
    saveBtn.style.display = "block";
    cancelBtn.style.display = "block";

    quill.focus();
    updateOverlay();
    section.style.pointerEvents = "auto";
  });

  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    savedDelta = quill.getContents();
    node.data("textBoxData", savedDelta);
    quill.enable(false);
    toolbarEl.style.display = "none";
    editBtn.style.display = "block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";

    saveBtn.classList.remove("is-flex"); // flex is removed as is conflict with quill custom style pointer-events: auto
    cancelBtn.classList.remove("is-flex"); // flex is removed as is conflict with quill custom style pointer-events: auto

    updateOverlay();
    section.style.pointerEvents = "none";
  });

  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Revert to last saved
    const revertDelta = node.data("textBoxData") || quill.getContents();
    quill.setContents(revertDelta);
    quill.enable(false);
    toolbarEl.style.display = "none";
    editBtn.style.display = "block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";

    saveBtn.classList.remove("is-flex"); // flex is removed as is conflict with quill custom style pointer-events: auto
    cancelBtn.classList.remove("is-flex"); // flex is removed as is conflict with quill custom style pointer-events: auto

    updateOverlay();
    section.style.pointerEvents = "none";
  });

  // Pass clicks to Cytoscape
  section.addEventListener("mousedown", (e) => {
    if (!e.target.closest(`#${toolbarId}`) && !e.target.closest(".resize-handle")) {
      const cyEvent = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      cy.container().dispatchEvent(cyEvent);
    }
  });

  section.addEventListener("click", (e) => {
    if (!e.target.closest(`#${toolbarId}`) && !e.target.closest(".resize-handle")) {
      const cyEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      cy.container().dispatchEvent(cyEvent);
    }
  });

  return { section, quill };
}