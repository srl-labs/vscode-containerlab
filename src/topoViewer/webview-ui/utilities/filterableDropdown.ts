import { log } from '../../logging/logger';

interface DropdownState {
  lastSelected: string;
}

const CLASS_HIGHLIGHT = 'bg-highlight';
const COLOR_ACTIVE_BG = 'var(--vscode-list-activeSelectionBackground)';
const COLOR_TRANSPARENT = 'transparent';

function buildDropdownHtml(containerId: string, placeholder: string, currentValue: string): string {
  return `
    <div class="filterable-dropdown relative w-full">
      <div class="filterable-dropdown-input-container relative">
        <input
          type="text"
          class="input-field w-full pr-8"
          placeholder="${placeholder}"
          value="${currentValue ?? ''}"
          id="${containerId}-filter-input"
        />
        <i class="fas fa-angle-down absolute right-2 top-1/2 transform -translate-y-1/2 cursor-pointer"
           id="${containerId}-dropdown-arrow"></i>
      </div>
      <div class="filterable-dropdown-menu hidden absolute top-full left-0 mt-1 w-full max-h-40 overflow-y-auto z-[60] bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded shadow-lg"
           id="${containerId}-dropdown-menu">
      </div>
    </div>
  `;
}

function findBestMatch(val: string, options: string[]): string | null {
  const v = (val || '').trim().toLowerCase();
  if (!v) return null;
  const exact = options.find(o => o.toLowerCase() === v);
  if (exact) return exact;
  const starts = options.find(o => o.toLowerCase().startsWith(v));
  if (starts) return starts;
  const include = options.find(o => o.toLowerCase().includes(v));
  if (include) return include;
  return null;
}

function commitInput(
  filterInput: HTMLInputElement,
  options: string[],
  allowFreeText: boolean,
  state: DropdownState,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
): void {
  const typed = filterInput.value;
  if (allowFreeText) {
    if (typed !== state.lastSelected) {
      state.lastSelected = typed;
      onSelect(typed);
    }
    return;
  }
  const match = findBestMatch(typed, options);
  if (match) {
    if (match !== state.lastSelected) {
      state.lastSelected = match;
      filterInput.value = match;
      onSelect(match);
    } else {
      filterInput.value = match;
    }
  } else {
    filterInput.value = state.lastSelected;
  }
}

function populateOptions(
  dropdownMenu: HTMLElement,
  filterInput: HTMLInputElement,
  filteredOptions: string[],
  state: DropdownState,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
): void {
  dropdownMenu.innerHTML = '';

  filteredOptions.forEach(option => {
    const optionElement = document.createElement('a');
    optionElement.classList.add('dropdown-item', 'block', 'px-3', 'py-2', 'cursor-pointer');
    optionElement.style.color = 'var(--vscode-dropdown-foreground)';
    optionElement.style.backgroundColor = 'transparent';
    optionElement.style.fontSize = 'var(--vscode-font-size)';
    optionElement.style.fontFamily = 'var(--vscode-font-family)';
    optionElement.textContent = option;
    optionElement.href = '#';

    optionElement.addEventListener('mouseenter', () => {
      optionElement.classList.add(CLASS_HIGHLIGHT);
      optionElement.style.backgroundColor = COLOR_ACTIVE_BG;
    });
    optionElement.addEventListener('mouseleave', () => {
      optionElement.classList.remove(CLASS_HIGHLIGHT);
      optionElement.style.backgroundColor = COLOR_TRANSPARENT;
    });

    optionElement.addEventListener('click', e => {
      e.preventDefault();
      filterInput.value = option;
      dropdownMenu.classList.add('hidden');
      state.lastSelected = option;
      onSelect(option);
    });

    dropdownMenu.appendChild(optionElement);
  });
}

function showDropdown(
  filterInput: HTMLInputElement,
  dropdownMenu: HTMLElement,
  originalParent: HTMLElement,
): void {
  const rect = (filterInput.getBoundingClientRect?.() || {
    left: 0,
    right: 0,
    bottom: 0,
    width: originalParent.clientWidth,
  }) as DOMRect;
  if (dropdownMenu.parentElement !== document.body) {
    document.body.appendChild(dropdownMenu);
  }
  dropdownMenu.style.position = 'fixed';
  dropdownMenu.style.left = `${rect.left}px`;
  dropdownMenu.style.top = `${rect.bottom}px`;
  dropdownMenu.style.width = `${rect.width || originalParent.clientWidth}px`;
  dropdownMenu.classList.remove('hidden');
}

function hideDropdown(dropdownMenu: HTMLElement, originalParent: HTMLElement): void {
  dropdownMenu.classList.add('hidden');
  if (dropdownMenu.parentElement === document.body) {
    originalParent.appendChild(dropdownMenu);
    dropdownMenu.style.position = '';
    dropdownMenu.style.left = '';
    dropdownMenu.style.top = '';
    dropdownMenu.style.width = '';
  }
}

function createFilterInputHandler(
  filterInput: HTMLInputElement,
  dropdownMenu: HTMLElement,
  options: string[],
  state: DropdownState,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
  show: () => void,
): () => void {
  return () => {
    const filterValue = filterInput.value.toLowerCase();
    const filteredOptions = options.filter(option =>
      option.toLowerCase().includes(filterValue),
    );
    populateOptions(dropdownMenu, filterInput, filteredOptions, state, onSelect);
    if (!dropdownMenu.classList.contains('hidden')) {
      show();
    }
  };
}

function createBlurHandler(commit: () => void): () => void {
  return () => setTimeout(commit, 0);
}

function createArrowHandler(
  filterInput: HTMLInputElement,
  dropdownMenu: HTMLElement,
  show: () => void,
  hide: () => void,
): (e: MouseEvent) => void { // eslint-disable-line no-unused-vars
  return e => {
    e.stopPropagation();
    if (dropdownMenu.classList.contains('hidden')) {
      show();
      filterInput.focus();
    } else {
      hide();
    }
  };
}

function attachOutsideClick(
  container: HTMLElement,
  dropdownMenu: HTMLElement,
  commit: () => void,
  hide: () => void,
): void {
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (!container.contains(target) && !dropdownMenu.contains(target)) {
      setTimeout(() => {
        commit();
        hide();
      }, 0);
    }
  });
}

function attachMenuPropagation(dropdownMenu: HTMLElement): void {
  dropdownMenu.addEventListener('click', e => e.stopPropagation());
  dropdownMenu.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  dropdownMenu.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
}

function attachWindowResizeCleanup(
  filterInput: HTMLInputElement,
  hide: () => void,
): void {
  const onWindowResize = () => hide();
  window.addEventListener('resize', onWindowResize);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(filterInput)) {
      window.removeEventListener('resize', onWindowResize);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function getCurrentIndex(items: NodeListOf<HTMLElement>): number {
  let idx = -1;
  items.forEach((item, index) => {
    if (item.classList.contains(CLASS_HIGHLIGHT)) idx = index;
  });
  return idx;
}

function navigate(
  items: NodeListOf<HTMLElement>,
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (currentIndex >= 0) {
    items[currentIndex].classList.remove(CLASS_HIGHLIGHT);
    items[currentIndex].style.backgroundColor = COLOR_TRANSPARENT;
  }
  currentIndex = direction === 1
    ? Math.min(currentIndex + 1, items.length - 1)
    : Math.max(currentIndex - 1, 0);
  if (items[currentIndex]) {
    items[currentIndex].classList.add(CLASS_HIGHLIGHT);
    items[currentIndex].style.backgroundColor = COLOR_ACTIVE_BG;
    items[currentIndex].scrollIntoView({ block: 'nearest' });
  }
  return currentIndex;
}

function commitFromItems(
  items: NodeListOf<HTMLElement>,
  currentIndex: number,
  filterInput: HTMLInputElement,
  dropdownMenu: HTMLElement,
  allowFreeText: boolean,
  state: DropdownState,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
): void {
  if (currentIndex >= 0 && items[currentIndex]) {
    const selectedValue = items[currentIndex].textContent || '';
    filterInput.value = selectedValue;
    dropdownMenu.classList.add('hidden');
    state.lastSelected = selectedValue;
    onSelect(selectedValue);
  } else if (allowFreeText) {
    const typed = filterInput.value;
    state.lastSelected = typed;
    onSelect(typed);
  }
}

function attachKeyboardNavigation(
  filterInput: HTMLInputElement,
  dropdownMenu: HTMLElement,
  allowFreeText: boolean,
  state: DropdownState,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
): void {
  filterInput.addEventListener('keydown', e => {
    const items = dropdownMenu.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>;
    let currentIndex = getCurrentIndex(items);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        navigate(items, currentIndex, 1);
        dropdownMenu.classList.remove('hidden');
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigate(items, currentIndex, -1);
        dropdownMenu.classList.remove('hidden');
        break;
      case 'Enter':
        e.preventDefault();
        commitFromItems(
          items,
          currentIndex,
          filterInput,
          dropdownMenu,
          allowFreeText,
          state,
          onSelect,
        );
        break;
      case 'Escape':
        dropdownMenu.classList.add('hidden');
        break;
    }
  });
}

export function createFilterableDropdown(
  containerId: string,
  options: string[],
  currentValue: string,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
  placeholder: string = 'Type to filter...',
  allowFreeText: boolean = false,
): void {
  const container = document.getElementById(containerId);
  if (!container) {
    log.error(`Container ${containerId} not found`);
    return;
  }

  container.innerHTML = buildDropdownHtml(containerId, placeholder, currentValue);

  const filterInput = document.getElementById(`${containerId}-filter-input`) as HTMLInputElement;
  const dropdownMenu = document.getElementById(`${containerId}-dropdown-menu`) as HTMLElement;
  const dropdownArrow = document.getElementById(`${containerId}-dropdown-arrow`);

  if (!filterInput || !dropdownMenu) {
    log.error(`Failed to create filterable dropdown elements for ${containerId}`);
    return;
  }

  const state: DropdownState = { lastSelected: currentValue ?? '' };
  populateOptions(dropdownMenu, filterInput, options, state, onSelect);

  const originalParent = dropdownMenu.parentElement as HTMLElement;
  const commit = () => commitInput(filterInput, options, allowFreeText, state, onSelect);
  const show = () => showDropdown(filterInput, dropdownMenu, originalParent);
  const hide = () => hideDropdown(dropdownMenu, originalParent);

  filterInput.addEventListener('input', createFilterInputHandler(filterInput, dropdownMenu, options, state, onSelect, show));
  filterInput.addEventListener('focus', show);
  filterInput.addEventListener('blur', createBlurHandler(commit));
  if (dropdownArrow) {
    dropdownArrow.addEventListener('click', createArrowHandler(filterInput, dropdownMenu, show, hide));
  }

  attachOutsideClick(container, dropdownMenu, commit, hide);
  attachMenuPropagation(dropdownMenu);
  attachWindowResizeCleanup(filterInput, hide);
  attachKeyboardNavigation(filterInput, dropdownMenu, allowFreeText, state, onSelect);
}
