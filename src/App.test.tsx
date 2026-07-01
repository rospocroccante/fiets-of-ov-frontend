import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import {
  __fireMapClick,
  __fireMapContextMenu,
  __fireMarkerDragEnd,
} from "./__mocks__/react-leaflet";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

function startTrip() {
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
}

test("arming Start and clicking the map sets the From field to the reverse-geocoded name", async () => {
  renderApp();
  // Start a trip from the hero to reach the results view (which shows the map).
  startTrip();

  // Arm the start endpoint and click the map near Vondelpark (a KNOWN mock place).
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  __fireMapClick(52.3581, 4.8687);

  // reverseGeocode is async: the From field updates to the mock name.
  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});

test("dragging the end pin re-plans and updates the To field to the reverse-geocoded name", async () => {
  renderApp();
  startTrip();

  // Wait for the plan to resolve so the B pin (draggable Marker) is rendered.
  await waitFor(() => {
    const text = screen.getByText(/routes in area/i).textContent ?? "";
    if (text.startsWith("0")) throw new Error("plan still loading");
  });

  // Drag the B pin to Vondelpark; App reverse-geocodes and re-plans.
  __fireMarkerDragEnd("end", 52.358, 4.8686);

  const toField = await screen.findByDisplayValue(/vondelpark/i);
  expect(toField).toBeInTheDocument();
});

test("right-click 'Directions from here' sets the From field", async () => {
  renderApp();
  startTrip();

  __fireMapContextMenu(52.358, 4.8686);
  fireEvent.click(await screen.findByRole("button", { name: /directions from here/i }));

  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});

test("swap exchanges the From and To fields", () => {
  renderApp();
  startTrip();

  fireEvent.click(screen.getByRole("button", { name: /swap start and end/i }));

  expect(screen.getByPlaceholderText("From")).toHaveValue("Dam");
  expect(screen.getByPlaceholderText("To")).toHaveValue("Centraal");
});
