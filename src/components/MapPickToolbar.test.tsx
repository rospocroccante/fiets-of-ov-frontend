import { render, screen, fireEvent } from "@testing-library/react";
import { MapPickToolbar } from "./MapPickToolbar";

test("clicking Start requests arming the start endpoint", () => {
  const armed: string[] = [];
  render(<MapPickToolbar armed={null} onArm={(w) => armed.push(w)} />);
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  expect(armed).toEqual(["start"]);
});

test("the armed endpoint's button is pressed and a hint is shown", () => {
  render(<MapPickToolbar armed="end" onArm={() => {}} />);
  expect(screen.getByRole("button", { name: /^end$/i })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/click the map/i)).toBeInTheDocument();
});
