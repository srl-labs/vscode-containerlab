import * as vscode from "vscode";

export interface ExplorerContributedMenuItem {
  commandId: string;
  label?: string;
  iconId?: string;
}

export interface ExplorerCommandMetadata {
  contributedContainerActions?: readonly ExplorerContributedMenuItem[];
  commandLabels?: ReadonlyMap<string, string>;
  commandIcons?: ReadonlyMap<string, string>;
}

interface ExtensionContributes {
  menus?: unknown;
  commands?: unknown;
}

interface ParsedContributedMenuItem extends ExplorerContributedMenuItem {
  when?: string;
}

const CONTAINER_NODE_CONTEXT_MENU_ID = "containerlab/node/context";
const LEGACY_VIEW_ITEM_CONTEXT_MENU_ID = "view/item/context";
const LEGACY_NODE_CONTEXT_WHEN_REGEX =
  /\bviewItem\s*==\s*["']?containerlabContainer(?:Group)?["']?\b/;

let commandMetadataCache: ExplorerCommandMetadata | undefined;
let commandMetadataCachePromise: Promise<ExplorerCommandMetadata> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractCommandId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return asNonEmptyString(value.id) ?? asNonEmptyString(value.command);
}

function extractCommandLabel(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return asNonEmptyString(value.title) ?? asNonEmptyString(value.value);
}

function parseThemeIconId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = /^\$\(([^)]+)\)$/u.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const [iconId] = match[1].split("~");
  return iconId.length > 0 ? iconId : undefined;
}

function extractCommandIconId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const icon = value.icon;
  if (typeof icon === "string") {
    return parseThemeIconId(icon);
  }
  if (isRecord(icon)) {
    return asNonEmptyString(icon.id);
  }
  return undefined;
}

function parseContributedMenuItem(value: unknown): ParsedContributedMenuItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const commandField = value.command;
  const commandId = extractCommandId(commandField);
  if (commandId === undefined) {
    return undefined;
  }

  let label = extractCommandLabel(value.title);
  if (label === undefined && isRecord(commandField)) {
    label = extractCommandLabel(commandField.title);
  }

  const iconId = isRecord(commandField)
    ? (extractCommandIconId(commandField) ?? extractCommandIconId(value))
    : extractCommandIconId(value);

  return {
    commandId,
    when: asNonEmptyString(value.when),
    label,
    iconId
  };
}

function parseContributedMenuItems(value: unknown): ParsedContributedMenuItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ParsedContributedMenuItem[] = [];
  for (const candidate of value) {
    const item = parseContributedMenuItem(candidate);
    if (item !== undefined) {
      items.push(item);
    }
  }
  return items;
}

function getExtensionContributes(
  extension: vscode.Extension<unknown>
): ExtensionContributes | undefined {
  const packageJson: unknown = extension.packageJSON;
  if (!isRecord(packageJson)) {
    return undefined;
  }

  const contributes = packageJson.contributes;
  if (!isRecord(contributes)) {
    return undefined;
  }

  return contributes as ExtensionContributes;
}

function getPackageContributionItems(menuId: string): ParsedContributedMenuItem[] {
  const items: ParsedContributedMenuItem[] = [];

  for (const extension of vscode.extensions.all) {
    const contributes = getExtensionContributes(extension);
    if (contributes === undefined || !isRecord(contributes.menus)) {
      continue;
    }

    const menuItems = parseContributedMenuItems(contributes.menus[menuId]);
    if (menuItems.length > 0) {
      items.push(...menuItems);
    }
  }

  return items;
}

async function getContributedMenuItems(menuId: string): Promise<ParsedContributedMenuItem[]> {
  try {
    const result = await vscode.commands.executeCommand<unknown>(
      "_builtin.getContributedMenuItems",
      menuId
    );
    const parsed = parseContributedMenuItems(result);
    if (parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fall back to extension package contributions when the internal command is unavailable.
  }

  return getPackageContributionItems(menuId);
}

function buildCommandMetadataMaps(): { labels: Map<string, string>; icons: Map<string, string> } {
  const labels = new Map<string, string>();
  const icons = new Map<string, string>();

  for (const extension of vscode.extensions.all) {
    const contributes = getExtensionContributes(extension);
    if (contributes === undefined) {
      continue;
    }

    let commands: unknown[] = [];
    const commandsContribution = contributes.commands;
    if (Array.isArray(commandsContribution)) {
      commands = commandsContribution;
    } else if (commandsContribution !== undefined) {
      commands = [commandsContribution];
    }

    for (const commandContribution of commands) {
      if (!isRecord(commandContribution)) {
        continue;
      }

      const commandId = asNonEmptyString(commandContribution.command);
      if (commandId === undefined) {
        continue;
      }

      const label = extractCommandLabel(commandContribution.title);
      if (label !== undefined && !labels.has(commandId)) {
        labels.set(commandId, label);
      }

      const iconId = extractCommandIconId(commandContribution);
      if (iconId !== undefined && !icons.has(commandId)) {
        icons.set(commandId, iconId);
      }
    }
  }

  return { labels, icons };
}

function dedupeMenuItems(items: ParsedContributedMenuItem[]): ParsedContributedMenuItem[] {
  const deduped: ParsedContributedMenuItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.commandId)) {
      continue;
    }
    seen.add(item.commandId);
    deduped.push(item);
  }

  return deduped;
}

function legacyViewItemMatchesContainer(when: string | undefined): boolean {
  if (when === undefined) {
    return false;
  }

  return LEGACY_NODE_CONTEXT_WHEN_REGEX.test(when);
}

async function computeExplorerCommandMetadata(): Promise<ExplorerCommandMetadata> {
  const { labels: commandLabels, icons: commandIcons } = buildCommandMetadataMaps();
  const menuItems = await getContributedMenuItems(CONTAINER_NODE_CONTEXT_MENU_ID);
  const legacyMenuItems = (await getContributedMenuItems(LEGACY_VIEW_ITEM_CONTEXT_MENU_ID)).filter(
    (item) => legacyViewItemMatchesContainer(item.when)
  );
  const contributedContainerActions = dedupeMenuItems([...menuItems, ...legacyMenuItems]);

  for (const item of contributedContainerActions) {
    if (item.label !== undefined && !commandLabels.has(item.commandId)) {
      commandLabels.set(item.commandId, item.label);
    }
    if (item.iconId !== undefined && !commandIcons.has(item.commandId)) {
      commandIcons.set(item.commandId, item.iconId);
    }
  }

  return {
    contributedContainerActions,
    commandLabels,
    commandIcons
  };
}

export async function getExplorerCommandMetadata(): Promise<ExplorerCommandMetadata> {
  if (commandMetadataCache !== undefined) {
    return commandMetadataCache;
  }

  commandMetadataCachePromise ??= computeExplorerCommandMetadata()
    .catch((error: unknown) => {
      console.error("[containerlab explorer] failed to resolve command metadata", error);
      return {
        contributedContainerActions: [],
        commandLabels: new Map<string, string>(),
        commandIcons: new Map<string, string>()
      };
    })
    .finally(() => {
      commandMetadataCachePromise = undefined;
    });

  commandMetadataCache = await commandMetadataCachePromise;
  return commandMetadataCache;
}

export function invalidateExplorerContributionCache(): void {
  commandMetadataCache = undefined;
  commandMetadataCachePromise = undefined;
}
