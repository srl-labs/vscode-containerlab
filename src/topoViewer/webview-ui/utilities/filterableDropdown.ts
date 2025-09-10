import { log } from '../../logging/logger';

export function createFilterableDropdown(
  containerId: string,
  options: string[],
  currentValue: string,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
  placeholder: string = 'Type to filter...',
  allowFreeText: boolean = false
): void {
  const container = document.getElementById(containerId);
  if (!container) {
    log.error(`Container ${containerId} not found`);
    return;
  }

  // Clear existing content
  container.innerHTML = '';

  // Create the filterable dropdown structure
  const dropdownHtml = `
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

  container.innerHTML = dropdownHtml;

  const filterInput = document.getElementById(`${containerId}-filter-input`) as HTMLInputElement;
  const dropdownMenu = document.getElementById(`${containerId}-dropdown-menu`);
  const dropdownArrow = document.getElementById(`${containerId}-dropdown-arrow`);

  if (!filterInput || !dropdownMenu) {
    log.error(`Failed to create filterable dropdown elements for ${containerId}`);
    return;
  }

  // Track last valid selected value
  let lastSelected = currentValue ?? '';

  // Utility to find the best match for a free-typed value
  const findBestMatch = (val: string): string | null => {
    const v = (val || '').trim().toLowerCase();
    if (!v) return null;
    const exact = options.find(o => o.toLowerCase() === v);
    if (exact) return exact;
    const starts = options.find(o => o.toLowerCase().startsWith(v));
    if (starts) return starts;
    const include = options.find(o => o.toLowerCase().includes(v));
    if (include) return include;
    return null;
  };

  // Commit current input: map to a valid option or revert to lastSelected
  const commitCurrentInput = () => {
    const typed = filterInput.value;
    if (allowFreeText) {
      // Accept the user's typed value verbatim
      if (typed !== lastSelected) {
        lastSelected = typed;
        onSelect(typed);
      }
      // Keep typed value as-is
      return;
    }
    const match = findBestMatch(typed);
    if (match) {
      if (match !== lastSelected) {
        lastSelected = match;
        filterInput.value = match;
        onSelect(match);
      } else {
        filterInput.value = match;
      }
    } else {
      filterInput.value = lastSelected;
    }
  };

  // Function to populate dropdown options
  const populateOptions = (filteredOptions: string[]) => {
    const CLASS_HIGHLIGHT = 'bg-highlight';
    const COLOR_ACTIVE_BG = 'var(--vscode-list-activeSelectionBackground)';
    const COLOR_TRANSPARENT = 'transparent';
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

      // Add hover effect
      optionElement.addEventListener('mouseenter', () => {
        optionElement.classList.add(CLASS_HIGHLIGHT);
        (optionElement as HTMLElement).style.backgroundColor = COLOR_ACTIVE_BG;
      });
      optionElement.addEventListener('mouseleave', () => {
        optionElement.classList.remove(CLASS_HIGHLIGHT);
        (optionElement as HTMLElement).style.backgroundColor = COLOR_TRANSPARENT;
      });

      optionElement.addEventListener('click', (e) => {
        e.preventDefault();
        filterInput.value = option;
        dropdownMenu.classList.add('hidden');
        lastSelected = option;
        onSelect(option);
      });

      dropdownMenu.appendChild(optionElement);
    });
  };

  // Initial population
  populateOptions(options);

  // Portal behavior: render dropdown menu as a fixed overlay at the input's position
  const originalParent = dropdownMenu.parentElement as HTMLElement;
  const showDropdown = () => {
    const rect = (filterInput.getBoundingClientRect?.() || { left: 0, right: 0, bottom: 0, width: originalParent.clientWidth }) as DOMRect;
    // Move to body and position
    if (dropdownMenu.parentElement !== document.body) {
      document.body.appendChild(dropdownMenu);
    }
    dropdownMenu.style.position = 'fixed';
    dropdownMenu.style.left = `${rect.left}px`;
    dropdownMenu.style.top = `${rect.bottom}px`;
    dropdownMenu.style.width = `${rect.width || originalParent.clientWidth}px`;
    dropdownMenu.classList.remove('hidden');
  };
  const hideDropdown = () => {
    dropdownMenu.classList.add('hidden');
    // Return to original DOM to avoid leaks
    if (dropdownMenu.parentElement === document.body) {
      originalParent.appendChild(dropdownMenu);
      dropdownMenu.style.position = '';
      dropdownMenu.style.left = '';
      dropdownMenu.style.top = '';
      dropdownMenu.style.width = '';
    }
  };

  // Filter functionality
  filterInput.addEventListener('input', () => {
    const filterValue = filterInput.value.toLowerCase();
    const filteredOptions = options.filter(option =>
      option.toLowerCase().includes(filterValue)
    );
    populateOptions(filteredOptions);
    if (!dropdownMenu.classList.contains('hidden')) {
      // Keep open and ensure position is correct
      showDropdown();
    }
  });

  // Show/hide dropdown on focus
  filterInput.addEventListener('focus', () => {
    showDropdown();
  });

  // On blur (leaving the input), commit to a valid option
  filterInput.addEventListener('blur', () => {
    // Defer to allow option click handlers to run first
    setTimeout(() => commitCurrentInput(), 0);
  });

  // Handle arrow click to toggle dropdown
  if (dropdownArrow) {
    dropdownArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdownMenu.classList.contains('hidden')) {
        showDropdown();
        filterInput.focus();
      } else {
        hideDropdown();
      }
    });
  }

  // Close dropdown when clicking outside (not the input or the menu)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!container.contains(target) && !dropdownMenu.contains(target)) {
      setTimeout(() => {
        // Ensure input maps to a valid option before hiding
        commitCurrentInput();
        hideDropdown();
      }, 0);
    }
  });

  // Prevent closing when clicking inside the dropdown menu
  dropdownMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  // Prevent scroll events from bubbling to parent panels (avoid extra scrollbar motion)
  dropdownMenu.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: true });
  dropdownMenu.addEventListener('touchmove', (e) => {
    e.stopPropagation();
  }, { passive: true });

  // Reposition/close dropdown on window resize/scroll for safety
  const onWindowResize = () => hideDropdown();
  window.addEventListener('resize', onWindowResize);

  // Cleanup listeners if container is removed later
  const observer = new MutationObserver(() => {
    if (!document.body.contains(filterInput)) {
      window.removeEventListener('resize', onWindowResize);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Keyboard navigation
  filterInput.addEventListener('keydown', (e) => {
    const items = dropdownMenu.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>;
    let currentIndex = -1;
    const CLASS_HIGHLIGHT = 'bg-highlight';
    const COLOR_ACTIVE_BG = 'var(--vscode-list-activeSelectionBackground)';
    const COLOR_TRANSPARENT = 'transparent';
    items.forEach((item, index) => {
      if (item.classList.contains(CLASS_HIGHLIGHT)) currentIndex = index;
    });

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex >= 0) {
          items[currentIndex].classList.remove(CLASS_HIGHLIGHT);
          (items[currentIndex] as HTMLElement).style.backgroundColor = COLOR_TRANSPARENT;
        }
        currentIndex = Math.min(currentIndex + 1, items.length - 1);
        if (items[currentIndex]) {
          items[currentIndex].classList.add(CLASS_HIGHLIGHT);
          (items[currentIndex] as HTMLElement).style.backgroundColor = COLOR_ACTIVE_BG;
          items[currentIndex].scrollIntoView({ block: 'nearest' });
        }
        dropdownMenu.classList.remove('hidden');
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex >= 0) {
          items[currentIndex].classList.remove(CLASS_HIGHLIGHT);
          (items[currentIndex] as HTMLElement).style.backgroundColor = COLOR_TRANSPARENT;
        }
        currentIndex = Math.max(currentIndex - 1, 0);
        if (items[currentIndex]) {
          items[currentIndex].classList.add(CLASS_HIGHLIGHT);
          (items[currentIndex] as HTMLElement).style.backgroundColor = COLOR_ACTIVE_BG;
          items[currentIndex].scrollIntoView({ block: 'nearest' });
        }
        dropdownMenu.classList.remove('hidden');
        break;
      case 'Enter':
        e.preventDefault();
        if (currentIndex >= 0 && items[currentIndex]) {
          const selectedValue = items[currentIndex].textContent || '';
          filterInput.value = selectedValue;
          dropdownMenu.classList.add('hidden');
          lastSelected = selectedValue;
          onSelect(selectedValue);
        } else if (allowFreeText) {
          // Accept free text on Enter
          const typed = filterInput.value;
          lastSelected = typed;
          onSelect(typed);
        }
        break;
      case 'Escape':
        dropdownMenu.classList.add('hidden');
        break;
    }
  });
}
