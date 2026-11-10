import { useState } from 'react';
import { Check, Copy, Landmark, Shield } from 'lucide-react';
import { formatPercent, formatThousands, formatUf, money } from '@/lib/format';

const TERMS = [12, 24, 36, 48];
const SUGGESTED_TERM = 48;
const ANNUAL_RATE = 25.32;
const MONTHLY_RATE = ANNUAL_RATE / 12 / 100;
const INSURANCE_RATE = 0.0026;
const OPERATING_RATE = 0.058;
const MIN_DOWN_PERCENT = 20;
const DOWN_SHORTCUTS = [20, 30, 40, 50];
const DEFAULT_PRICE = 39400000;

const parseAmount = (text: string) => Number(text.replace(/\D/g, '')) || 0;
const parseDecimal = (text: string) => Number(text.replace(',', '.')) || 0;
const formatDecimalInput = (value: number) => Number(value.toFixed(2)).toString().replace('.', ',');

const monthlyPayment = (principal: number, months: number) => principal * MONTHLY_RATE / (1 - (1 + MONTHLY_RATE) ** -months);

// Annual effective rate (CAE) that equates the amount requested with the fixed installments.
function annualCae(principal: number, payment: number, months: number) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const presentValue = payment * (1 - (1 + mid) ** -months) / mid;
    if (presentValue > principal) low = mid;
    else high = mid;
  }
  return (1 + (low + high) / 2) ** 12 - 1;
}

export function SimuladorCuotas({ ufValue }: { ufValue: number }) {
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [down, setDown] = useState(Math.round(DEFAULT_PRICE * MIN_DOWN_PERCENT / 100));
  const [term, setTerm] = useState(SUGGESTED_TERM);
  const [includeInsurance, setIncludeInsurance] = useState(true);
  const [copied, setCopied] = useState(false);

  const effectiveDown = Math.min(price, Math.max(down, price * MIN_DOWN_PERCENT / 100));
  const downPercent = price > 0 ? (effectiveDown / price) * 100 : 0;
  const requested = price - effectiveDown;
  const requestedUf = ufValue > 0 ? requested / ufValue : 0;
  const insuranceCost = requested * INSURANCE_RATE;
  const insurance = includeInsurance ? insuranceCost : 0;
  const financed = requested + insurance + requested * OPERATING_RATE;

  const installments = TERMS.map((months) => ({ months, value: requested > 0 ? Math.round(monthlyPayment(financed, months)) : 0 }));
  const payment = installments.find((item) => item.months === term)?.value ?? 0;
  const totalToPay = payment * term;
  const financingCost = totalToPay - financed;
  const cae = requested > 0 && payment > 0 ? annualCae(requested, payment, term) : 0;

  const commitDown = () => setDown(effectiveDown);
  const handleDownPercent = (text: string) => setDown(Math.round(price * parseDecimal(text) / 100));

  const quote = [
    'Cotización de crédito automotriz - CARWIN',
    `Precio del vehículo: ${money(price)}`,
    `Pie: ${money(effectiveDown)} (${formatPercent(downPercent)})`,
    `Monto solicitado: ${money(requested)} (${formatUf(requestedUf)})`,
    `Plazo: ${term} cuotas`,
    `Cuota mensual estimada: ${money(payment)}`,
    `Seguro de desgravamen: ${includeInsurance ? `incluido (${money(insuranceCost)})` : 'no incluido'}`,
    `Total a pagar: ${money(totalToPay)}`,
    `Tasa anual: ${formatPercent(ANNUAL_RATE)}`,
    `CAE: ${formatPercent(cae * 100)}`,
  ].join('\n');

  const copyQuote = async () => {
    try {
      await navigator.clipboard.writeText(quote);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return <>
    <section className="page-heading">
      <div>
        <p className="eyebrow">CRÉDITO AUTOMOTRIZ</p>
        <h2>Simulador de <span>cuotas</span></h2>
        <p className="muted">Calcula la cuota mensual para tus clientes en segundos.</p>
      </div>
    </section>

    <div className="rounded-3xl bg-slate-100 p-4 text-slate-900 sm:p-6">
      <div>
        <h3 className="text-base font-bold text-slate-900">Elige tu plazo</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {installments.map((item) => {
            const selected = item.months === term;
            return <button key={item.months} type="button" onClick={() => setTerm(item.months)} aria-pressed={selected} className={`relative rounded-2xl border-2 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-blue-600 shadow-md' : 'border-slate-200'}`}>
              {item.months === SUGGESTED_TERM && <span className="absolute -top-3 left-4 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white">SUGERIDO</span>}
              {selected && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white"><Check size={13} strokeWidth={3} /></span>}
              <span className="block text-sm font-semibold text-slate-500">{item.months} cuotas</span>
              <span className="mt-1 block text-2xl font-extrabold text-slate-900">{money(item.value)}</span>
              <span className="block text-sm text-slate-500">/mes</span>
            </button>;
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Precio del vehículo</span>
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
              <span className="font-semibold text-slate-500">$</span>
              <input inputMode="numeric" value={formatThousands(price)} onChange={(event) => setPrice(parseAmount(event.target.value))} className="w-full bg-transparent py-3 text-lg font-semibold text-slate-900 outline-none" />
            </span>
          </label>

          <div>
            <span className="text-sm font-semibold text-slate-600">Pie</span>
            <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
              <span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <span className="font-semibold text-slate-500">$</span>
                <input aria-label="Monto del pie" inputMode="numeric" value={formatThousands(effectiveDown)} onChange={(event) => setDown(parseAmount(event.target.value))} onBlur={commitDown} className="w-full bg-transparent py-3 font-semibold text-slate-900 outline-none" />
              </span>
              <span className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <input aria-label="Porcentaje del pie" inputMode="decimal" value={formatDecimalInput(downPercent)} onChange={(event) => handleDownPercent(event.target.value)} onBlur={commitDown} className="w-full bg-transparent py-3 text-right font-semibold text-slate-900 outline-none" />
                <span className="font-semibold text-slate-500">%</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {DOWN_SHORTCUTS.map((percent) => {
                const active = Math.abs(downPercent - percent) < 0.01;
                return <button key={percent} type="button" onClick={() => setDown(Math.round(price * percent / 100))} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400'}`}>{percent}%</button>;
              })}
              <span className="text-xs text-slate-500">Mínimo {MIN_DOWN_PERCENT}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 p-4">
            <div>
              <span className="block text-sm font-semibold text-slate-600">Monto solicitado (Precio - Pie)</span>
              <span className="block text-sm text-slate-500">{formatUf(requestedUf)}</span>
            </div>
            <strong className="text-xl font-extrabold text-slate-900">{money(requested)}</strong>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-600">Coberturas</h4>
            <label className={`mt-2 flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition ${includeInsurance ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <input type="checkbox" checked={includeInsurance} onChange={(event) => setIncludeInsurance(event.target.checked)} className="h-5 w-5 accent-blue-600" />
              <Shield size={20} className="text-blue-600" />
              <span className="flex-1">
                <span className="block font-semibold text-slate-900">Seguro de desgravamen {includeInsurance ? '(incluido)' : '(no incluido)'}</span>
                <span className="block text-xs text-slate-500">Aprox. {formatPercent(INSURANCE_RATE * 100)} del monto solicitado</span>
              </span>
              <strong className="font-bold text-slate-900">{money(insuranceCost)}</strong>
            </label>
            <p className="mt-2 text-xs text-slate-500">Incluye gastos operacionales e impuestos ({formatPercent(OPERATING_RATE * 100)}) en el capital financiado.</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl bg-blue-600 p-6 text-white shadow-lg">
            <p className="text-xs font-bold tracking-widest text-blue-100">CUOTA MENSUAL ESTIMADA</p>
            <p className="mt-3 text-5xl font-extrabold tracking-tight">{money(payment)}</p>
            <p className="mt-3 text-sm text-blue-100">{term} cuotas mensuales · CAE {formatPercent(cae * 100)}</p>
          </div>

          <div>
            <h4 className="text-base font-bold text-slate-900">Detalle del crédito</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                { label: 'TOTAL A PAGAR', value: money(totalToPay) },
                { label: 'COSTO DEL FINANCIAMIENTO', value: money(financingCost) },
                { label: 'MONTO FINANCIADO', value: money(financed) },
                { label: 'TASA ANUAL', value: formatPercent(ANNUAL_RATE) },
              ].map((item) => <div key={item.label} className="rounded-xl bg-white p-4 shadow-sm">
                <span className="block text-[11px] font-semibold tracking-wide text-slate-500">{item.label}</span>
                <span className="mt-1 block text-base font-bold text-slate-900">{item.value}</span>
              </div>)}
            </div>
          </div>

          <button type="button" onClick={() => void copyQuote()} disabled={requested <= 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Cotización copiada' : 'Copiar cotización para WhatsApp'}
          </button>
          <p className="flex items-center gap-2 text-xs text-slate-500"><Landmark size={14} /> Cálculo referencial con UF de {money(ufValue)}, editable en Ajustes.</p>
        </div>
      </div>
    </div>
  </>;
}
