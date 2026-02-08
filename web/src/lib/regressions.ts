/**
 * Dev-mode regression assertions.
 * Called after processData to validate known invariants.
 */
import { ProcessedData } from "./types";

export function runRegressions(data: ProcessedData): void {
  if (process.env.NODE_ENV === "production") return;

  // Kevin O'Connell should only be mentored by Sean McVay (coaching_tree only)
  const koConnell = data.edges.filter(
    (e) => e.target === "kevin-oconnell"
  );

  if (koConnell.length !== 1) {
    console.warn(
      `[REGRESSION] Kevin O'Connell: expected 1 coaching_tree mentor edge, got ${koConnell.length}`,
      koConnell
    );
  } else if (koConnell[0].source !== "sean-mcvay") {
    console.warn(
      `[REGRESSION] Kevin O'Connell: expected mentor "sean-mcvay", got "${koConnell[0].source}"`
    );
  } else {
    console.log(
      "[REGRESSION] ✓ Kevin O'Connell: correctly shows only Sean McVay as mentor"
    );
  }

  // edges should contain ONLY coaching_tree type
  const nonCoachingTree = data.edges.filter(
    (e) => e.type !== "coaching_tree"
  );
  if (nonCoachingTree.length > 0) {
    console.warn(
      `[REGRESSION] edges contains ${nonCoachingTree.length} non-coaching_tree connections`,
      nonCoachingTree
    );
  }
}
