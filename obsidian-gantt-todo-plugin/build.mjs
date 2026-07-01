import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProduction = process.argv.includes("--production");

const buildOptions = {
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  outfile: "main.js",
  platform: "browser",
  sourcemap: !isProduction,
  minify: isProduction,
  target: "es2020",
  logLevel: "info"
};

if (isWatch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log("[watch] Watching for changes...");
} else {
  await esbuild.build(buildOptions);
}
