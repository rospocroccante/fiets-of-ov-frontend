import { render, screen, fireEvent } from "@testing-library/react";
import { HomeHero } from "./HomeHero";

test("renders wordmark and headline", () => {
  render(<HomeHero onSearch={() => {}} />);
  expect(screen.getByText("Fiets of OV")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
});

test("submitting typed from/to calls onSearch", () => {
  const onSearch = vi.fn();
  render(<HomeHero onSearch={onSearch} />);
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Vondelpark" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(onSearch).toHaveBeenCalledWith({ from: "Centraal", to: "Vondelpark" });
});

test("a popular-trip quick pick submits a trip", () => {
  const onSearch = vi.fn();
  render(<HomeHero onSearch={onSearch} />);
  fireEvent.click(screen.getAllByRole("button", { name: /→/ })[0]);
  expect(onSearch).toHaveBeenCalledTimes(1);
  expect(onSearch.mock.calls[0][0]).toHaveProperty("from");
  expect(onSearch.mock.calls[0][0]).toHaveProperty("to");
});
