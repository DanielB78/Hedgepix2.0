import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mlRoot = resolve(__dirname, "../../ml");
const sectorsPath = resolve(mlRoot, "sector_classify/sectors.json");

function testSectorsFilePresent() {
  assert.equal(existsSync(sectorsPath), true);
  // Dynamic import avoided — read via spawn python for schema sanity.
  const py = spawnSync(
    "python3",
    [
      "-c",
      "import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d,dict) and len(d)>=8; assert all(len(v)>=5 for v in d.values())",
      sectorsPath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(py.status, 0, py.stderr || py.stdout);
}

testSectorsFilePresent();
console.log("sector-classify unit tests passed");
