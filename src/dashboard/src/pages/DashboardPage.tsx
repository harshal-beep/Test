import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
} from "@tanstack/react-table";
import { PuchoCard, PuchoKPI, PuchoTable, StatusBadge } from "../components";
import {
  kpiData,
  executionTrendData,
  workflowDistributionData,
  executionLogData,
  type ExecutionLogEntry,
} from "../data/sample-data";

const tooltipStyle = {
  backgroundColor: "#fff",
  borderRadius: "12px",
  boxShadow: "0 1px 3px rgba(89,34,198,0.08)",
  border: "none",
};

const columnHelper = createColumnHelper<ExecutionLogEntry>();

export default function DashboardPage() {
  const columns = useMemo(
    () => [
      columnHelper.accessor("workflowName", {
        header: "Workflow",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("duration", {
        header: "Duration",
        cell: (info) => (
          <span className="font-mono text-pucho-violet font-semibold">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("timestamp", {
        header: "Timestamp",
        cell: (info) => info.getValue(),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: executionLogData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Dashboard</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi) => (
          <PuchoCard key={kpi.label}>
            <PuchoKPI label={kpi.label} value={kpi.value} trend={kpi.trend} />
          </PuchoCard>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PuchoCard>
          <h3 className="text-lg mb-4">Workflow Executions</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={executionTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0d8f0" />
              <XAxis dataKey="day" tick={{ fill: "#000", fontSize: 12 }} />
              <YAxis tick={{ fill: "#000", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="executions"
                stroke="#5922c6"
                fill="#5922c6"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </PuchoCard>

        <PuchoCard>
          <h3 className="text-lg mb-4">Workflow Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={workflowDistributionData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                nameKey="name"
                paddingAngle={2}
              >
                {workflowDistributionData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </PuchoCard>
      </div>

      {/* Execution Log Table */}
      <PuchoCard>
        <h3 className="text-lg mb-4">Recent Executions</h3>
        <PuchoTable table={table} />
      </PuchoCard>
    </div>
  );
}
