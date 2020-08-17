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

    console.log(
      nodeFs.readdirSync(join(dir.path, defaultOptions.outDir, "utils-doit")),
      "DIRS"
    );

    console.log(
      nodeFs.readFileSync(
        join(dir.path, defaultOptions.outDir, "utils-doit", "package.json"),
        "utf8"
      ),
      "package.json"
    );

    dir.remove();
  });
});
