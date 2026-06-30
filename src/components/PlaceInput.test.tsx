import { render, screen, fireEvent } from "@testing-library/react";
import { PlaceInput } from "./PlaceInput";

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
