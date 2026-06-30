import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

test("starts on the hero with headline", () => {
  renderApp();
  expect(screen.getByText("Fiets of OV")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
});

test("searching from the hero shows the results view", () => {
  renderApp();
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Vondelpark" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(screen.getByText(/routes in area/i)).toBeInTheDocument();
});
