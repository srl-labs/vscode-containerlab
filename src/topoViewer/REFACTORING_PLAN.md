# TopoViewer Refactoring Plan - Step-by-Step Prompts

## Overview
This document contains detailed prompts for refactoring the topoViewer to eliminate duplication between view and edit modes. Each step is designed to be executed independently with clear validation criteria.

---

## Phase 1: Logger Unification

### Step 1.1: Update Edit Backend Logger Imports
**Prompt:**
```
Update all files in src/topoViewer/edit/backend/ that import logger from '../../view/backend/logger' to instead import from '../../common/logger'. 

Files to update:
- src/topoViewer/edit/backend/topoViewerEditorWebUiFacade.ts (line 6)
- src/topoViewer/edit/backend/yamlValidator.ts (line 6)
- src/topoViewer/edit/backend/saveViewport.ts (line 4)

Change from: import { log } from '../../view/backend/logger';
Change to: import { log } from '../../common/logger';

Verify the common logger works correctly with these backend files.
```

### Step 1.2: Analyze Logger Differences
**Prompt:**
```
Compare the two logger implementations:
1. src/topoViewer/view/backend/logger.ts
2. src/topoViewer/common/logger.ts

Determine if they serve different purposes (backend vs webview). If the view/backend/logger is specifically for VS Code OutputChannel and common/logger is for webview postMessage, we may need to keep both but clarify their usage.

Create a unified logging strategy that works for both contexts or document why both are needed.
```

---

## Phase 2: Move TopoViewerAdaptorClab to Common ✅ COMPLETED

### Step 2.1: Create Common Backend Directory ✅
**Prompt:**
```
Create a new directory structure:
src/topoViewer/common/backend/

This will house shared backend utilities used by both view and edit modes.
```

### Step 2.2: Move TopoViewerAdaptorClab ✅
**Prompt:**
```
Move src/topoViewer/view/backend/topoViewerAdaptorClab.ts to src/topoViewer/common/backend/topoViewerAdaptorClab.ts

Update all imports in these files:
1. src/topoViewer/view/backend/topoViewerWebUiFacade.ts (line 6)
   - Change from: './topoViewerAdaptorClab'
   - Change to: '../../common/backend/topoViewerAdaptorClab'

2. src/topoViewer/edit/backend/topoViewerEditorWebUiFacade.ts (line 9)
   - Change from: '../../view/backend/topoViewerAdaptorClab'
   - Change to: '../../common/backend/topoViewerAdaptorClab'

3. src/topoViewer/edit/backend/saveViewport.ts (line 5)
   - Change from: '../../view/backend/topoViewerAdaptorClab'
   - Change to: '../../common/backend/topoViewerAdaptorClab'

Also update any imports within topoViewerAdaptorClab.ts itself to reflect its new location.
```

### Step 2.3: Verify and Test ✅
**Prompt:**
```
After moving TopoViewerAdaptorClab:
1. Run npm run package to ensure no TypeScript errors
2. Test both view and edit modes to ensure they still work
3. Verify that YAML parsing and Cytoscape element generation work in both modes
```

---

## Phase 3: Template Consolidation

### Step 3.1: Analyze Template Differences
**Prompt:**
```
Compare these HTML templates and identify the differences:
1. src/topoViewer/view/webview-ui/html-static/template/vscodeHtmlTemplate.html
2. src/topoViewer/edit/webview-ui/template/vscodeHtmlTemplate.html

Create a list of:
- Common elements that are identical
- View-specific elements
- Edit-specific elements
- Variable placeholders that differ

This analysis will guide the creation of a unified base template.
```

### Step 3.2: Create Base Template
**Prompt:**
```
Create a new base HTML template at:
src/topoViewer/common/template/baseTemplate.html

This template should contain:
1. All common HTML structure
2. Placeholders for mode-specific content using template variables like {{MODE_SPECIFIC_NAVBAR}}
3. Common scripts and styles
4. Flexible injection points for mode-specific functionality

The template should be designed to work with the existing htmlTemplateUtils.ts system.
```

### Step 3.3: Update htmlTemplateUtils.ts
**Prompt:**
```
Enhance src/topoViewer/common/htmlTemplateUtils.ts to:
1. Support the new base template
2. Allow mode-specific partial injection
3. Maintain backward compatibility with existing ViewerTemplateParams and EditorTemplateParams
4. Add a new function that can generate HTML for both modes using the base template

Ensure both generateWebviewHtml functions for view and edit modes can use the new unified approach.
```

---

## Phase 4: Consolidate Navbar Partials

### Step 4.1: Create Common Navbar Base
**Prompt:**
```
Analyze these navbar partials:
1. src/topoViewer/view/webview-ui/html-static/template/partials/navbar-extend.html
2. src/topoViewer/edit/webview-ui/template/partials/navbar-extend.html

Extract common navbar elements into:
src/topoViewer/common/template/partials/navbar-base.html

Keep only mode-specific handlers and buttons in the respective view/edit partials.
```

### Step 4.2: Refactor Navbar Event Handlers
**Prompt:**
```
Create a common navbar event handler system:
1. Create src/topoViewer/common/webview-ui/navbarHandlers.ts
2. Define base navbar functionality that both modes share
3. Allow mode-specific extensions through inheritance or composition
4. Update both view and edit modes to use this common handler

This should eliminate duplicate navbar handling code.
```

---

## Phase 5: Unify Common UI Handlers

### Step 5.1: Extract Zoom Functionality
**Prompt:**
```
The zoom-to-fit functionality exists in:
1. View mode: as a function in src/topoViewer/view/webview-ui/uiHandlers.ts
2. Edit mode: as a class in src/topoViewer/edit/webview-ui/managerZoomToFit.ts

Create a unified zoom manager:
1. Create src/topoViewer/common/webview-ui/managerZoom.ts
2. Implement a consistent zoom manager that both modes can use
3. Update view mode to use the manager instead of inline function
4. Update edit mode to use the common manager
5. Remove the duplicate implementations
```

### Step 5.2: Consolidate Panel Management
**Prompt:**
```
Both modes have panel management code. Create a common panel manager:
1. Create src/topoViewer/common/webview-ui/managerPanels.ts
2. Extract common panel show/hide/toggle logic
3. Support mode-specific panel configurations
4. Update both view and edit modes to use this common manager
```

---

## Phase 6: File Organization Cleanup

### Step 6.1: Remove Unused Files
**Prompt:**
```
After completing the refactoring:
1. Identify any files that are no longer used
2. Remove duplicate implementations that have been replaced
3. Update any remaining cross-boundary imports
4. Ensure no edit files import from view and vice versa (except through common)
```

### Step 6.2: Update Import Paths
**Prompt:**
```
Run a comprehensive check of all import statements:
1. Find all imports that cross view/edit boundaries
2. Update them to use common modules instead
3. Ensure consistent import patterns throughout the codebase
4. Use relative imports within modules, absolute imports for external dependencies
```

---

## Phase 7: Testing and Validation

### Step 7.1: Compile and Lint
**Prompt:**
```
Run the following commands to ensure the refactoring is clean:
1. npm run compile - Ensure no TypeScript errors
2. npm run lint:fix - Fix any linting issues
3. npm test - Run all unit tests
4. npm run package - Ensure the extension builds correctly
```

### Step 7.2: Functional Testing
**Prompt:**
```
Test both view and edit modes thoroughly:

View Mode Tests:
1. Open a deployed lab topology
2. Verify all visualization features work
3. Test node selection and information display
4. Verify SSH and capture functionality
5. Test layout algorithms and grouping

Edit Mode Tests:
1. Create a new topology
2. Add and connect nodes
3. Save the topology
4. Reload and verify changes persist
5. Test validation and error handling
6. Verify node editing and link management

Common Features:
1. SVG export works in both modes
2. Layout algorithms work consistently
3. Zoom and pan work identically
4. Panel management is consistent
```

---

## Phase 8: Documentation

### Step 8.1: Update CLAUDE.md
**Prompt:**
```
Update CLAUDE.md to reflect the new architecture:
1. Document the new common/backend and common/webview-ui structure
2. Explain the separation between common, view, and edit modules
3. Update the architecture overview section
4. Add notes about which functionality belongs where
```

### Step 8.2: Add Code Comments
**Prompt:**
```
Add JSDoc comments to all new common modules explaining:
1. Purpose of the module
2. Which modes use it
3. Any mode-specific behavior
4. Example usage

Focus on:
- src/topoViewer/common/backend/topoViewerAdaptorClab.ts
- New common UI managers
- Updated htmlTemplateUtils.ts
```

---

## Validation Checklist

After each phase, verify:
- [ ] TypeScript compilation succeeds
- [ ] No linting errors
- [ ] Both view and edit modes function correctly
- [ ] No console errors in webview
- [ ] No regression in existing features
- [ ] Import paths are correct and consistent

## Rollback Plan

If any phase causes issues:
1. Git stash or commit current changes
2. Revert to previous working state
3. Analyze what went wrong
4. Adjust the approach and retry

## Notes

- Each phase can be completed independently
- Test thoroughly after each phase before moving to the next
- Keep the original files until the refactoring is validated
- Consider creating a feature branch for this refactoring
- Document any deviations from this plan and why they were necessary