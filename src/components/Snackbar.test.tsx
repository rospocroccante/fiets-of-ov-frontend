import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Snackbar } from "./Snackbar";

test("speaks politely, offers its action, and times out", () => {
  vi.useFakeTimers();
  const onAction = vi.fn();
  const onDone = vi.fn();
  render(<Snackbar message="Removed Artis" actionLabel="Undo" onAction={onAction} onDone={onDone} ms={5000} />);
  expect(screen.getByRole("status")).toHaveTextContent("Removed Artis");
  const undo = screen.getByRole("button", { name: "Undo" });
  expect(undo).toHaveClass("min-h-[44px]");
  fireEvent.click(undo);
  expect(onAction).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(5000));
  expect(onDone).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
