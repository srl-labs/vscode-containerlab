import { isSpecialEndpoint } from '../shared/utilities/SpecialNodes';

export function generateDummyId(baseName: string, usedIds: Set<string>): string {
  const re = /^(dummy)(\d*)$/;
  const match = re.exec(baseName);
  const base = match?.[1] || 'dummy';
  let num = parseInt(match?.[2] || '1') || 1;
  while (usedIds.has(`${base}${num}`)) num++;
  return `${base}${num}`;
}

export function generateAdapterNodeId(baseName: string, usedIds: Set<string>): string {
  const [nodeType, adapter] = baseName.split(':');
  const adapterRe = /^([a-zA-Z]+)(\d+)$/;
  const adapterMatch = adapterRe.exec(adapter);
  if (adapterMatch) {
    const adapterBase = adapterMatch[1];
    let adapterNum = parseInt(adapterMatch[2]);
    let name = baseName;
    while (usedIds.has(name)) {
      adapterNum++;
      name = `${nodeType}:${adapterBase}${adapterNum}`;
    }
    return name;
  }
  let name = baseName;
  let counter = 1;
  while (usedIds.has(name)) {
    name = `${nodeType}:${adapter}${counter}`;
    counter++;
  }
  return name;
}

export function generateSpecialNodeId(baseName: string, usedIds: Set<string>): string {
  let name = baseName;
  while (usedIds.has(name)) {
    let i = name.length - 1;
    while (i >= 0 && name[i] >= '0' && name[i] <= '9') i--;
    const base = name.slice(0, i + 1) || name;
    const digits = name.slice(i + 1);
    let num = digits ? parseInt(digits, 10) : 0;
    num += 1;
    name = `${base}${num}`;
  }
  return name;
}

export function generateRegularNodeId(baseName: string, usedIds: Set<string>, isGroup: boolean): string {
  if (isGroup) {
    let num = 1;
    let id = `${baseName}:${num}`;
    while (usedIds.has(id)) {
      num++;
      id = `${baseName}:${num}`;
    }
    return id;
  }

  let i = baseName.length - 1;
  while (i >= 0 && baseName[i] >= '0' && baseName[i] <= '9') i--;
  const hasNumber = i < baseName.length - 1;
  const base = hasNumber ? baseName.slice(0, i + 1) : baseName;
  let num: number;
  if (hasNumber) {
    num = parseInt(baseName.slice(i + 1), 10);
  } else {
    num = 1;
  }
  while (usedIds.has(`${base}${num}`)) num++;
  return `${base}${num}`;
}

export function getUniqueId(baseName: string, usedIds: Set<string>, isGroup: boolean): string {
  if (isSpecialEndpoint(baseName)) {
    if (baseName.startsWith('dummy')) {
      return generateDummyId(baseName, usedIds);
    }
    if (baseName.includes(':')) {
      return generateAdapterNodeId(baseName, usedIds);
    }
    return generateSpecialNodeId(baseName, usedIds);
  }
  return generateRegularNodeId(baseName, usedIds, isGroup);
}

