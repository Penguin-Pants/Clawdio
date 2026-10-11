import { Wordmark } from "@/components/brand/Wordmark";
import { AppMenu } from "./AppMenu";

/** The 32 px header strip (D11): wordmark at left, menu button at right. No layout hides it. */
export function AppHeader() {
  return (
    <header className="flex h-8 shrink-0 items-center justify-between bg-bg-canvas pr-1 pl-3">
      <Wordmark className="h-5 w-auto" />
      <AppMenu />
    </header>
  );
}
