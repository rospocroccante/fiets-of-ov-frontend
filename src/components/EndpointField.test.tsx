import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EndpointField } from "./EndpointField";
import type { Place } from "../api/types";
import type { Endpoint } from "../trip";

describe("EndpointField", () => {
  it("typing in the input calls onText with the typed text", () => {
    const onText = vi.fn();
    const onSelect = vi.fn();
    const onLocate = vi.fn();

    render(
      <EndpointField
        value=""
        placeholder="From"
        onText={onText}
        onSelect={onSelect}
        onLocate={onLocate}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("From"), {
      target: { value: "Centraal" },
    });

    expect(onText).toHaveBeenCalledWith("Centraal");
  });

  it("selecting a suggestion calls onSelect with the place", async () => {
    const onText = vi.fn();
    const onSelect = vi.fn();
    const onLocate = vi.fn();

    render(
      <EndpointField
        value=""
        placeholder="From"
        onText={onText}
        onSelect={onSelect}
        onLocate={onLocate}
      />
    );

    // type 2+ chars to trigger autocomplete
    fireEvent.change(screen.getByPlaceholderText("From"), {
      target: { value: "vondel" },
    });

    const option = await screen.findByText(/Vondelpark/);
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const place: Place = onSelect.mock.calls[0][0];
    expect(place.name).toMatch(/Vondelpark/i);
  });

  it("renders the GPS button", () => {
    render(
      <EndpointField
        value=""
        placeholder="To"
        onText={vi.fn()}
        onSelect={vi.fn()}
        onLocate={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /use my location/i })
    ).toBeInTheDocument();
  });

  it("GPS button click forwards the located endpoint via onLocate", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        geolocation: {
          getCurrentPosition: (ok: (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void) => {
            ok({ coords: { latitude: 52.358, longitude: 4.8686, accuracy: 20 } });
          },
        },
      },
      writable: true,
      configurable: true,
    });

    const onLocate = vi.fn();

    render(
      <EndpointField
        value=""
        placeholder="To"
        onText={vi.fn()}
        onSelect={vi.fn()}
        onLocate={onLocate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    const ep: Endpoint = await vi.waitFor(() => {
      expect(onLocate).toHaveBeenCalledTimes(1);
      return onLocate.mock.calls[0][0];
    });

    expect(ep.query).toBe("52.358000,4.868600");
    expect(ep.label).toMatch(/vondelpark/i);

    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
  });
});

describe("EndpointField accessible name", () => {
  it("gives the combobox an accessible name, which a placeholder alone never is", () => {
    render(
      <EndpointField
        value=""
        placeholder="From"
        onText={vi.fn()}
        onSelect={vi.fn()}
        onLocate={vi.fn()}
      />
    );

    // getByRole matches on the computed accessible name, and a placeholder does not
    // contribute one for an element carrying role="combobox": drop the aria-label and
    // this query finds nothing. The name matching the visible hint is deliberate
    // (WCAG 2.5.3, label in name), so the assertion is on the attribute as well.
    const input = screen.getByRole("combobox", { name: "From" });
    expect(input).toHaveAttribute("aria-label", "From");
    expect(input).toHaveAttribute("placeholder", "From");
  });
});

test("clear is only drawn when there is something to clear, and does not blur the field", () => {
  const onText = vi.fn();
  const { rerender } = render(
    <EndpointField
      value=""
      placeholder="From"
      onText={onText}
      onSelect={() => {}}
      onLocate={() => {}}
      onClear={() => onText("")}
      clearLabel="Clear From"
    />,
  );
  expect(screen.queryByRole("button", { name: "Clear From" })).toBeNull();

  rerender(
    <EndpointField
      value="Amsterdam Centraal"
      placeholder="From"
      onText={onText}
      onSelect={() => {}}
      onLocate={() => {}}
      onClear={() => onText("")}
      clearLabel="Clear From"
    />,
  );
  const clear = screen.getByRole("button", { name: "Clear From" });
  // A fingertip target, not a 20px glyph.
  expect(clear).toHaveClass("min-h-[44px]", "min-w-[44px]");

  // mousedown is what would blur the input and close the suggestion list under it, so
  // it has to be swallowed: on a phone that blur also drops the keyboard.
  const field = screen.getByPlaceholderText("From");
  field.focus();
  const mousedown = fireEvent.mouseDown(clear);
  expect(mousedown).toBe(false); // preventDefault() was called
  expect(document.activeElement).toBe(field);

  fireEvent.click(clear);
  expect(onText).toHaveBeenCalledWith("");
});

test("without onClear the field is exactly what it always was", () => {
  render(
    <EndpointField
      value="Amsterdam Centraal"
      placeholder="From"
      onText={() => {}}
      onSelect={() => {}}
      onLocate={() => {}}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /use my location/i })).toBeInTheDocument();
});
