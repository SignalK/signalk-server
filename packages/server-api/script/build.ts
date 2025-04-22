import { writeFile, mkdir } from 'fs/promises'
import { compileFromFile } from 'json-schema-to-typescript'
import ts, { EmitHint, Identifier, Node } from 'typescript';
import { join } from 'path'

const cwd = join(
  __dirname,
  '../../../node_modules/@signalk/signalk-schema/schemas/'
)
const schema = join(cwd, 'signalk.json')

async function build() {
  let output = await compileFromFile(schema, {
    cwd,
    additionalProperties: false
  })

  output = fixTSDeclarations(output)

  await mkdir('src', { recursive: true })
  await writeFile('src/schema.d.ts', output, 'utf8')
}

build()

// FITS strings that do not end with digits (so duplicated types)
// AND strings that contain V1,V2,V3,... ant the end (versioned API is considered as not duplicate)
const NON_DUPLICATED_IDENTIFIER_REGEXP = /\b(?!\w*\d+$)\w+\b|\b\w*V\d+\b/;

const isDuplicatedTypeIdentifier = (typeIdentifier: Identifier): boolean => {
  return !(typeIdentifier.escapedText.toString().match(NON_DUPLICATED_IDENTIFIER_REGEXP));
};

const getNonDuplicatedIdentifierName = (typeIdentifier: Identifier): string => {
  // removes tail digits
  return typeIdentifier.escapedText.toString().replace(/[\d.]+$/, '');
};

const fixTSDeclarations = (tsCode: string): string => {
  const tsPrinter = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  }, {
    substituteNode: (_: EmitHint, node: Node): Node => {
      if (ts.isTypeReferenceNode(node) && isDuplicatedTypeIdentifier(node.typeName as Identifier)) {
        const originalIdentifierName = getNonDuplicatedIdentifierName(node.typeName as Identifier);
        return ts.factory.createTypeReferenceNode(originalIdentifierName);
      }
      if ((ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node))
        && isDuplicatedTypeIdentifier(node.name as Identifier)) {
        const declarationIsCleared = ts.factory.createIdentifier('');
        return declarationIsCleared;
      }
      return node;
    },
  });

  const sourceFile = ts.createSourceFile('', tsCode, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);

  let result = tsPrinter.printFile(sourceFile);

  // TS compiler API does not support formatting options so we do it manually
  // You may not need it
  result = result.replace(/^(\s{4})+/gm, (match) => {
    // tabulation (2)
    return '  '.repeat(match.length / 4);
  });

  // single quotes only
  result.replace(/"/g, '\'');

  return result;
};
