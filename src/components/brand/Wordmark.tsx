import wordmarkUrl from "../../../assets/branding/export/clawdio-wordmark-primary.svg";
import { useAppName } from "@/lib/app-name";

/** The primary wordmark for dark backgrounds (P1.8). Its text alternative is the app name. */
export function Wordmark({ className }: { className?: string }) {
  const name = useAppName();
  return <img src={wordmarkUrl} alt={name} className={className} draggable={false} />;
}
