import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CarFront, ListChecks, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';

type LedgerEntry = { id: string; entry_date: string; category: string; detail: string; amount: number };
type BalanceAccount = { account_code: string; account_name: string; as_of: string; asset: number; liability: number; expense: number; income: number };

const CATEGORY_LABELS: Record<string, string> = {
  vehiculos: 'Vehículos',
  activo_fijo: 'Oficina y equipos',
  honorarios: 'Honorarios',
  comisiones: 'Comisiones',
  arriendos: 'Arriendos y estacionamiento',
  garantias: 'Garantías de arriendo',
  tramites: 'Trámites y notaría',
  fondos_rendir: 'Fondos por rendir',
  proveedores: 'Proveedores',
  operacion: 'Operación',
  traspasos: 'Traspasos',
  depositos: 'Depósitos',
  capital: 'Capital (acciones)',
};

const NEXT_STEPS = [
  { code: '1108001', title: 'Vender el stock', detail: 'Los autos parados inmovilizan capital cada mes.' },
  { code: '2106009', title: 'Ordenar la cuenta con el socio', detail: 'Definir cómo se devuelve o se convierte en capital.' },
  { code: '2110005', title: 'Confirmar comisiones pendientes', detail: 'Provisiones registradas que aún no se pagan.' },
  { code: '2106001', title: 'Pagar proveedores', detail: 'Facturas por pagar a proveedores.' },
  { code: '2106003', title: 'Pagar honorarios pendientes', detail: 'Honorarios devengados y no pagados.' },
  { code: '2111040', title: 'Pagar impuestos', detail: 'Cumplir antes del vencimiento.' },
  { code: '1106004', title: 'Rendir anticipos a proveedores', detail: 'Cerrar cada anticipo con factura o recuperarlo.' },
  { code: '1106005', title: 'Rendir anticipos de honorarios', detail: 'Descontar contra los honorarios del mes.' },
  { code: '1101002', title: 'Rendir fondos entregados', detail: 'Presentar comprobantes de los fondos por rendir.' },
  { code: '1104003', title: 'Recuperar garantías', detail: 'Se recuperan al término de los contratos de bodega.' },
  { code: '1109030', title: 'Usar el remanente de IVA', detail: 'Se aplica contra el IVA a pagar de los próximos meses.' },
];

const monthKey = (iso: string) => iso.slice(0, 7);

function formatDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonth(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}

export function BalanceResumen() {
  const [accounts, setAccounts] = useState<BalanceAccount[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      const [accountsResult, entriesResult] = await Promise.all([
        supabase.from('carwin_balance_accounts').select('account_code, account_name, as_of, asset, liability, expense, income'),
        supabase.from('carwin_ledger_entries').select('id, entry_date, category, detail, amount').order('entry_date', { ascending: true }),
      ]);
      if (!active) return;
      if (accountsResult.error || entriesResult.error) {
        setStatus('error');
        return;
      }
      setAccounts((accountsResult.data ?? []).map((row) => ({ ...row, asset: Number(row.asset), liability: Number(row.liability), expense: Number(row.expense), income: Number(row.income) })));
      setEntries((entriesResult.data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })));
      setStatus('ready');
    })();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (accounts.length === 0) return null;
    const asOf = accounts.reduce((latest, row) => (row.as_of > latest ? row.as_of : latest), accounts[0].as_of);
    const latest = accounts.filter((row) => row.as_of === asOf);
    const byCode = new Map(latest.map((row) => [row.account_code, row]));
    const totalExpense = latest.reduce((sum, row) => sum + row.expense, 0);
    const totalIncome = latest.reduce((sum, row) => sum + row.income, 0);
    const steps = NEXT_STEPS.flatMap((step) => {
      const row = byCode.get(step.code);
      const value = row ? row.asset + row.liability : 0;
      return value > 0 ? [{ ...step, value }] : [];
    });
    return {
      asOf,
      stockValue: byCode.get('1108001')?.asset ?? 0,
      partnerDebt: byCode.get('2106009')?.liability ?? 0,
      totalExpense,
      totalIncome,
      steps,
    };
  }, [accounts]);

  const monthly = useMemo(() => {
    const months = [...new Set(entries.map((entry) => monthKey(entry.entry_date)))].sort();
    const categories = Object.keys(CATEGORY_LABELS).filter((key) => entries.some((entry) => entry.category === key));
    const cells = new Map<string, number>();
    const monthTotals = new Map<string, { total: number; count: number; first: string }>();
    entries.forEach((entry) => {
      const key = monthKey(entry.entry_date);
      cells.set(`${entry.category}|${key}`, (cells.get(`${entry.category}|${key}`) ?? 0) + entry.amount);
      const current = monthTotals.get(key) ?? { total: 0, count: 0, first: entry.entry_date };
      monthTotals.set(key, { total: current.total + entry.amount, count: current.count + 1, first: current.first });
    });
    return { months, categories, cells, monthTotals };
  }, [entries]);

  if (status === 'loading') return <section className="monthly-analysis"><p className="muted">Cargando balance...</p></section>;
  if (status === 'error' || !summary) {
    return (
      <section className="monthly-analysis">
        <div className="alert-strip has-alerts">
          <div className="alert-title">
            <div className="alert-icon"><AlertTriangle size={20} /></div>
            <div><strong>No pudimos cargar el balance</strong><p>Recarga la página para intentarlo de nuevo.</p></div>
          </div>
        </div>
      </section>
    );
  }

  const firstDate = entries[0]?.entry_date ?? summary.asOf;

  return (
    <section id="balance-resumen" className="monthly-analysis">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BALANCE CONTABLE</p>
          <h3>Balance desde el inicio a la fecha</h3>
          <p className="muted">Movimientos desde el {formatDate(firstDate)} hasta el {formatDate(summary.asOf)}.</p>
        </div>
        <Wallet size={26} />
      </div>

      <div className="analysis-grid">
        <div className="analysis-stat">
          <span>Vehículos en stock</span>
          <strong>{money(summary.stockValue)}</strong>
          <small>Valor de compra de los autos</small>
        </div>
        <div className="analysis-stat negative">
          <span>Deuda con el socio</span>
          <strong>{money(summary.partnerDebt)}</strong>
          <small>Cuenta corriente pendiente</small>
        </div>
        <div className="analysis-stat">
          <span>Gastos acumulados</span>
          <strong>{money(summary.totalExpense)}</strong>
          <small>Según el balance al cierre</small>
        </div>
        <div className="analysis-stat">
          <span>Ventas registradas</span>
          <strong>{money(summary.totalIncome)}</strong>
          <small>Hasta el cierre cargado</small>
        </div>
      </div>

      <section className="summary-card timeline-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">CRONOLOGÍA</p>
            <h3>Cómo empezamos y cómo vamos</h3>
          </div>
          <CalendarDays size={22} />
        </div>
        <div className="timeline-track">
          <div className="timeline-node complete"><span>Inicio</span><strong>Julio 2026</strong><small>Capital inicial y primeros gastos</small></div>
          <div className="timeline-node complete"><span>Construcción</span><strong>Agosto 2026</strong><small>Compras, vehículos y operación</small></div>
          <div className="timeline-node current"><span>Situación actual</span><strong>Septiembre 2026</strong><small>Balance contable cargado</small></div>
          <div className="timeline-node pending"><span>Siguiente corte</span><strong>Octubre 2026</strong><small>Falta incorporar el balance</small></div>
        </div>
        <div className="monthly-lines">
        {monthly.months.map((key, index) => {
          const totals = monthly.monthTotals.get(key);
          return (
            <div className="summary-line" key={key}>
              <span>
                {index === 0 ? 'Inicio · ' : ''}{formatMonth(key)} · {totals?.count ?? 0} movimientos
              </span>
              <strong>{money(totals?.total ?? 0)}</strong>
            </div>
          );
        })}
        </div>
        <p className="muted">Octubre de 2026 aún no está cargado en el balance.</p>
      </section>

      <section className="summary-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">DETALLE POR MES</p>
            <h3>Gastos y compras por categoría</h3>
          </div>
          <CarFront size={22} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-semibold">Categoría</th>
                {monthly.months.map((key) => (
                  <th key={key} className="py-2 pr-3 text-right font-semibold capitalize">{formatMonth(key)}</th>
                ))}
                <th className="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {monthly.categories.map((category) => {
                const rowTotal = monthly.months.reduce((sum, key) => sum + (monthly.cells.get(`${category}|${key}`) ?? 0), 0);
                return (
                  <tr key={category} className="border-b border-white/5">
                    <td className="py-2 pr-3">{CATEGORY_LABELS[category]}</td>
                    {monthly.months.map((key) => (
                      <td key={key} className="py-2 pr-3 text-right tabular-nums">{money(monthly.cells.get(`${category}|${key}`) ?? 0)}</td>
                    ))}
                    <td className="py-2 text-right font-semibold tabular-nums">{money(rowTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">Los montos negativos reducen la deuda con el socio.</p>
      </section>

      <section className="summary-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">QUÉ DEBEMOS HACER</p>
            <h3>Pendientes al cierre</h3>
          </div>
          <ListChecks size={22} />
        </div>
        {summary.steps.map((step) => (
          <div className="summary-line" key={step.code}>
            <span>
              <strong>{step.title}</strong>
              <small className="block muted">{step.detail}</small>
            </span>
            <strong>{money(step.value)}</strong>
          </div>
        ))}
      </section>
    </section>
  );
}
