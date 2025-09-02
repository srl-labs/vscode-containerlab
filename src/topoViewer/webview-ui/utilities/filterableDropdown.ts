import { log } from '../../logging/logger';

export function createFilterableDropdown(
  containerId: string,
  options: string[],
  currentValue: string,
  onSelect: (selected: string) => void, // eslint-disable-line no-unused-vars
  placeholder: string = 'Type to filter...'
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
    const match = findBestMatch(typed);
    if (match) {
      if (match !== lastSelected) {
        lastSelected = match;
        filterInput.value = match;
        onSelect(match);
      } else {
        // Align casing even if same logical value
        filterInput.value = match;
      }
    } else {
      // Revert to last selected valid value
      filterInput.value = lastSelected;
    }
  };

  // Function to populate dropdown options
  const populateOptions = (filteredOptions: string[]) => {
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
        optionElement.classList.add('bg-highlight');
        (optionElement as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
      });
      optionElement.addEventListener('mouseleave', () => {
        optionElement.classList.remove('bg-highlight');
        (optionElement as HTMLElement).style.backgroundColor = 'transparent';
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

  // Filter functionality
  filterInput.addEventListener('input', () => {
    const filterValue = filterInput.value.toLowerCase();
    const filteredOptions = options.filter(option =>
      option.toLowerCase().includes(filterValue)
    );
    populateOptions(filteredOptions);

    if (!dropdownMenu.classList.contains('hidden')) {
      dropdownMenu.classList.remove('hidden');
    }
  });

  // Show/hide dropdown on focus
  filterInput.addEventListener('focus', () => {
    dropdownMenu.classList.remove('hidden');
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
        dropdownMenu.classList.remove('hidden');
        filterInput.focus();
      } else {
        dropdownMenu.classList.add('hidden');
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!container.contains(target)) {
      setTimeout(() => {
        // Ensure input maps to a valid option before hiding
        commitCurrentInput();
        dropdownMenu.classList.add('hidden');
      }, 0);
    }
  });

  // Prevent closing when clicking inside the dropdown menu
  dropdownMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Keyboard navigation
  filterInput.addEventListener('keydown', (e) => {
    const items = dropdownMenu.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>;
    let currentIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains('bg-highlight')) currentIndex = index;
    });

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex >= 0) {
          items[currentIndex].classList.remove('bg-highlight');
          (items[currentIndex] as HTMLElement).style.backgroundColor = 'transparent';
        }
        currentIndex = Math.min(currentIndex + 1, items.length - 1);
        if (items[currentIndex]) {
          items[currentIndex].classList.add('bg-highlight');
          (items[currentIndex] as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
          items[currentIndex].scrollIntoView({ block: 'nearest' });
        }
        dropdownMenu.classList.remove('hidden');
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex >= 0) {
          items[currentIndex].classList.remove('bg-highlight');
          (items[currentIndex] as HTMLElement).style.backgroundColor = 'transparent';
        }
        currentIndex = Math.max(currentIndex - 1, 0);
        if (items[currentIndex]) {
          items[currentIndex].classList.add('bg-highlight');
          (items[currentIndex] as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
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
        }
        break;
      case 'Escape':
        dropdownMenu.classList.add('hidden');
        break;
    }
  });
}
