const VS_CODE_VAR_PATTERN = /var\(\s*--vscode/i;
const INLINE_STYLE_CONTEXT_PATTERN = /<style[\s>]|style\s*=|\.style(?:\.|\[)|style\.setProperty/i;
const CSS_DECLARATION_WITH_VSCODE_VAR_PATTERN = /[a-z-]+\s*:\s*[^;]*var\(\s*--vscode/i;
const ALLOWED_FILE_SUFFIXES = [
  "/src/reactTopoViewer/webview/theme/vscodeTheme.ts",
  "/src/reactTopoViewer/webview/theme/devTheme.ts"
];

const normalizeFilePath = (filePath) => filePath.replaceAll("\\", "/");

const isAllowedThemeFile = (filePath) => {
  if (!filePath || filePath === "<input>") {
    return false;
  }

  const normalizedPath = normalizeFilePath(filePath);
  return ALLOWED_FILE_SUFFIXES.some((suffix) => normalizedPath.endsWith(suffix));
};

const templateElementText = (templateElement) =>
  templateElement.value.cooked ?? templateElement.value.raw ?? "";

const vscodeVarMatchesInText = (text) => {
  const matches = [];
  const pattern = /var\(\s*--vscode/gi;
  let currentMatch = pattern.exec(text);

  while (currentMatch) {
    matches.push({ index: currentMatch.index, length: currentMatch[0].length });
    currentMatch = pattern.exec(text);
  }

  return matches;
};

const textContainsInlineStyleVscodeVar = (text) => {
  if (!text || vscodeVarMatchesInText(text).length === 0) {
    return false;
  }

  return (
    INLINE_STYLE_CONTEXT_PATTERN.test(text) || CSS_DECLARATION_WITH_VSCODE_VAR_PATTERN.test(text)
  );
};

const memberExpressionPropertyName = (memberExpression) => {
  if (!memberExpression.computed && memberExpression.property.type === "Identifier") {
    return memberExpression.property.name;
  }

  if (
    memberExpression.computed &&
    memberExpression.property.type === "Literal" &&
    typeof memberExpression.property.value === "string"
  ) {
    return memberExpression.property.value;
  }

  return null;
};

const memberExpressionIncludesStyle = (memberExpression) => {
  if (memberExpression.type !== "MemberExpression") {
    return false;
  }

  if (memberExpressionPropertyName(memberExpression) === "style") {
    return true;
  }

  return (
    memberExpression.object.type === "MemberExpression" &&
    memberExpressionIncludesStyle(memberExpression.object)
  );
};

const isStyleSetPropertyCall = (callExpression) =>
  callExpression.callee.type === "MemberExpression" &&
  memberExpressionPropertyName(callExpression.callee) === "setProperty" &&
  memberExpressionIncludesStyle(callExpression.callee.object);

const reportVscodeVarMatchesInNode = (context, sourceCode, node, messageId) => {
  const nodeText = sourceCode.getText(node);
  const matches = vscodeVarMatchesInText(nodeText);

  if (matches.length === 0) {
    context.report({ node, messageId });
    return;
  }

  for (const match of matches) {
    const start = sourceCode.getLocFromIndex(node.range[0] + match.index);
    const end = sourceCode.getLocFromIndex(node.range[0] + match.index + match.length);
    context.report({
      loc: { start, end },
      messageId
    });
  }
};

const nodeContainsVscodeVar = (node) => {
  if (!node) {
    return false;
  }

  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" && VS_CODE_VAR_PATTERN.test(node.value);
    case "TemplateLiteral":
      return (
        node.quasis.some((quasi) => VS_CODE_VAR_PATTERN.test(templateElementText(quasi))) ||
        node.expressions.some((expression) => nodeContainsVscodeVar(expression))
      );
    case "ObjectExpression":
      return node.properties.some((property) => {
        if (property.type === "Property") {
          return nodeContainsVscodeVar(property.value);
        }
        if (property.type === "SpreadElement") {
          return nodeContainsVscodeVar(property.argument);
        }
        return false;
      });
    case "ArrayExpression":
      return node.elements.some((element) => element && nodeContainsVscodeVar(element));
    case "ConditionalExpression":
      return (
        nodeContainsVscodeVar(node.test) ||
        nodeContainsVscodeVar(node.consequent) ||
        nodeContainsVscodeVar(node.alternate)
      );
    case "BinaryExpression":
    case "LogicalExpression":
      return nodeContainsVscodeVar(node.left) || nodeContainsVscodeVar(node.right);
    case "UnaryExpression":
    case "UpdateExpression":
      return nodeContainsVscodeVar(node.argument);
    case "AssignmentExpression":
      return nodeContainsVscodeVar(node.right);
    case "TemplateElement":
      return VS_CODE_VAR_PATTERN.test(templateElementText(node));
    case "ParenthesizedExpression":
    case "ChainExpression":
    case "TSAsExpression":
    case "TSTypeAssertion":
    case "TSNonNullExpression":
    case "TSInstantiationExpression":
      return nodeContainsVscodeVar(node.expression);
    case "CallExpression":
    case "NewExpression":
      return node.arguments.some((argument) => argument && nodeContainsVscodeVar(argument));
    case "SequenceExpression":
      return node.expressions.some((expression) => nodeContainsVscodeVar(expression));
    default:
      return false;
  }
};

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow inline style overrides that reference VS Code CSS variables outside theme files"
    },
    schema: [],
    messages: {
      noInlineVscodeVar:
        "Do not use `var(--vscode...)` in inline style overrides outside `vscodeTheme.ts` or `devTheme.ts`."
    }
  },
  create(context) {
    const fileName =
      typeof context.filename === "string" ? context.filename : context.getFilename?.() ?? "";
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();

    if (!sourceCode || isAllowedThemeFile(fileName)) {
      return {};
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") {
          return;
        }

        if (!node.value || node.value.type !== "JSXExpressionContainer") {
          return;
        }

        if (node.value.expression.type !== "ObjectExpression") {
          return;
        }

        if (!nodeContainsVscodeVar(node.value.expression)) {
          return;
        }

        reportVscodeVarMatchesInNode(
          context,
          sourceCode,
          node.value.expression,
          "noInlineVscodeVar"
        );
      },

      TemplateLiteral(node) {
        const nodeText = sourceCode.getText(node);
        if (!textContainsInlineStyleVscodeVar(nodeText)) {
          return;
        }

        reportVscodeVarMatchesInNode(context, sourceCode, node, "noInlineVscodeVar");
      },

      Literal(node) {
        if (typeof node.value !== "string") {
          return;
        }

        const nodeText = sourceCode.getText(node);
        if (!textContainsInlineStyleVscodeVar(nodeText)) {
          return;
        }

        reportVscodeVarMatchesInNode(context, sourceCode, node, "noInlineVscodeVar");
      },

      AssignmentExpression(node) {
        if (node.left.type !== "MemberExpression") {
          return;
        }

        if (!memberExpressionIncludesStyle(node.left)) {
          return;
        }

        if (!nodeContainsVscodeVar(node.right)) {
          return;
        }

        reportVscodeVarMatchesInNode(context, sourceCode, node.right, "noInlineVscodeVar");
      },

      CallExpression(node) {
        if (!isStyleSetPropertyCall(node)) {
          return;
        }

        if (!node.arguments.some((argument) => argument && nodeContainsVscodeVar(argument))) {
          return;
        }

        for (const argument of node.arguments) {
          if (!argument || !nodeContainsVscodeVar(argument)) {
            continue;
          }
          reportVscodeVarMatchesInNode(context, sourceCode, argument, "noInlineVscodeVar");
        }
      }
    };
  }
};
