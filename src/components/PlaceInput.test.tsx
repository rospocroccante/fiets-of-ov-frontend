import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PlaceInput } from "./PlaceInput";

// The real app wires PlaceInput as a controlled input: every keystroke goes up via
// onChange and comes back down as `value`. The regression this guards: treating that
// echo as an external change killed the dropdown on every keystroke.
function ControlledHarness() {
  const [text, setText] = useState("");
  return <PlaceInput value={text} placeholder="From" onChange={setText} onSelect={() => {}} />;
}

test("typing with real controlled wiring (parent echoes value) opens suggestions", async () => {
  render(<ControlledHarness />);
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "vondel" } });
  expect(await screen.findByRole("listbox")).toBeInTheDocument();
});

test("blurring the input closes the suggestion list", async () => {
  render(<ControlledHarness />);
  const input = screen.getByPlaceholderText("From");
  fireEvent.change(input, { target: { value: "vondel" } });
  await screen.findByRole("listbox");
  fireEvent.blur(input);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("shows suggestions and selects one (mock mode)", async () => {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  render(<PlaceInput value="" placeholder="From" onChange={onChange} onSelect={onSelect} />);

  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "vondel" } });
  expect(onChange).toHaveBeenCalledWith("vondel");

  const option = await screen.findByText(/Vondelpark/);
  fireEvent.click(option);
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect.mock.calls[0][0].name).toMatch(/Vondelpark/);
});

test("no suggestion box for empty input", () => {
  render(<PlaceInput value="" placeholder="To" onChange={() => {}} onSelect={() => {}} />);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("focusing an empty field shows recent endpoints; picking one fires onPickHistory", () => {
  const picked: string[] = [];
  render(
    <PlaceInput
      value=""
      placeholder="From"
      onChange={() => {}}
      onSelect={() => {}}
      history={[{ label: "NDSM", query: "52.401,4.8935" }]}
      onPickHistory={(h) => picked.push(h.query)}
    />,
  );
  fireEvent.focus(screen.getByPlaceholderText("From"));
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  fireEvent.click(screen.getByText("NDSM"));
  expect(picked).toEqual(["52.401,4.8935"]);
});

test("history hides as soon as the user types enough for live suggestions", async () => {
  render(
    <PlaceInput
      value=""
      placeholder="From"
      onChange={() => {}}
      onSelect={() => {}}
      history={[{ label: "NDSM", query: "52.401,4.8935" }]}
      onPickHistory={() => {}}
    />,
  );
  const input = screen.getByPlaceholderText("From");
  fireEvent.focus(input);
  expect(screen.getByText("NDSM")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "vondel" } });
  expect(screen.queryByText("NDSM")).toBeNull();
  expect(await screen.findByText(/Vondelpark/)).toBeInTheDocument();
});

test("programmatic value change (e.g. a suggested trip) does not open suggestions", async () => {
  const { rerender } = render(
    <PlaceInput value="" placeholder="From" onChange={() => {}} onSelect={() => {}} />,
  );
  rerender(<PlaceInput value="NDSM" placeholder="From" onChange={() => {}} onSelect={() => {}} />);
  // Past the fetch debounce: still no dropdown, the user never typed here.
  await new Promise((r) => setTimeout(r, 300));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
