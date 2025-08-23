// managerBulkLink.ts
// Handles Bulk Link panel interactions (ported from inline HTML script)

export class ManagerBulkLink {
  static init(): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bindEvents());
    } else {
      this.bindEvents();
    }
  }

  private static bindEvents(): void {
    const cancelBtn = document.getElementById('bulk-link-cancel');
    const applyBtn = document.getElementById('bulk-link-apply');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const panel = document.getElementById('panel-bulk-link') as HTMLElement | null;
        if (panel) panel.style.display = 'none';
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const sourceEl = document.getElementById('source-regex') as HTMLInputElement | null;
        const targetEl = document.getElementById('target-regex') as HTMLInputElement | null;
        const source = sourceEl?.value?.trim();
        const target = targetEl?.value?.trim();
        if (source && target) {
          await (window as any).topologyWebviewController.bulkCreateLinks(source, target);
          const panel = document.getElementById('panel-bulk-link') as HTMLElement | null;
          if (panel) panel.style.display = 'none';
        }
      });
    }
  }
}

export default ManagerBulkLink;

