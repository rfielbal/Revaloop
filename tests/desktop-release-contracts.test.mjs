import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("fabrique aussi les artefacts signés depuis le staging Electron minimal", async () => {
  const [workflow, packagingScript, releaseGuide] = await Promise.all([
    source("../.github/workflows/desktop-release.yml"),
    source("../desktop/electron/scripts/package.mjs"),
    source("../docs/DESKTOP_RELEASE.md"),
  ]);

  assert.doesNotMatch(workflow, /npm exec -- electron-builder/);
  assert.match(
    workflow,
    /node desktop\/electron\/scripts\/package\.mjs \\\s+--mac \\\s+--arm64 \\\s+--force-code-signing \\\s+--notarize/,
  );
  assert.match(
    workflow,
    /node desktop\/electron\/scripts\/package\.mjs `\s+--win `\s+--x64 `\s+--force-code-signing/,
  );

  assert.match(
    packagingScript,
    /await cp\(resolve\(desktopRoot, "out"\), stagingApp, \{ recursive: true \}\)/,
  );
  assert.match(
    packagingScript,
    /"--projectDir",\s+stagingApp,\s+"--config",\s+stagingConfig/,
  );
  assert.match(
    packagingScript,
    /args\.push\("--config\.forceCodeSigning=true"\)/,
  );
  assert.match(
    packagingScript,
    /args\.push\("--config\.mac\.notarize=true"\)/,
  );

  assert.doesNotMatch(releaseGuide, /npm exec -- electron-builder/);
  assert.match(
    releaseGuide,
    /Le script de packaging copie uniquement `desktop\/out\/`/,
  );
});
