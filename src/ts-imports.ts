import ts from "typescript";
const {
  SyntaxKind: { ImportKeyword },
  isCallExpression,
  isStringLiteral,
  isImportDeclaration,
  isExportDeclaration,
  createSourceFile,
} = ts;

export function parseCode(filePath: string, sourceText: string): ts.SourceFile {
  return createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest);
}

export interface ITextRange {
  start: number;
  end: number;
  text: string;
}

export function findImportRanges(sourceFile: ts.SourceFile): ITextRange[] {
  const importRanges: ITextRange[] = [];
  const dynamicImportsFinder = (node: ts.Node) => {
    if (
      isCallExpression(node) &&
      node.expression.kind === ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [callArgument] = node.arguments;
      if (isStringLiteral(callArgument)) {
        importRanges.push(stringLiteralToTextRange(callArgument, sourceFile));
      }
    } else {
      node.forEachChild(dynamicImportsFinder);
    }
  };
  const importsFinder = (node: ts.Node) => {
    if (isImportDeclaration(node) || isExportDeclaration(node)) {
      const { moduleSpecifier } = node;
      if (moduleSpecifier && isStringLiteral(moduleSpecifier)) {
        importRanges.push(
          stringLiteralToTextRange(moduleSpecifier, sourceFile)
        );
      }
    } else {
      node.forEachChild(dynamicImportsFinder);
    }
  };
  sourceFile.forEachChild(importsFinder);
  return importRanges;
}

function stringLiteralToTextRange(
  node: ts.StringLiteral,
  sourceFile: ts.SourceFile
): ITextRange {
  return {
    start: node.getStart(sourceFile) + 1,
    end: node.getEnd() - 1,
    text: node.text,
  };
}

export function remapImports(
  sourceText: string,
  importRanges: ITextRange[],
  remap: (request: string) => string
): string {
  let modifiedText = sourceText;
  let offset = 0;
  for (const { start, end, text } of importRanges) {
    const startWithOffset = start + offset;
    const endWithOffset = end + offset;
    const newText = remap(text);
    modifiedText =
      modifiedText.slice(0, startWithOffset) +
      newText +
      modifiedText.slice(endWithOffset);
    offset += newText.length - text.length;
  }
  return modifiedText;
}
