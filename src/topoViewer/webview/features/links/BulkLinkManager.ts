// file: BulkLinkManager.ts
// Manages bulk link creation between nodes based on filter patterns

import type cytoscape from "cytoscape";
import { FilterUtils } from "../../../../helpers/filterUtils";
import type { SaveManager } from "../../core/SaveManager";

export interface BulkLinkDependencies {
  cy: cytoscape.Core;
  getSaveManager: () => SaveManager;
  getNextEndpoint: (nodeId: string) => string;
  isNetworkNode: (nodeId: string) => boolean;
}

export class BulkLinkManager {
  private cy: cytoscape.Core;
  private deps: BulkLinkDependencies;

  constructor(deps: BulkLinkDependencies) {
    this.cy = deps.cy;
    this.deps = deps;
  }

  public showBulkLinkPanel(): void {
    const panel = document.getElementById("panel-bulk-link");
    if (panel) {
      panel.style.display = "block";
    }
  }

  public async bulkCreateLinks(sourceFilterText: string, targetFilterText: string): Promise<void> {
    const nodes = this.cy.nodes('node[topoViewerRole != "freeText"][topoViewerRole != "group"]');
    const candidateLinks: Array<{
      source: cytoscape.NodeSingular;
      target: cytoscape.NodeSingular;
    }> = [];

    const sourceRegex = FilterUtils.tryCreateRegExp(sourceFilterText);
    const sourceFallbackFilter = sourceRegex ? null : FilterUtils.createFilter(sourceFilterText);

    nodes.forEach((sourceNode) => {
      const match = this.getSourceMatch(sourceNode.data("name"), sourceRegex, sourceFallbackFilter);

      if (match === undefined) {
        return;
      }

      const substitutedTargetPattern = this.applyBackreferences(targetFilterText, match);
      const targetFilter = FilterUtils.createFilter(substitutedTargetPattern);

      nodes.forEach((targetNode) => {
        if (
          sourceNode.id() === targetNode.id() ||
          !targetFilter(targetNode.data("name")) ||
          sourceNode.edgesTo(targetNode).nonempty()
        ) {
          return;
        }

        candidateLinks.push({
          source: sourceNode,
          target: targetNode
        });
      });
    });

    const potentialLinks = candidateLinks.length;

    if (potentialLinks === 0) {
      (window as any).showConfirmDialog({
        title: "No Links to Create",
        message: "No new links would be created with the specified patterns.",
        icon: "fas fa-info-circle text-blue-500",
        confirmText: "OK",
        confirmStyle: "btn-primary",
        cancelText: null
      });
      return;
    }

    const result = await (window as any).showBulkActionConfirm(
      "Bulk Link Creation",
      sourceFilterText,
      targetFilterText,
      potentialLinks
    );

    if (!result) {
      return;
    }

    candidateLinks.forEach(({ source, target }) => {
      const edgeData = {
        id: `${source.id()}-${target.id()}`,
        source: source.id(),
        target: target.id(),
        sourceEndpoint: this.deps.getNextEndpoint(source.id()),
        targetEndpoint: this.deps.getNextEndpoint(target.id()),
        editor: "true"
      };
      const isStubLink =
        this.deps.isNetworkNode(source.id()) || this.deps.isNetworkNode(target.id());
      this.cy.add({
        group: "edges",
        data: edgeData,
        classes: isStubLink ? "stub-link" : undefined
      });
    });
    this.deps.getSaveManager().saveTopo(this.cy, true);
  }

  private applyBackreferences(pattern: string, match: RegExpMatchArray | null): string {
    if (!pattern) {
      return pattern;
    }

    return pattern.replace(
      /\$\$|\$<([^>]+)>|\$(\d+)/g,
      (fullMatch: string, namedGroup?: string, numberedGroup?: string) => {
        if (fullMatch === "$$") {
          return "$";
        }

        if (!match) {
          return fullMatch;
        }

        if (fullMatch.startsWith("$<")) {
          if (
            namedGroup &&
            match.groups &&
            Object.prototype.hasOwnProperty.call(match.groups, namedGroup)
          ) {
            const value = match.groups[namedGroup];
            return value ?? "";
          }
          return fullMatch;
        }

        if (numberedGroup) {
          const index = Number(numberedGroup);
          if (!Number.isNaN(index) && index < match.length) {
            return match[index] ?? "";
          }
          return fullMatch;
        }

        return fullMatch;
      }
    );
  }

  private getSourceMatch(
    name: string,
    sourceRegex: RegExp | null,
    fallbackFilter: ReturnType<typeof FilterUtils.createFilter> | null
  ): RegExpMatchArray | null | undefined {
    if (sourceRegex) {
      const execResult = sourceRegex.exec(name);
      return execResult ?? undefined;
    }

    if (!fallbackFilter) {
      return null;
    }

    return fallbackFilter(name) ? null : undefined;
  }
}
