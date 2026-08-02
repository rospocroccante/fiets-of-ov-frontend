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

test("the field is an ARIA combobox: expanded state and activedescendant follow the list", async () => {
  render(<ControlledHarness />);
  const input = screen.getByPlaceholderText("From");
  expect(input).toHaveAttribute("role", "combobox");
  expect(input).toHaveAttribute("aria-autocomplete", "list");
  expect(input).toHaveAttribute("aria-expanded", "false");

  fireEvent.change(input, { target: { value: "vondel" } });
  const list = await screen.findByRole("listbox");
  expect(input).toHaveAttribute("aria-expanded", "true");
  expect(input).toHaveAttribute("aria-controls", list.id);
  // Nothing highlighted until the user asks for it.
  expect(input).not.toHaveAttribute("aria-activedescendant");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  const option = screen.getAllByRole("option")[0];
  expect(option).toHaveAttribute("aria-selected", "true");
  expect(input).toHaveAttribute("aria-activedescendant", option.id);
});

test("keyboard: ArrowDown then Enter selects the highlighted suggestion", async () => {
  const onSelect = vi.fn();
  render(<PlaceInput value="" placeholder="From" onChange={() => {}} onSelect={onSelect} />);
  const input = screen.getByPlaceholderText("From");
  fireEvent.change(input, { target: { value: "vondel" } });
  await screen.findByRole("listbox");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect.mock.calls[0][0].name).toMatch(/Vondelpark/);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("keyboard: ArrowUp wraps to the last suggestion", async () => {
  const onSelect = vi.fn();
  render(<PlaceInput value="" placeholder="From" onChange={() => {}} onSelect={onSelect} />);
  const input = screen.getByPlaceholderText("From");
  // "museum" matches both museums in the fixture, so there is a last item to wrap to.
  fireEvent.change(input, { target: { value: "museum" } });
  await screen.findByRole("listbox");
  const options = screen.getAllByRole("option");
  expect(options.length).toBeGreaterThan(1);

  fireEvent.keyDown(input, { key: "ArrowUp" });
  const after = screen.getAllByRole("option");
  expect(after[after.length - 1]).toHaveAttribute("aria-selected", "true");
});

test("Escape closes the list and it stays closed until the next keystroke", async () => {
  render(<ControlledHarness />);
  const input = screen.getByPlaceholderText("From");
  fireEvent.change(input, { target: { value: "vondel" } });
  await screen.findByRole("listbox");

  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(input).toHaveAttribute("aria-expanded", "false");

  // Typing on brings it back.
  fireEvent.change(input, { target: { value: "vondelp" } });
  expect(await screen.findByRole("listbox")).toBeInTheDocument();
});

test("keyboard also drives the recents list", () => {
  const picked: string[] = [];
  render(
    <PlaceInput
      value=""
      placeholder="From"
      onChange={() => {}}
      onSelect={() => {}}
      history={[
        { label: "NDSM", query: "52.401,4.8935" },
        { label: "Dam", query: "52.373,4.8926" },
      ]}
      onPickHistory={(h) => picked.push(h.query)}
    />,
  );
  const input = screen.getByPlaceholderText("From");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(picked).toEqual(["52.373,4.8926"]);
});

test("a saved place does not hide a remote namesake somewhere else in town", async () => {
  // A saved "Vondelpark" pin 3 km away from the real park: same name, different place,
  // so the remote result must still be offered (deduping on the name alone hid it).
  const saved = [
    { id: "52.4000,4.9500", name: "Vondelpark", label: "Vondelpark (my pin)", lat: 52.4, lon: 4.95 },
  ];
  render(
    <PlaceInput
      value=""
      placeholder="From"
      onChange={() => {}}
      onSelect={() => {}}
      savedPlaces={saved}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "vondel" } });
  await screen.findByRole("listbox");
  expect(screen.getAllByRole("option")).toHaveLength(2);
});

test("the same place saved and returned remotely is listed once", async () => {
  // Same name, a few metres apart: one entry, the saved one.
  const saved = [
    { id: "52.3580,4.8686", name: "Vondelpark", label: "Vondelpark", lat: 52.358, lon: 4.8686 },
  ];
  render(
    <PlaceInput
      value=""
      placeholder="From"
      onChange={() => {}}
      onSelect={() => {}}
      savedPlaces={saved}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "vondel" } });
  await screen.findByRole("listbox");
  expect(screen.getAllByRole("option")).toHaveLength(1);
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
