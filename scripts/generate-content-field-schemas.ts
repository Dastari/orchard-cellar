/** Regenerate after changing content definition types. --check is a CI drift gate. */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const program = ts.createProgram([resolve(root, 'packages/sim/src/content/definitions.ts')], {
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true, skipLibCheck: true,
});
const checker = program.getTypeChecker();
const source = program.getSourceFile(resolve(root, 'packages/sim/src/content/definitions.ts'))!;
const symbol = checker.getSymbolAtLocation(source)!;
const definition = checker.getExportsOfModule(symbol).find(entry => entry.name === 'SupportedContentDefinition')!;
const types = checker.getDeclaredTypeOfSymbol(definition);
type Schema = Record<string, unknown>;
const nodes: Record<string, Schema> = {};
const seen = new Map<ts.Type, string>();
function schema(type: ts.Type): string {
  if (type.isUnion()) {
    const jsonTypes = type.types.filter(part => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.BigIntLike)));
    if (jsonTypes.length === 1) return schema(jsonTypes[0]!);
  }
  const prior = seen.get(type); if (prior) return prior;
  const id = `s${seen.size}`; seen.set(type, id); nodes[id] = {};
  let node: Schema;
  if (type.flags & ts.TypeFlags.StringLiteral) node = { type: 'literal', value: (type as ts.StringLiteralType).value };
  else if (type.flags & ts.TypeFlags.NumberLiteral) node = { type: 'literal', value: (type as ts.NumberLiteralType).value };
  else if (type.flags & ts.TypeFlags.BooleanLiteral) node = { type: 'literal', value: checker.typeToString(type) === 'true' };
  else if (type.flags & ts.TypeFlags.Null) node = { type: 'literal', value: null };
  else if (type.isUnion()) {
    const choices = type.types.filter(part => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.BigIntLike)));
    if (choices.every(part => (part.flags & ts.TypeFlags.BooleanLiteral) !== 0)) node = { type: 'boolean' };
    else node = { type: 'union', options: choices.map(schema) };
  } else if (type.flags & ts.TypeFlags.TemplateLiteral) {
    const template = type as ts.TemplateLiteralType;
    node = { type: 'string', ...(template.texts.length === 2 && template.texts[0]?.endsWith(':') ? { reference: template.texts[0].slice(0, -1) } : {}) };
  } else if (type.flags & ts.TypeFlags.StringLike) node = { type: 'string' };
  else if (type.flags & ts.TypeFlags.NumberLike) node = { type: 'number' };
  else if (type.flags & ts.TypeFlags.BooleanLike) node = { type: 'boolean' };
  else if (checker.isTupleType(type)) {
    const tuple = type as ts.TupleTypeReference;
    const args = checker.getTypeArguments(tuple);
    const rest = tuple.target.elementFlags.findIndex(flag => (flag & ts.ElementFlags.Rest) !== 0);
    node = { type: 'tuple', items: args.slice(0, rest < 0 ? args.length : rest).map(schema), minItems: tuple.target.minLength, ...(rest >= 0 ? { rest: schema(args[rest]!) } : {}) };
  }
  else if (checker.isArrayType(type) || type.getSymbol()?.name === 'ReadonlyArray') node = { type: 'array', items: schema(checker.getTypeArguments(type as ts.TypeReference)[0]!) };
  else if (type.flags & ts.TypeFlags.Object || type.isIntersection()) {
    const fields: Record<string, unknown> = {};
    for (const field of type.getProperties()) {
      const fieldType = checker.getTypeOfSymbolAtLocation(field, field.valueDeclaration ?? source);
      // Optional `never` excludes a key in discriminated union alternatives.
      // TypeScript exposes it as undefined; it has no JSON field to edit.
      if ((field.flags & ts.SymbolFlags.Optional) && (fieldType.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Never))) continue;
      const help = ts.displayPartsToString(field.getDocumentationComment(checker));
      const unit = /Ticks$/u.test(field.name) || field.name === 'ticksPerUnit' ? 'ticks' : /Centi$/u.test(field.name) ? 'hundredths' : /Tiles$/u.test(field.name) ? 'tiles' : /Degrees$/u.test(field.name) ? 'degrees' : /BasisPoints$/u.test(field.name) ? 'basis points' : undefined;
      fields[field.name] = { schema: schema(fieldType), ...(field.flags & ts.SymbolFlags.Optional ? { optional: true } : {}), ...(help ? { help } : {}), ...(unit ? { unit } : {}) };
    }
    const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
    node = { type: 'object', fields, ...(index ? { additional: schema(index) } : {}) };
  } else throw new Error(`Unsupported field type ${checker.typeToString(type)}`);
  nodes[id] = node; return id;
}
const kinds: Record<string, string[]> = {};
for (const type of types.isUnion() ? types.types : [types]) {
  const kind = type.getProperty('kind')!;
  const name = (checker.getTypeOfSymbolAtLocation(kind, source) as ts.StringLiteralType).value;
  (kinds[name] ??= []).push(schema(type));
}
const roots: Record<string, string> = {};
for (const [kind, variants] of Object.entries(kinds)) {
  if (variants.length === 1) roots[kind] = variants[0]!;
  else { const id = `kind_${kind}`; nodes[id] = { type: 'union', options: variants }; roots[kind] = id; }
}
const target = resolve(root, 'packages/sim/src/content/generated-field-schemas.ts');
const result = `// Generated by scripts/generate-content-field-schemas.ts. Do not edit.\nimport type { ContentFieldSchemaGraph } from './field-schema.js';\nexport const CONTENT_FIELD_SCHEMAS: ContentFieldSchemaGraph = ${'{\n  roots: ' + JSON.stringify(roots) + ',\n  nodes: {\n' + Object.entries(nodes).map(([id, node]) => '    ' + JSON.stringify(id) + ': ' + JSON.stringify(node)).join(',\n') + '\n  }\n}'};\n`;
if (process.argv.includes('--check')) { if (readFileSync(target, 'utf8') !== result) throw new Error('Content field schemas are stale. Run npx tsx scripts/generate-content-field-schemas.ts'); }
else writeFileSync(target, result);
