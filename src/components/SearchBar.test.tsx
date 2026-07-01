import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

function defaultProps(overrides: Partial<Parameters<typeof SearchBar>[0]> = {}) {
  return {
    fromValue: "Centraal",
    toValue: "Vondelpark",
    onFromText: vi.fn(),
    onToText: vi.fn(),
    onFromSelect: vi.fn(),
    onToSelect: vi.fn(),
    onFromLocate: vi.fn(),
    onToLocate: vi.fn(),
    onSwap: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

test("clicking the search button calls onSubmit", () => {
  const props = defaultProps();
  render(<SearchBar {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(props.onSubmit).toHaveBeenCalledTimes(1);
});

test("clicking the swap button calls onSwap", () => {
  const props = defaultProps();
  render(<SearchBar {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /swap start and end/i }));
  expect(props.onSwap).toHaveBeenCalledTimes(1);
});

test("typing in the From field calls onFromText", () => {
  const props = defaultProps({ fromValue: "" });
  render(<SearchBar {...props} />);
  fireEvent.change(screen.getByPlaceholderText("From"), {
    target: { value: "Dam" },
  });
  expect(props.onFromText).toHaveBeenCalledWith("Dam");
});

test("renders GPS buttons for both From and To fields", () => {
  const props = defaultProps();
  render(<SearchBar {...props} />);
  const gpsButtons = screen.getAllByRole("button", { name: /use my location/i });
  expect(gpsButtons).toHaveLength(2);
});
