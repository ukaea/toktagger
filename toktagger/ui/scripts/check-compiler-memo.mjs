/**
 * Fails when the React Compiler leaves a listed value unmemoised. ESLint only catches a component the
 * compiler skips, not one it compiles while leaving a value such as a context value rebuilt on every render.
 */
import { transformFileAsync } from "@babel/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const uiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = {
  "src/app/contexts/TimeSeriesContext.tsx": [
    "actionsValue",
    "stateValue",
    "addAnnotation",
    "removeAnnotation",
    "updateAnnotation",
  ],
  "src/app/video/components/video-session.tsx": [
    "value",
    "desiredOverlay",
    "tryFocusPending",
    "applyAnnotatorInteractionMode",
    "commitFromAnnotorious",
    "setEditMode",
  ],
  "src/app/video/components/frame-annotator-host.tsx": ["viewerOptions"],
  "src/app/profile2d/components/profile2d.tsx": [
    "plot",
    "plotData",
    "plotLayout",
  ],
  "src/app/time_series/components/time-series.tsx": ["plotLayout"],
};

/** True when `name` is read from the compiler's memo cache rather than rebuilt on each render. */
function isMemoised(code, name) {
  const cachedConst = new RegExp(`\\bconst ${name} = (t\\d+|_temp\\d*);`);
  const restoredFromCache = new RegExp(`\\b${name} = \\$\\[\\d+\\];`);
  return cachedConst.test(code) || restoredFromCache.test(code);
}

function isDeclared(code, name) {
  return new RegExp(`\\b(const|let) ${name}\\b`).test(code);
}

const failures = [];

for (const [file, names] of Object.entries(REQUIRED)) {
  const bailouts = [];
  const result = await transformFileAsync(path.join(uiDir, file), {
    babelrc: false,
    configFile: false,
    cwd: uiDir,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        "babel-plugin-react-compiler",
        {
          logger: {
            logEvent: (_filename, event) => {
              if (event.kind === "CompileError") bailouts.push(event);
            },
          },
        },
      ],
    ],
  });
  const code = result?.code ?? "";

  for (const bailout of bailouts) {
    failures.push(
      `${file}: the compiler skipped a component (${bailout.detail?.reason ?? "unknown reason"})`,
    );
  }
  for (const name of names) {
    if (!isDeclared(code, name)) {
      failures.push(
        `${file}: "${name}" not found; update REQUIRED in scripts/check-compiler-memo.mjs`,
      );
    } else if (!isMemoised(code, name)) {
      failures.push(`${file}: the compiler does not memoise "${name}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `React Compiler memoises every checked value in ${Object.keys(REQUIRED).length} files.`,
);
