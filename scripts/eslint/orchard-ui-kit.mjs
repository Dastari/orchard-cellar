/**
 * Orchard UI-kit gate (doc 61 §5). Studio (and later the game client) must
 * compose screens only from `@orchard/ui/studio` kit factories. Anything the
 * kit lacks gets added to the kit with a UI Lab specimen, never hand-built in
 * the application.
 *
 * Rules:
 * - no-hand-built-elements: `new UiElement`, `uiComponent(...)`, and object
 *   properties that implement element behaviour (`paint`, `paintOverlay`,
 *   `measure`, `onPointer`, `onPointerObserved`).
 * - kit-entry-only: imports must use `@orchard/ui/studio`, never the game
 *   entry `@orchard/ui` or deep `packages/ui/src` paths, and never engine
 *   painters (`draw*`, `paint*`), hand layout (`layoutUi*`) or retired Studio
 *   shell models.
 * - no-raw-canvas-draw: Canvas 2D drawing calls and style assignments, and
 *   creating images or canvases. Allowed only in the explicit allowlist of
 *   spatial viewport renderers configured in eslint.config.js.
 * - no-colour-literals: hex, rgb(a) and hsl(a) colour literals. Allowed only
 *   in token and content files configured in eslint.config.js.
 */

const ELEMENT_BEHAVIOUR_PROPS = new Set(['paint', 'paintOverlay', 'measure', 'onPointer', 'onPointerObserved']);
const RETIRED_STUDIO_MODELS = new Set([
  'buildStudioRailModel', 'buildStudioTableView', 'studioTabStrip', 'studioDockFrame', 'studioInspectorGroups',
  'drawStudioCanvasShell', 'drawStudioCanvasTable', 'renderStudioUiLabHtml', 'CanvasFocusManager', 'UiInputRouter',
  'uiComponent', 'uiInventorySelectorRect',
]);
const BANNED_IMPORT_PATTERNS = [/^draw[A-Z]/u, /^paint[A-Z]/u, /^layoutUi/u];
const DRAW_METHODS = new Set([
  'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'beginPath', 'closePath',
  'moveTo', 'lineTo', 'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'roundRect',
  'putImageData', 'getImageData', 'createImageData', 'setLineDash', 'createLinearGradient',
  'createRadialGradient', 'createConicGradient', 'createPattern',
]);
/** Ambiguous names (Array#fill) count only when called without arguments. */
const ZERO_ARG_DRAW_METHODS = new Set(['fill', 'stroke', 'clip']);
const DRAW_STYLE_PROPS = new Set([
  'fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled', 'lineWidth', 'font', 'filter',
]);
const DRAW_CONSTRUCTORS = new Set(['Image', 'OffscreenCanvas', 'Path2D', 'ImageData']);
const HEX_COLOUR = /(?:^|[^\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/iu;
const FUNCTION_COLOUR = /\b(?:rgba?|hsla?)\(\s*[\d.]/iu;

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

const noHandBuiltElements = {
  meta: {
    type: 'problem',
    docs: { description: 'Compose UI from kit factories; never construct elements or implement element behaviour.' },
    schema: [],
    messages: {
      construct: 'Do not construct `{{name}}` outside the UI kit. Use a `ui.*` factory; if none fits, add one to packages/ui/src/kit with a UI Lab specimen.',
      behaviour: '`{{name}}` implements element behaviour. Only kit components may paint, measure or handle raw pointers; add the missing primitive to the kit.',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'UiElement') context.report({ node, messageId: 'construct', data: { name: 'UiElement' } });
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'uiComponent') context.report({ node, messageId: 'construct', data: { name: 'uiComponent' } });
      },
      Property(node) {
        if (node.parent?.type !== 'ObjectExpression' || node.computed) return;
        const name = propertyName(node.key);
        if (name && ELEMENT_BEHAVIOUR_PROPS.has(name)) context.report({ node: node.key, messageId: 'behaviour', data: { name } });
      },
    };
  },
};

const kitEntryOnly = {
  meta: {
    type: 'problem',
    docs: { description: 'Import UI only through the reviewed kit entry.' },
    schema: [],
    messages: {
      gameEntry: 'Import Studio UI from `@orchard/ui/studio` (the kit entry), not `{{source}}`.',
      banned: '`{{name}}` is an engine painter, hand-layout helper or retired Studio model. Compose `ui.*` factories instead.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (source === '@orchard/ui' || /^@orchard\/ui\/src\b/u.test(source) || /(?:^|\/)ui\/src\//u.test(source)) {
          context.report({ node: node.source, messageId: 'gameEntry', data: { source } });
          return;
        }
        if (source !== '@orchard/ui/studio') return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const name = propertyName(specifier.imported);
          if (name && (RETIRED_STUDIO_MODELS.has(name) || BANNED_IMPORT_PATTERNS.some(pattern => pattern.test(name)))) {
            context.report({ node: specifier, messageId: 'banned', data: { name } });
          }
        }
      },
    };
  },
};

const noRawCanvasDraw = {
  meta: {
    type: 'problem',
    docs: { description: 'Raw Canvas 2D drawing is limited to allowlisted spatial viewport renderers.' },
    schema: [],
    messages: {
      call: 'Raw canvas call `{{name}}()` outside an allowlisted viewport renderer. Chrome belongs to kit components; spatial content belongs in a renderer listed in eslint.config.js.',
      style: 'Raw canvas style `{{name}}` outside an allowlisted viewport renderer.',
      construct: '`new {{name}}()` outside an allowlisted viewport renderer. Use `ui.imageUrl`, `ui.image` or `ui.viewport`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) return;
        const name = propertyName(node.callee.property);
        if (!name) return;
        if (DRAW_METHODS.has(name) || (ZERO_ARG_DRAW_METHODS.has(name) && node.arguments.length === 0)) {
          context.report({ node: node.callee.property, messageId: 'call', data: { name } });
        }
      },
      AssignmentExpression(node) {
        if (node.left.type !== 'MemberExpression' || node.left.computed) return;
        const name = propertyName(node.left.property);
        if (name && DRAW_STYLE_PROPS.has(name)) context.report({ node: node.left.property, messageId: 'style', data: { name } });
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && DRAW_CONSTRUCTORS.has(node.callee.name)) {
          context.report({ node, messageId: 'construct', data: { name: node.callee.name } });
        }
      },
    };
  },
};

const noColourLiterals = {
  meta: {
    type: 'problem',
    docs: { description: 'Colours come from kit tones or token/content files.' },
    schema: [],
    messages: {
      colour: 'Colour literal outside a token or content file. Use a kit tone, STUDIO_SKIN_TOKENS or a token file listed in eslint.config.js.',
    },
  },
  create(context) {
    const check = (node, text) => {
      if (typeof text === 'string' && (HEX_COLOUR.test(text) || FUNCTION_COLOUR.test(text))) context.report({ node, messageId: 'colour' });
    };
    return {
      Literal(node) { check(node, node.value); },
      TemplateElement(node) { check(node, node.value.raw); },
    };
  },
};

export default {
  meta: { name: 'orchard-ui-kit' },
  rules: {
    'no-hand-built-elements': noHandBuiltElements,
    'kit-entry-only': kitEntryOnly,
    'no-raw-canvas-draw': noRawCanvasDraw,
    'no-colour-literals': noColourLiterals,
  },
};
