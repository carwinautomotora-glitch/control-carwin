import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clipboard,
  Clock3,
  Copy,
  Image as ImageIcon,
  LayoutDashboard,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  Trash2,
  TrendingUp,
  Wallet,
  CreditCard,
  Eye,
  FileText,
  FileSignature,
  Calculator,
  Landmark,
  ArrowRightLeft,
  Info,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatPercent, money } from '@/lib/format';
import { SimuladorCuotas } from '@/components/SimuladorCuotas';
import { BalanceResumen } from '@/components/BalanceResumen';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const TODAY = new Date();
const DEFAULT_DAILY_STAY_COST = 3900;
const DEFAULT_UF_VALUE = 47890;
const ADDRESS_TEXT = 'Av. Vitacura 4607 Nivel -3 N°22\nCentro Comercial Paseo el Tamarugo';

type VehicleType = 'own' | 'physical_consignment' | 'virtual_consignment';
type MaintenanceType = 'brand' | 'private' | 'none';
type ExpenseType = 'wash' | 'extra';
type ExpenseAllocation = 'carwin' | 'customer' | 'shared';
type PaymentMethod = 'cash' | 'bank_draft' | 'bank_transfer' | 'card' | 'trade_in';
type View = 'dashboard' | 'inventory' | 'expenses' | 'calculators' | 'simulador' | 'reports';

interface Vehicle {
  id: string;
  model: string;
  plate: string;
  kilometers: number;
  owners_count: number;
  color: string;
  vehicle_type: VehicleType;
  purchase_price: number;
  sale_price: number;
  agreed_price: number;
  has_both_keys: boolean;
  maintenance_type: MaintenanceType;
  permit_expiry: string | null;
  soap_expiry: string | null;
  inspection_expiry: string | null;
  entered_at: string;
  status: 'active' | 'sold' | 'removed';
}

interface VehicleExpense {
  id: string;
  vehicle_id: string;
  expense_type: ExpenseType;
  description: string;
  amount: number;
  expense_date: string;
  allocation: ExpenseAllocation;
  is_daily_stay: boolean;
}

interface OfficeExpense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
}

interface Sale {
  id: string;
  vehicle_id: string;
  sold_at: string;
  real_sale_price: number;
  agreed_price: number;
  charged_expense_ids: string[];
  final_transfer_amount: number;
  parking_charged: boolean;
  status: 'completed' | 'cancelled';
  folio: string;
  buyer_name: string;
  buyer_rut: string;
  buyer_address: string;
  buyer_phone: string;
  delivery_date: string | null;
  terms: string;
  document_version: number;
}

interface SalePayment {
  id: string;
  sale_id: string;
  payment_date: string;
  method: PaymentMethod;
  amount: number;
  bank: string;
  operation_reference: string;
  receipt_url: string | null;
  verified: boolean;
  notes: string;
}

interface CarwinSettings {
  daily_stay_cost: number;
  card_fee_rate: number;
  transfer_tax_rate: number;
  transfer_fixed_cost: number;
  uf_value: number;
}

interface GroupedExpense {
  key: string;
  description: string;
  total: number;
  count: number;
}

const initialVehicle: Omit<Vehicle, 'id' | 'status'> = {
  model: '', plate: '', kilometers: 0, owners_count: 1, color: '', vehicle_type: 'own',
  purchase_price: 0, sale_price: 0, agreed_price: 0, has_both_keys: false, maintenance_type: 'none',
  permit_expiry: '', soap_expiry: '', inspection_expiry: '', entered_at: '2026-11-02',
};

const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', '') : 'Sin fecha';
const daysBetween = (date: string) => Math.max(1, Math.floor((TODAY.getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000) + 1);
const isPhysical = (type: VehicleType) => type === 'own' || type === 'physical_consignment';
const typeLabel = (type: VehicleType) => type === 'own' ? 'Propio' : type === 'physical_consignment' ? 'Consignación física' : 'Consignación virtual';
const paymentMethodLabel = (method: PaymentMethod) => method === 'cash' ? 'Efectivo' : method === 'bank_draft' ? 'Vale vista' : method === 'bank_transfer' ? 'Transferencia' : method === 'card' ? 'Tarjeta' : 'Parte de pago';

function groupExpenses(expenses: VehicleExpense[]): GroupedExpense[] {
  const map = new Map<string, GroupedExpense>();
  for (const expense of expenses) {
    const key = expense.description.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.total += expense.amount;
      existing.count += 1;
    } else {
      map.set(key, { key, description: expense.description, total: expense.amount, count: 1 });
    }
  }
  return Array.from(map.values());
}

function App({ isAdmin = false }: { isAdmin?: boolean }) {
  const [view, setView] = useState<View>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; });
  const monthPrefix = selectedMonth;
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpense[]>([]);
  const [officeExpenses, setOfficeExpenses] = useState<OfficeExpense[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [settings, setSettings] = useState<CarwinSettings>({ daily_stay_cost: DEFAULT_DAILY_STAY_COST, card_fee_rate: 1.8, transfer_tax_rate: 1.5, transfer_fixed_cost: 130000, uf_value: DEFAULT_UF_VALUE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [sellingVehicle, setSellingVehicle] = useState<Vehicle | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [showOfficeForm, setShowOfficeForm] = useState(false);
  const [expenseVehicle, setExpenseVehicle] = useState<Vehicle | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const results = await Promise.all([
      supabase.from('carwin_vehicles').select('*').order('created_at'),
      supabase.from('carwin_vehicle_expenses').select('*').order('expense_date'),
      supabase.from('carwin_office_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('carwin_sales').select('*').order('sold_at', { ascending: false }),
      supabase.from('carwin_sale_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('carwin_settings').select('*').maybeSingle(),
    ]);
    const [vehicleResult, vehicleExpenseResult, officeResult, salesResult, paymentResult, settingsResult] = results;
    const firstError = vehicleResult.error ?? vehicleExpenseResult.error ?? officeResult.error ?? salesResult.error ?? paymentResult.error ?? settingsResult.error;
    if (firstError) setError('No pudimos cargar los datos. Revisa la conexión e inténtalo de nuevo.');
    else {
      setVehicles((vehicleResult.data ?? []) as Vehicle[]);
      setVehicleExpenses((vehicleExpenseResult.data ?? []) as VehicleExpense[]);
      setOfficeExpenses((officeResult.data ?? []) as OfficeExpense[]);
      setSales((salesResult.data ?? []) as Sale[]);
      setSalePayments((paymentResult.data ?? []) as SalePayment[]);
      if (settingsResult.data) setSettings(settingsResult.data as CarwinSettings);
    }
    setLoading(false);
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('carwin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_vehicles' }, (payload) => {
        if (payload.eventType === 'INSERT') setVehicles((items) => [...items, payload.new as Vehicle]);
        else if (payload.eventType === 'UPDATE') setVehicles((items) => items.map((item) => item.id === (payload.new as Vehicle).id ? payload.new as Vehicle : item));
        else if (payload.eventType === 'DELETE') setVehicles((items) => items.filter((item) => item.id !== (payload.old as Vehicle).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_vehicle_expenses' }, (payload) => {
        if (payload.eventType === 'INSERT') setVehicleExpenses((items) => [...items, payload.new as VehicleExpense]);
        else if (payload.eventType === 'UPDATE') setVehicleExpenses((items) => items.map((item) => item.id === (payload.new as VehicleExpense).id ? payload.new as VehicleExpense : item));
        else if (payload.eventType === 'DELETE') setVehicleExpenses((items) => items.filter((item) => item.id !== (payload.old as VehicleExpense).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_office_expenses' }, (payload) => {
        if (payload.eventType === 'INSERT') setOfficeExpenses((items) => [payload.new as OfficeExpense, ...items]);
        else if (payload.eventType === 'UPDATE') setOfficeExpenses((items) => items.map((item) => item.id === (payload.new as OfficeExpense).id ? payload.new as OfficeExpense : item));
        else if (payload.eventType === 'DELETE') setOfficeExpenses((items) => items.filter((item) => item.id !== (payload.old as OfficeExpense).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_sales' }, (payload) => {
        if (payload.eventType === 'INSERT') setSales((items) => [payload.new as Sale, ...items]);
        else if (payload.eventType === 'UPDATE') setSales((items) => items.map((item) => item.id === (payload.new as Sale).id ? payload.new as Sale : item));
        else if (payload.eventType === 'DELETE') setSales((items) => items.filter((item) => item.id !== (payload.old as Sale).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_sale_payments' }, (payload) => {
        if (payload.eventType === 'INSERT') setSalePayments((items) => [payload.new as SalePayment, ...items]);
        else if (payload.eventType === 'UPDATE') setSalePayments((items) => items.map((item) => item.id === (payload.new as SalePayment).id ? payload.new as SalePayment : item));
        else if (payload.eventType === 'DELETE') setSalePayments((items) => items.filter((item) => item.id !== (payload.old as SalePayment).id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const monthSales = sales.filter((s) => s.sold_at.startsWith(monthPrefix) && s.status !== 'cancelled');
  const monthSalesTotal = monthSales.reduce((sum, sale) => {
    const vehicle = vehicles.find((item) => item.id === sale.vehicle_id);
    return vehicle ? sum + calculateSaleUtility(vehicle, sale, vehicleExpenses, settings.daily_stay_cost) : sum;
  }, 0);
  const currentOfficeExpenses = officeExpenses.filter((e) => e.expense_date.startsWith(monthPrefix));
  const officeTotal = currentOfficeExpenses.reduce((sum, e) => sum + e.amount, 0);
  const monthUtility = monthSalesTotal - officeTotal;
  const potentialProfit = activeVehicles.reduce((total, v) => total + calculateVehicleMargin(v, vehicleExpenses, settings.daily_stay_cost), 0);
  const physicalAging = activeVehicles.filter((v) => isPhysical(v.vehicle_type) && daysBetween(v.entered_at) > 60).length;
  const documentationAlerts = activeVehicles.reduce((total, v) => total + expiringDocuments(v), 0);

  const saveVehicle = async (data: Omit<Vehicle, 'id' | 'status'>, id?: string) => {
    const payload = { ...data, plate: data.plate.toUpperCase() };
    const result = id
      ? await supabase.from('carwin_vehicles').update(payload).eq('id', id).select().maybeSingle()
      : await supabase.from('carwin_vehicles').insert(payload).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo guardar');
    if (id) setVehicles((items) => items.map((item) => item.id === id ? result.data as Vehicle : item));
    else setVehicles((items) => [...items, result.data as Vehicle]);
    setShowVehicleForm(false);
    setEditingVehicle(null);
  };

  const removeVehicle = async (vehicle: Vehicle) => {
    if (!window.confirm(`¿Retirar ${vehicle.model} del stock?`)) return;
    const result = await supabase.from('carwin_vehicles').update({ status: 'removed' }).eq('id', vehicle.id);
    if (result.error) setError('No se pudo retirar el vehículo.');
    else setVehicles((items) => items.filter((item) => item.id !== vehicle.id));
  };

  const addOfficeExpense = async (description: string, amount: number, date: string) => {
    const result = await supabase.from('carwin_office_expenses').insert({ description, amount, expense_date: date }).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo guardar');
    setOfficeExpenses((items) => [result.data as OfficeExpense, ...items]);
    setShowOfficeForm(false);
  };

  const addVehicleExpense = async (vehicleId: string, description: string, amount: number, expenseType: ExpenseType, allocation: ExpenseAllocation = 'carwin') => {
    const result = await supabase.from('carwin_vehicle_expenses').insert({ vehicle_id: vehicleId, expense_type: expenseType, description, amount, allocation, expense_date: '2026-11-02' }).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo guardar');
    setVehicleExpenses((items) => [...items, result.data as VehicleExpense]);
  };

  const deleteVehicleExpense = async (id: string) => {
    const result = await supabase.from('carwin_vehicle_expenses').delete().eq('id', id);
    if (result.error) { setError('No se pudo eliminar el gasto.'); return; }
    setVehicleExpenses((items) => items.filter((item) => item.id !== id));
  };

  const updateVehicleExpense = async (id: string, description: string, amount: number, allocation: ExpenseAllocation) => {
    const result = await supabase.from('carwin_vehicle_expenses').update({ description, amount, allocation }).eq('id', id).select().maybeSingle();
    if (result.error || !result.data) { setError('No se pudo actualizar el gasto.'); return; }
    setVehicleExpenses((items) => items.map((item) => item.id === id ? result.data as VehicleExpense : item));
  };

  const addSalePayment = async (saleId: string, payment: Omit<SalePayment, 'id' | 'sale_id'>) => {
    const result = await supabase.from('carwin_sale_payments').insert({ sale_id: saleId, ...payment }).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo registrar el pago');
    setSalePayments((items) => [result.data as SalePayment, ...items]);
  };

  const deleteSalePayment = async (id: string) => {
    const result = await supabase.from('carwin_sale_payments').delete().eq('id', id);
    if (result.error) { setError('No se pudo eliminar el pago.'); return; }
    setSalePayments((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="brand-logo" />
          <div><p className="eyebrow">CONTROL OPERATIVO</p><h1>CARWIN</h1></div>
        </div>
        <button className="icon-button" onClick={() => setShowInfo(true)} aria-label="Abrir información"><Banknote size={20} /></button>
      </header>

      <main className="main-content">
        {error && <div className="error-banner"><AlertTriangle size={18} />{error}<button onClick={() => setError('')}><X size={17} /></button></div>}
{view === 'dashboard' && <><Dashboard activeVehicles={activeVehicles} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} monthUtility={monthUtility} monthSalesTotal={monthSalesTotal} officeTotal={officeTotal} potentialProfit={potentialProfit} documentationAlerts={documentationAlerts} physicalAging={physicalAging} onSeeInventory={() => setView('inventory')} onSell={setSellingVehicle} onManageExpenses={setExpenseVehicle} vehicleExpenses={vehicleExpenses} /><BalanceResumen isAdmin={isAdmin} /></>}
        {view === 'reports' && <Reports vehicles={vehicles} sales={sales} vehicleExpenses={vehicleExpenses} salePayments={salePayments} officeExpenses={officeExpenses} monthPrefix={monthPrefix} />}
        {view === 'inventory' && <Inventory vehicles={vehicles} sales={sales} vehicleExpenses={vehicleExpenses} search={search} setSearch={setSearch} onAdd={() => { setEditingVehicle(null); setShowVehicleForm(true); }} onEdit={(v) => { setEditingVehicle(null); setEditingVehicle(v); setShowVehicleForm(true); }} onDelete={removeVehicle} onSell={(v) => { setEditingSale(null); setSellingVehicle(v); }} onEditSale={(v, sale) => { setEditingSale(sale); setSellingVehicle(v); }} onRestoreSale={async (v, sale) => { const saleResult = await supabase.from('carwin_sales').update({ status: 'cancelled' }).eq('id', sale.id); const vehicleResult = await supabase.from('carwin_vehicles').update({ status: 'active' }).eq('id', v.id); if (saleResult.error || vehicleResult.error) { setError('No se pudo devolver el auto a activos.'); return; } void loadData(); }} onManageExpenses={setExpenseVehicle} />}
        {view === 'expenses' && <OfficeExpenses expenses={officeExpenses} monthPrefix={monthPrefix} onAdd={() => setShowOfficeForm(true)} onDelete={async (id) => { await supabase.from('carwin_office_expenses').delete().eq('id', id); setOfficeExpenses((items) => items.filter((item) => item.id !== id)); }} />}
        {view === 'calculators' && <Calculators settings={settings} />}
        {view === 'simulador' && <SimuladorCuotas ufValue={settings.uf_value} />}
      </main>

      <nav className="bottom-nav">
        <NavItem icon={<LayoutDashboard size={22} />} label="Resumen" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <NavItem icon={<CarFront size={22} />} label="Stock" active={view === 'inventory'} onClick={() => setView('inventory')} badge={activeVehicles.length} />
        <NavItem icon={<ReceiptText size={22} />} label="Gastos" active={view === 'expenses'} onClick={() => setView('expenses')} />
        <NavItem icon={<Calculator size={22} />} label="Calculadoras" active={view === 'calculators'} onClick={() => setView('calculators')} />
        <NavItem icon={<Landmark size={22} />} label="Simulador" active={view === 'simulador'} onClick={() => setView('simulador')} />
        <NavItem icon={<BarChart3 size={22} />} label="Reportes" active={view === 'reports'} onClick={() => setView('reports')} />
{isAdmin && <NavItem icon={<Settings2 size={22} />} label="Ajustes" active={false} onClick={() => setShowSettings(true)} />}
      </nav>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {isAdmin && showSettings && <SettingsModal settings={settings} onClose={() => setShowSettings(false)} onSave={async (newSettings) => { const result = await supabase.from('carwin_settings').update({ daily_stay_cost: newSettings.daily_stay_cost, card_fee_rate: newSettings.card_fee_rate, transfer_tax_rate: newSettings.transfer_tax_rate, transfer_fixed_cost: newSettings.transfer_fixed_cost, uf_value: newSettings.uf_value }).eq('id', true); if (result.error) { setError('No se pudo guardar la configuración.'); return; } setSettings(newSettings); setShowSettings(false); }} />}
      {isAdmin && showVehicleForm && <VehicleForm vehicle={editingVehicle} onClose={() => { setShowVehicleForm(false); setEditingVehicle(null); }} onSave={saveVehicle} />}
      {isAdmin && showOfficeForm && <OfficeExpenseForm onClose={() => setShowOfficeForm(false)} onSave={addOfficeExpense} />}
      {expenseVehicle && <VehicleExpenseModal vehicle={expenseVehicle} expenses={vehicleExpenses.filter((e) => e.vehicle_id === expenseVehicle.id)} dailyStayCost={settings.daily_stay_cost} onClose={() => setExpenseVehicle(null)} onAdd={addVehicleExpense} onUpdate={updateVehicleExpense} onDelete={deleteVehicleExpense} />}
{isAdmin && sellingVehicle && <SaleModal vehicle={sellingVehicle} sale={editingSale ?? undefined} dailyStayCost={settings.daily_stay_cost} monthPrefix={monthPrefix} payments={salePayments.filter((payment) => payment.sale_id === editingSale?.id)} onAddPayment={addSalePayment} onDeletePayment={deleteSalePayment} expenses={vehicleExpenses.filter((e) => e.vehicle_id === sellingVehicle.id)} onClose={() => { setSellingVehicle(null); setEditingSale(null); }} onAddExpense={addVehicleExpense} onSold={async (selectedExpenseIds, finalTransferAmount, realSalePrice, agreedPrice, buyer, soldAt, stayDaysOverride) => { const salePayload = { vehicle_id: sellingVehicle.id, sold_at: soldAt, real_sale_price: realSalePrice, agreed_price: agreedPrice, charged_expense_ids: selectedExpenseIds.filter((id) => id !== 'parking'), parking_charged: selectedExpenseIds.includes('parking'), final_transfer_amount: finalTransferAmount, document_version: editingSale ? editingSale.document_version + 1 : 1, buyer_name: buyer.buyer_name, buyer_rut: buyer.buyer_rut, buyer_address: buyer.buyer_address, buyer_phone: buyer.buyer_phone, delivery_date: buyer.delivery_date, terms: buyer.terms }; const saleResult = editingSale ? await supabase.from('carwin_sales').update(salePayload).eq('id', editingSale.id).select().maybeSingle() : await supabase.from('carwin_sales').insert(salePayload).select().maybeSingle(); const vehicleResult = editingSale ? { error: null } : await supabase.from('carwin_vehicles').update({ status: 'sold' }).eq('id', sellingVehicle.id); if (saleResult.error || !saleResult.data || vehicleResult.error) { setError('No se pudo guardar la liquidación. Inténtalo nuevamente.'); return; } const savedSale = saleResult.data as Sale; const stayDays = stayDaysOverride ?? daysBetweenDates(sellingVehicle.entered_at, soldAt); if (isPhysical(sellingVehicle.vehicle_type)) { const existingStay = vehicleExpenses.find((e) => e.vehicle_id === sellingVehicle.id && e.is_daily_stay); const stayDescription = `Estadía · ${stayDays} días × ${money(settings.daily_stay_cost)}`; const stayAmount = settings.daily_stay_cost * stayDays; if (existingStay) { await supabase.from('carwin_vehicle_expenses').update({ description: stayDescription, amount: stayAmount, expense_date: soldAt }).eq('id', existingStay.id); } else { await supabase.from('carwin_vehicle_expenses').insert({ vehicle_id: sellingVehicle.id, expense_type: 'extra', description: stayDescription, amount: stayAmount, allocation: 'carwin', is_daily_stay: true, expense_date: soldAt }); } } const historyResult = await supabase.from('carwin_sale_change_history').insert({ sale_id: savedSale.id, version: savedSale.document_version, change_type: editingSale ? 'updated' : 'created', snapshot: salePayload }); if (historyResult.error) { setError('La venta se guardó, pero no se pudo registrar su historial.'); return; } setSellingVehicle(null); setEditingSale(null); void loadData(); }} />}
      {loading && <div className="loading-screen"><div className="loader-mark"><CarFront size={28} /></div><p>Cargando operación CARWIN...</p></div>}
    </div>
  );
}

function calculateVehicleExpenseTotal(vehicle: Vehicle, expenses: VehicleExpense[], dailyStayCost = DEFAULT_DAILY_STAY_COST) {
  const directExpenses = expenses.filter((e) => e.vehicle_id === vehicle.id).reduce((total, e) => total + e.amount, 0);
  const parking = isPhysical(vehicle.vehicle_type) ? dailyStayCost * daysBetween(vehicle.entered_at) : 0;
  return directExpenses + parking;
}

function calculateVehicleMargin(vehicle: Vehicle, expenses: VehicleExpense[], dailyStayCost = DEFAULT_DAILY_STAY_COST) {
  return vehicle.sale_price - vehicle.purchase_price - calculateVehicleExpenseTotal(vehicle, expenses, dailyStayCost);
}

function daysBetweenDates(start: string, end: string) {
  return Math.max(1, Math.floor((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1);
}

function calculateSaleUtility(vehicle: Vehicle, sale: Sale, expenses: VehicleExpense[], dailyStayCost = DEFAULT_DAILY_STAY_COST) {
  const charged = new Set(sale.charged_expense_ids ?? []);
  const assumedExpenses = expenses.filter((expense) => expense.vehicle_id === vehicle.id && !charged.has(expense.id)).reduce((total, expense) => total + (expense.allocation === 'shared' ? expense.amount / 2 : expense.allocation === 'customer' ? 0 : expense.amount), 0);
  const stay = isPhysical(vehicle.vehicle_type) ? dailyStayCost * daysBetweenDates(vehicle.entered_at, sale.sold_at) : 0;
  return sale.real_sale_price - vehicle.purchase_price - assumedExpenses - (sale.parking_charged ? 0 : stay);
}

function expiringDocuments(vehicle: Vehicle) {
  return [vehicle.permit_expiry, vehicle.soap_expiry, vehicle.inspection_expiry].filter((date) => date && Math.ceil((new Date(`${date}T12:00:00`).getTime() - TODAY.getTime()) / 86400000) < 30).length;
}

function Dashboard({ activeVehicles, selectedMonth, setSelectedMonth, monthUtility, monthSalesTotal, officeTotal, potentialProfit, documentationAlerts, physicalAging, onSeeInventory, onSell, onManageExpenses, vehicleExpenses }: { activeVehicles: Vehicle[]; selectedMonth: string; setSelectedMonth: (value: string) => void; monthUtility: number; monthSalesTotal: number; officeTotal: number; potentialProfit: number; documentationAlerts: number; physicalAging: number; onSeeInventory: () => void; onSell: (v: Vehicle) => void; onManageExpenses: (v: Vehicle) => void; vehicleExpenses: VehicleExpense[] }) {
  const utilityTone = monthUtility >= 0 ? 'green' : 'red';
  const topVehicles = [...activeVehicles].sort((a, b) => calculateVehicleMargin(b, vehicleExpenses) - calculateVehicleMargin(a, vehicleExpenses)).slice(0, 4);
  return <>
    <section className="hero-row"><div><p className="eyebrow">TABLERO GERENCIAL</p><h2>Buenos días, <span>CARWIN</span></h2><p className="muted">Fecha real: {new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(TODAY)}</p></div><label className="month-chip"><CalendarDays size={17} /><span>Mes</span><input type="month" min="2026-08" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /><ChevronRight size={17} /></label></section>
    <section className="kpi-grid">
      <KpiCard label="Utilidad neta del mes" value={money(monthUtility)} detail={`Utilidad ventas ${money(monthSalesTotal)} - Oficina ${money(officeTotal)}`} icon={<TrendingUp size={19} />} tone={utilityTone} trend={monthUtility >= 0 ? 'Positivo' : 'Negativo'} />
      <KpiCard label="Gastos de oficina" value={money(officeTotal)} detail="Acumulado mensual" icon={<Wallet size={19} />} tone="amber" />
      <KpiCard label="Utilidad potencial" value={money(potentialProfit)} detail="Margen del stock activo" icon={<CircleDollarSign size={19} />} tone="blue" trend="+12.4%" />
    </section>
    <section className={`alert-strip ${documentationAlerts > 0 || physicalAging > 0 ? 'has-alerts' : 'clear-alerts'}`}><div className="alert-title"><div className="alert-icon"><AlertTriangle size={20} /></div><div><strong>Atención operativa</strong><p>Revisa estos puntos antes de cerrar el mes</p></div></div><div className="alert-stat"><strong>{documentationAlerts}</strong><span>docs por vencer</span></div><div className="alert-stat"><strong>{physicalAging}</strong><span>autos +60 días</span></div></section>
    <section className="section-heading"><div><p className="eyebrow">RENDIMIENTO DE STOCK</p><h3>Vehículos destacados</h3></div><button className="text-button" onClick={onSeeInventory}>Ver todo <ChevronRight size={18} /></button></section>
    <section className="vehicle-list">{topVehicles.map((v) => <VehicleRow key={v.id} vehicle={v} margin={calculateVehicleMargin(v, vehicleExpenses)} expenseTotal={calculateVehicleExpenseTotal(v, vehicleExpenses)} onSell={() => onSell(v)} onManageExpenses={() => onManageExpenses(v)} />)}</section>
    <section className="quick-actions"><button onClick={onSeeInventory}><Plus size={20} /><span><strong>Ingresar vehículo</strong><small>Agregar al stock actual</small></span><ChevronRight size={19} /></button><button onClick={() => document.getElementById('monthly-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><BarChart3 size={20} /><span><strong>Ver análisis mensual</strong><small>Rendimiento del mes seleccionado</small></span><ChevronRight size={19} /></button></section><section id="monthly-analysis" className="monthly-analysis"><div className="section-heading"><div><p className="eyebrow">ANÁLISIS MENSUAL</p><h3>Noviembre 2026</h3></div><BarChart3 size={26} /></div><div className="analysis-grid"><div className="analysis-stat"><span>Ventas concretadas</span><strong>{monthSalesTotal > 0 ? 'Con actividad' : 'Sin ventas aún'}</strong><small>Utilidad de ventas: {money(monthSalesTotal)}</small></div><div className="analysis-stat"><span>Gastos de oficina</span><strong>{money(officeTotal)}</strong><small>Registrados durante el mes</small></div><div className={`analysis-stat ${monthUtility >= 0 ? 'positive' : 'negative'}`}><span>Resultado neto</span><strong>{money(monthUtility)}</strong><small>{monthUtility >= 0 ? 'Resultado favorable' : 'Requiere revisión'}</small></div></div><div className="analysis-bars"><div><span><b>Ventas</b><strong>{money(monthSalesTotal)}</strong></span><i><em style={{ width: `${monthSalesTotal > 0 ? '100%' : '4%'}` }} /></i></div><div><span><b>Gastos oficina</b><strong>{money(officeTotal)}</strong></span><i><em className="orange-bar" style={{ width: `${monthSalesTotal > 0 ? `${Math.max(4, Math.min(100, Math.round((officeTotal / monthSalesTotal) * 100)))}%` : officeTotal > 0 ? '100%' : '4%'}` }} /></i></div><div><span><b>Utilidad neta</b><strong>{money(Math.max(0, monthUtility))}</strong></span><i><em className="green-bar" style={{ width: `${monthSalesTotal > 0 ? `${Math.max(4, Math.min(100, Math.round((Math.max(0, monthUtility) / monthSalesTotal) * 100)))}%` : '4%'}` }} /></i></div></div></section>
  </>;
}

function Inventory({ isAdmin, vehicles, sales, vehicleExpenses, search, setSearch, onAdd, onEdit, onDelete, onSell, onEditSale, onRestoreSale, onManageExpenses }: { vehicles: Vehicle[]; sales: Sale[]; vehicleExpenses: VehicleExpense[]; search: string; setSearch: (value: string) => void; onAdd: () => void; onEdit: (v: Vehicle) => void; onDelete: (v: Vehicle) => void; onSell: (v: Vehicle) => void; onEditSale: (v: Vehicle, sale: Sale) => void; onRestoreSale: (v: Vehicle, sale: Sale) => Promise<void>; onManageExpenses: (v: Vehicle) => void }) {
  const [stockView, setStockView] = useState<'active' | 'sold'>('active');
  const [contractVehicle, setContractVehicle] = useState<Vehicle | null>(null);
  const active = vehicles.filter((v) => v.status === 'active');
  const sold = vehicles.filter((v) => v.status === 'sold');
  const visibleVehicles = (stockView === 'active' ? active : sold).filter((v) => v.model.toLowerCase().includes(search.toLowerCase()) || v.plate.toLowerCase().includes(search.toLowerCase()));
  return <><section className="page-heading"><div><p className="eyebrow">GESTIÓN DE INVENTARIO</p><h2>Stock <span>{stockView === 'active' ? 'activo' : 'vendido'}</span></h2><p className="muted">{stockView === 'active' ? `${active.length} vehículos disponibles` : `${sold.length} operaciones vendidas y editables`}</p></div><button className="primary-button" onClick={onAdd}><Plus size={20} /> Nuevo auto</button></section><div className="stock-tabs"><button className={stockView === 'active' ? 'active' : ''} onClick={() => setStockView('active')}>Activos <b>{active.length}</b></button><button className={stockView === 'sold' ? 'active' : ''} onClick={() => setStockView('sold')}>Vendidos <b>{sold.length}</b></button></div><div className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo o patente..." /></div>{visibleVehicles.length ? <section className="inventory-grid">{visibleVehicles.map((v) => <InventoryCard key={v.id} vehicle={v} sale={sales.find((sale) => sale.vehicle_id === v.id)} expenseTotal={calculateVehicleExpenseTotal(v, vehicleExpenses)} margin={calculateVehicleMargin(v, vehicleExpenses)} onEdit={() => onEdit(v)} onDelete={() => onDelete(v)} onSell={() => onSell(v)} onEditSale={(sale) => onEditSale(v, sale)} onRestoreSale={(sale) => void onRestoreSale(v, sale)} onManageExpenses={() => onManageExpenses(v)} onContract={() => setContractVehicle(v)} />)}</section> : <EmptyState text={stockView === 'sold' ? 'Aún no hay vehículos vendidos.' : 'No hay vehículos que coincidan con la búsqueda.'} />}{contractVehicle && <ConsignmentContractModal vehicle={contractVehicle} onClose={() => setContractVehicle(null)} />}</>;
}

function OfficeExpenses({ expenses, monthPrefix, onAdd, onDelete }: { expenses: OfficeExpense[]; monthPrefix: string; onAdd: () => void; onDelete: (id: string) => void }) {
  const [showAllYear, setShowAllYear] = useState(false);
  const filtered = showAllYear ? expenses : expenses.filter((item) => item.expense_date.startsWith(monthPrefix));
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);
  const grouped = filtered.reduce<Record<string, number>>((acc, item) => { acc[item.description] = (acc[item.description] ?? 0) + item.amount; return acc; }, {});
  const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date(`${monthPrefix}-15T12:00:00`));
  return <><section className="page-heading"><div><p className="eyebrow">CONTROL FINANCIERO</p><h2>Gastos de <span>oficina</span></h2><p className="muted">Cada peso queda trazable y consolidado.</p></div><button className="primary-button" onClick={onAdd}><Plus size={20} /> Registrar gasto</button></section><div className="expense-total"><div><span>Total {showAllYear ? 'año' : monthName}</span><strong>{money(total)}</strong></div><div className="expense-total-icon"><ReceiptText size={22} /></div></div><div className="stock-tabs"><button className={!showAllYear ? 'active' : ''} onClick={() => setShowAllYear(false)}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</button><button className={showAllYear ? 'active' : ''} onClick={() => setShowAllYear(true)}>Todo el año</button></div><section className="summary-card"><div className="section-heading compact"><div><p className="eyebrow">CONSOLIDADO POR CONCEPTO</p><h3>Resumen de gastos</h3></div></div>{Object.entries(grouped).length ? Object.entries(grouped).map(([description, amount]) => <div className="summary-line" key={description}><span>{description}</span><strong>{money(amount)}</strong></div>) : <EmptyState text="Aún no hay gastos registrados en este período." />}</section><section className="section-heading compact"><div><p className="eyebrow">MOVIMIENTOS</p><h3>Detalle día a día</h3></div></section><section className="expense-list">{filtered.map((e) => <div className="expense-row" key={e.id}><div className="expense-dot"><ReceiptText size={17} /></div><div className="expense-info"><strong>{e.description}</strong><span>{dateLabel(e.expense_date)} · Gasto de oficina</span></div><strong className="expense-amount">{money(e.amount)}</strong><button className="row-action danger" onClick={() => onDelete(e.id)}><Trash2 size={17} /></button></div>)}</section></>;
}

function VehicleRow({ vehicle, margin, expenseTotal, onSell, onManageExpenses }: { vehicle: Vehicle; margin: number; expenseTotal: number; onSell: () => void; onManageExpenses: () => void }) {
  const days = daysBetween(vehicle.entered_at);
  return <div className={`vehicle-row ${margin < 0 ? 'negative-row' : ''}`}><div className="vehicle-avatar"><CarFront size={22} /></div><div className="vehicle-main"><strong>{vehicle.model}</strong><div><span>{typeLabel(vehicle.vehicle_type)}</span><i /> <span>{days} días en stock</span></div></div><div className="vehicle-cost"><span>Gastos acumulados</span><strong>{money(expenseTotal)}</strong></div><div className="vehicle-margin"><span>Margen real</span><strong className={margin < 0 ? 'negative' : ''}>{money(margin)}</strong></div><button className="row-action" onClick={onManageExpenses} title="Gastos del vehículo"><Wallet size={17} /></button><button className="sell-button" onClick={onSell}>Vender</button></div>;
}

function InventoryCard({ vehicle, sale, expenseTotal, margin, onEdit, onDelete, onSell, onEditSale, onRestoreSale, onManageExpenses, onContract }: { vehicle: Vehicle; sale?: Sale; expenseTotal: number; margin: number; onEdit: () => void; onDelete: () => void; onSell: () => void; onEditSale: (sale: Sale) => void; onRestoreSale: (sale: Sale) => void; onManageExpenses: () => void; onContract: () => void }) {
  const days = daysBetween(vehicle.entered_at); const aging = days > 90 ? 'red' : days > 60 ? 'yellow' : 'green'; const documentCount = expiringDocuments(vehicle); const hasAlert = documentCount > 0 || aging === 'red' || margin < 0;
  return <article className={`inventory-card ${hasAlert ? 'has-risk' : ''}`}><div className="card-top"><div className="vehicle-avatar large"><CarFront size={23} /></div><div className="card-title"><strong>{vehicle.model}</strong><span>{vehicle.plate || 'PATENTE PENDIENTE'} · {vehicle.color}</span></div><button className="more-button"><MoreHorizontal size={20} /></button></div><div className="tag-row"><span className={`type-tag ${vehicle.vehicle_type}`}>{vehicle.vehicle_type === 'virtual_consignment' ? 'Virtual' : vehicle.vehicle_type === 'own' ? 'Propio' : 'Físico'}</span>{vehicle.status === 'sold' && <span className="sold-tag"><Check size={12} /> Vendido</span>}<span className={`aging-tag ${aging}`}><i /> {days} días</span>{documentCount > 0 && <span className="doc-tag"><AlertTriangle size={13} /> {documentCount} alerta{documentCount > 1 ? 's' : ''}</span>}</div><div className="price-grid"><div><small>Precio compra</small><strong>{money(vehicle.purchase_price)}</strong></div><div><small>Precio venta</small><strong>{money(vehicle.sale_price)}</strong></div><div><small>Margen real</small><strong className={margin < 0 ? 'negative' : 'positive'}>{money(margin)}</strong></div></div><div className="expense-balance"><span><Wallet size={14} /> Gastos acumulados</span><strong>{money(expenseTotal)}</strong></div><div className="card-footer"><span><Clock3 size={15} /> Ingreso {dateLabel(vehicle.entered_at)}</span><div><button className="row-action" onClick={onManageExpenses} title="Gastos"><Wallet size={16} /></button><button className="row-action" onClick={onEdit}><Pencil size={16} /></button><button className="row-action" onClick={onDelete}><Trash2 size={16} /></button>{vehicle.status === 'active' && <button className="mini-sell" onClick={onSell}>Vender</button>}{vehicle.status === 'active' && vehicle.vehicle_type !== 'own' && <button className="contract-button" onClick={onContract} title="Generar contrato de consignación"><FileSignature size={15} /> Contrato</button>}{vehicle.status === 'sold' && sale && <><button className="mini-sell edit-sale-button" onClick={() => onEditSale(sale)}>Editar venta</button><button className="restore-button" onClick={() => onRestoreSale(sale)}>Volver a activos</button></>}</div></div></article>;
}

function Reports({ vehicles, sales, vehicleExpenses, salePayments, officeExpenses, monthPrefix }: { vehicles: Vehicle[]; sales: Sale[]; vehicleExpenses: VehicleExpense[]; salePayments: SalePayment[]; officeExpenses: OfficeExpense[]; monthPrefix: string }) {
  const [query, setQuery] = useState('');
  const [expenseQuery, setExpenseQuery] = useState('');
  const types: VehicleType[] = ['own', 'physical_consignment', 'virtual_consignment'];
  const visible = vehicles.filter((vehicle) => `${vehicle.model} ${vehicle.plate}`.toLowerCase().includes(query.toLowerCase()));

  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const normQuery = normalize(expenseQuery);
  const hasQuery = normQuery.length >= 2;

  type SearchRow = { id: string; date: string; origin: string; description: string; amount: number; monthKey: string };
  const searchResults: SearchRow[] = useMemo(() => {
    if (!hasQuery) return [];
    const rows: SearchRow[] = [];
    for (const e of vehicleExpenses) {
      const vehicle = vehicles.find((v) => v.id === e.vehicle_id);
      const searchText = normalize(`${e.description} ${e.expense_type} ${vehicle?.model ?? ''} ${vehicle?.plate ?? ''}`);
      if (searchText.includes(normQuery)) {
        rows.push({ id: e.id, date: e.expense_date, origin: `Auto: ${vehicle?.plate || vehicle?.model || 'N/A'}`, description: e.description, amount: e.amount, monthKey: e.expense_date.slice(0, 7) });
      }
    }
    for (const e of officeExpenses) {
      const searchText = normalize(`${e.description} oficina`);
      if (searchText.includes(normQuery)) {
        rows.push({ id: e.id, date: e.expense_date, origin: 'Oficina', description: e.description, amount: e.amount, monthKey: e.expense_date.slice(0, 7) });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [expenseQuery, vehicleExpenses, officeExpenses, vehicles, normQuery, hasQuery]);

  const monthTotal = searchResults.filter((r) => r.monthKey === monthPrefix).reduce((s, r) => s + r.amount, 0);
  const ytdTotal = searchResults.reduce((s, r) => s + r.amount, 0);
  const monthCount = new Set(searchResults.map((r) => r.monthKey)).size || 1;
  const avgMonthly = ytdTotal / monthCount;

  const monthBuckets = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of searchResults) { map.set(r.monthKey, (map.get(r.monthKey) ?? 0) + r.amount); }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [searchResults]);

  return <><section className="page-heading"><div><p className="eyebrow">REPORTES EJECUTIVOS</p><h2>Lectura <span>gerencial</span></h2><p className="muted">Comparativos de stock, ventas, gastos y pagos.</p></div></section><section className="report-type-grid">{types.map((type) => { const own = vehicles.filter((vehicle) => vehicle.vehicle_type === type); const sold = own.filter((vehicle) => vehicle.status === 'sold'); const invested = own.reduce((sum, vehicle) => sum + vehicle.purchase_price + vehicleExpenses.filter((expense) => expense.vehicle_id === vehicle.id).reduce((total, expense) => total + expense.amount, 0), 0); const revenue = sold.reduce((sum, vehicle) => { const sale = sales.find((item) => item.vehicle_id === vehicle.id && item.status !== 'cancelled'); return sum + (sale?.real_sale_price ?? 0); }, 0); return <div className="report-card" key={type}><p className="eyebrow">{typeLabel(type)}</p><strong>{own.length} autos</strong><span>{sold.length} vendidos · {own.length - sold.length} activos</span><span>Invertido {money(invested)}</span><span>Vendido {money(revenue)}</span><b>Resultado {money(revenue - invested)}</b></div>; })}</section><section className="summary-card"><div className="section-heading compact"><div><p className="eyebrow">BUSCADOR DE VEHÍCULOS</p><h3>Patente o modelo</h3></div><Search size={21} /></div><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por patente o modelo..." /></div>{visible.map((vehicle) => { const expenses = vehicleExpenses.filter((expense) => expense.vehicle_id === vehicle.id); const sale = sales.find((item) => item.vehicle_id === vehicle.id && item.status !== 'cancelled'); const payments = salePayments.filter((payment) => payment.sale_id === sale?.id); return <div className="report-result" key={vehicle.id}><div><strong>{vehicle.model}</strong><span>{vehicle.plate || 'Sin patente'} · {typeLabel(vehicle.vehicle_type)} · {vehicle.status === 'sold' ? 'Vendido' : `${daysBetween(vehicle.entered_at)} días en stock`}</span></div><div><small>Gastos</small><b>{money(expenses.reduce((sum, item) => sum + item.amount, 0))}</b></div><div><small>Venta real</small><b>{money(sale?.real_sale_price ?? vehicle.sale_price)}</b></div><div><small>Pagos recibidos</small><b>{money(payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + payment.amount, 0))}</b></div></div>; })}</section><section className="summary-card"><div className="section-heading compact"><div><p className="eyebrow">BUSCADOR GLOBAL DE GASTOS</p><h3>Buscar por palabra clave</h3></div><Search size={21} /></div><div className="search-box"><Search size={18} /><input value={expenseQuery} onChange={(event) => setExpenseQuery(event.target.value)} placeholder="Buscar gasto (ej: bencina, preparación, arriendo, sueldos)..." /></div>{hasQuery && <><div className="report-search-totals"><div className="report-search-total"><span>Total Mes Seleccionado</span><strong>{money(monthTotal)}</strong></div><div className="report-search-total"><span>Total Acumulado Año</span><strong>{money(ytdTotal)}</strong></div><div className="report-search-total"><span>Movimientos / Prom. mensual</span><strong>{searchResults.length} / {money(Math.round(avgMonthly))}</strong></div></div>{monthBuckets.length > 0 && <div className="report-month-buckets">{monthBuckets.map(([monthKey, amount]) => { const label = new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(new Date(`${monthKey}-15T12:00:00`)); return <div key={monthKey}><span>{label}</span><b>{money(amount)}</b></div>; })}</div>}<div className="report-search-list">{searchResults.length ? searchResults.map((row) => <div className="report-search-row" key={row.id}><div className="report-search-date">{dateLabel(row.date)}</div><div className="report-search-origin">[{row.origin}]</div><div className="report-search-desc">{row.description}</div><strong className="report-search-amount">{money(row.amount)}</strong></div>) : <EmptyState text="No se encontraron gastos con esa palabra." />}</div></>}{!hasQuery && <p className="muted">Escribe al menos 2 letras para buscar en todos los gastos de oficina y vehículos.</p>}</section></>;
}

function KpiCard({ label, value, detail, icon, tone, trend }: { label: string; value: string; detail: string; icon: ReactNode; tone: string; trend?: string }) { return <div className={`kpi-card ${tone}`}><div className="kpi-head"><span>{label}</span><div className="kpi-icon">{icon}</div></div><strong>{value}</strong><div className="kpi-foot"><span>{detail}</span>{trend && <em><ArrowUpRight size={15} />{trend}</em>}</div></div>; }
function NavItem({ icon, label, active, onClick, badge }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} aria-label={label} title={label}>{icon}<span>{label}</span>{badge ? <b>{badge}</b> : null}</button>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><Clipboard size={22} /><p>{text}</p></div>; }

function InfoModal({ onClose }: { onClose: () => void }) {
  const bankText = 'Automotora CARWIN SpA\nRUT: 78.497.454-5\nBanco Santander\nCuenta Corriente N°: 0100790262\nCorreo: Lvalenzuela@carwin.cl';
  const [copied, setCopied] = useState<'bank' | 'address' | null>(null);
  const copy = async (text: string, key: 'bank' | 'address') => { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1800); };
  return <Modal title="Información CARWIN" onClose={onClose}><div className="bank-card"><div className="bank-brand"><img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="bank-logo" /><div><strong>CARWIN SpA</strong><span>Datos institucionales</span></div></div><div className="bank-details">{bankText.split('\n').map((line) => <p key={line}>{line}</p>)}</div></div><button className="copy-button" onClick={() => void copy(bankText, 'bank')}>{copied === 'bank' ? <Check size={19} /> : <Copy size={19} />}{copied === 'bank' ? 'Datos copiados' : 'Copiar datos bancarios'}</button><div className="address-card"><div className="address-title"><MapPin size={20} /><strong>Cómo llegar</strong></div><div className="address-details">{ADDRESS_TEXT.split('\n').map((line) => <p key={line}>{line}</p>)}</div><button className="copy-button address-copy" onClick={() => void copy(ADDRESS_TEXT, 'address')}>{copied === 'address' ? <Check size={19} /> : <Copy size={19} />}{copied === 'address' ? 'Dirección copiada' : 'Copiar dirección'}</button></div></Modal>;
}

function VehicleForm({ vehicle, onClose, onSave }: { vehicle: Vehicle | null; onClose: () => void; onSave: (data: Omit<Vehicle, 'id' | 'status'>, id?: string) => Promise<void> }) {
  const [form, setForm] = useState<Omit<Vehicle, 'id' | 'status'>>(vehicle ? { ...vehicle, permit_expiry: vehicle.permit_expiry ?? '', soap_expiry: vehicle.soap_expiry ?? '', inspection_expiry: vehicle.inspection_expiry ?? '' } : initialVehicle);
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('');
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setFormError(''); try { await onSave(form, vehicle?.id); } catch { setFormError('Revisa los campos e inténtalo nuevamente.'); } finally { setSaving(false); } };
  return <Modal title={vehicle ? 'Editar vehículo' : 'Ingresar vehículo'} onClose={onClose} wide><form className="form-grid" onSubmit={submit}>
    <div className="form-section-title">Ficha principal</div>
    <Field label="Modelo"><input value={form.model} onChange={(e) => update('model', e.target.value)} placeholder="Ej. BMW X3 xDrive" /></Field>
    <Field label="Patente"><input value={form.plate} onChange={(e) => update('plate', e.target.value)} placeholder="AB CD 12" /></Field>
    <Field label="Kilómetros"><input min="0" type="number" value={form.kilometers || ''} onChange={(e) => update('kilometers', Number(e.target.value))} /></Field>
    <Field label="Dueños"><input min="0" type="number" value={form.owners_count} onChange={(e) => update('owners_count', Number(e.target.value))} /></Field>
    <Field label="Color"><input value={form.color} onChange={(e) => update('color', e.target.value)} /></Field>
    <Field label="Tipo"><select value={form.vehicle_type} onChange={(e) => update('vehicle_type', e.target.value as VehicleType)}><option value="own">Propio</option><option value="physical_consignment">Consignación física</option><option value="virtual_consignment">Consignación virtual</option></select></Field>
    <Field label="Precio compra / acordado"><input min="0" type="number" value={form.purchase_price || ''} onChange={(e) => update('purchase_price', Number(e.target.value))} /></Field>
    <Field label="Precio venta CARWIN"><input min="0" type="number" value={form.sale_price || ''} onChange={(e) => update('sale_price', Number(e.target.value))} /></Field>
    <Field label="Fecha de ingreso"><input type="date" value={form.entered_at} onChange={(e) => update('entered_at', e.target.value)} /></Field>
    <div className="form-section-title">Estado y documentación</div>
    <Field label="Ambas llaves"><select value={form.has_both_keys ? 'yes' : 'no'} onChange={(e) => update('has_both_keys', e.target.value === 'yes')}><option value="yes">Sí</option><option value="no">No</option></select></Field>
    <Field label="Mantenciones"><select value={form.maintenance_type} onChange={(e) => update('maintenance_type', e.target.value as MaintenanceType)}><option value="brand">En la marca</option><option value="private">Particulares</option><option value="none">No registra</option></select></Field>
    <Field label="Permiso de circulación"><input type="date" value={form.permit_expiry ?? ''} onChange={(e) => update('permit_expiry', e.target.value)} /></Field>
    <Field label="SOAP"><input type="date" value={form.soap_expiry ?? ''} onChange={(e) => update('soap_expiry', e.target.value)} /></Field>
    <Field label="Revisión técnica"><input type="date" value={form.inspection_expiry ?? ''} onChange={(e) => update('inspection_expiry', e.target.value)} /></Field>
    <p className="form-hint">Puedes dejar campos vacíos y completarlos después.</p>
    {formError && <p className="form-error">{formError}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : vehicle ? 'Guardar cambios' : 'Agregar al stock'}</button></div>
  </form></Modal>;
}

function OfficeExpenseForm({ onClose, onSave }: { onClose: () => void; onSave: (description: string, amount: number, date: string) => Promise<void> }) {
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState('2026-11-02'); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!description || !Number(amount)) return; setSaving(true); try { await onSave(description, Number(amount), date); } finally { setSaving(false); } };
  return <Modal title="Registrar gasto de oficina" onClose={onClose}><form className="single-form" onSubmit={submit}><Field label="Descripción" required><input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Publicidad digital" /></Field><Field label="Monto CLP" required><input required min="1" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field><Field label="Fecha" required><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Guardar gasto'}</button></div></form></Modal>;
}

function VehicleExpenseModal({ vehicle, expenses, dailyStayCost, onClose, onAdd, onUpdate, onDelete }: { vehicle: Vehicle; expenses: VehicleExpense[]; dailyStayCost: number; onClose: () => void; onAdd: (vehicleId: string, description: string, amount: number, expenseType: ExpenseType, allocation: ExpenseAllocation) => Promise<void>; onUpdate: (id: string, description: string, amount: number, allocation: ExpenseAllocation) => Promise<void>; onDelete: (id: string) => void }) {
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [expenseType, setExpenseType] = useState<ExpenseType>('extra'); const [allocation, setAllocation] = useState<ExpenseAllocation>('carwin'); const [saving, setSaving] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [editingDescription, setEditingDescription] = useState(''); const [editingAmount, setEditingAmount] = useState(''); const [editingAllocation, setEditingAllocation] = useState<ExpenseAllocation>('carwin');
  const grouped = useMemo(() => groupExpenses(expenses), [expenses]);
  const grandTotal = grouped.reduce((sum, g) => sum + g.total, 0);
  const [stayDays, setStayDays] = useState(() => { if (vehicle.status === 'sold') { const stayExpense = expenses.find((e) => e.is_daily_stay); if (stayExpense) { const match = stayExpense.description.match(/(\d+)\s+días/); if (match) return Number(match[1]); } } return daysBetween(vehicle.entered_at); });
  const [stayEdit, setStayEdit] = useState(false);
  const parkingCost = isPhysical(vehicle.vehicle_type) ? dailyStayCost * stayDays : 0;
  const totalWithParking = grandTotal + parkingCost;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!description) return; setSaving(true); try { await onAdd(vehicle.id, description, Number(amount) || 0, expenseType, allocation); setDescription(''); setAmount(''); } finally { setSaving(false); } };
  const startEdit = (expense: VehicleExpense) => { setEditingId(expense.id); setEditingDescription(expense.description); setEditingAmount(expense.amount.toString()); setEditingAllocation(expense.allocation); };
  const saveEdit = async () => { if (!editingId || !editingDescription) return; await onUpdate(editingId, editingDescription, Number(editingAmount) || 0, editingAllocation); setEditingId(null); };
  return <Modal title="Gastos del vehículo" onClose={onClose} wide>
    <div className="sale-header"><div className="vehicle-avatar large"><CarFront size={24} /></div><div><strong>{vehicle.model}</strong><span>Gestión de gastos de preparación y extras</span></div></div>
    <div className="expense-grand-total"><div><span>Total de gastos{parkingCost > 0 ? ' (incluye estacionamiento)' : ''}</span><strong>{money(totalWithParking)}</strong></div><div className="expense-total-icon"><Wallet size={22} /></div></div>
    {grouped.length > 0 && <><div className="sale-section-title"><span>Gastos consolidados</span><small>Items repetidos se suman automáticamente</small></div><div className="grouped-list">{grouped.map((g) => <div className="grouped-row" key={g.key}><div className="grouped-info"><strong>{g.description}</strong><span>{g.count} registro{g.count > 1 ? 's' : ''}</span></div><strong className="grouped-amount">{money(g.total)}</strong></div>)}</div></>}
    <div className="sale-section-title"><span>Detalle de movimientos</span></div>
    {parkingCost > 0 && <div className="parking-detail-card"><div className="parking-detail-icon"><MapPin size={18} /></div><div className="parking-detail-info"><strong>Estacionamiento / Estadía</strong><div className="stay-edit-row"><input type="number" min="1" className="stay-days-input" value={stayDays} onChange={(e) => { setStayDays(Number(e.target.value) || 1); setStayEdit(true); }} /><span>{money(dailyStayCost)} por día</span></div><small>{vehicle.status === 'sold' ? 'Días fijados al vender' : 'Asignado a: CARWIN (calculado automáticamente)'}</small></div><strong className="parking-detail-amount">{money(parkingCost)}</strong></div>}
    <div className="expense-list compact-list">{expenses.map((e) => editingId === e.id ? <div className="expense-row expense-edit-row" key={e.id}><input value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} /><input type="number" value={editingAmount} onChange={(event) => setEditingAmount(event.target.value)} /><select value={editingAllocation} onChange={(event) => setEditingAllocation(event.target.value as ExpenseAllocation)}><option value="carwin">CARWIN</option><option value="customer">Cliente</option><option value="shared">Compartido</option></select><button className="row-action" onClick={() => void saveEdit()}><Check size={16} /></button><button className="row-action danger" onClick={() => setEditingId(null)}><X size={16} /></button></div> : <div className="expense-row" key={e.id}><div className="expense-dot small"><ReceiptText size={14} /></div><div className="expense-info"><strong>{e.description}</strong><span>{e.expense_type === 'wash' ? 'Lavado/Pulido' : e.is_daily_stay ? 'Estadía diaria' : 'Extra'} · {e.allocation === 'customer' ? 'Cobrado al cliente' : e.allocation === 'shared' ? 'Compartido' : 'Asumido por CARWIN'} · {money(e.amount)}</span></div><button className="row-action" onClick={() => startEdit(e)}><Pencil size={16} /></button><button className="row-action danger" onClick={() => onDelete(e.id)}><Trash2 size={16} /></button></div>)}</div>
    <form className="add-expense-form" onSubmit={submit}>
      <div className="sale-section-title"><span>Agregar gasto</span></div>
      <Field label="Tipo"><select value={expenseType} onChange={(e) => setExpenseType(e.target.value as ExpenseType)}><option value="extra">Extra</option><option value="wash">Lavado y pulido</option></select></Field><Field label="Responsable del gasto"><select value={allocation} onChange={(e) => setAllocation(e.target.value as ExpenseAllocation)}><option value="carwin">Asumido por CARWIN</option><option value="customer">Cobrado al cliente</option><option value="shared">Compartido</option></select></Field>
      <Field label="Descripción"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Cambio de aceite" /></Field>
      <Field label="Monto CLP (0 si lo defines después)"><input min="0" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
      <div className="form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Agregar gasto'}</button></div>
    </form>
  </Modal>;
}

function SaleModal({ vehicle, sale, dailyStayCost, monthPrefix, payments, onAddPayment, onDeletePayment, expenses, onClose, onAddExpense, onSold }: { vehicle: Vehicle; sale?: Sale; dailyStayCost: number; monthPrefix: string; payments: SalePayment[]; onAddPayment: (saleId: string, payment: Omit<SalePayment, 'id' | 'sale_id'>) => Promise<void>; onDeletePayment: (id: string) => Promise<void>; expenses: VehicleExpense[]; onClose: () => void; onAddExpense: (vehicleId: string, description: string, amount: number, expenseType: ExpenseType) => Promise<void>; onSold: (selectedExpenseIds: string[], finalTransferAmount: number, realSalePrice: number, agreedPrice: number, buyer: { buyer_name: string; buyer_rut: string; buyer_address: string; buyer_phone: string; delivery_date: string | null; terms: string }, soldAt: string, stayDaysOverride?: number) => Promise<void> }) {
  const defaultSoldAt = sale?.sold_at ?? `${monthPrefix}-15`;
  const [soldAt, setSoldAt] = useState(defaultSoldAt);
  const autoStayDays = isPhysical(vehicle.vehicle_type) ? daysBetweenDates(vehicle.entered_at, soldAt) : 0;
  const [stayDays, setStayDays] = useState(autoStayDays);
  const [stayEdit, setStayEdit] = useState(false);
  const parking = isPhysical(vehicle.vehicle_type) ? dailyStayCost * stayDays : 0;
  const lines = useMemo(() => [...expenses.map((e) => ({ id: e.id, description: e.description, amount: e.amount, expense_type: e.expense_type, allocation: e.allocation })), ...(parking > 0 ? [{ id: 'parking', description: `Estadía · ${stayDays} días × ${money(dailyStayCost)}`, amount: parking, expense_type: 'parking' as const, allocation: 'carwin' as const }] : [])], [expenses, parking, dailyStayCost, stayDays]);
  const initialSelected = sale ? [...sale.charged_expense_ids, ...(sale.parking_charged ? ['parking'] : [])] : lines.map((l) => l.id);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [realPrice, setRealPrice] = useState((sale?.real_sale_price ?? vehicle.sale_price).toString());
  const [agreedPrice, setAgreedPrice] = useState((sale?.agreed_price ?? vehicle.agreed_price).toString());
  const [newExpense, setNewExpense] = useState(''); const [newAmount, setNewAmount] = useState('');
  const [newExpenseType, setNewExpenseType] = useState<ExpenseType>('extra');
  const [paymentDate, setPaymentDate] = useState('2026-11-08'); const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer'); const [paymentAmount, setPaymentAmount] = useState(''); const [paymentBank, setPaymentBank] = useState(''); const [paymentReference, setPaymentReference] = useState(''); const [paymentVerified, setPaymentVerified] = useState(false);
  const [buyerName, setBuyerName] = useState(sale?.buyer_name ?? ''); const [buyerRut, setBuyerRut] = useState(sale?.buyer_rut ?? ''); const [buyerAddress, setBuyerAddress] = useState(sale?.buyer_address ?? ''); const [buyerPhone, setBuyerPhone] = useState(sale?.buyer_phone ?? ''); const [deliveryDate, setDeliveryDate] = useState(sale?.delivery_date ?? ''); const [terms, setTerms] = useState(sale?.terms ?? ''); const [showSaleNote, setShowSaleNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const charged = lines.filter((l) => selected.includes(l.id)).reduce((sum, l) => sum + l.amount, 0);
  const finalAmount = Number(agreedPrice || 0) - charged;
  const assumedExpenseTotal = lines.filter((line) => !selected.includes(line.id)).reduce((sum, line) => sum + line.amount, 0);
  const projectedUtility = Number(realPrice || 0) - vehicle.purchase_price - assumedExpenseTotal;
  const saleIsViable = projectedUtility >= 0;
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const liquidationRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const addExtra = async () => { if (!newExpense) return; await onAddExpense(vehicle.id, newExpense, Number(newAmount) || 0, newExpenseType); setNewExpense(''); setNewAmount(''); };
  const addPayment = async () => { if (!sale || !Number(paymentAmount)) return; await onAddPayment(sale.id, { payment_date: paymentDate, method: paymentMethod, amount: Number(paymentAmount), bank: paymentBank, operation_reference: paymentReference, receipt_url: null, verified: paymentVerified, notes: '' }); setPaymentAmount(''); setPaymentBank(''); setPaymentReference(''); setPaymentVerified(false); };
  const totalReceived = payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + payment.amount, 0);
  const pendingBalance = Math.max(0, Number(agreedPrice || 0) - totalReceived);
  const handleSold = async () => { setSaving(true); try { await onSold(selected, finalAmount, Number(realPrice), Number(agreedPrice), { buyer_name: buyerName, buyer_rut: buyerRut, buyer_address: buyerAddress, buyer_phone: buyerPhone, delivery_date: deliveryDate || null, terms }, soldAt, stayEdit ? stayDays : undefined); } finally { setSaving(false); } };
  const buyerData = { buyer_name: buyerName, buyer_rut: buyerRut, buyer_address: buyerAddress, buyer_phone: buyerPhone, delivery_date: deliveryDate || null, terms };

  const copySummary = async () => {
    const text = `LIQUIDACIÓN CARWIN\n${vehicle.model}\nPrecio venta real: ${money(Number(realPrice))}\nPrecio acordado: ${money(Number(agreedPrice))}\nGastos cobrados:\n${lines.filter((l) => selected.includes(l.id)).map((l) => `- ${l.description}: ${money(l.amount)}`).join('\n') || '- Ninguno'}\n\nMonto final a transferir: ${money(finalAmount)}`;
    await navigator.clipboard.writeText(text);
  };

  const exportImage = async () => {
    if (!liquidationRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(liquidationRef.current, { backgroundColor: '#0a1929', scale: 2, useCORS: true });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No se pudo generar la imagen');
      const fileName = `liquidacion-${vehicle.model.replace(/[^a-zA-Z0-9]/g, '')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Liquidación ${vehicle.model}` });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setExportError('No se pudo exportar la imagen. Intenta copiar el resumen.');
    } finally {
      setExporting(false);
    }
  };

  const [exportError, setExportError] = useState('');

  return <Modal title={sale ? 'Editar venta realizada' : 'Liquidación para el cliente'} onClose={onClose} wide>
    <Field label="Editar precio de venta real"><input type="number" value={realPrice} onChange={(e) => setRealPrice(e.target.value)} /></Field>
    <Field label="Editar precio acordado con cliente"><input type="number" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} /></Field>
    <Field label="Fecha de venta"><input type="date" value={soldAt} onChange={(e) => { setSoldAt(e.target.value); if (!stayEdit) setStayDays(isPhysical(vehicle.vehicle_type) ? daysBetweenDates(vehicle.entered_at, e.target.value) : 0); }} /></Field>
    {isPhysical(vehicle.vehicle_type) && <Field label="Días de estadía / estacionamiento"><input type="number" min="1" value={stayDays} onChange={(e) => { setStayDays(Number(e.target.value) || 1); setStayEdit(true); }} /><small className="form-hint">Cálculo automático: {autoStayDays} días. Puedes modificarlo manualmente. Monto: {money(dailyStayCost * stayDays)}</small></Field>}
    <div className="sale-section-title"><span>Datos del comprador</span><small>Para la nota de venta</small></div>
    <Field label="Nombre del comprador"><input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nombre completo" /></Field>
    <Field label="RUT del comprador"><input value={buyerRut} onChange={(e) => setBuyerRut(e.target.value)} placeholder="12.345.678-9" /></Field>
    <Field label="Dirección"><input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Dirección del comprador" /></Field>
    <Field label="Teléfono"><input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+56 9 ..." /></Field>
    <Field label="Fecha de entrega"><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
    <Field label="Condiciones de venta"><textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Ej. Pago al contado, entrega inmediata..." rows={2} /></Field>
    <div className="sale-section-title"><span>Gastos acumulados</span><small>Selecciona lo que se cobra al cliente</small></div>
    <div className="charge-list">{lines.map((line) => <button className={`charge-line ${selected.includes(line.id) ? 'selected' : ''}`} key={line.id} onClick={() => toggle(line.id)}><span className="toggle"><span /></span><span className="charge-name">{line.description}<small>{line.expense_type === 'wash' ? 'Lavado/Pulido' : line.expense_type === 'parking' ? 'Costo diario de estadía' : 'Extra'} · {line.allocation === 'customer' ? 'Cobrado al cliente' : line.allocation === 'shared' ? 'Compartido' : 'Asumido por CARWIN'}</small></span><strong>{money(line.amount)}</strong></button>)}</div>
    <div className="add-extra"><select value={newExpenseType} onChange={(e) => setNewExpenseType(e.target.value as ExpenseType)}><option value="extra">Extra</option><option value="wash">Lavado y pulido</option></select><input value={newExpense} onChange={(e) => setNewExpense(e.target.value)} placeholder="Otro gasto" /><input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="$ Monto" /><button onClick={() => void addExtra()}><Plus size={17} /></button></div>
    <div className="liquidation-export" ref={liquidationRef}>
      <div className="liquidation-header"><img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="liquidation-logo" /><div><h3>CARWIN</h3><span>Automotora · Liquidación</span></div></div>
      <div className="liquidation-vehicle"><strong>{vehicle.model}</strong><span>{vehicle.plate || 'Patente pendiente'} · {dateLabel(vehicle.entered_at)}</span></div>
      <div className="sale-prices"><div><span>Precio venta real</span><strong>{money(Number(realPrice))}</strong></div><div><span>Saldo acordado cliente</span><strong>{money(Number(agreedPrice))}</strong></div></div>
      <div className="charge-summary"><div className="sale-section-title"><span>Gastos cobrados al cliente</span></div>{lines.filter((l) => selected.includes(l.id)).length > 0 ? lines.filter((l) => selected.includes(l.id)).map((l) => <div className="charge-summary-row" key={l.id}><span>{l.description}</span><strong>{money(l.amount)}</strong></div>) : <p className="charge-summary-empty">Sin gastos cobrados</p>}</div>
      <div className="transfer-total"><span>Monto final a transferir</span><strong>{money(finalAmount)}</strong><small>Saldo acordado menos gastos cobrados al cliente</small></div><div className={`sale-decision ${saleIsViable ? 'viable' : 'not-viable'}`}><div><span>Utilidad neta CARWIN</span><small>Venta real menos compra y gastos asumidos por CARWIN</small></div><strong>{money(projectedUtility)}</strong><b>{saleIsViable ? 'APTO PARA VENDER' : 'NO APTO A ESTE PRECIO'}</b></div>
    </div>
    <div className="payment-panel"><div className="sale-section-title"><span><CreditCard size={16} /> Pagos recibidos</span><small>{sale ? `${payments.filter((payment) => payment.verified).length} verificados` : 'Guarda la venta para registrar pagos'}</small></div>{sale ? <><div className="payment-summary"><div><span>Total verificado</span><strong>{money(totalReceived)}</strong></div><div><span>Saldo pendiente</span><strong>{money(pendingBalance)}</strong></div><div><span>Pagado</span><strong>{Number(agreedPrice) > 0 ? `${Math.min(100, Math.round((totalReceived / Number(agreedPrice)) * 100))}%` : '0%'}</strong></div></div><div className="payment-progress"><div className="payment-progress-fill" style={{ width: `${Number(agreedPrice) > 0 ? Math.min(100, Math.round((totalReceived / Number(agreedPrice)) * 100)) : 0}%` }} /></div><div className="payment-list">{payments.map((payment) => <div className="payment-row" key={payment.id}><div><strong>{money(payment.amount)}</strong><span>{paymentMethodLabel(payment.method)} · {dateLabel(payment.payment_date)}{payment.operation_reference ? ` · ${payment.operation_reference}` : ''}</span></div><b className={payment.verified ? 'verified-payment' : 'pending-payment'}>{payment.verified ? 'Verificado' : 'Pendiente'}</b><button className="row-action danger" onClick={() => void onDeletePayment(payment.id)}><Trash2 size={15} /></button></div>)}</div></> : <p className="form-hint"><FileText size={15} /> Guarda la venta para registrar sus pagos.</p>}</div>
    {sale && <div className="payment-form"><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}><option value="cash">Efectivo</option><option value="bank_draft">Vale vista</option><option value="bank_transfer">Transferencia</option><option value="card">Tarjeta</option><option value="trade_in">Vehículo en parte de pago</option></select><input type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Monto" /><input value={paymentBank} onChange={(event) => setPaymentBank(event.target.value)} placeholder="Banco" /><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="N° operación" /><label className="check-field"><input type="checkbox" checked={paymentVerified} onChange={(event) => setPaymentVerified(event.target.checked)} /> Verificado</label><button className="secondary-button" onClick={() => void addPayment()}><Plus size={16} /> Agregar pago</button></div>}
    {exportError && <p className="form-error">{exportError}</p>}
    <div className="sale-actions">
      {sale && <button className="copy-button" onClick={() => setShowSaleNote(true)}><FileText size={18} /> Ver nota de venta</button>}
      <button className="copy-button" onClick={() => void copySummary()}><Copy size={18} /> Copiar resumen para WhatsApp</button>
      <button className="copy-button" onClick={() => void exportImage()} disabled={exporting}>{exporting ? <span className="mini-spin" /> : <ImageIcon size={18} />}{exporting ? 'Generando imagen...' : 'Descargar liquidación con logo'}</button>
      <button className="primary-button" onClick={() => void handleSold()} disabled={saving}><Check size={18} /> {saving ? 'Guardando...' : sale ? 'Guardar cambios de venta' : 'Marcar como vendido'}</button>
    </div>
    {showSaleNote && sale && <SaleNoteModal vehicle={vehicle} sale={sale} payments={payments} buyerData={buyerData} onClose={() => setShowSaleNote(false)} />}
  </Modal>;
}

function SaleNoteModal({ vehicle, sale, payments, buyerData, onClose }: { vehicle: Vehicle; sale: Sale; payments: SalePayment[]; buyerData: { buyer_name: string; buyer_rut: string; buyer_address: string; buyer_phone: string; delivery_date: string | null; terms: string }; onClose: () => void }) {
  const totalReceived = payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + payment.amount, 0);
  const fullDate = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date('2026-11-08T12:00:00'));
  const noteRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!noteRef.current) return;
    setPrinting(true);
    try {
      const fontCs = `@font-face{font-family:'DM Sans';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/s/dmsans/v15/PumbUy5fUHfnkB_nt5YDaw.woff2) format('woff2');}@font-face{font-family:'DM Sans';font-style:normal;font-weight:600;src:url(https://fonts.gstatic.com/s/dmsans/v15/U8YNi5H5OZ3RskChRwBgTw.woff2) format('woff2');}@font-face{font-family:'DM Sans';font-style:normal;font-weight:700;src:url(https://fonts.gstatic.com/s/dmsans/v15/ifopbHfUnBAwPudRyITdzQ.woff2) format('woff2');}@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:600;src:url(https://fonts.gstatic.com/s/spacegrotesk/v16/FMidRyI5HfLPot/2ld/876W.woff2) format('woff2');}@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:700;src:url(https://fonts.gstatic.com/s/spacegrotesk/v16/FMid_gFyI5HfLPot/2ld/876W.woff2) format('woff2');}`;
      const node = noteRef.current;
      const width = Math.max(node.scrollWidth, 800);
      const height = node.scrollHeight;
      const clone = node.cloneNode(true) as HTMLElement;
      clone.style.width = `${width}px`;
      const html = `<foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:'DM Sans',sans-serif;width:${width}px;height:${height}px;">${clone.innerHTML}</div></foreignObject>`;
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>${fontCs}</style>${html}</svg>`;
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = svgDataUrl;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [width, height] });
      pdf.addImage(imgData, 'PNG', 0, 0, width, height);
      pdf.save(`nota-venta-${sale.folio}.pdf`);
    } catch {
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  return <Modal title="Nota de venta" onClose={onClose} wide>
    <div className="sale-note" ref={noteRef}>
      <div className="note-header">
        <div className="note-brand"><img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="note-logo" /><div><h3>CARWIN SpA</h3><span>Automotora · Nota de venta</span></div></div>
        <div className="note-folio"><span>Folio</span><strong>{sale.folio}</strong></div>
      </div>
      <div className="note-date"><span>Vitacura, {fullDate}</span></div>
      <div className="note-section"><div className="note-section-title">Datos del comprador</div>
        <div className="note-data-grid">
          <div><small>Nombre</small><strong>{buyerData.buyer_name || 'Por completar'}</strong></div>
          <div><small>RUT</small><strong>{buyerData.buyer_rut || 'Por completar'}</strong></div>
          <div><small>Dirección</small><strong>{buyerData.buyer_address || 'Por completar'}</strong></div>
          <div><small>Teléfono</small><strong>{buyerData.buyer_phone || 'Por completar'}</strong></div>
          <div><small>Fecha entrega</small><strong>{buyerData.delivery_date ? dateLabel(buyerData.delivery_date) : 'Por definir'}</strong></div>
        </div>
      </div>
      <div className="note-section"><div className="note-section-title">Vehículo</div>
        <div className="note-vehicle-grid">
          <div><small>Modelo</small><strong>{vehicle.model}</strong></div>
          <div><small>Patente</small><strong>{vehicle.plate || 'Pendiente'}</strong></div>
          <div><small>Kilómetros</small><strong>{vehicle.kilometers.toLocaleString('es-CL')}</strong></div>
          <div><small>Color</small><strong>{vehicle.color}</strong></div>
          <div><small>Tipo</small><strong>{typeLabel(vehicle.vehicle_type)}</strong></div>
          <div><small>Año</small><strong>{new Date(vehicle.entered_at).getFullYear()}</strong></div>
        </div>
      </div>
      {buyerData.terms && <div className="note-section"><div className="note-section-title">Condiciones</div><p className="note-terms">{buyerData.terms}</p></div>}
      <div className="note-section"><div className="note-section-title">Detalle financiero</div>
        <div className="note-finance-table">
          <div className="note-finance-row total"><span>Precio venta real</span><strong>{money(sale.real_sale_price)}</strong></div>
          {totalReceived > sale.real_sale_price && <div className="note-finance-row"><span>Costo de transferencia</span><strong>{money(totalReceived - sale.real_sale_price)}</strong></div>}
        </div>
      </div>
      {payments.length > 0 && <div className="note-section"><div className="note-section-title">Pagos registrados</div>
        <div className="note-payments">{payments.map((payment) => <div className="note-payment-row" key={payment.id}><span>{paymentMethodLabel(payment.method)} · {dateLabel(payment.payment_date)}{payment.operation_reference ? ` · ${payment.operation_reference}` : ''}</span><strong>{money(payment.amount)}</strong><b className={payment.verified ? 'verified-payment' : 'pending-payment'}>{payment.verified ? 'Verificado' : 'Pendiente'}</b></div>)}</div>
      </div>}
      <div className="note-signatures">
        <div className="note-sig"><span>CARWIN SpA</span><div /></div>
        <div className="note-sig"><span>Comprador</span><div /></div>
      </div>
    </div>
    <div className="sale-actions">
      <button className="copy-button" onClick={() => void handlePrint()} disabled={printing}><FileText size={18} />{printing ? 'Generando PDF...' : 'Descargar nota de venta (PDF)'}</button>
      <button className="primary-button" onClick={onClose}>Cerrar</button>
    </div>
  </Modal>;
}

function SettingsModal({ settings, onClose, onSave }: { settings: CarwinSettings; onClose: () => void; onSave: (settings: CarwinSettings) => Promise<void> }) {
  const [dailyStay, setDailyStay] = useState(settings.daily_stay_cost.toString());
  const [cardFee, setCardFee] = useState(settings.card_fee_rate.toString());
  const [transferTax, setTransferTax] = useState(settings.transfer_tax_rate.toString());
  const [transferFixed, setTransferFixed] = useState(settings.transfer_fixed_cost.toString());
  const [ufValue, setUfValue] = useState(settings.uf_value.toString());
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await onSave({ daily_stay_cost: Number(dailyStay) || 0, card_fee_rate: Number(cardFee) || 0, transfer_tax_rate: Number(transferTax) || 0, transfer_fixed_cost: Number(transferFixed) || 0, uf_value: Number(ufValue) || 0 }); } finally { setSaving(false); } };
  return <Modal title="Configuración operativa" onClose={onClose}><form className="single-form" onSubmit={submit}>
    <div className="form-section-title">Costos operativos</div>
    <Field label="Costo diario de estadía (CLP)"><input min="0" type="number" value={dailyStay} onChange={(e) => setDailyStay(e.target.value)} /></Field>
    <Field label="Comisión tarjeta (%)"><input min="0" step="0.1" type="number" value={cardFee} onChange={(e) => setCardFee(e.target.value)} /></Field>
    <Field label="Impuesto transferencia (%)"><input min="0" step="0.1" type="number" value={transferTax} onChange={(e) => setTransferTax(e.target.value)} /></Field>
    <Field label="Costo fijo transferencia (CLP)"><input min="0" type="number" value={transferFixed} onChange={(e) => setTransferFixed(e.target.value)} /></Field>
    <Field label="Valor UF (CLP)"><input min="0" type="number" value={ufValue} onChange={(e) => setUfValue(e.target.value)} /></Field>
    <p className="form-hint">El costo diario de estadía se aplica automáticamente a vehículos propios y consignaciones físicas.</p>
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Guardar configuración'}</button></div>
  </form></Modal>;
}

function Calculators({ settings }: { settings: CarwinSettings }) {
  const [activeCalc, setActiveCalc] = useState<'card' | 'transfer'>('card');
  return <>
    <section className="page-heading"><div><p className="eyebrow">HERRAMIENTAS</p><h2>Calculadoras <span>CARWIN</span></h2><p className="muted">Comisiones de tarjeta y costo de transferencia vehicular.</p></div></section>
    <div className="calc-tabs">
      <button className={activeCalc === 'card' ? 'active' : ''} onClick={() => setActiveCalc('card')}><CreditCard size={16} /> Comisión tarjeta</button>
      <button className={activeCalc === 'transfer' ? 'active' : ''} onClick={() => setActiveCalc('transfer')}><ArrowRightLeft size={16} /> Transferencia vehicular</button>
    </div>
    {activeCalc === 'card' ? <CardFeeCalculator rate={settings.card_fee_rate} /> : <TransferCalculator taxRate={settings.transfer_tax_rate} fixedCost={settings.transfer_fixed_cost} />}
  </>;
}

function CardFeeCalculator({ rate }: { rate: number }) {
  const [mode, setMode] = useState<'absorb' | 'surcharge'>('absorb');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState(rate.toString());
  const r = Number(feeRate) || 0;
  const amt = Number(amount) || 0;
  const fee = mode === 'absorb' ? amt * (r / 100) : 0;
  const netReceived = mode === 'absorb' ? amt - fee : 0;
  const grossNeeded = mode === 'surcharge' ? amt / (1 - r / 100) : 0;
  const surcharge = mode === 'surcharge' ? grossNeeded - amt : 0;
  return <div className="calc-card">
    <div className="calc-title"><CreditCard size={22} /><div><h3>Comisión por tarjetas</h3><small>Tasa configurable — actualmente {formatPercent(r)}</small></div></div>
    <div className="calc-tabs">
      <button className={mode === 'absorb' ? 'active' : ''} onClick={() => setMode('absorb')}>A. CARWIN absorbe el costo</button>
      <button className={mode === 'surcharge' ? 'active' : ''} onClick={() => setMode('surcharge')}>B. CARWIN recibe un monto neto</button>
    </div>
    <div className="calc-grid">
      <label className="calc-field"><span>{mode === 'absorb' ? 'Monto cobrado con tarjeta' : 'Monto neto que CARWIN quiere recibir'}</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0" /></label>
      <label className="calc-field"><span>Porcentaje de comisión (%)</span><input type="number" step="0.1" value={feeRate} onChange={(e) => setFeeRate(e.target.value)} /></label>
    </div>
    {amt > 0 && <div className="calc-result">
      {mode === 'absorb' ? <>
        <div className="calc-result-row"><span>Monto original cobrado</span><strong>{money(amt)}</strong></div>
        <div className="calc-result-row warn"><span>Comisión ({formatPercent(r)})</span><strong>-{money(fee)}</strong></div>
        <div className="calc-result-row total"><span>Neto final recibido</span><strong>{money(netReceived)}</strong></div>
      </> : <>
        <div className="calc-result-row"><span>Monto neto deseado</span><strong>{money(amt)}</strong></div>
        <div className="calc-result-row warn"><span>Comisión ({formatPercent(r)})</span><strong>{money(grossNeeded * (r / 100))}</strong></div>
        <div className="calc-result-row"><span>Adicional necesario al cliente</span><strong>+{money(surcharge)}</strong></div>
        <div className="calc-result-row highlight"><span>Total a cobrar (bruto)</span><strong>{money(grossNeeded)}</strong></div>
        <div className="calc-result-row total"><span>Neto final recibido</span><strong>{money(amt)}</strong></div>
      </>}
    </div>}
    <div className="calc-note"><Info size={16} /> El escenario de recargo es solo una simulación. No se aplica automáticamente al cliente sin validación comercial.</div>
  </div>;
}

function TransferCalculator({ taxRate, fixedCost }: { taxRate: number; fixedCost: number }) {
  const [salePrice, setSalePrice] = useState('');
  const [fiscalValue, setFiscalValue] = useState('');
  const [taxPercent, setTaxPercent] = useState(taxRate.toString());
  const [extraCosts, setExtraCosts] = useState(fixedCost.toString());
  const [whoPays, setWhoPays] = useState<'buyer' | 'seller' | 'carwin' | 'shared'>('buyer');
  const sp = Number(salePrice) || 0;
  const fv = Number(fiscalValue) || 0;
  const base = Math.max(sp, fv);
  const tp = Number(taxPercent) || 0;
  const ec = Number(extraCosts) || 0;
  const tax = base * (tp / 100);
  const total = tax + ec;
  return <div className="calc-card">
    <div className="calc-title"><ArrowRightLeft size={22} /><div><h3>Transferencia vehicular</h3><small>Estimación interna — no es tarifa legal oficial</small></div></div>
    <div className="calc-grid">
      <label className="calc-field"><span>Precio de venta</span><input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="$0" /></label>
      <label className="calc-field"><span>Tasación fiscal</span><input type="number" value={fiscalValue} onChange={(e) => setFiscalValue(e.target.value)} placeholder="$0" /></label>
      <label className="calc-field"><span>Impuesto (%)</span><input type="number" step="0.1" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} /></label>
      <label className="calc-field"><span>Gastos adicionales (CLP)</span><input type="number" value={extraCosts} onChange={(e) => setExtraCosts(e.target.value)} placeholder="$0" /></label>
      <label className="calc-field"><span>¿Quién asume el costo?</span><select value={whoPays} onChange={(e) => setWhoPays(e.target.value as 'buyer' | 'seller' | 'carwin' | 'shared')}><option value="buyer">Comprador</option><option value="seller">Vendedor</option><option value="carwin">CARWIN</option><option value="shared">Compartido</option></select></label>
    </div>
    {base > 0 && <div className="calc-result">
      <div className="calc-result-row"><span>Base imponible (mayor valor)</span><strong>{money(base)}</strong></div>
      <div className="calc-result-row warn"><span>Impuesto ({formatPercent(tp)})</span><strong>{money(tax)}</strong></div>
      <div className="calc-result-row"><span>Gastos adicionales</span><strong>{money(ec)}</strong></div>
      <div className="calc-result-row total"><span>Costo estimado total</span><strong>{money(total)}</strong></div>
      <div className="calc-result-row"><span>Asume el costo</span><strong>{whoPays === 'buyer' ? 'Comprador' : whoPays === 'seller' ? 'Vendedor' : whoPays === 'carwin' ? 'CARWIN' : 'Compartido'}</strong></div>
    </div>}
    <div className="calc-disclaimer">Los {money(fixedCost)} son una estimación interna de CARWIN y pueden modificarse. No presentar como tarifa legal oficial.</div>
  </div>;
}

function ConsignmentContractModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [ownerName, setOwnerName] = useState('');
  const [ownerRut, setOwnerRut] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [commission, setCommission] = useState('5');
  const [minimumPrice, setMinimumPrice] = useState(vehicle.agreed_price.toString());
  const [terms, setTerms] = useState('El propietario autoriza a CARWIN SpA a exhibir y gestionar la venta del vehículo. La entrega se realizará contra la liquidación acordada y los gastos previamente informados.');
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const generatePdf = async () => {
    setGenerating(true);
    try {
      const pdf = new jsPDF();
      const left = 18;
      let y = 20;
      pdf.setFillColor(16, 43, 79);
      pdf.rect(0, 0, 210, 32, 'F');
      let logoDataUrl: string | null = null;
      try {
        const logoResp = await fetch('/assets/images/Logo_Oficial.jpeg');
        const logoBlob = await logoResp.blob();
        logoDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(logoBlob); });
      } catch { logoDataUrl = null; }
      if (logoDataUrl) {
        try { pdf.addImage(logoDataUrl, 'JPEG', left, 4, 22, 22); } catch { /* skip if format fails */ }
      }
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('CARWIN SpA', left + 26, 16);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('CONTRATO DE CONSIGNACIÓN VEHICULAR', left + 26, 24);
      y = 46;
      pdf.setTextColor(16, 43, 79);
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.text('1. Datos del propietario', left, y);
      y += 9;
      pdf.setTextColor(35, 35, 35);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Nombre: ${ownerName || 'Por completar'}`, left, y);
      pdf.text(`RUT: ${ownerRut || 'Por completar'}`, 110, y);
      y += 7;
      pdf.text(`Teléfono: ${ownerPhone || 'Por completar'}`, left, y);
      y += 7;
      pdf.text(`Dirección: ${ownerAddress || 'Por completar'}`, left, y);
      y += 14;
      pdf.setTextColor(16, 43, 79);
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.text('2. Vehículo consignado', left, y);
      y += 9;
      pdf.setTextColor(35, 35, 35);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Modelo: ${vehicle.model}`, left, y);
      pdf.text(`Patente: ${vehicle.plate || 'Pendiente'}`, 110, y);
      y += 7;
      pdf.text(`Color: ${vehicle.color || 'Por completar'}`, left, y);
      pdf.text(`Kilómetros: ${vehicle.kilometers.toLocaleString('es-CL')}`, 110, y);
      y += 14;
      pdf.setTextColor(16, 43, 79);
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.text('3. Condiciones comerciales', left, y);
      y += 9;
      pdf.setTextColor(35, 35, 35);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Precio mínimo autorizado: ${money(Number(minimumPrice) || 0)}`, left, y);
      pdf.text(`Comisión CARWIN: ${commission || '0'}%`, 110, y);
      y += 12;
      const wrappedTerms = pdf.splitTextToSize(terms || 'Sin condiciones adicionales.', 174) as string[];
      pdf.text(wrappedTerms, left, y);
      y += wrappedTerms.length * 6 + 18;
      pdf.setTextColor(16, 43, 79);
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.text('4. Observaciones y firmas', left, y);
      y += 32;
      pdf.setDrawColor(90, 90, 90);
      pdf.line(left, y, 90, y);
      pdf.line(120, y, 192, y);
      y += 6;
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Propietario', 45, y);
      pdf.text('CARWIN SpA', 145, y);
      y += 16;
      pdf.text(`Fecha de emisión: ${dateLabel('2026-11-08')}`, left, y);
      pdf.save(`contrato-consignacion-${vehicle.model.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return <Modal title="Contrato de consignación" onClose={onClose} wide>
    <div className="contract-intro"><FileSignature size={24} /><div><strong>{vehicle.model}</strong><span>Completa los datos del propietario para generar el documento.</span></div></div>
    <div className="form-grid contract-form">
      <Field label="Nombre del propietario" required><input required value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Nombre completo" /></Field>
      <Field label="RUT" required><input required value={ownerRut} onChange={(event) => setOwnerRut(event.target.value)} placeholder="12.345.678-9" /></Field>
      <Field label="Teléfono"><input value={ownerPhone} onChange={(event) => setOwnerPhone(event.target.value)} placeholder="+56 9 ..." /></Field>
      <Field label="Dirección"><input value={ownerAddress} onChange={(event) => setOwnerAddress(event.target.value)} placeholder="Dirección del propietario" /></Field>
      <Field label="Comisión CARWIN (%)"><input min="0" step="0.1" type="number" value={commission} onChange={(event) => setCommission(event.target.value)} /></Field>
      <Field label="Precio mínimo autorizado"><input min="0" type="number" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} /></Field>
      <label className="field contract-terms"><span>Condiciones del acuerdo</span><textarea rows={5} value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
    </div>
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="button" className="secondary-button" onClick={() => setShowPreview((v) => !v)}><Eye size={18} />{showPreview ? 'Ocultar vista previa' : 'Ver vista previa'}</button><button type="button" className="primary-button" disabled={generating || !ownerName || !ownerRut} onClick={() => void generatePdf()}><FileText size={18} />{generating ? 'Generando...' : 'Descargar contrato PDF'}</button></div>
    {showPreview && <div className="contract-preview">
      <div className="contract-preview-paper">
        <div className="contract-preview-header"><img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="contract-preview-logo" /><div><strong>CARWIN SpA</strong><span>CONTRATO DE CONSIGNACIÓN VEHICULAR</span></div></div>
        <div className="contract-preview-section"><strong>1. Datos del propietario</strong><div className="contract-preview-data"><span><small>Nombre</small><b>{ownerName || 'Por completar'}</b></span><span><small>RUT</small><b>{ownerRut || 'Por completar'}</b></span><span><small>Teléfono</small><b>{ownerPhone || 'Por completar'}</b></span><span><small>Dirección</small><b>{ownerAddress || 'Por completar'}</b></span></div></div>
        <div className="contract-preview-section"><strong>2. Vehículo consignado</strong><div className="contract-preview-data"><span><small>Modelo</small><b>{vehicle.model}</b></span><span><small>Patente</small><b>{vehicle.plate || 'Pendiente'}</b></span><span><small>Color</small><b>{vehicle.color || 'Por completar'}</b></span><span><small>Kilómetros</small><b>{vehicle.kilometers.toLocaleString('es-CL')}</b></span></div></div>
        <div className="contract-preview-section"><strong>3. Condiciones comerciales</strong><div className="contract-preview-data"><span><small>Precio mínimo autorizado</small><b>{money(Number(minimumPrice) || 0)}</b></span><span><small>Comisión CARWIN</small><b>{commission || '0'}%</b></span></div><p className="contract-preview-terms">{terms || 'Sin condiciones adicionales.'}</p></div>
        <div className="contract-preview-section"><strong>4. Observaciones y firmas</strong><div className="contract-preview-signatures"><div><i /><small>Propietario</small></div><div><i /><small>CARWIN SpA</small></div></div><p className="contract-preview-date">Fecha de emisión: {dateLabel('2026-11-08')}</p></div>
      </div>
    </div>}
  </Modal>;
}

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) { return <label className="field"><span>{label}{required && <em> *</em>}</span>{children}</label>; }
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">CARWIN</p><h3>{title}</h3></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>{children}</div></div>; }

export default App;
