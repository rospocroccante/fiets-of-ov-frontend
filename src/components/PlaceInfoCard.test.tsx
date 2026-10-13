import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnimatePresence } from "framer-motion";
import { PlaceInfoCard } from "./PlaceInfoCard";
import { waitForExit } from "../test/exit";

const place = { name: "NDSM Werf", address: "Noord, Amsterdam", lat: 52.401, lon: 4.8935 };

test("shows name, address and coordinates; star reflects saved state", () => {
  const { rerender } = render(
    <PlaceInfoCard place={place} saved={false} onToggleSave={() => {}} onDirections={() => {}} onClose={() => {}} />,
  );
  expect(screen.getByText("NDSM Werf")).toBeInTheDocument();
  expect(screen.getByText("Noord, Amsterdam")).toBeInTheDocument();
  expect(screen.getByText("52.40100, 4.89350")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /save this place/i })).toHaveAttribute("aria-pressed", "false");

  rerender(
    <PlaceInfoCard place={place} saved onToggleSave={() => {}} onDirections={() => {}} onClose={() => {}} />,
  );
  expect(screen.getByRole("button", { name: /remove from saved/i })).toHaveAttribute("aria-pressed", "true");
});

test("directions buttons report which endpoint; close closes", () => {
  const dirs: string[] = [];
  const closed = vi.fn();
  render(
    <PlaceInfoCard place={place} saved={false} onToggleSave={() => {}} onDirections={(w) => dirs.push(w)} onClose={closed} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /from here/i }));
  fireEvent.click(screen.getByRole("button", { name: /to here/i }));
  fireEvent.click(screen.getByRole("button", { name: /close place info/i }));
  expect(dirs).toEqual(["start", "end"]);
  expect(closed).toHaveBeenCalledTimes(1);
});

test("inside AnimatePresence, a closed card is out of reach until it has gone", async () => {
  // How App mounts it: the card plays an exit after its close button is pressed.
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <AnimatePresence>
        {open && (
          <PlaceInfoCard
            key="place-info"
            place={place}
            saved={false}
            onToggleSave={() => {}}
            onDirections={() => {}}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    );
  }
  const { container } = render(<Harness />);
  const card = container.firstElementChild as HTMLElement;
  expect(card).toHaveTextContent("NDSM Werf");
  expect(card).not.toHaveAttribute("inert");

  fireEvent.click(screen.getByRole("button", { name: /close place info/i }));

  expect(card).toBeInTheDocument();
  expect(card).toHaveAttribute("aria-hidden", "true");
  expect(card).toHaveAttribute("inert", "");
  expect(card).toHaveStyle({ pointerEvents: "none" });
  expect(screen.queryByRole("button", { name: /from here/i })).toBeNull();

  await waitForExit(card);
});

test("the card rises above a sheet covering the bottom of the map", () => {
  const { container } = render(
    <PlaceInfoCard
      place={place}
      saved={false}
      onToggleSave={() => {}}
      onDirections={() => {}}
      onClose={() => {}}
      bottomInset={200}
    />,
  );
  expect(container.firstElementChild).toHaveStyle({ bottom: "212px" });
});
