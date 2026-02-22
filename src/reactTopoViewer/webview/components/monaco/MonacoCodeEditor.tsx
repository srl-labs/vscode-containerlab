import React, { useEffect, useRef, useCallback } from "react";
import * as monaco from "monaco-editor";
import {
  conf as yamlConf,
  language as yamlLanguage
} from "monaco-editor/esm/vs/basic-languages/yaml/yaml.js";
import * as YAML from "yaml";
import Ajv from "ajv";

import { parseLuminance } from "../../utils/color";

declare global {
  interface Window {
    monacoEditorWorkerUrl?: string;
    monacoJsonWorkerUrl?: string;
  }
}

let monacoConfigured = false;
let yamlRegistered = false;

function getCssVar(name: string, fallback: string): string {
  const value = window.getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

function detectColorMode(): "light" | "dark" {
  const isDevMock = Boolean(window.vscode && window.vscode.__isDevMock__);
  if (isDevMock) {
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  }

  const bg = getCssVar("--vscode-editor-background", "#1e1e1e");
  const lum = parseLuminance(bg);
  if (lum !== null) return lum > 0.5 ? "light" : "dark";
  return "dark";
}

function ensureMonacoConfiguredOnce(): void {
  if (monacoConfigured) return;

  // Worker wiring for VS Code webview build (dev mode sets MonacoEnvironment already).
  const existingEnvironment = Reflect.get(globalThis, "MonacoEnvironment");
  const hasWorker =
    isObj(existingEnvironment) &&
    "getWorker" in existingEnvironment &&
    typeof existingEnvironment.getWorker === "function";
  if (!hasWorker) {
    const editorUrl = window.monacoEditorWorkerUrl;
    const jsonUrl = window.monacoJsonWorkerUrl;
    if (editorUrl !== undefined && editorUrl !== "" && jsonUrl !== undefined && jsonUrl !== "") {
      Reflect.set(globalThis, "MonacoEnvironment", {
        getWorker: (_workerId: string, label: string) => {
          const url = label === "json" ? jsonUrl : editorUrl;
          return new Worker(url);
        }
      });
    }
  }

  // YAML language registration (basic Monarch tokens).
  if (!yamlRegistered) {
    if (!monaco.languages.getLanguages().some((l) => l.id === "yaml")) {
      monaco.languages.register({ id: "yaml" });
      monaco.languages.setMonarchTokensProvider("yaml", yamlLanguage);
      monaco.languages.setLanguageConfiguration("yaml", yamlConf);
    }
    yamlRegistered = true;
  }

  // Avoid JSON diagnostics that require extra config and can be noisy for annotations.
  monaco.json.jsonDefaults.setDiagnosticsOptions({ validate: false });

  monacoConfigured = true;
}

/** Hardcoded Monaco colours per mode – used in dev where CSS vars lag behind the class toggle. */
const DEV_MONACO_COLORS = {
  light: { bg: "#ffffff", fg: "#333333", sel: "#add6ff", inactiveSel: "#e5ebf1" },
  dark: { bg: "#1e1e1e", fg: "#cccccc", sel: "#264f78", inactiveSel: "#3a3d41" }
} as const;

function isDevMock(): boolean {
  const vsc = Reflect.get(window, "vscode");
  return isObj(vsc) && Reflect.get(vsc, "__isDevMock__") === true;
}

function applyVscodeThemeToMonaco(): void {
  const mode = detectColorMode();
  const themeName = mode === "light" ? "topoviewer-vscode-light" : "topoviewer-vscode-dark";
  const c = DEV_MONACO_COLORS[mode];

  // In dev mode, CssBaseline re-renders asynchronously so CSS variables still
  // hold the *previous* theme's values when the MutationObserver fires.
  // Use hardcoded colours keyed off the detected mode instead.
  const dev = isDevMock();
  const background = dev ? c.bg : getCssVar("--vscode-editor-background", c.bg);
  const foreground = dev ? c.fg : getCssVar("--vscode-editor-foreground", c.fg);
  const selection = dev ? c.sel : getCssVar("--vscode-editor-selectionBackground", c.sel);
  const inactiveSelection = dev
    ? c.inactiveSel
    : getCssVar("--vscode-editor-inactiveSelectionBackground", c.inactiveSel);

  monaco.editor.defineTheme(themeName, {
    base: mode === "light" ? "vs" : "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editor.selectionBackground": selection,
      "editor.inactiveSelectionBackground": inactiveSelection
    }
  });
  monaco.editor.setTheme(themeName);
}

// ---------------------------------------------------------------------------
// YAML schema validation (ajv + yaml)
// ---------------------------------------------------------------------------

const VALIDATION_DEBOUNCE_MS = 400;
const MARKER_OWNER = "yaml-schema";

/** Cache compiled ajv validators keyed by schema reference. */
const validatorCache = new WeakMap<object, ReturnType<Ajv["compile"]>>();
const ajv = new Ajv({ allErrors: true, strict: false });

function getValidator(schema: object): ReturnType<Ajv["compile"]> {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

/** Convert a byte-offset in `text` to a 1-based line and column. */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/**
 * Structural/combinator keywords emitted by ajv that wrap the real errors.
 * These produce noise like "must match 'then' schema" and should be dropped
 * when more specific child errors exist.
 */
const STRUCTURAL_KEYWORDS = new Set(["if", "then", "else", "allOf", "anyOf", "oneOf", "not"]);

/** Build a human-readable message from an ajv error. */
function formatAjvError(error: {
  keyword: string;
  message?: string;
  params?: Record<string, unknown>;
}): string {
  const allowedValues = error.params?.["allowedValues"];
  if (error.keyword === "enum" && Array.isArray(allowedValues)) {
    const list = allowedValues.map((value) => `"${String(value)}"`).join(", ");
    return `Value is not accepted. Valid values: ${list}`;
  }
  const additionalProperty = error.params?.["additionalProperty"];
  if (error.keyword === "additionalProperties" && typeof additionalProperty === "string") {
    return `Unknown property "${additionalProperty}"`;
  }
  const missingProperty = error.params?.["missingProperty"];
  if (error.keyword === "required" && typeof missingProperty === "string") {
    return `Missing required property "${missingProperty}"`;
  }
  const expectedType = error.params?.["type"];
  if (error.keyword === "type" && typeof expectedType === "string") {
    return `Must be ${expectedType}`;
  }
  return error.message ?? "Schema validation error";
}

/** Resolve an ajv instancePath to Monaco line/col via the YAML document. */
function resolveYamlPosition(
  doc: YAML.Document,
  text: string,
  instancePath: string
): { startLine: number; startCol: number; endLine: number; endCol: number } {
  const pathParts = instancePath.split("/").filter(Boolean);
  const node = doc.getIn(pathParts, true);
  if (YAML.isNode(node) && node.range) {
    const s = offsetToLineCol(text, node.range[0]);
    const e = offsetToLineCol(text, node.range[1]);
    return { startLine: s.line, startCol: s.col, endLine: e.line, endCol: e.col };
  }
  return { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };
}

/** Validate YAML `text` against a JSON `schema` and return Monaco markers. */
function validateYaml(text: string, schema: object): monaco.editor.IMarkerData[] {
  // 1. Parse YAML — collect syntax errors
  let doc: YAML.Document;
  try {
    doc = YAML.parseDocument(text, { keepSourceTokens: true });
  } catch {
    return [
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        message: "Invalid YAML syntax",
        severity: monaco.MarkerSeverity.Error
      }
    ];
  }

  const markers: monaco.editor.IMarkerData[] = [];
  for (const err of doc.errors) {
    const [s0, s1] = err.pos;
    const start = offsetToLineCol(text, s0);
    const end = offsetToLineCol(text, s1);
    markers.push({
      startLineNumber: start.line,
      startColumn: start.col,
      endLineNumber: end.line,
      endColumn: end.col,
      message: err.message,
      severity: monaco.MarkerSeverity.Error
    });
  }

  if (doc.errors.length > 0) return markers;

  // 2. Schema validation
  const jsonData: unknown = doc.toJSON();
  if (jsonData === undefined) return markers;

  const validate = getValidator(schema);
  const isValid = validate(jsonData);
  if (isValid === true || validate.errors === null || validate.errors === undefined) return markers;

  // Filter out structural/combinator wrapper errors — keep only leaf-level
  // errors that carry actionable information (enum, type, required, etc.).
  const leafErrors = validate.errors.filter((e) => !STRUCTURAL_KEYWORDS.has(e.keyword));
  const errors = leafErrors.length > 0 ? leafErrors : validate.errors;

  // De-duplicate by (path + message) so the same problem isn't shown twice.
  const seen = new Set<string>();
  for (const error of errors) {
    const msg = formatAjvError(error);
    const key = `${error.instancePath}::${msg}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pos = resolveYamlPosition(doc, text, error.instancePath);
    markers.push({
      startLineNumber: pos.startLine,
      startColumn: pos.startCol,
      endLineNumber: pos.endLine,
      endColumn: pos.endCol,
      message: msg,
      severity: monaco.MarkerSeverity.Warning
    });
  }
  return markers;
}

// ---------------------------------------------------------------------------
// YAML hover provider — shows schema descriptions for keys/values
// ---------------------------------------------------------------------------

type SchemaObj = Record<string, unknown>;

/** Resolve a `$ref` like `#/definitions/foo` within the root schema. */
function resolveRef(ref: string, root: SchemaObj): SchemaObj | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let cur: unknown = root;
  for (const p of parts) {
    if (!isObj(cur)) return null;
    cur = cur[p];
  }
  return isObj(cur) ? cur : null;
}

/** Dereference a single `$ref`, returning the resolved schema or the input. */
function deref(schema: SchemaObj, root: SchemaObj): SchemaObj {
  const ref = schema["$ref"];
  if (typeof ref === "string" && ref !== "") {
    const resolved = resolveRef(ref, root);
    if (resolved) return deref(resolved, root);
  }
  return schema;
}

/**
 * Look up a property in a schema. Searches, in order:
 *   1. `properties`
 *   2. `patternProperties`
 *   3. `allOf` items (including if/then/else — optionally evaluating conditions)
 *   4. Top-level `if/then/else`
 *   5. Wrapped `oneOf` / `anyOf` combinators
 *
 * When `yamlSiblings` is supplied the if-conditions are evaluated against it
 * so that kind-specific enum values are returned for `type`, etc.
 */
/** Search patternProperties for a matching key. */
function searchPatternProps(schema: SchemaObj, key: string, root: SchemaObj): SchemaObj | null {
  const ppValue = schema["patternProperties"];
  if (!isObj(ppValue)) return null;
  const pp = ppValue;
  for (const pat of Object.keys(pp)) {
    try {
      if (new RegExp(pat).test(key) && isObj(pp[pat])) return deref(pp[pat], root);
    } catch {
      /* invalid regex in schema – skip */
    }
  }
  return null;
}

/** Search oneOf/anyOf branches for a key. */
function searchCombinators(
  schema: SchemaObj,
  key: string,
  root: SchemaObj,
  yamlSiblings?: SchemaObj | null
): SchemaObj | null {
  for (const kw of ["oneOf", "anyOf"] as const) {
    const arr = schema[kw];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!isObj(item)) continue;
      const found = lookupProperty(item, key, root, yamlSiblings);
      if (found) return found;
    }
  }
  return null;
}

function lookupProperty(
  rawSchema: SchemaObj,
  key: string,
  root: SchemaObj,
  yamlSiblings?: SchemaObj | null
): SchemaObj | null {
  const schema = deref(rawSchema, root);

  // 1. Direct properties
  const propsValue = schema["properties"];
  if (isObj(propsValue) && isObj(propsValue[key])) return deref(propsValue[key], root);

  // 2. Pattern properties
  const fromPattern = searchPatternProps(schema, key, root);
  if (fromPattern) return fromPattern;

  // 3. allOf items
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    const result = searchAllOf(allOf, key, root, yamlSiblings);
    if (result) return result;
  }

  // 4. Top-level if/then/else
  const fromCond = searchIfThenElse(schema, key, root, yamlSiblings);
  if (fromCond) return fromCond;

  // 5. oneOf / anyOf combinators
  return searchCombinators(schema, key, root, yamlSiblings);
}

/** Try to find a key in a single allOf item (if/then/else or direct properties). */
function searchAllOfItem(
  sub: SchemaObj,
  key: string,
  root: SchemaObj,
  yamlSiblings?: SchemaObj | null
): { result: SchemaObj; fromCondition: boolean } | null {
  const fromCond = searchIfThenElse(sub, key, root, yamlSiblings);
  if (fromCond) return { result: fromCond, fromCondition: true };
  const direct = sub["properties"];
  if (isObj(direct) && isObj(direct[key])) {
    return { result: deref(direct[key], root), fromCondition: false };
  }
  return null;
}

/** Search allOf items for a property, preferring a branch whose if-condition matches. */
function searchAllOf(
  items: unknown[],
  key: string,
  root: SchemaObj,
  yamlSiblings?: SchemaObj | null
): SchemaObj | null {
  let fallback: SchemaObj | null = null;
  for (const item of items) {
    if (!isObj(item)) continue;
    const hit = searchAllOfItem(deref(item, root), key, root, yamlSiblings);
    if (!hit) continue;
    if (hit.fromCondition && yamlSiblings) return hit.result;
    fallback ??= hit.result;
  }
  return fallback;
}

/** Check an if/then/else block for the target property. */
function searchIfThenElse(
  schema: SchemaObj,
  key: string,
  root: SchemaObj,
  yamlSiblings?: SchemaObj | null
): SchemaObj | null {
  const ifBlockValue = schema["if"];
  const thenBlockValue = schema["then"];
  const elseBlockValue = schema["else"];
  if (!isObj(ifBlockValue) || !isObj(thenBlockValue)) return null;
  const ifBlock = ifBlockValue;
  const thenBlock = thenBlockValue;
  const elseBlock = isObj(elseBlockValue) ? elseBlockValue : undefined;

  const conditionMatches =
    yamlSiblings !== undefined && yamlSiblings !== null
      ? matchesIfCondition(ifBlock, yamlSiblings)
      : null;

  if (conditionMatches === true) {
    const found = lookupInDirect(thenBlock, key, root);
    if (found) return found;
  } else if (conditionMatches === false && elseBlock) {
    const found = lookupInDirect(elseBlock, key, root);
    if (found) return found;
  }

  // No context or no match — check then as fallback
  if (conditionMatches === null) {
    const found = lookupInDirect(thenBlock, key, root);
    if (found) return found;
  }
  return null;
}

/** Lookup directly in properties only (no recursion into allOf). */
function lookupInDirect(rawSchema: SchemaObj, key: string, root: SchemaObj): SchemaObj | null {
  const schema = deref(rawSchema, root);
  const props = schema["properties"];
  if (isObj(props) && isObj(props[key])) return deref(props[key], root);
  return null;
}

/** Check a single if-property constraint against a YAML value. */
function checkConstraint(constraint: SchemaObj, yamlValue: unknown): boolean {
  const pattern = constraint["pattern"];
  if (typeof pattern === "string") {
    if (typeof yamlValue !== "string") return false;
    if (!new RegExp(pattern).test(yamlValue)) return false;
  }
  const enumValues = constraint["enum"];
  if (Array.isArray(enumValues) && !enumValues.includes(yamlValue)) return false;
  return true;
}

/** Evaluate an `if` block against YAML sibling values. */
function matchesIfCondition(ifBlock: SchemaObj, yamlSiblings: SchemaObj): boolean {
  const requiredRaw = ifBlock["required"];
  const requiredKeys = Array.isArray(requiredRaw)
    ? requiredRaw.filter((entry): entry is string => typeof entry === "string")
    : [];
  const ifProps = ifBlock["properties"];
  if (!isObj(ifProps)) return false;

  for (const propKey of Object.keys(ifProps)) {
    const constraint = ifProps[propKey];
    if (!isObj(constraint)) continue;
    const hasValue = Object.prototype.hasOwnProperty.call(yamlSiblings, propKey);
    if (!hasValue && requiredKeys.includes(propKey)) return false;
    if (!checkConstraint(constraint, yamlSiblings[propKey])) return false;
  }
  return true;
}

function isObj(v: unknown): v is SchemaObj {
  return typeof v === "object" && v !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isDisposable(value: unknown): value is monaco.IDisposable {
  return isObj(value) && "dispose" in value && typeof value.dispose === "function";
}

/**
 * Walk YAML path segments through the schema, returning description + enum
 * for the final segment. Uses parsed YAML data for context-aware resolution
 * (e.g. showing kind-specific enum values for `type`).
 */
function getSchemaHoverInfo(
  pathSegments: string[],
  schema: SchemaObj,
  yamlData: unknown
): { description?: string; markdownDescription?: string; enumValues?: string[] } | null {
  let currentSchema = schema;
  let currentData = yamlData;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    // yamlSiblings = the object that *contains* the key we're looking up
    const yamlSiblings = isObj(currentData) ? currentData : null;
    const next = lookupProperty(currentSchema, segment, schema, yamlSiblings);
    if (!next) return null;
    currentSchema = next;
    // Advance into the YAML data for the next level
    currentData = isObj(currentData) ? currentData[segment] : undefined;
  }

  const desc =
    typeof currentSchema["description"] === "string" ? currentSchema["description"] : undefined;
  const mdDesc =
    typeof currentSchema["markdownDescription"] === "string"
      ? currentSchema["markdownDescription"]
      : undefined;
  const enumValuesRaw = currentSchema["enum"];
  const enumVals = Array.isArray(enumValuesRaw)
    ? enumValuesRaw.map((value) => String(value))
    : undefined;
  if (desc === undefined && mdDesc === undefined) return null;
  return { description: desc, markdownDescription: mdDesc, enumValues: enumVals };
}

/**
 * Given YAML text and a 1-based line, determine the path of keys leading to that line.
 * Returns segments like ["topology", "nodes", "srl1", "type"].
 */
function getYamlPathAtLine(text: string, line: number): string[] | null {
  const lines = text.split("\n");
  if (line < 1 || line > lines.length) return null;

  const currentLine = lines[line - 1];
  const keyMatch = /^(\s*)([^\s#:][^:]*):/.exec(currentLine);
  if (!keyMatch) return null;

  const currentIndent = keyMatch[1].length;
  const currentKey = keyMatch[2].trimEnd();
  const segments: string[] = [currentKey];

  let targetIndent = currentIndent;
  for (let i = line - 2; i >= 0; i--) {
    const ln = lines[i];
    const parentMatch = /^(\s*)([^\s#:][^:]*):/.exec(ln);
    if (!parentMatch) continue;
    const indent = parentMatch[1].length;
    if (indent < targetIndent) {
      segments.unshift(parentMatch[2].trimEnd());
      targetIndent = indent;
      if (indent === 0) break;
    }
  }

  return segments;
}

/** Module-level ref for the active schema; updated by the component on each render. */
let activeSchema: SchemaObj | null = null;

/** Window-level key to survive HMR — old disposable is cleaned up on re-register. */
const HOVER_DISPOSABLE_KEY = "__monacoYamlHoverDisposable__";

function ensureHoverProvider(): void {
  const existing: unknown = Reflect.get(window, HOVER_DISPOSABLE_KEY);
  if (isDisposable(existing)) existing.dispose();

  Reflect.set(
    window,
    HOVER_DISPOSABLE_KEY,
    monaco.languages.registerHoverProvider("yaml", {
      provideHover(model, position) {
        if (!activeSchema) return null;
        const text = model.getValue();
        const path = getYamlPathAtLine(text, position.lineNumber);
        if (!path || path.length === 0) return null;

        // Parse YAML for context-aware schema resolution (e.g. kind → type enum)
        let yamlData: unknown;
        try {
          yamlData = YAML.parse(text);
        } catch {
          yamlData = undefined;
        }

        const info = getSchemaHoverInfo(path, activeSchema, yamlData);
        if (!info) return null;

        const parts: string[] = [];
        if (isNonEmptyString(info.markdownDescription)) {
          parts.push(info.markdownDescription);
        } else if (isNonEmptyString(info.description)) {
          parts.push(info.description);
        }
        if (info.enumValues !== undefined && info.enumValues.length > 0) {
          const enumList = info.enumValues.map((v) => "`" + v + "`").join(", ");
          parts.push("\nAllowed values: " + enumList);
        }

        const word = model.getWordAtPosition(position);
        return {
          range: word
            ? new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn
              )
            : new monaco.Range(
                position.lineNumber,
                1,
                position.lineNumber,
                model.getLineMaxColumn(position.lineNumber)
              ),
          contents: [{ value: parts.join("\n") }]
        };
      }
    })
  );
}

// ---------------------------------------------------------------------------

export interface MonacoCodeEditorProps {
  value: string;
  language: "yaml" | "json";
  readOnly?: boolean;
  jsonSchema?: object;
  onChange?: (value: string) => void;
}

export const MonacoCodeEditor: React.FC<MonacoCodeEditorProps> = ({
  value,
  language,
  readOnly = false,
  jsonSchema,
  onChange
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const applyingExternalRef = useRef(false);
  const lastExternalAppliedRef = useRef<string>(value);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getEditorFontFamily = () => {
    const fallback = "Consolas, Monaco, 'Courier New', monospace";
    return getCssVar("--vscode-editor-font-family", fallback) || fallback;
  };

  const getEditorFontSize = () => {
    const raw =
      getCssVar("--vscode-editor-font-size", "") || getCssVar("--vscode-font-size", "13px");
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 13;
  };

  useEffect(() => {
    ensureMonacoConfiguredOnce();
    applyVscodeThemeToMonaco();

    const observer = new MutationObserver(() => {
      applyVscodeThemeToMonaco();
      const editor = editorRef.current;
      if (editor) {
        editor.updateOptions({
          fontFamily: getEditorFontFamily(),
          fontSize: getEditorFontSize()
        });
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    return () => observer.disconnect();
  }, []);

  // Keep hover provider's active schema in sync
  activeSchema = isObj(jsonSchema) ? jsonSchema : null;

  // Debounced schema validation — sets Monaco markers on the model
  const jsonSchemaRef = useRef(jsonSchema);
  jsonSchemaRef.current = jsonSchema;

  const scheduleValidation = useCallback(() => {
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    validationTimerRef.current = setTimeout(() => {
      const model = modelRef.current;
      const schema = jsonSchemaRef.current;
      if (!model) return;
      if (schema === undefined || language !== "yaml") {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
        return;
      }
      const markers = validateYaml(model.getValue(), schema);
      monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    }, VALIDATION_DEBOUNCE_MS);
  }, [language]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    ensureMonacoConfiguredOnce();
    ensureHoverProvider();
    applyVscodeThemeToMonaco();

    modelRef.current = monaco.editor.createModel(value, language);
    lastExternalAppliedRef.current = value;

    editorRef.current = monaco.editor.create(container, {
      model: modelRef.current,
      readOnly,
      automaticLayout: true,
      contextmenu: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: getEditorFontFamily(),
      fontSize: getEditorFontSize(),
      tabSize: 2,
      insertSpaces: true,
      renderWhitespace: "selection",
      wordWrap: "on",
      fixedOverflowWidgets: true
    });

    const editor = editorRef.current;
    const disposable = editor.onDidChangeModelContent(() => {
      if (applyingExternalRef.current) return;
      const next = editor.getValue();
      if (onChange !== undefined) onChange(next);
      scheduleValidation();
    });

    // Run initial validation
    scheduleValidation();

    return () => {
      disposable.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
      modelRef.current?.dispose();
      modelRef.current = null;
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ readOnly });
  }, [readOnly]);

  // Re-validate when the schema changes
  useEffect(() => {
    scheduleValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonSchema]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model) return;

    // Avoid clobbering user edits. If the model diverged from the last external
    // value, treat it as locally edited and don't overwrite while focused.
    if (editor.hasTextFocus()) {
      const locallyEdited = model.getValue() !== lastExternalAppliedRef.current;
      if (locallyEdited) return;
    }

    const current = model.getValue();
    const next = value;
    if (current === next) return;

    applyingExternalRef.current = true;
    model.pushEditOperations(
      [],
      [
        {
          range: model.getFullModelRange(),
          text: next
        }
      ],
      () => null
    );
    applyingExternalRef.current = false;
    lastExternalAppliedRef.current = next;
  }, [value]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};
