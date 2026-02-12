import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useInvoices } from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DollarSign,
  Clock,
  TrendingUp,
  Users,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO, startOfMonth } from "date-fns";

export default function Dashboard() {
  // Fetch all invoices (first 100 for dashboard aggregation)
  const { data, isLoading } = useInvoices({ limit: "100" });
  const invoices = data?.data ?? [];

  // ─── KPI calculations ──────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalSpend = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.totalAmount || "0"),
      0
    );
    const pendingReview = invoices.filter(
      (inv) => inv.status === "review"
    ).length;
    const avgValue =
      invoices.length > 0 ? totalSpend / invoices.length : 0;

    const vendorNames = new Set(
      invoices.filter((inv) => inv.vendorName).map((inv) => inv.vendorName)
    );

    return { totalSpend, pendingReview, avgValue, newVendors: vendorNames.size };
  }, [invoices]);

  // ─── Spend over time (monthly aggregation) ─────────────────────────────
  const spendOverTime = useMemo(() => {
    const monthly = new Map<string, number>();
    for (const inv of invoices) {
      if (!inv.createdAt) continue;
      const key = format(startOfMonth(parseISO(inv.createdAt)), "yyyy-MM");
      monthly.set(key, (monthly.get(key) ?? 0) + parseFloat(inv.totalAmount || "0"));
    }
    return Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, spend]) => ({
        month: format(parseISO(`${month}-01`), "MMM yyyy"),
        spend,
      }));
  }, [invoices]);

  // ─── Top 5 vendors ─────────────────────────────────────────────────────
  const topVendors = useMemo(() => {
    const vendorMap = new Map<string, number>();
    for (const inv of invoices) {
      const name = inv.vendorName || "Unknown";
      vendorMap.set(name, (vendorMap.get(name) ?? 0) + parseFloat(inv.totalAmount || "0"));
    }
    return Array.from(vendorMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, spend]) => ({ name, spend }));
  }, [invoices]);

  // ─── Recent activity ───────────────────────────────────────────────────
  const recent = invoices.slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* ─── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Spend"
          value={`$${kpis.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
        />
        <KpiCard
          title="Pending Review"
          value={String(kpis.pendingReview)}
          icon={Clock}
          highlight={kpis.pendingReview > 0}
        />
        <KpiCard
          title="Avg. Invoice Value"
          value={`$${kpis.avgValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={TrendingUp}
        />
        <KpiCard
          title="Vendors"
          value={String(kpis.newVendors)}
          icon={Users}
        />
      </div>

      {/* ─── Charts ─────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spend Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {spendOverTime.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No data yet. Upload invoices to see trends.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={spendOverTime}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                      "Spend",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="hsl(240 5.9% 10%)"
                    fill="url(#spendGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 Vendors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 Vendors</CardTitle>
          </CardHeader>
          <CardContent>
            {topVendors.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No vendor data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topVendors} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                      "Total Spend",
                    ]}
                  />
                  <Bar dataKey="spend" fill="hsl(240 5.9% 10%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Recent Activity ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Link
            to="/invoices"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No invoices yet. Upload your first invoice to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {recent.map((inv) => (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="flex items-center justify-between rounded-md border px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {inv.vendorName || inv.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.invoiceNumber || "No number"} &middot;{" "}
                      {inv.createdAt
                        ? format(parseISO(inv.createdAt), "MMM d, yyyy")
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {inv.totalAmount
                        ? `$${parseFloat(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : "—"}
                    </span>
                    <StatusBadge status={inv.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── KPI Card component ──────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  highlight,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-300" : undefined}>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
