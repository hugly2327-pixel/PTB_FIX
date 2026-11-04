import { readFileSync, existsSync } from "node:fs";
import { strict as assert } from "node:assert";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const exportHelper = readFileSync(new URL("../lib/photo-export.ts", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.equal(pkg.version, "4.2.0", "package version must be 4.1.7");
assert.match(page, /layout==="twoThree"\s*\?\s*6\s*:\s*4/, "2x3 export must include six images");
assert.match(page, /sharpenRegion\(ctx/, "export path must call the sharpening routine");
assert.match(page, /renderFinal\(mimeType/, "export must support selected image formats");
assert.match(page, /getBoundingClientRect\(\)/, "camera capture must match preview framing");
assert.ok(existsSync(new URL("../lib/template-store.ts", import.meta.url)), "IndexedDB template store must exist");
assert.ok(existsSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url)), "Pages workflow must exist");
assert.ok(!existsSync(new URL("../.github/workflows/nextjs.yml", import.meta.url)), "duplicate Pages workflow must be removed");
assert.match(exportHelper, /photos\.length !== 4 && photos\.length !== 6/, "composite helper must support 4 or 6 photos");
console.log("LH PTB 4.2.0 source checks passed.");
