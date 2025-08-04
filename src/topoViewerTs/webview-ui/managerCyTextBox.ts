/* eslint-disable no-unused-vars */

// Declarations for global variables provided elsewhere in the webview
declare const Quill: any;
declare const hljs: any;

type Position = { x: number; y: number };
type TextboxOverlay = { section: HTMLElement; quill: any };

// We'll keep references to all textbox overlays here if needed
const textboxOverlays: Record<string, TextboxOverlay> = {};

/**
 * Create a new Cytoscape node with topoViewerRole="textbox"
 * and link it to a custom overlay with Quill.
 *
 * @param cy - The Cytoscape instance
 * @param nodeId - A unique ID for this new node (e.g. "textbox123")
 * @param position - The (x, y) coordinates for the new node
 * @returns The newly created node
 */
export function createTextboxNode(
  cy: any,
  nodeId: string,
  position: Position = { x: 20, y: 20 }
): any {
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

  const overlay = createTextboxOverlay(cy, newNode);
  textboxOverlays[nodeId] = overlay;

  return newNode;
}

/**
 * Build the HTML overlay + Quill editor for a "textbox" node.
 * Has logic for resizing, editing, saving/canceling, etc.
 *
 * @param cy - The Cytoscape instance
 * @param node - The Cytoscape node for which we want an overlay
 * @returns Some references
 */
function createTextboxOverlay(cy: any, node: any): TextboxOverlay {
  const section = document.createElement("div");
  section.className = "html-label columns is-mobile is-multiline";
  section.id = `overlay-${node.id()}`;

  const toolbarId = `toolbar-${node.id()}`;
  const editorId = `editor-${node.id()}`;
  const editBtnId = `editBtn-${node.id()}`;
  const saveBtnId = `saveBtn-${node.id()}`;
  const cancelBtnId = `cancelBtn-${node.id()}`;
  const closeBtnId = `closeBtnId-${node.id()}`;

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

  document.body.appendChild(section);

  const quill = new Quill(`#${editorId}`, {
    theme: "snow",
    syntax: true,
    modules: {
      toolbar: `#${toolbarId}`,
      syntax: {
        highlight: (text: string) => hljs.highlightAuto(text).value,
      },
    },
    readOnly: true,
  });

  const Delta = Quill.import("delta");
  quill.setContents(
    new Delta()
      .insert(" Every success has its network! ", {
        color: "#ffffff",
        size: "huge",
        background: "#6b24b2",
      })
      .insert("\n")
  );

  const toolbarEl = section.querySelector(`#${toolbarId}`) as HTMLElement;
  const editBtn = section.querySelector(`#${editBtnId}`) as HTMLElement;
  const saveBtn = section.querySelector(`#${saveBtnId}`) as HTMLElement;
  const cancelBtn = section.querySelector(`#${cancelBtnId}`) as HTMLElement;
  const resizeHandles = section.querySelectorAll(".resize-handle") as NodeListOf<HTMLElement>;
  const editorDiv = section.querySelector(`#${editorId}`) as HTMLElement;

  function updateOverlay(): void {
    const pos = node.renderedPosition();
    const cyRect = cy.container().getBoundingClientRect();
    const overlayWidth = section.offsetWidth;
    const overlayHeight = section.offsetHeight;

    // Expand the node so it is visually behind the overlay
    const paddingInPx = 10;
    const zoomLevel = cy.zoom() * 0.5;
    node.style({
      width: (overlayWidth + paddingInPx) * (zoomLevel * 0.1),
      height: (overlayHeight + paddingInPx) * (zoomLevel * 0.1),
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

  let updateTimeout: ReturnType<typeof setTimeout> | null = null;
  function debounceUpdateOverlay(): void {
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateOverlay, 0);
  }

  cy.on("zoom pan resize", debounceUpdateOverlay);
  node.on("position", debounceUpdateOverlay);
  window.addEventListener("resize", debounceUpdateOverlay);

  updateOverlay();

  let isResizing = false;
  let initialX = 0;
  let initialY = 0;
  let initialWidth = 0;
  let initialHeight = 0;

  resizeHandles.forEach((handle: HTMLElement) => {
    handle.addEventListener("mousedown", (e: MouseEvent) => {
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
    throttle((e: MouseEvent) => {
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

  function throttle(func: (...args: any[]) => void, limit: number) {
    let lastFunc: ReturnType<typeof setTimeout>;
    let lastRan: number | null = null;
    return function (this: unknown, ...args: any[]) {
      const context = this;
      if (!lastRan) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(() => {
          if (Date.now() - (lastRan as number) >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - (lastRan as number)));
      }
    };
  }

  let savedDelta: any = null;
  editBtn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    quill.enable(true);

    saveBtn.classList.add("is-flex");
    cancelBtn.classList.add("is-flex");

    toolbarEl.style.display = "block";
    editBtn.style.display = "none";
    saveBtn.style.display = "block";
    cancelBtn.style.display = "block";

    quill.focus();
    updateOverlay();
    section.style.pointerEvents = "auto";
  });

  saveBtn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    savedDelta = quill.getContents();
    node.data("textBoxData", savedDelta);
    quill.enable(false);
    toolbarEl.style.display = "none";
    editBtn.style.display = "block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";

    saveBtn.classList.remove("is-flex");
    cancelBtn.classList.remove("is-flex");

    updateOverlay();
    section.style.pointerEvents = "none";
  });

  cancelBtn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    const revertDelta = node.data("textBoxData") || quill.getContents();
    quill.setContents(revertDelta);
    quill.enable(false);
    toolbarEl.style.display = "none";
    editBtn.style.display = "block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";

    saveBtn.classList.remove("is-flex");
    cancelBtn.classList.remove("is-flex");

    updateOverlay();
    section.style.pointerEvents = "none";
  });

  section.addEventListener("mousedown", (e: MouseEvent) => {
    if (
      !(e.target as HTMLElement).closest(`#${toolbarId}`) &&
      !(e.target as HTMLElement).closest(".resize-handle")
    ) {
      const cyEvent = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      cy.container().dispatchEvent(cyEvent);
    }
  });

  section.addEventListener("click", (e: MouseEvent) => {
    if (
      !(e.target as HTMLElement).closest(`#${toolbarId}`) &&
      !(e.target as HTMLElement).closest(".resize-handle")
    ) {
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

