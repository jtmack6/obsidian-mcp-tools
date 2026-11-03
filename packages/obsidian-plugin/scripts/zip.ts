import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";
import fs from "fs-extra";
import { join, resolve } from "path";
import { version } from "../../../package.json" with { type: "json" };

async function zipPlugin() {
  const pluginDir = resolve(import.meta.dir, "..");

  const releaseDir = join(pluginDir, "releases");
  fs.ensureDirSync(releaseDir);

  const zipFilePath = join(releaseDir, `obsidian-plugin-${version}.zip`);
  const output = createWriteStream(zipFilePath);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(output);

  // bun.config.ts builds main.js into the repo root, next to manifest.json
  const rootDir = resolve(pluginDir, "../..");
  for (const name of ["main.js", "manifest.json", "styles.css"]) {
    const file = join(rootDir, name);
    if (fs.existsSync(file)) archive.file(file, { name });
    else if (name !== "styles.css") throw new Error(`Missing ${file}`);
  }

  await archive.finalize();
  console.log("Plugin files zipped successfully!");
}

zipPlugin().catch((err) => {
  console.error(err);
  process.exit(1);
});
