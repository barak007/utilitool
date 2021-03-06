import { SourceFile } from "typescript";
import { ITextRange } from "./ts-imports";

type version = string;
type npmPackageName = string;

export interface PackageData {
  name: string;
  packageDir: string;
  files: Set<string>;
  dependencies: Map<npmPackageName, version>;
  version: version;
}
export interface SourceFileData {
  filePath: string;
  sourceText: string;
  sourceFile: SourceFile;
  importRanges: ITextRange[];
}

export type KnownKeys<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K;
} extends { [_ in keyof T]: infer U }
  ? U
  : never;
