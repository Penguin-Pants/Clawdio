// UD20, TR-10: the slot list works by keyboard and pointer; changes apply to the band at once.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DEFAULT_SLOTS } from "@/shell/transport/slots";
import { useUiStore } from "@/store/ui";
import { CustomizeTransportDialog } from "./CustomizeTransportDialog";

function open() {
  render(
    <Dialog open>
      <DialogContent>
        <CustomizeTransportDialog />
      </DialogContent>
    </Dialog>,
  );
  return screen.getByRole("list", { name: "Transport bar slots" });
}

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((item) => item.dataset.slot);

beforeEach(() => useUiStore.setState({ transportSlots: DEFAULT_SLOTS, dialog: { kind: "customizeTransport" } }));

describe("CustomizeTransportDialog (UD20)", () => {
  it("lists every slot; play or pause has no checkbox but moves with its group", () => {
    const list = open();
    expect(names(list)).toEqual(DEFAULT_SLOTS.order);
    const play = within(list).getAllByRole("listitem")[DEFAULT_SLOTS.order.indexOf("playPause")];
    expect(within(play).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(play).getByRole("button", { name: "Move Play or pause up" }));
    expect(names(list).slice(0, 5)).toEqual(["nowPlaying", "previous", "playPause", "next", "seek"]);
    expect((screen.getByRole("checkbox", { name: "Show Search" }) as HTMLInputElement).checked).toBe(false);
  });

  it("hides Stop and moves Volume before Shuffle, and the store follows", () => {
    const list = open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Stop" }));
    expect(useUiStore.getState().transportSlots.hidden).toContain("stop");
    // Volume comes after Shuffle and Repeat: two moves up put it before Shuffle.
    fireEvent.click(screen.getByRole("button", { name: "Move Volume up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Volume up" }));
    const order = useUiStore.getState().transportSlots.order;
    expect(order.indexOf("volume")).toBe(order.indexOf("shuffle") - 1);
    expect(names(list)).toEqual(order);
    expect((screen.getByRole("button", { name: "Move Now playing up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Reset to default restores the default slots", () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(useUiStore.getState().transportSlots).toEqual(DEFAULT_SLOTS);
  });

  it("Done closes the dialog", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useUiStore.getState().dialog).toBeNull();
  });
});
