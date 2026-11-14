import { GreenroomError } from "../errors.js";
import { BrightDataProvider } from "./brightdata.js";
import { LocalProvider } from "./local.js";
import type { GroundProvider } from "./types.js";

export type GroundChoice = "auto" | "brightdata" | "local" | "none";

/** auto: Bright Data when a key is present, otherwise plain fetch. */
export function resolveGround(choice: GroundChoice = "auto"): GroundProvider | null {
  if (choice === "none") return null;
  if (choice === "local") return new LocalProvider();
  const bd = BrightDataProvider.fromEnv();
  if (choice === "brightdata") {
    if (!bd) throw new GreenroomError("PROVIDER_UNAVAILABLE", "BRIGHTDATA_API_KEY is not set.", "Create a key in the Bright Data dashboard, or use --ground local.");
    return bd;
  }
  return bd ?? new LocalProvider();
}

export { BrightDataProvider, LocalProvider };
export type { GroundProvider };
