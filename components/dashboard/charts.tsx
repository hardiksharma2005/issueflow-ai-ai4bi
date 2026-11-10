"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Chart conventions (dataviz skill): single-series magnitude uses one hue; multi-series uses
// the validated categorical slots in fixed order with a legend; no dual axes; hover tooltips;
// recessive grid; and every chart has a table view.

const axis = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, labelFormat }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{labelFormat ? labelFormat(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium text-popover-foreground tabular-nums">{p.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  description,
  table,
  children,
}: {
  title: string;
  description?: string;
  table: { columns: string[]; rows: (string | number | null)[][] };
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={showTable}
          aria-label={showTable ? "Show chart" : "Show as table"}
          onClick={() => setShowTable((s) => !s)}
        >
          <Table2 />
        </Button>
      </div>
      <div className="h-64 px-2 pt-2 pb-3">
        {showTable ? (
          <div className="h-full overflow-auto px-2">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="py-1 text-left font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((v, j) => (
                      <td key={j} className="py-1">
                        {v ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function BreakdownChart({
  title,
  description,
  data,
}: {
  title: string;
  description?: string;
  data: { label: string; value: number }[];
}) {
  return (
    <ChartCard title={title} description={description} table={{ columns: ["", "Issues"], rows: data.map((d) => [d.label, d.value]) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" allowDecimals={false} {...axis} />
          <YAxis type="category" dataKey="label" width={118} {...axis} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip />} />
          <Bar dataKey="value" name="Issues" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TimelineChart({ data }: { data: { date: string; created: number; resolved: number }[] }) {
  const fmt = (d: string) => format(new Date(`${d}T00:00:00`), "d MMM");
  // Daily counts are mostly 0 or 1, which reads as noise; running totals (a burn-up chart)
  // show the trend, and the gap between the lines is the backlog added in the period.
  const cumulative = data.reduce<{ date: string; created: number; resolved: number }[]>((acc, d) => {
    const prev = acc.at(-1) ?? { created: 0, resolved: 0 };
    return [...acc, { date: d.date, created: prev.created + d.created, resolved: prev.resolved + d.resolved }];
  }, []);
  return (
    <ChartCard
      title="Issues created vs resolved"
      description="Running total, last 30 days"
      table={{
        columns: ["Date", "Created", "Resolved", "Created (total)", "Resolved (total)"],
        rows: data.map((d, n) => [d.date, d.created, d.resolved, cumulative[n].created, cumulative[n].resolved]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={cumulative} margin={{ left: -16, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" tickFormatter={fmt} minTickGap={28} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip content={<ChartTooltip labelFormat={fmt} />} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Area type="linear" dataKey="created" name="Created" stroke="var(--series-1)" fill="var(--series-1)" fillOpacity={0.1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Area type="linear" dataKey="resolved" name="Resolved" stroke="var(--series-2)" fill="var(--series-2)" fillOpacity={0} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ResolutionChart({ data }: { data: { week: string; resolved: number; avgDays: number | null }[] }) {
  const fmt = (d: string) => `w/c ${format(new Date(`${d}T00:00:00`), "d MMM")}`;
  return (
    <ChartCard
      title="Resolution trend"
      description="Issues resolved per week (hover for average days to resolve)"
      table={{ columns: ["Week", "Resolved", "Avg days to resolve"], rows: data.map((d) => [d.week, d.resolved, d.avgDays]) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="week" tickFormatter={(d) => format(new Date(`${d}T00:00:00`), "d MMM")} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="mb-1 font-medium">{fmt(String(label))}</div>
                  <div className="text-muted-foreground">
                    Resolved: <span className="font-medium text-popover-foreground">{payload[0].payload.resolved}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Avg days to resolve:{" "}
                    <span className="font-medium text-popover-foreground">{payload[0].payload.avgDays ?? "—"}</span>
                  </div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="resolved" name="Resolved" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
