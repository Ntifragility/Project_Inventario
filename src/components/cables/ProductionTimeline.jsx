import React, { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';

const parseLocalDate = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const startOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
};

const compact = (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : Math.round(value).toLocaleString();

export default function ProductionTimeline({ rows = [], onPeriodClick, activeFilter }) {
  const [grouping, setGrouping] = useState('week');

  const data = useMemo(() => {
    const groups = new Map();
    rows.forEach((row) => {
      const date = parseLocalDate(row.fecha_tendido);
      const meters = parseFloat(row.metrado_reportado_campo) || 0;
      if (!date || meters <= 0) return;
      const start = grouping === 'week' ? startOfWeek(date) : date;
      const key = toKey(start);
      const current = groups.get(key) || { date: key, production: 0, circuits: 0 };
      current.production += meters;
      current.circuits += 1;
      groups.set(key, current);
    });

    let cumulative = 0;
    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)).map((item) => {
      cumulative += item.production;
      const start = parseLocalDate(item.date);
      const end = grouping === 'week' ? addDays(start, 6) : start;
      return {
        ...item,
        cumulative,
        dateFrom: item.date,
        dateTo: toKey(end),
        label: grouping === 'week'
          ? `${start.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}–${end.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`
          : start.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
      };
    });
  }, [rows, grouping]);

  const selected = (entry) => activeFilter?.dateFrom === entry.dateFrom && activeFilter?.dateTo === entry.dateTo;

  return (
    <section className="production-timeline-card dashboard-drilldown-target" onClick={(event) => event.stopPropagation()}>
      <div className="production-timeline-header">
        <div>
          <h4>Producción ejecutada en el tiempo</h4>
          <span>Metros instalados por período y avance acumulado</span>
        </div>
        <div className="production-grouping" aria-label="Agrupación de producción">
          <button className={grouping === 'day' ? 'active' : ''} onClick={() => setGrouping('day')}>Diario</button>
          <button className={grouping === 'week' ? 'active' : ''} onClick={() => setGrouping('week')}>Semanal</button>
        </div>
      </div>
      {data.length ? (
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis yAxisId="production" tickFormatter={compact} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="cumulative" orientation="right" tickFormatter={compact} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
              formatter={(value, name) => [`${Math.round(value).toLocaleString()} m`, name === 'production' ? 'Producción' : 'Acumulado']}
              labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.dateFrom} — ${payload[0].payload.dateTo} · ${payload[0].payload.circuits} circuitos` : ''}
            />
            <Bar
              yAxisId="production"
              dataKey="production"
              name="production"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(entry) => {
                const period = entry?.payload || entry;
                if (period?.dateFrom) onPeriodClick?.({ source: 'timeline', label: period.label, dateFrom: period.dateFrom, dateTo: period.dateTo, condition: 'production-period' });
              }}
              opacity={activeFilter?.dateFrom ? 0.45 : 0.9}
            />
            <Line yAxisId="cumulative" type="monotone" dataKey="cumulative" name="cumulative" stroke="#3b82f6" strokeWidth={3} dot={({ cx, cy, payload }) => <circle cx={cx} cy={cy} r={selected(payload) ? 6 : 3} fill={selected(payload) ? '#f59e0b' : '#3b82f6'} />} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="production-timeline-empty">No hay producción con fecha registrada para los filtros actuales.</div>
      )}
    </section>
  );
}
