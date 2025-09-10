export default {
  rules: {
    'aggregate-complexity': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'enforce maximum aggregate cyclomatic complexity including nested functions',
        },
        schema: [
          {
            type: 'object',
            properties: {
              max: {
                type: 'number',
                default: 20
              }
            },
            additionalProperties: false
          }
        ],
        messages: {
          tooComplex: '{{name}} has a total complexity of {{complexity}} (max allowed is {{max}})'
        }
      },
      create(context) {
        const option = context.options[0] || {};
        const max = typeof option.max === 'number' ? option.max : 20;
        const sourceCode = context.getSourceCode();

        function getPropertyKeyName(key) {
          if (!key) return null;
          if (key.type === 'Identifier') return key.name;
          if (key.type === 'Literal') return String(key.value);
          try {
            return sourceCode.getText(key);
          } catch {
            return null;
          }
        }

        function getMemberExpressionName(node) {
          // Prefer the property name (e.g., `.map`) when available
          if (node.type !== 'MemberExpression') return null;
          const prop = node.property;
          if (prop.type === 'Identifier') return prop.name;
          if (prop.type === 'Literal') return String(prop.value);
          try {
            return sourceCode.getText(prop);
          } catch {
            return null;
          }
        }

        function getCalleeName(callee) {
          if (!callee) return null;
          if (callee.type === 'Identifier') return callee.name;
          if (callee.type === 'MemberExpression') return getMemberExpressionName(callee) || null;
          try {
            return sourceCode.getText(callee);
          } catch {
            return null;
          }
        }

        function getFunctionName(node) {
          // Directly named function declarations
          if (node.type === 'FunctionDeclaration' && node.id && node.id.name) return node.id.name;

          // Named function expressions
          if (node.type === 'FunctionExpression' && node.id && node.id.name) return node.id.name;

          const parent = node.parent;
          if (!parent) return '<anonymous>';

          // Variable assignment: const foo = () => {}
          if (parent.type === 'VariableDeclarator' && parent.id && parent.id.type === 'Identifier') {
            return parent.id.name;
          }

          // Object property: const o = { foo: () => {} } or { 'foo': () => {} }
          if ((parent.type === 'Property' || parent.type === 'PropertyDefinition') && parent.value === node) {
            const keyName = getPropertyKeyName(parent.key);
            if (keyName) return keyName;
          }

          // Class method: class X { foo() {} }
          if (parent.type === 'MethodDefinition' && parent.value === node) {
            const keyName = getPropertyKeyName(parent.key);
            if (keyName) return keyName;
          }

          // Class field with arrow: class X { foo = () => {} }
          if ((parent.type === 'PropertyDefinition' || parent.type === 'ClassProperty') && parent.value === node) {
            const keyName = getPropertyKeyName(parent.key);
            if (keyName) return keyName;
          }

          // Assignment: obj.foo = () => {}
          if (parent.type === 'AssignmentExpression' && parent.right === node) {
            try {
              return sourceCode.getText(parent.left);
            } catch {
              // fallthrough
            }
          }

          // Default export: export default () => {}
          if (parent.type === 'ExportDefaultDeclaration') {
            return 'default export function';
          }

          // Callback argument: something.map(() => {})
          if (parent.type === 'CallExpression') {
            const calleeName = getCalleeName(parent.callee);
            if (calleeName) return `callback for ${calleeName}`;
            return 'callback function';
          }

          return '<anonymous>';
        }

        function calculate(node) {
          let complexity = 1;
          function traverse(n) {
            switch (n.type) {
              case 'IfStatement':
              case 'ForStatement':
              case 'ForInStatement':
              case 'ForOfStatement':
              case 'WhileStatement':
              case 'DoWhileStatement':
                complexity++;
                break;
              case 'LogicalExpression':
                if (n.operator === '&&' || n.operator === '||' || n.operator === '??') {
                  complexity++;
                }
                break;
              case 'ConditionalExpression':
                complexity++;
                break;
              case 'SwitchCase':
                if (n.test) complexity++;
                break;
              case 'CatchClause':
                complexity++;
                break;
              default:
                break;
            }

            for (const key in n) {
              if (key === 'parent') continue;
              if (!Object.prototype.hasOwnProperty.call(n, key)) continue;
              const value = n[key];
              if (!value) continue;
              if (Array.isArray(value)) {
                value.forEach(child => {
                  if (child && typeof child.type === 'string') {
                    traverse(child);
                  }
                });
              } else if (typeof value.type === 'string') {
                traverse(value);
              }
            }
          }
          traverse(node.body || node);
          return complexity;
        }

        function check(node) {
          const complexity = calculate(node);
          if (complexity > max) {
            const name = getFunctionName(node);
            context.report({
              node,
              messageId: 'tooComplex',
              data: { name, complexity, max }
            });
          }
        }

        return {
          FunctionDeclaration: check,
          FunctionExpression: check,
          ArrowFunctionExpression: check,
          MethodDefinition(node) {
            if (node.value) {
              check(node.value);
            }
          }
        };
      }
    }
  }
};
