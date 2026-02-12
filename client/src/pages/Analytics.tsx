import { useMemo } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO, startOfMonth } from "date-fns";

const COLORS = [
  "hsl(240, 5.9%, 10%)",
  "hsl(240, 4.8%, 30%)",
  "hsl(240, 3.8%, 46%)",
  "hsl(240, 4.8%, 60%)",
  "hsl(240, 5.9%, 75%)",
  "hsl(0, 84.2%, 60.2%)",
  "hsl(47, 96%, 53%)",
  "hsl(142, 71%, 45%)",
];

export default function Analytics() {
  const { data, isLoading } = useInvoices({ limit: "200" });
  const invoices = data?.data ?? [];

  // ─── Spend over time ───────────────────────────────────────────────────
  const spendOverTime = useMemo(() => {
    const monthly = new Map<string, number>();
    for (const inv of invoices) {
      if (!inv.createdAt || !inv.totalAmount) continue;
      const key = format(startOfMonth(parseISO(inv.createdAt)), "yyyy-MM");
      monthly.set(key, (monthly.get(key) ?? 0) + parseFloat(inv.totalAmount));
    }
    return Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, spend]) => ({
        month: format(parseISO(`${month}-01`), "MMM yyyy"),
        spend,
      }));
  }, [invoices]);

  // ─── Top vendors ───────────────────────────────────────────────────────
  const topVendors = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      const name = inv.vendorName || "Unknown";
      map.set(name, (map.get(name) ?? 0) + parseFloat(inv.totalAmount || "0"));
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, spend]) => ({ name, spend }));
  }, [invoices]);

  // ─── Status distribution ───────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      map.set(inv.status, (map.get(inv.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
    }));
  }, [invoices]);

  // ─── Category breakdown ────────────────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      if (!inv.rawExtraction) continue;
      const raw = inv.rawExtraction as { lineItems?: { category?: string; amount?: number }[] };
      for (const li of raw.lineItems ?? []) {
        const cat = li.category || "Uncategorized";
        map.set(cat, (map.get(cat) ?? 0) + (li.amount || 0));
      }
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, spend]) => ({ name, spend }));
  }, [invoices]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spend Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Spend Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {spendOverTime.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={spendOverTime}>
                  <defs>
                    <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Spend"]} />
                  <Area type="monotone" dataKey="spend" stroke="hsl(240 5.9% 10%)" fill="url(#aGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Vendors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Vendors by Spend</CardTitle>
          </CardHeader>
          <CardContent>
            {topVendors.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topVendors} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Total"]} />
                  <Bar dataKey="spend" fill="hsl(240 5.9% 10%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statusDist.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={statusDist} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {statusDist.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Spend by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={categoryBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Spend"]} />
                  <Bar dataKey="spend" fill="hsl(240 5.9% 10%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      No data available yet.
    </p>
  );
}
