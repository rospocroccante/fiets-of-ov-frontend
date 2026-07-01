import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

test("calls onSubmit and reflects trimmed values via controlled props", () => {
  const onFromChange = vi.fn();
  const onToChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <SearchBar
      fromValue="Centraal"
      toValue="Vondelpark"
      onFromChange={onFromChange}
      onToChange={onToChange}
      onSubmit={onSubmit}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("calls onSubmit when Enter is pressed on From input", () => {
  // Empty-field guard has moved to App.commitSearch
  const onSubmit = vi.fn();
  render(
    <SearchBar
      fromValue=""
      toValue=""
      onFromChange={vi.fn()}
      onToChange={vi.fn()}
      onSubmit={onSubmit}
    />
  );
  fireEvent.keyDown(screen.getByPlaceholderText("From"), { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
