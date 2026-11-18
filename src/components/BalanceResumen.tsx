import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CarFront, Check, ListChecks, Plus, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';

type Month = { id: string; month_start: string; month_label: string; is_closed: boolean };
type CategoryAmount = { id: string; month_start: string; category: string; amount: number };
type Metric = { id: string; month_start: string; metric_key: string; amount: number };
type PendingItem = { id: string; month_start: string; account_code: string | null; title: string; detail: string; amount: number; status: 'pending' | 'completed' };

const CATEGORY_LABELS: Record<string, string> = { vehiculos: 'Vehículos', activo_fijo: 'Oficina y equipos', honorarios: 'Honorarios', comisiones: 'Comisiones', arriendos: 'Arriendos y estacionamiento', garantias: 'Garantías', tramites: 'Trámites y notaría', fondos_rendir: 'Fondos por rendir', proveedores: 'Proveedores', operacion: 'Operación', traspasos: 'Traspasos', depositos: 'Depósitos', capital: 'Capital (acciones)' };
const METRIC_LABELS: Record<string, [string, string]> = { stock_value: ['Vehículos en stock', 'Valor de compra de los autos'], partner_debt: ['Deuda con el socio', 'Cuenta corriente pendiente'], total_expense: ['Gastos acumulados', 'Según el balance al cierre'], total_income: ['Ventas registradas', 'Hasta el cierre cargado'] };
const monthLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
const asNumber = (value: string) => Number(value.replace(/\./g, '').replace(',', '.')) || 0;
const nextMonth = (value: string) => { const date = new Date(`${value}T12:00:00`); date.setMonth(date.getMonth() + 1); return date.toISOString().slice(0, 10); };

export function BalanceResumen({ isAdmin = true }: { isAdmin?: boolean } = {}) {
  const [months, setMonths] = useState<Month[]>([]);
  const [categories, setCategories] = useState<CategoryAmount[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('2026-09-01');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    const [monthResult, categoryResult, metricResult, pendingResult] = await Promise.all([
      supabase.from('carwin_balance_months').select('id, month_start, month_label, is_closed').order('month_start'),
      supabase.from('carwin_balance_category_amounts').select('id, month_start, category, amount').order('month_start'),
      supabase.from('carwin_balance_metrics').select('id, month_start, metric_key, amount').order('month_start'),
      supabase.from('carwin_balance_pending_items').select('id, month_start, account_code, title, detail, amount, status').order('updated_at', { ascending: false }),
    ]);
    if (monthResult.error || categoryResult.error || metricResult.error || pendingResult.error) { setStatus('error'); return; }
    const loadedMonths = (monthResult.data ?? []) as Month[];
    setMonths(loadedMonths);
    setCategories((categoryResult.data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as CategoryAmount[]);
    setMetrics((metricResult.data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as Metric[]);
    setPending((pendingResult.data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as PendingItem[]);
    if (loadedMonths.length && !loadedMonths.some((month) => month.month_start === selectedMonth)) setSelectedMonth(loadedMonths[loadedMonths.length - 1].month_start);
    setStatus('ready');
  }, [selectedMonth]);

  useEffect(() => { void load(); }, [load]);

  const currentMetrics = useMemo(() => metrics.filter((item) => item.month_start === selectedMonth), [metrics, selectedMonth]);
  const currentCategories = useMemo(() => categories.filter((item) => item.month_start === selectedMonth), [categories, selectedMonth]);
  const currentPending = useMemo(() => pending.filter((item) => item.month_start === selectedMonth), [pending, selectedMonth]);
  const metricValue = (key: string) => currentMetrics.find((item) => item.metric_key === key)?.amount ?? 0;
  const saveMetric = async (key: string, value: number) => {
    if (!isAdmin) return;
    const existing = currentMetrics.find((item) => item.metric_key === key);
    const result = existing
      ? await supabase.from('carwin_balance_metrics').update({ amount: value, updated_at: new Date().toISOString() }).eq('id', existing.id).select().maybeSingle()
      : await supabase.from('carwin_balance_metrics').insert({ month_start: selectedMonth, metric_key: key, amount: value }).select().maybeSingle();
    if (result.error || !result.data) return;
    const saved = { ...result.data, amount: Number(result.data.amount) } as Metric;
    setMetrics((items) => existing ? items.map((item) => item.id === existing.id ? saved : item) : [...items, saved]);
  };

  const addMonth = async () => {
    if (!isAdmin) return;
    const start = nextMonth(months[months.length - 1]?.month_start ?? selectedMonth);
    const result = await supabase.from('carwin_balance_months').insert({ month_start: start, month_label: monthLabel(start) }).select().maybeSingle();
    if (result.error || !result.data) return;
    setMonths((items) => [...items, result.data as Month]);
    setSelectedMonth(start);
  };

  const updatePending = async (item: PendingItem, patch: Partial<PendingItem>) => {
    if (!isAdmin) return;
    const result = await supabase.from('carwin_balance_pending_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', item.id).select().maybeSingle();
    if (result.error || !result.data) return;
    setPending((items) => items.map((entry) => entry.id === item.id ? { ...result.data, amount: Number(result.data.amount) } as PendingItem : entry));
  };

 Cargando balance contable...
  if (status === 'error') return <section className="monthly-analysis"><div className="alert-strip has-alerts"><AlertTriangle size={20} /><div><strong>No pudimos cargar el balance</strong><p>Recarga la página para intentarlo de nuevo.</p></div></div></section>;

  return <section id="balance-resumen" className="monthly-analysis">
    <div className="section-heading">
      <div><p className="eyebrow">BALANCE CONTABLE</p><h3>Balance editable desde julio 2026</h3><p className="muted">Selecciona un mes y modifica cualquier monto directamente.</p></div>
      <Wallet size={26} />
    </div>
    <div className="balance-toolbar">
  <label>
    Mes visible
    <select
      value={selectedMonth}
      onChange={(event) => setSelectedMonth(event.target.value)}
    >
      {months.map((month) => (
        <option key={month.month_start} value={month.month_start}>
          {month.month_label}
        </option>
      ))}
    </select>
  </label>

  {isAdmin && (
    <button className="primary-button" onClick={() => void addMonth()}>
      <Plus size={18} /> Agregar mes al balance
    </button>
  )}
</div>
  <div className="analysis-grid">
  {Object.entries(METRIC_LABELS).map(([key, [label, detail]]) => (
    <EditableMetric
      key={key}
      label={label}
      detail={detail}
      value={metricValue(key)}
      negative={key === 'partner_debt'}
      readOnly={!isAdmin}
      onSave={(value) => void saveMetric(key, value)}
    />
  ))}
</div>
   <section className="summary-card">
  <div className="section-heading compact">
    <div>
      <p className="eyebrow">
        {isAdmin ? 'DETALLE EDITABLE' : 'DETALLE CONTABLE'}
      </p>
      <h3>Gastos y compras por categoría</h3>
    </div>
    <CarFront size={22} />
  </div>

  <div className="overflow-x-auto">
    <table className="balance-edit-table">
      <thead>
        <tr>
          <th>Categoría</th>
          {months.map((month) => (
            <th key={month.month_start}>
              {month.month_label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
          <tr key={category}>
            <td>{label}</td>
            {months.map((month) => (
              <td key={month.month_start}>
                <EditableCell
                  value={categories.find((item) =>
                    item.month_start === month.month_start &&
                    item.category === category
                  )?.amount ?? 0}
                  readOnly={!isAdmin}
                  onSave={(value) => {
                    if (!isAdmin) return;
                    setSelectedMonth(month.month_start);
                    void saveCategoryForMonth(
                      month.month_start,
                      category,
                      value,
                      categories,
                      setCategories
                    );
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {isAdmin && (
    <p className="muted">
      Haz clic en cualquier monto para editarlo.
    </p>
  )}
</section>
    <section className="summary-card"><div className="section-heading compact"><div><p className="eyebrow">DETALLE EDITABLE</p><h3>Gastos y compras por categoría</h3></div><CarFront size={22} /></div><div className="overflow-x-auto"><table className="balance-edit-table"><thead><tr><th>Categoría</th>{months.map((month) => <th key={month.month_start}>{month.month_label}</th>)}</tr></thead><tbody>{Object.entries(CATEGORY_LABELS).map(([category, label]) => <tr key={category}><td>{label}</td>{months.map((month) => <td key={month.month_start}><EditableCell value={categories.find((item) => item.month_start === month.month_start && item.category === category)?.amount ?? 0} onSave={(value) => { setSelectedMonth(month.month_start); void saveCategoryForMonth(month.month_start, category, value, categories, setCategories); }} /></td>)}</tr>)}</tbody></table></div><p className="muted">Haz clic en cualquier monto para editarlo.</p></section>
<section className="summary-card">
  <div className="section-heading compact">
    <div>
      <p className="eyebrow">QUÉ DEBEMOS HACER</p>
      <h3>Pendientes al cierre</h3>
    </div>
    <ListChecks size={22} />
  </div>

  {currentPending.map((item) => (
    <div
      className={`summary-line pending-line ${item.status === 'completed' ? 'completed' : ''}`}
      key={item.id}
    >
      <span>
        <button
          className="check-button"
          disabled={!isAdmin}
          onClick={() => {
            if (!isAdmin) return;
            void updatePending(item, {
              status: item.status === 'completed'
                ? 'pending'
                : 'completed'
            });
          }}
        >
          {item.status === 'completed' ? <Check size={15} /> : null}
        </button>

        {isAdmin ? (
          <input
            value={item.title}
            onChange={(event) =>
              setPending((items) =>
                items.map((entry) =>
                  entry.id === item.id
                    ? { ...entry, title: event.target.value }
                    : entry
                )
              )
            }
            onBlur={(event) =>
              void updatePending(item, {
                title: event.target.value
              })
            }
          />
        ) : (
          <strong>{item.title}</strong>
        )}

        <small className="block muted">{item.detail}</small>
      </span>

      <EditableCell
        value={item.amount}
        readOnly={!isAdmin}
        onSave={(value) =>
          void updatePending(item, { amount: value })
        }
      />
    </div>
  ))}
</section>
  </section>;
}

function EditableMetric({ label, detail, value, negative, onSave, readOnly = false }: {
  label: string;
  detail: string;
  value: number;
  negative: boolean;
  onSave: (value: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className={`analysis-stat ${negative ? 'negative' : ''}`}>
      <span>{label}</span>
      <EditableCell value={value} onSave={onSave} readOnly={readOnly} />
      <small>{detail}</small>
    </div>
  );
}

function EditableCell({ value, onSave, readOnly = false }: {
  value: number;
  onSave: (value: number) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (readOnly) {
    return <strong>{money(value)}</strong>;
  }

  if (editing) {
    return (
      <input
        className="balance-input"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          onSave(asNumber(draft));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    );
  }

  return (
    <button
      className="editable-number"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      {money(value)}
    </button>
  );
}
async function saveCategoryForMonth(month: string, category: string, value: number, items: CategoryAmount[], setItems: (items: CategoryAmount[]) => void) { const existing = items.find((item) => item.month_start === month && item.category === category); const result = existing ? await supabase.from('carwin_balance_category_amounts').update({ amount: value, updated_at: new Date().toISOString() }).eq('id', existing.id).select().maybeSingle() : await supabase.from('carwin_balance_category_amounts').insert({ month_start: month, category, amount: value }).select().maybeSingle(); if (result.error || !result.data) return; const saved = { ...result.data, amount: Number(result.data.amount) } as CategoryAmount; setItems(existing ? items.map((item) => item.id === existing.id ? saved : item) : [...items, saved]); }
