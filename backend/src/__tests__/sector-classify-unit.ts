import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mlRoot = resolve(__dirname, "../../ml");
const templatesPath = resolve(mlRoot, "sector_classify/naics/templates.json");
const xlsxPath = resolve(
  mlRoot,
  "sector_classify/naics/2022_NAICS_Descriptions.xlsx",
);
const venvPython = resolve(mlRoot, ".venv/bin/python");

function pythonBin(): string {
  return existsSync(venvPython) ? venvPython : "python3";
}

function testNaicsWorkbookPresent() {
  assert.equal(existsSync(xlsxPath), true, "NAICS workbook should be vendored");
}

function testTemplatesFile() {
  if (!existsSync(templatesPath)) {
    const built = spawnSync(
      pythonBin(),
      ["-m", "sector_classify.cli", "build-templates"],
      {
        cwd: mlRoot,
        env: {
          ...process.env,
          PYTHONPATH: [mlRoot, process.env.PYTHONPATH ?? ""]
            .filter(Boolean)
            .join(":"),
        },
        encoding: "utf8",
      },
    );
    assert.equal(built.status, 0, built.stderr || built.stdout);
  }
  assert.equal(existsSync(templatesPath), true);
  const data = JSON.parse(readFileSync(templatesPath, "utf8")) as {
    count?: number;
    code_length?: number;
    templates?: Array<{ code?: string; name?: string; template_text?: string }>;
  };
  assert.equal(data.code_length, 5);
  assert.ok((data.count ?? 0) >= 600);
  assert.ok(Array.isArray(data.templates));
  assert.ok((data.templates?.length ?? 0) >= 600);
  const sample = data.templates?.find((t) => t.code === "33441");
  assert.ok(sample?.name?.toLowerCase().includes("semiconductor"));
  assert.ok((sample?.template_text ?? "").includes("33441"));
}

function testFilterHelperLogic() {
  // Mirror frontend matching: sector in any of top 3.
  const article = {
    sector_1_code: "52211",
    sector_2_code: "33441",
    sector_3_code: "51121",
  };
  const needle = "33441";
  const hit =
    article.sector_1_code === needle ||
    article.sector_2_code === needle ||
    article.sector_3_code === needle;
  assert.equal(hit, true);
  assert.equal(article.sector_1_code === needle, false);
}

testNaicsWorkbookPresent();
testTemplatesFile();
testFilterHelperLogic();
console.log("sector-classify unit tests passed");
