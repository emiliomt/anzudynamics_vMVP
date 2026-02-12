import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import InvoiceList from "@/pages/InvoiceList";
import InvoiceReviewer from "@/pages/InvoiceReviewer";
import Analytics from "@/pages/Analytics";

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          {/* Reviewer uses its own full-height layout (no sidebar padding) */}
          <Route
            path="/invoices/:id"
            element={
              <AppLayout>
                <InvoiceReviewer />
              </AppLayout>
            }
          />

          {/* All other pages use the standard layout */}
          <Route
            path="/"
            element={
              <AppLayout>
                <Dashboard />
              </AppLayout>
            }
          />
          <Route
            path="/invoices"
            element={
              <AppLayout>
                <InvoiceList />
              </AppLayout>
            }
          />
          <Route
            path="/analytics"
            element={
              <AppLayout>
                <Analytics />
              </AppLayout>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
