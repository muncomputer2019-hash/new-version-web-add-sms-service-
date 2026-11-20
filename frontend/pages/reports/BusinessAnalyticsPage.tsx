import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, TrendingUp, BarChart2, PieChart } from 'lucide-react';
import { formatINR } from '../../services/formatters';
import { AnalyticsDashboardPayload, AnalyticsSeriesPoint, reportApi } from '../../services/reportApi';
import { Button } from '../../components/Button';

interface BusinessAnalyticsPageProps {
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const SvgBarComparisonChart: React.FC<{
  points: AnalyticsSeriesPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
}> = ({ points, primaryLabel, secondaryLabel }) => {
  if (points.length === 0) {
    return <div className="h-44 flex items-center justify-center text-xs text-neutral-500">No chart data in selected range.</div>;
  }
  const maxVal = Math.max(
    1,
    ...points.map((p) => Math.max(Math.abs(p.value), Math.abs(p.secondaryValue ?? 0)))
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-[11px] text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 bg-neutral-950 dark:bg-white inline-block rounded-xs" /> {primaryLabel}
        </span>
        {secondaryLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 bg-blue-700 dark:bg-blue-400 inline-block rounded-xs" /> {secondaryLabel}
          </span>
        )}
      </div>
      <div className="w-full overflow-x-auto">
        <div className="flex items-end gap-2 min-w-[420px] h-44 pt-4 pb-1 border-b border-neutral-200 dark:border-neutral-800">
          {points.map((pt, idx) => {
            const h1 = Math.max(Math.round((Math.max(pt.value, 0) / maxVal) * 124), 2);
            const h2 =
              pt.secondaryValue !== undefined
                ? Math.max(Math.round((Math.max(pt.secondaryValue, 0) / maxVal) * 124), 2)
                : 0;
            return (
              <div key={idx} className="flex-1 min-w-[44px] flex flex-col items-center justify-end gap-1 group relative">
                <div className="flex items-end gap-1 h-32">
                  <div
                    title={`${pt.label} · ${primaryLabel}: ${formatINR(pt.value)}`}
                    className={`w-4 rounded-t-xs transition-all ${
                      pt.isEstimate ? 'bg-amber-500/80 border border-dashed border-amber-700' : 'bg-neutral-950 dark:bg-white'
                    }`}
                    style={{ height: `${h1}px` }}
                  />
                  {secondaryLabel && pt.secondaryValue !== undefined && (
                    <div
                      title={`${pt.label} · ${secondaryLabel}: ${formatINR(pt.secondaryValue)}`}
                      className="w-4 rounded-t-xs bg-blue-700 dark:bg-blue-400 transition-all"
                      style={{ height: `${h2}px` }}
                    />
                  )}
                </div>
                <span className="text-[10px] font-mono text-neutral-500 truncate max-w-[60px]" title={pt.label}>
                  {pt.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SvgLineTrendChart: React.FC<{ points: AnalyticsSeriesPoint[]; isCurrency?: boolean; stroke?: string }> = ({
  points,
  isCurrency = true,
  stroke = '#0a2e8a',
}) => {
  if (points.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-neutral-500">No trend points recorded.</div>;
  }
  const w = 520;
  const h = 140;
  const pad = 18;
  const vals = points.map((p) => p.value);
  const min = Math.min(0, ...vals);
  const max = Math.max(1, ...vals);
  const span = max - min || 1;

  const coords = points.map((pt, i) => {
    const x = points.length === 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((pt.value - min) / span) * (h - pad * 2);
    return { x, y, pt };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPath = `M ${coords[0].x},${h - pad} L ${coords.map((c) => `${c.x},${c.y}`).join(' L ')} L ${
    coords[coords.length - 1].x
  },${h - pad} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36 overflow-visible">
        <path d={areaPath} fill={stroke} fillOpacity="0.08" />
        <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={polyline} />
        {coords.map((c, idx) => (
          <g key={idx}>
            <circle cx={c.x} cy={c.y} r="3.5" fill={c.pt.isEstimate ? '#d97706' : stroke} />
            <title>
              {c.pt.label}: {isCurrency ? formatINR(c.pt.value) : c.pt.value}
              {c.pt.isEstimate ? ' (ESTIMATE)' : ''}
            </title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
        <span>{points[0]?.label}</span>
        <span>{points[Math.floor(points.length / 2)]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
};

const SvgDonutChart: React.FC<{ items: Array<{ status: string; count: number; pct: number }> }> = ({ items }) => {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  const palette = ['#0f172a', '#1d4ed8', '#15803d', '#b91c1c', '#d97706', '#64748b'];
  let cumulative = 0;
  const r = 42;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="16" />
        {items.map((item, idx) => {
          const frac = item.count / total;
          const dash = frac * c;
          const offset = -cumulative * c;
          cumulative += frac;
          return (
            <circle
              key={item.status}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={palette[idx % palette.length]}
              strokeWidth="16"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <text x="60" y="64" textAnchor="middle" className="text-sm font-bold fill-neutral-900 dark:fill-white">
          {total}
        </text>
      </svg>
      <div className="flex-1 space-y-1.5 text-xs w-full">
        {items.slice(0, 6).map((item, idx) => (
          <div key={item.status} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 truncate">
              <span className="h-2.5 w-2.5 rounded-xs shrink-0" style={{ backgroundColor: palette[idx % palette.length] }} />
              <span className="truncate">{item.status}</span>
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {item.count} ({item.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const BusinessAnalyticsPage: React.FC<BusinessAnalyticsPageProps> = ({ onShowToast }) => {
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<'daily' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportApi.getAnalytics({
        granularity,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setPayload(res.data);
    } catch (err) {
      onShowToast('error', 'Analytics Restricted or Unavailable', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [granularity, fromDate, toDate, onShowToast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-950 dark:text-white tracking-tight">
            Business Intelligence &amp; Interactive Analytics
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            13 analytical views computed directly from posted GL vouchers, confirmed receipts, CRM records, and SLA filings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(['daily', 'monthly', 'quarterly', 'yearly'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 rounded capitalize cursor-pointer font-medium ${
                granularity === g
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              {g}
            </button>
          ))}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <Button variant="primary" size="sm" loading={loading} onClick={loadAnalytics} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Update
          </Button>
        </div>
      </div>

      {payload && (
        <>
          {/* Row 1: Income vs Expense + Revenue Growth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Income vs Expense Comparison ({payload.granularity})</h2>
                <BarChart2 className="h-4 w-4 text-neutral-500" />
              </div>
              <SvgBarComparisonChart
                points={payload.incomeVsExpense}
                primaryLabel="Posted Income (₹)"
                secondaryLabel="Posted Expense (₹)"
              />
            </section>

            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Profit Trend &amp; Net Margin ({payload.granularity})</h2>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <SvgLineTrendChart points={payload.profitTrend} stroke="#15803d" />
            </section>
          </div>

          {/* Row 2: Application Success Donut + Customer Growth + Collections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Application Success Rate</h2>
                <PieChart className="h-4 w-4 text-neutral-500" />
              </div>
              <SvgDonutChart items={payload.applicationSuccessRate} />
            </section>

            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Customer Registration Growth</h2>
              <SvgLineTrendChart points={payload.customerGrowth} isCurrency={false} stroke="#0f172a" />
            </section>

            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Revenue &amp; Collection Trajectory</h2>
              <SvgLineTrendChart points={payload.monthlyCollectionComparison} stroke="#1d4ed8" />
            </section>
          </div>

          {/* Row 3: Financial Year Comparison + Outstanding Due Aging + Staff Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Financial Year Comparison (Apr–Mar)</h2>
              <div className="space-y-2 text-xs">
                {payload.financialYearComparison.map((fy) => (
                  <div key={fy.fyCode} className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
                    <span className="font-mono font-bold">FY {fy.fyCode}</span>
                    <div className="text-right tabular-nums">
                      <div>Inc: {formatINR(fy.income)} · Exp: {formatINR(fy.expense)}</div>
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400">Net: {formatINR(fy.netProfit)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Outstanding Customer Due Analysis</h2>
              <div className="space-y-2 text-xs">
                {payload.outstandingDueAnalysis.map((b) => (
                  <div key={b.bucket} className="flex justify-between p-2 rounded bg-neutral-50 dark:bg-neutral-950/50 border border-neutral-200 dark:border-neutral-800 tabular-nums">
                    <span>{b.bucket} ({b.customerCount} cust.)</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{formatINR(b.amountDue)}</span>
                  </div>
                ))}
                {payload.outstandingDueAnalysis.length === 0 && (
                  <div className="text-neutral-500">Zero outstanding customer dues.</div>
                )}
              </div>
            </section>

            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Staff Performance Comparison</h2>
              <div className="space-y-2 text-xs">
                {payload.staffPerformanceComparison.map((st) => (
                  <div key={st.staffId} className="p-2 rounded border border-neutral-200 dark:border-neutral-800 flex justify-between tabular-nums">
                    <span className="font-mono">{st.staffId}</span>
                    <span>Done: {st.completed} · Active: {st.active} · {formatINR(st.collections)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Row 4: Top 10 Services + Top 10 Customers + Clearly Labeled Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Top 10 Services by Revenue</h2>
              <div className="space-y-2 text-xs">
                {payload.top10Services.map((s, idx) => (
                  <div key={s.serviceName} className="flex items-center justify-between gap-2 tabular-nums">
                    <span className="truncate">
                      {idx + 1}. {s.serviceName} ({s.count})
                    </span>
                    <span className="font-mono font-semibold shrink-0">{formatINR(s.revenue)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Top 10 Customers by Net Collections</h2>
              <div className="space-y-2 text-xs">
                {payload.top10Customers.map((c, idx) => (
                  <div key={c.customerId} className="flex items-center justify-between gap-2 tabular-nums">
                    <span className="truncate">
                      {idx + 1}. {c.customerName} ({c.village})
                    </span>
                    <span className="font-mono font-semibold shrink-0">{formatINR(c.paid)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Business Growth Forecast (ESTIMATE)</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 rounded">
                  <AlertTriangle className="h-3 w-3" /> ESTIMATE
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-3">
                {payload.businessGrowthForecast.disclaimer}
              </p>
              <SvgBarComparisonChart
                points={payload.businessGrowthForecast.points}
                primaryLabel="Historical / Projected Revenue (₹)"
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
};
