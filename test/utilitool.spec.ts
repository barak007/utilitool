import { nodeFs } from "@file-services/node";
import { expect } from "chai";
import { utilitool } from "../src/utilitool";
import { initFixtureProject } from "./test-kit";

describe("utilitool cli", () => {
  it("run on empty", async () => {
    const dir = initFixtureProject("utils");

    await utilitool({
      projectRoot: dir.path,
    });
  });
});
