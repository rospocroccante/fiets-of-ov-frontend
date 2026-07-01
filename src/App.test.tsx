import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { __fireMapClick } from "./__mocks__/react-leaflet";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

test("arming Start and clicking the map sets the From field to the reverse-geocoded name", async () => {
  renderApp();
  // Start a trip from the hero to reach the results view (which shows the map).
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));

  // Arm the start endpoint and click the map near Vondelpark (a KNOWN mock place).
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  __fireMapClick(52.3581, 4.8687);

  // reverseGeocode is async: the From field updates to the mock name.
  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});
