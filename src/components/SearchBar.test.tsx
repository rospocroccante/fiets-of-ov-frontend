import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

test("submits trimmed from/to on search", () => {
  const onSearch = vi.fn();
  render(<SearchBar onSearch={onSearch} />);
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: " Centraal " } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Vondelpark" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(onSearch).toHaveBeenCalledWith({ from: "Centraal", to: "Vondelpark" });
});

test("does not submit when a field is empty", () => {
  const onSearch = vi.fn();
  render(<SearchBar onSearch={onSearch} />);
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(onSearch).not.toHaveBeenCalled();
});
