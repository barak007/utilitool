import { nodeFs } from "@file-services/node";
import { expect } from "chai";
import { utilitool, defaultOptions } from "../src/utilitool";
import { initFixtureProject } from "./test-kit";
import { join } from "path";

describe("utilitool cli", () => {
  it("run on empty", async () => {
    const dir = initFixtureProject("utils");

    await utilitool({
      project: dir.path,
    });

    console.log(getPackageContent(dir.path, "utils-doit"));
    console.log(getPackageContent(dir.path, "utils-dothat"));
    dir.remove();
  });
});

function getPackageContent(path: string, name: string) {
  const dirs = nodeFs.readdirSync(join(path, defaultOptions.outDir, name));
  const packageJSON = nodeFs.readFileSync(
    join(path, defaultOptions.outDir, name, "package.json"),
    "utf8"
  );
  return { dirs, packageJSON };
}
