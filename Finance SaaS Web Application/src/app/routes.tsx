import { createBrowserRouter } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { Dashboard } from "./pages/Dashboard";
import { AccountsPage } from "./pages/AccountsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { FinancialReportPage } from "./pages/FinancialReportPage";
import { AnalyticsReportPage } from "./pages/AnalyticsReportPage";
import { BudgetDashboard } from "./pages/BudgetDashboard";
import { CashFlowDashboard } from "./pages/CashFlowDashboard";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: MainLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "accounts", Component: AccountsPage },
      { path: "transactions", Component: TransactionsPage },
      { path: "invoices", Component: InvoicesPage },
      { path: "reports/financial", Component: FinancialReportPage },
      { path: "reports/analytics", Component: AnalyticsReportPage },
      { path: "dashboards/budget", Component: BudgetDashboard },
      { path: "dashboards/cashflow", Component: CashFlowDashboard },
    ],
  },
]);
