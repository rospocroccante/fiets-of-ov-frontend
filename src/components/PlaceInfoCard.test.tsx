import { render, screen, fireEvent } from "@testing-library/react";
import { PlaceInfoCard } from "./PlaceInfoCard";

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
