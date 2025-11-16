import { getIconDataUriForRole } from '../managerCytoscapeBaseStyles';

export function createNodeIconOptionElement(role: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-3 py-1';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '0.75rem';
  wrapper.style.padding = '0.25rem 0';

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
  label.className = 'text-base capitalize';

  wrapper.appendChild(icon);
  wrapper.appendChild(label);
  return wrapper;
}
