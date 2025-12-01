// file: managerTabNavigation.ts

// CSS classes
const CLASS_PANEL_TAB_BUTTON = "panel-tab-button" as const;
const CLASS_TAB_CONTENT = "tab-content" as const;
const CLASS_TAB_ACTIVE = "tab-active" as const;
const CLASS_HIDDEN = "hidden" as const;

// Element IDs
const ID_TAB_VIEWPORT = "node-editor-tab-viewport" as const;
const ID_TAB_STRIP = "node-editor-tab-strip" as const;
const ID_TAB_SCROLL_LEFT = "node-editor-tab-scroll-left" as const;
const ID_TAB_SCROLL_RIGHT = "node-editor-tab-scroll-right" as const;

/**
 * TabNavigationManager handles tab navigation in the node editor:
 * - Tab switching
 * - Tab scroll arrows for overflow
 * - Ensuring active tab visibility
 */
export class TabNavigationManager {
  private panel: HTMLElement | null = null;

  public setPanel(panel: HTMLElement | null): void {
    this.panel = panel;
  }

  /**
   * Setup tab switching functionality
   */
  public setupTabSwitching(): void {
    const tabButtons = this.panel?.querySelectorAll(`.${CLASS_PANEL_TAB_BUTTON}`);
    const tabContents = this.panel?.querySelectorAll(`.${CLASS_TAB_CONTENT}`);

    tabButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        const targetTab = button.getAttribute("data-tab");

        // Update active tab button
        tabButtons.forEach((btn) => btn.classList.remove(CLASS_TAB_ACTIVE));
        button.classList.add(CLASS_TAB_ACTIVE);

        // Show corresponding tab content
        tabContents?.forEach((content) => {
          if (content.id === `tab-${targetTab}`) {
            content.classList.remove(CLASS_HIDDEN);
          } else {
            content.classList.add(CLASS_HIDDEN);
          }
        });

        // Keep tab visible and update scroll buttons
        this.ensureActiveTabVisible();
        this.updateTabScrollButtons();
      });
    });
  }

  /**
   * Setup scrollable tab bar with arrow buttons
   */
  public setupTabScrollArrows(): void {
    const viewport = document.getElementById(ID_TAB_VIEWPORT) as HTMLElement | null;
    const leftBtn = document.getElementById(ID_TAB_SCROLL_LEFT) as HTMLButtonElement | null;
    const rightBtn = document.getElementById(ID_TAB_SCROLL_RIGHT) as HTMLButtonElement | null;

    if (!viewport || !leftBtn || !rightBtn) return;

    const scrollByAmount = (dir: -1 | 1) => {
      const delta = Math.max(120, Math.floor(viewport.clientWidth * 0.6));
      viewport.scrollBy({ left: dir * delta, behavior: "smooth" });
    };

    leftBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scrollByAmount(-1);
    });
    rightBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scrollByAmount(1);
    });

    viewport.addEventListener("scroll", () => this.updateTabScrollButtons(), { passive: true });
    window.addEventListener("resize", () => this.updateTabScrollButtons());

    // Initial state
    setTimeout(() => {
      this.ensureActiveTabVisible();
      this.updateTabScrollButtons();
    }, 0);
  }

  /**
   * Ensure the active tab button is visible inside the viewport
   */
  public ensureActiveTabVisible(): void {
    const viewport = document.getElementById(ID_TAB_VIEWPORT) as HTMLElement | null;
    const strip = document.getElementById(ID_TAB_STRIP) as HTMLElement | null;
    if (!viewport || !strip) return;
    const active = strip.querySelector(
      `.${CLASS_PANEL_TAB_BUTTON}.${CLASS_TAB_ACTIVE}`
    ) as HTMLElement | null;
    if (!active) return;
    const vpLeft = viewport.scrollLeft;
    const vpRight = vpLeft + viewport.clientWidth;
    const elLeft = active.offsetLeft;
    const elRight = elLeft + active.offsetWidth;
    if (elLeft < vpLeft) {
      viewport.scrollTo({ left: Math.max(0, elLeft - 16), behavior: "smooth" });
    } else if (elRight > vpRight) {
      viewport.scrollTo({ left: elRight - viewport.clientWidth + 16, behavior: "smooth" });
    }
  }

  /**
   * Show/hide left/right scroll buttons based on overflow
   */
  public updateTabScrollButtons(): void {
    const viewport = document.getElementById(ID_TAB_VIEWPORT) as HTMLElement | null;
    const leftBtn = document.getElementById(ID_TAB_SCROLL_LEFT) as HTMLButtonElement | null;
    const rightBtn = document.getElementById(ID_TAB_SCROLL_RIGHT) as HTMLButtonElement | null;
    if (!viewport || !leftBtn || !rightBtn) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const current = viewport.scrollLeft;
    const canLeft = current > 1;
    const canRight = current < maxScroll - 1;
    leftBtn.classList.toggle("hidden", !canLeft);
    rightBtn.classList.toggle("hidden", !canRight);
  }

  /**
   * Switch to a specific tab by name
   */
  public switchToTab(tabName: string): void {
    const tabButton = this.panel?.querySelector(`[data-tab="${tabName}"]`) as HTMLElement;
    tabButton?.click();
  }
}
