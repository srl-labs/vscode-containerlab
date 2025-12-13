import { getIconDataUriForRole } from '../features/canvas/BaseStyles';

const ATTR_ARIA_DISABLED = 'aria-disabled';
const CLASS_DIMMED = 'opacity-60';
const CLASS_NO_POINTER = 'pointer-events-none';

type NodeIconDeleteHandler = (iconName: string) => void | Promise<void>;

export interface NodeIconOptionRendererOptions {
  onDelete?: NodeIconDeleteHandler;
}

function isCustomIcon(role: string): boolean {
  const customIcons = (window as any)?.customIcons;
  return Boolean(customIcons && typeof customIcons === 'object' && customIcons[role]);
}

export function createNodeIconOptionElement(
  role: string,
  options?: NodeIconOptionRendererOptions
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center justify-between gap-3 py-1 w-full';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'space-between';
  wrapper.style.gap = '0.75rem';
  wrapper.style.padding = '0.25rem 0';
  wrapper.style.width = '100%';

  const infoContainer = document.createElement('div');
  infoContainer.className = 'flex items-center gap-3';
  infoContainer.style.display = 'flex';
  infoContainer.style.alignItems = 'center';
  infoContainer.style.gap = '0.75rem';

  const iconUri = getIconDataUriForRole(role);
  const icon = document.createElement('img');
  icon.alt = `${role} icon`;
  icon.width = 40;
  icon.height = 40;
  icon.style.width = '40px';
  icon.style.height = '40px';
  icon.style.objectFit = 'contain';
  icon.style.borderRadius = '4px';
  if (iconUri) {
    icon.src = iconUri;
  }

  const label = document.createElement('span');
  label.textContent = role;
  label.className = 'text-base capitalize flex-1';
  label.style.flex = '1';

  infoContainer.appendChild(icon);
  infoContainer.appendChild(label);
  wrapper.appendChild(infoContainer);

  const shouldShowDeleteButton = Boolean(isCustomIcon(role) && options?.onDelete);
  if (shouldShowDeleteButton) {
    const deleteButton = document.createElement('span');
    deleteButton.setAttribute('role', 'button');
    deleteButton.tabIndex = 0;
    deleteButton.className = 'btn-icon-hover-clean flex items-center gap-1 text-sm';
    deleteButton.style.color = 'var(--vscode-errorForeground, #f14c4c)';
    deleteButton.style.cursor = 'pointer';
    deleteButton.title = `Delete custom icon "${role}"`;
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';

    const executeDelete = (): void => {
      if (!options?.onDelete || deleteButton.getAttribute(ATTR_ARIA_DISABLED) === 'true') {
        return;
      }
      deleteButton.setAttribute(ATTR_ARIA_DISABLED, 'true');
      deleteButton.classList.add(CLASS_DIMMED, CLASS_NO_POINTER);
      const maybePromise = options.onDelete(role);
      Promise.resolve(maybePromise)
        .catch(() => undefined)
        .finally(() => {
          deleteButton.setAttribute(ATTR_ARIA_DISABLED, 'false');
          deleteButton.classList.remove(CLASS_DIMMED, CLASS_NO_POINTER);
        });
    };

    deleteButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      executeDelete();
    });

    deleteButton.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      executeDelete();
    });

    wrapper.appendChild(deleteButton);
  }

  return wrapper;
}
