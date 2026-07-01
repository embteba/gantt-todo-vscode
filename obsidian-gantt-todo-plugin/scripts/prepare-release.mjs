import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const releaseDir = path.join(root, "release", "gantt-todo-board");

await fs.mkdir(releaseDir, { recursive: true });
await fs.copyFile(path.join(root, "manifest.json"), path.join(releaseDir, "manifest.json"));
await fs.copyFile(path.join(root, "main.js"), path.join(releaseDir, "main.js"));
await fs.copyFile(path.join(root, "styles.css"), path.join(releaseDir, "styles.css"));

console.log(`Prepared release files in ${releaseDir}`);
