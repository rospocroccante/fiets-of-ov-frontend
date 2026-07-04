import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WeatherStrip } from "./WeatherStrip";

function renderStrip() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeatherStrip lat={52.37} lon={4.89} />
    </QueryClientProvider>,
  );
}

test("renders current temperature, hourly slots and rain probability from the forecast", async () => {
  renderStrip();
  // Mock fixture: 18 degrees now, partly cloudy; rain at 70% in the 16:00 slot.
  // The degree sign is a separate JSX text node, so match on the element's textContent.
  expect(await screen.findByText("Partly cloudy")).toBeInTheDocument();
  expect(
    screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "18°"),
  ).toBeInTheDocument();
  expect(screen.getByText("16:00")).toBeInTheDocument();
  expect(
    screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "70%"),
  ).toBeInTheDocument();
});
