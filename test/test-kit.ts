import { createTempDirectorySync } from "create-temp-directory";
import { nodeFs } from "@file-services/node";
import { basename, join } from "path";

export function initFixtureProject(name: string) {
  const projectPath = join(__dirname, "fixtures", name);
  const tmp = createTempDirectorySync(basename(projectPath));
  nodeFs.copyDirectorySync(projectPath, tmp.path);
  return tmp;
}
