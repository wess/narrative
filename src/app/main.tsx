import { BasketProvider } from "@basket/ui/provider";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

// BasketProvider is mounted with a fixed theme purely to inject the
// component-library stylesheet (palette + toasts). The app owns the real theme
// and writes `data-theme` / `data-basket-theme` itself.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <BasketProvider app={{ name: "Narrative", id: "io.wess.narrative" }} theme="light">
      <App />
    </BasketProvider>,
  );
}
