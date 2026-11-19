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

const todayChile = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const DEFAULT_DAILY_STAY_COST = 3900;
const DEFAULT_UF_VALUE = 47890;
const ADDRESS_TEXT = 'Av. Vitacura 4607 Nivel -3 N°22\nCentro Comercial Paseo el Tamarugo';

type VehicleType = 'own' | 'physical_consignment' | 'virtual_consignment';
type MaintenanceType = 'brand' | 'private' | 'none';
type ExpenseType = 'wash' | 'extra';
type ExpenseAllocation = 'carwin' | 'customer' | 'shared';
type PaymentMethod = 'cash' | 'bank_draft' | 'bank_transfer' | 'card' | 'trade_in';
type View = 'dashboard' | 'inventory' | 'expenses' | 'calculators' | 'simulador' | 'reports' | 'sales' | 'finance';

interface Vehicle {
  photo_path?: string | null;
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
transfer_mode?: 'separate' | 'included' | 'direct' | null;
transfer_cost?: number | null;
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
  permit_expiry: '', soap_expiry: '', inspection_expiry: '', entered_at: todayChile(),
};

const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', '') : 'Sin fecha';
const daysBetween = (date: string) => daysBetweenDates(date, todayChile());
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

function upsertRow<T extends { id: string }>(items: T[], row: T): T[] {
  return items.some(item => item.id === row.id) ? items.map(item => item.id === row.id ? row : item) : [row, ...items];
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
        if (payload.eventType === 'INSERT') setVehicles((items) => upsertRow(items, payload.new as Vehicle));
        else if (payload.eventType === 'UPDATE') setVehicles((items) => items.map((item) => item.id === (payload.new as Vehicle).id ? payload.new as Vehicle : item));
        else if (payload.eventType === 'DELETE') setVehicles((items) => items.filter((item) => item.id !== (payload.old as Vehicle).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_vehicle_expenses' }, (payload) => {
        if (payload.eventType === 'INSERT') setVehicleExpenses((items) => upsertRow(items, payload.new as VehicleExpense));
        else if (payload.eventType === 'UPDATE') setVehicleExpenses((items) => items.map((item) => item.id === (payload.new as VehicleExpense).id ? payload.new as VehicleExpense : item));
        else if (payload.eventType === 'DELETE') setVehicleExpenses((items) => items.filter((item) => item.id !== (payload.old as VehicleExpense).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_office_expenses' }, (payload) => {
        if (payload.eventType === 'INSERT') setOfficeExpenses((items) => upsertRow(items, payload.new as OfficeExpense));
        else if (payload.eventType === 'UPDATE') setOfficeExpenses((items) => items.map((item) => item.id === (payload.new as OfficeExpense).id ? payload.new as OfficeExpense : item));
        else if (payload.eventType === 'DELETE') setOfficeExpenses((items) => items.filter((item) => item.id !== (payload.old as OfficeExpense).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_sales' }, (payload) => {
        if (payload.eventType === 'INSERT') setSales((items) => upsertRow(items, payload.new as Sale));
        else if (payload.eventType === 'UPDATE') setSales((items) => items.map((item) => item.id === (payload.new as Sale).id ? payload.new as Sale : item));
        else if (payload.eventType === 'DELETE') setSales((items) => items.filter((item) => item.id !== (payload.old as Sale).id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carwin_sale_payments' }, (payload) => {
        if (payload.eventType === 'INSERT') setSalePayments((items) => upsertRow(items, payload.new as SalePayment));
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

  const saveVehicle = async (data: Omit<Vehicle, 'id' | 'status'>, id?: string, photo?: File | null, removePhoto = false) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    const oldPath = id ? vehicles.find(v => v.id === id)?.photo_path : null;
    let newPath: string | undefined;
    if (photo) {
      const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as Record<string,string>)[photo.type];
      if (!ext || photo.size > 5 * 1024 * 1024) throw new Error('Usa JPG, PNG o WebP de hasta 5 MB');
      newPath = `${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from('carwin-vehicle-photos').upload(newPath, photo, { contentType: photo.type });
      if (upload.error) throw upload.error;
    }
    const payload = { ...data, plate: data.plate.toUpperCase(), ...(newPath ? {photo_path:newPath} : removePhoto ? {photo_path:null} : {}) };
    const result = id
      ? await supabase.from('carwin_vehicles').update(payload).eq('id', id).select().maybeSingle()
      : await supabase.from('carwin_vehicles').insert(payload).select().maybeSingle();
    if (result.error || !result.data) {
      if (newPath) await supabase.storage.from('carwin-vehicle-photos').remove([newPath]);
      throw result.error ?? new Error('No se pudo guardar');
    }
    if (oldPath && (newPath || removePhoto)) {
      const cleanup = await supabase.storage.from('carwin-vehicle-photos').remove([oldPath]);
      if (cleanup.error) setError('Vehículo guardado; no se pudo eliminar la fotografía anterior.');
    }
    if (id) setVehicles((items) => items.map((item) => item.id === id ? result.data as Vehicle : item));
    else setVehicles((items) => upsertRow(items, result.data as Vehicle));
    setShowVehicleForm(false);
    setEditingVehicle(null);
  };

  const removeVehicle = async (vehicle: Vehicle) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    if (!window.confirm(`¿Retirar ${vehicle.model} del stock?`)) return;
    const result = await supabase.from('carwin_vehicles').update({ status: 'removed' }).eq('id', vehicle.id);
    if (result.error) setError('No se pudo retirar el vehículo.');
    else setVehicles((items) => items.filter((item) => item.id !== vehicle.id));
  };

  const addOfficeExpense = async (description: string, amount: number, date: string) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    const result = await supabase.from('carwin_office_expenses').insert({ description, amount, expense_date: date }).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo guardar');
    setOfficeExpenses((items) => upsertRow(items, result.data as OfficeExpense));
    setShowOfficeForm(false);
  };

  const addVehicleExpense = async (vehicleId: string, description: string, amount: number, expenseType: ExpenseType, allocation: ExpenseAllocation = 'carwin') => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    const result = await supabase.from('carwin_vehicle_expenses').insert({ vehicle_id: vehicleId, expense_type: expenseType, description, amount, allocation, expense_date: todayChile()}).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo guardar');
    setVehicleExpenses((items) => upsertRow(items, result.data as VehicleExpense));
  };

  const deleteVehicleExpense = async (id: string) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    const result = await supabase.from('carwin_vehicle_expenses').delete().eq('id', id);
    if (result.error) { setError('No se pudo eliminar el gasto.'); return; }
    setVehicleExpenses((items) => items.filter((item) => item.id !== id));
  };

  const updateVehicleExpense = async (id: string, description: string, amount: number, allocation: ExpenseAllocation) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    const result = await supabase.from('carwin_vehicle_expenses').update({ description, amount, allocation }).eq('id', id).select().maybeSingle();
    if (result.error || !result.data) { setError('No se pudo actualizar el gasto.'); return; }
    setVehicleExpenses((items) => items.map((item) => item.id === id ? result.data as VehicleExpense : item));
  };

  const addSalePayment = async (saleId: string, payment: Omit<SalePayment, 'id' | 'sale_id'>) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    const result = await supabase.from('carwin_sale_payments').insert({ sale_id: saleId, ...payment }).select().maybeSingle();
    if (result.error || !result.data) throw result.error ?? new Error('No se pudo registrar el pago');
    setSalePayments((items) => upsertRow(items, result.data as SalePayment));
  };

  const deleteSalePayment = async (id: string) => {
    if (!isAdmin) throw new Error("Acceso de solo lectura");
    if (!window.confirm('¿Eliminar este pago?')) return;
    const result = await supabase.from('carwin_sale_payments').delete().eq('id', id).select('id').maybeSingle();
    if (result.error || !result.data) { setError('No se pudo eliminar el pago.'); return; }
    setSalePayments((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="app-shell"><style>{`
.app-shell .inventory-card,.app-shell .vehicle-row,.app-shell .expense-row,.app-shell .grouped-row,.app-shell .summary-card,.app-shell .calc-card,.app-shell .report-card{background:linear-gradient(145deg,#122d49,#0a1b30);border-color:#38678d;box-shadow:0 8px 22px #0003}
.app-shell .inventory-card{padding:20px;border-radius:20px}.app-shell .inventory-card.has-risk{border-color:#f36b79;box-shadow:inset 3px 0 #f36b79,0 8px 22px #0003}.app-shell .inventory-card .vehicle-avatar{background:linear-gradient(145deg,#133e66,#091b30);border-color:#38b6ff;color:#65d8ff}.app-shell .inventory-card .price-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;border-color:#315574}.app-shell .inventory-card .price-grid>div{min-width:0}.app-shell .inventory-card .price-grid>div:nth-child(2){background:#123c67;border-radius:10px;padding:8px}.app-shell .inventory-card .price-grid>div:not(:nth-child(2)){padding:8px 0}.app-shell .inventory-card .price-grid strong{font-size:clamp(13px,1.2vw,19px);overflow-wrap:anywhere}.app-shell .inventory-card .expense-balance strong{color:#ffcf50}.app-shell .type-tag.own{background:#103e76;color:#8bd5ff}.app-shell .type-tag.physical_consignment{background:#104c42;color:#76ffcf}.app-shell .type-tag.virtual_consignment{background:#493817;color:#ffdc78}.app-shell .inventory-card .mini-sell{background:linear-gradient(130deg,#0875ff,#084ab6);border-color:#49baff}.app-shell .inventory-card .contract-button{background:#102c43;color:#8de8ff}.app-shell .inventory-card .card-footer{flex-wrap:wrap}.app-shell .inventory-card .card-footer>div{flex-wrap:wrap}.app-shell .inventory-card .row-action{color:#a7d5f2}.app-shell .nav-item.active{border-radius:12px}.app-shell .primary-button{background:linear-gradient(135deg,#ffdc78,#d99d2e);border-color:#ffcf50;color:#07172b;box-shadow:0 6px 18px #d99d2e30}.app-shell .stock-tabs button.active{background:#0875ff;color:white}.app-shell .search-box{background:#0b2036;border-color:#38678d}.app-shell .expense-total{background:linear-gradient(135deg,#104b85,#102b4f)}.app-shell .expense-grand-total{background:linear-gradient(135deg,#12634e,#103a34)}
@media(min-width:1050px){.app-shell{max-width:1600px;padding-left:218px;padding-bottom:24px;overflow:visible}.app-shell .topbar{height:90px}.app-shell .main-content{max-width:none;padding:24px}.app-shell .bottom-nav{position:fixed;top:0;bottom:0;left:max(0px,calc((100vw - 1600px)/2));transform:none;width:210px;height:100dvh;flex-direction:column;justify-content:flex-start;align-items:stretch;gap:10px;padding:120px 12px 24px;background:linear-gradient(160deg,#102b4f,#061426);border-top:0;border-right:1px solid #357bb4;overflow-y:auto}.app-shell .bottom-nav:before{content:'CARWIN CONTROL';position:absolute;top:48px;left:20px;color:#65d8ff;font-weight:800;letter-spacing:.08em}.app-shell .nav-item{flex-direction:row;justify-content:flex-start;padding:15px 12px;gap:12px;font-size:15px}.app-shell .nav-item b{position:static;margin-left:auto}.app-shell .nav-item.active{background:linear-gradient(100deg,#075abb,#103c67);color:white;border:1px solid #38b6ff}.exec-kpis .kpi-card{padding:16px!important}.exec-kpis .kpi-card>strong{font-size:clamp(20px,2vw,34px)!important}.executive-dashboard .hero-row{margin-bottom:20px}.exec-panel{padding:18px!important}.exec-overview{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:16px}.exec-overview .exec-panel{min-width:0}}.exec-chart-axis{display:grid;grid-template-columns:65px minmax(0,1fr);gap:8px}.exec-chart-labels{display:flex;flex-direction:column;justify-content:space-between;height:150px;font-size:11px;color:#c5d9ed;text-align:right}.exec-chart-month small{line-height:1.4}.exec-chart-month .exec-values{font-size:11px;overflow-wrap:anywhere}.exec-chart-month .exec-values span{display:block}.exec-panel .section-heading select{max-width:100%}@media(max-width:680px){.exec-chart-axis{grid-template-columns:48px minmax(0,1fr)}.exec-chart-labels{font-size:10px}.exec-chart-month .exec-values{font-size:10px}}@media(max-width:1049px){.app-shell .bottom-nav{overflow-x:auto;justify-content:flex-start}.app-shell .bottom-nav .nav-item{flex:1 0 78px;min-width:78px}} .commercial-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}.commercial-grid>div{background:#102b46;border:1px solid #41769d;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px}.commercial-grid strong{font-size:23px;overflow-wrap:anywhere}.commercial-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.commercial-filters{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.commercial-filters select{background:#102b46;color:white;border:1px solid #41769d;border-radius:10px;padding:12px}.commercial-grid small{color:#c5d9ed}.commercial-sale{margin:12px 0;padding:18px}.commercial-sale .card-top{display:flex;align-items:center;gap:12px} .app-shell .brand-logo{width:145px;height:65px;object-fit:contain;background:transparent;border:0;padding:0;border-radius:8px}.app-shell .main-content{min-width:0;width:100%;box-sizing:border-box}.app-shell .exec-pair{align-items:start;grid-template-columns:repeat(2,minmax(0,1fr))}.cw-alerts h3{display:flex;gap:10px;align-items:center;color:#ffce63;margin-bottom:14px}.cw-alerts button,.cw-alerts>div{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;padding:14px;margin-top:8px;border:1px solid #365c80;border-radius:12px;background:#132f49;color:#fff;text-align:left}.cw-alerts strong{color:#ffce63;overflow-wrap:anywhere}.cw-report select,.cw-report input{max-width:100%;min-width:0}.cw-report .commercial-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}.cw-report .report-search-row{display:grid;grid-template-columns:90px minmax(0,1fr) minmax(0,1fr) auto;gap:8px;overflow-wrap:anywhere}.cw-report .summary-card{margin-bottom:16px}.cw-report .report-result{overflow-wrap:anywhere}.cw-report .commercial-grid>div{min-width:0}.app-shell .hero-row,.app-shell .page-heading{flex-wrap:wrap}.app-shell .main-content>*{min-width:0;max-width:100%}@media(max-width:680px){.app-shell .exec-pair{grid-template-columns:1fr}.app-shell .brand-logo{width:105px;height:48px}.app-shell .brand-lockup{min-width:0;gap:8px}.app-shell .brand-lockup h1{font-size:20px}.app-shell .main-content{padding:12px}.app-shell .inventory-card{padding:12px}.app-shell .inventory-grid,.app-shell .report-type-grid{grid-template-columns:minmax(0,1fr)}.app-shell .commercial-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.app-shell .commercial-grid>div{padding:10px;min-width:0}.app-shell .commercial-grid strong{font-size:18px}.cw-report .report-search-row{grid-template-columns:minmax(0,1fr) auto}.cw-report .report-result{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.app-shell .summary-card{min-width:0;overflow-x:auto}.app-shell .exec-chart{overflow-x:auto}.app-shell .exec-chart-month{min-width:62px}.app-shell .bottom-nav{max-width:100vw}.app-shell .topbar{max-width:100%}}`}</style>
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="brand-logo" />
          <div><p className="eyebrow">CONTROL OPERATIVO</p><h1>CARWIN</h1></div>
        </div>
        <button className="icon-button" onClick={() => setShowInfo(true)} aria-label="Abrir información"><Banknote size={20} /></button>
      </header>

      <main className="main-content">
        {error && <div className="error-banner"><AlertTriangle size={18} />{error}<button onClick={() => setError('')}><X size={17} /></button></div>}
{view === 'dashboard' && <><Dashboard isAdmin={isAdmin} activeVehicles={activeVehicles} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} monthUtility={monthUtility} monthSalesTotal={monthSalesTotal} officeTotal={officeTotal} potentialProfit={potentialProfit} documentationAlerts={documentationAlerts} physicalAging={physicalAging} onSeeInventory={() => setView('inventory')} onSell={setSellingVehicle} onManageExpenses={setExpenseVehicle} vehicleExpenses={vehicleExpenses} vehicles={vehicles} sales={sales} officeExpenses={officeExpenses} salePayments={salePayments} dailyStayCost={settings.daily_stay_cost} /></>}
        {view === 'sales' && <CommercialView key={view} finance={false} isAdmin={isAdmin} vehicles={vehicles} sales={sales} expenses={vehicleExpenses} payments={salePayments} dailyStayCost={settings.daily_stay_cost} onEdit={(v,s)=>{if(isAdmin){setEditingSale(s);setSellingVehicle(v);}}} onExpenses={setExpenseVehicle}/>}
        {view === 'finance' && <><section className="page-heading"><div><p className="eyebrow">CONTROL FINANCIERO</p><h2>Finanzas <span>y balance</span></h2><p className="muted">Situación contable, gastos y compromisos financieros.</p></div></section><BalanceResumen isAdmin={isAdmin}/></>}
        {view === 'reports' && <Reports vehicles={vehicles} sales={sales} vehicleExpenses={vehicleExpenses} salePayments={salePayments} officeExpenses={officeExpenses} monthPrefix={monthPrefix} dailyStayCost={settings.daily_stay_cost} />}
        {view === 'inventory' && <Inventory isAdmin={isAdmin} vehicles={vehicles} sales={sales} vehicleExpenses={vehicleExpenses} search={search} setSearch={setSearch} onAdd={() => { setEditingVehicle(null); setShowVehicleForm(true); }} onEdit={(v) => { setEditingVehicle(null); setEditingVehicle(v); setShowVehicleForm(true); }} onDelete={removeVehicle} onSell={(v) => { setEditingSale(null); setSellingVehicle(v); }} onEditSale={(v, sale) => { setEditingSale(sale); setSellingVehicle(v); }} onRestoreSale={async (v, sale) => { const saleResult = await supabase.from('carwin_sales').update({ status: 'cancelled' }).eq('id', sale.id); const vehicleResult = await supabase.from('carwin_vehicles').update({ status: 'active' }).eq('id', v.id); if (saleResult.error || vehicleResult.error) { setError('No se pudo devolver el auto a activos.'); return; } void loadData(); }} onManageExpenses={setExpenseVehicle} />}
        {view === 'expenses' && <OfficeExpenses isAdmin={isAdmin} expenses={officeExpenses} monthPrefix={monthPrefix} onAdd={() => setShowOfficeForm(true)} onDelete={async (id) => { if (!isAdmin || !window.confirm('¿Eliminar este gasto?')) return; const result = await supabase.from('carwin_office_expenses').delete().eq('id', id).select('id').maybeSingle(); if (result.error || !result.data) { setError('No se pudo eliminar el gasto.'); return; } setOfficeExpenses((items) => items.filter((item) => item.id !== id)); }} />}
        {view === 'calculators' && <Calculators settings={settings} />}
        {view === 'simulador' && <SimuladorCuotas ufValue={settings.uf_value} />}
      </main>

      <nav className="bottom-nav">
        <NavItem icon={<LayoutDashboard size={22} />} label="Resumen" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <NavItem icon={<CarFront size={22} />} label="Stock" active={view === 'inventory'} onClick={() => setView('inventory')} badge={activeVehicles.length} />
        <NavItem icon={<FileText size={22}/>} label="Ventas" active={view === 'sales'} onClick={()=>setView('sales')}/>
        <NavItem icon={<Wallet size={22}/>} label="Finanzas" active={view === 'finance'} onClick={()=>setView('finance')}/>
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
      {expenseVehicle && <VehicleExpenseModal isAdmin={isAdmin} vehicle={expenseVehicle} sale={sales.find(s => s.vehicle_id === expenseVehicle.id && s.status === 'completed')} onSaveStay={async (days) => { if (!isAdmin) throw new Error('Acceso de solo lectura'); const sale = sales.find(s => s.vehicle_id === expenseVehicle.id && s.status === 'completed'); if (!sale || sale.parking_charged) throw new Error('Corrige la estadía desde Editar venta.'); const existing = vehicleExpenses.find(e => e.vehicle_id === expenseVehicle.id && e.is_daily_stay); const payload = { description: `Estadía · ${days} días × ${money(settings.daily_stay_cost)}`, amount: days * settings.daily_stay_cost, expense_date: sale.sold_at }; const result = existing ? await supabase.from('carwin_vehicle_expenses').update(payload).eq('id', existing.id).select().single() : await supabase.from('carwin_vehicle_expenses').insert({ ...payload, vehicle_id: expenseVehicle.id, expense_type: 'extra', allocation: 'carwin', is_daily_stay: true }).select().single(); if (result.error || !result.data) throw new Error(result.error?.message ?? 'No se pudo guardar la estadía'); setVehicleExpenses(items => upsertRow(items, result.data as VehicleExpense)); }} expenses={vehicleExpenses.filter((e) => e.vehicle_id === expenseVehicle.id)} dailyStayCost={settings.daily_stay_cost} onClose={() => setExpenseVehicle(null)} onAdd={addVehicleExpense} onUpdate={updateVehicleExpense} onDelete={deleteVehicleExpense} />}
{isAdmin && sellingVehicle && <SaleModal vehicle={sellingVehicle} sale={editingSale ?? undefined} dailyStayCost={settings.daily_stay_cost} monthPrefix={monthPrefix} payments={salePayments.filter((payment) => payment.sale_id === editingSale?.id)} onAddPayment={addSalePayment} onDeletePayment={deleteSalePayment} expenses={vehicleExpenses.filter((e) => e.vehicle_id === sellingVehicle.id)} onClose={() => { setSellingVehicle(null); setEditingSale(null); }} onAddExpense={addVehicleExpense} onSold={async (selectedExpenseIds, finalTransferAmount, realSalePrice, agreedPrice, buyer, soldAt, stayDaysOverride, transferMode, transferCost) => { const salePayload = { vehicle_id: sellingVehicle.id, sold_at: soldAt, real_sale_price: realSalePrice, agreed_price: agreedPrice, transfer_mode: transferMode || null, transfer_cost: transferMode === 'direct' ? null : transferCost, charged_expense_ids: selectedExpenseIds.filter((id) => id !== 'parking'), parking_charged: selectedExpenseIds.includes('parking'), final_transfer_amount: finalTransferAmount, document_version: editingSale ? editingSale.document_version + 1 : 1, buyer_name: buyer.buyer_name, buyer_rut: buyer.buyer_rut, buyer_address: buyer.buyer_address, buyer_phone: buyer.buyer_phone, delivery_date: buyer.delivery_date, terms: buyer.terms }; const saleResult = editingSale ? await supabase.from('carwin_sales').update(salePayload).eq('id', editingSale.id).select().maybeSingle() : await supabase.from('carwin_sales').insert(salePayload).select().maybeSingle(); const vehicleResult = editingSale ? { error: null } : await supabase.from('carwin_vehicles').update({ status: 'sold' }).eq('id', sellingVehicle.id); if (saleResult.error || !saleResult.data || vehicleResult.error) { setError('No se pudo guardar la liquidación. Inténtalo nuevamente.'); return; } const savedSale = saleResult.data as Sale; const stayDays = stayDaysOverride ?? daysBetweenDates(sellingVehicle.entered_at, soldAt); if (isPhysical(sellingVehicle.vehicle_type)) { const existingStay = vehicleExpenses.find((e) => e.vehicle_id === sellingVehicle.id && e.is_daily_stay); const stayDescription = `Estadía · ${stayDays} días × ${money(settings.daily_stay_cost)}`; const stayAmount = settings.daily_stay_cost * stayDays; if (existingStay) { await supabase.from('carwin_vehicle_expenses').update({ description: stayDescription, amount: stayAmount, expense_date: soldAt }).eq('id', existingStay.id); } else { await supabase.from('carwin_vehicle_expenses').insert({ vehicle_id: sellingVehicle.id, expense_type: 'extra', description: stayDescription, amount: stayAmount, allocation: 'carwin', is_daily_stay: true, expense_date: soldAt }); } } const historyResult = await supabase.from('carwin_sale_change_history').insert({ sale_id: savedSale.id, version: savedSale.document_version, change_type: editingSale ? 'updated' : 'created', snapshot: salePayload }); if (historyResult.error) { setError('La venta se guardó, pero no se pudo registrar su historial.'); return; } setSellingVehicle(null); setEditingSale(null); void loadData(); }} />}
      {loading && <div className="loading-screen"><div className="loader-mark"><CarFront size={28} /></div><p>Cargando operación CARWIN...</p></div>}
    </div>
  );
}

function calculateVehicleExpenseTotal(vehicle: Vehicle, expenses: VehicleExpense[], dailyStayCost = DEFAULT_DAILY_STAY_COST) {
  const directExpenses = expenses.filter((e) => e.vehicle_id === vehicle.id && !e.is_daily_stay).reduce((total, e) => total + e.amount, 0);
  const parking = isPhysical(vehicle.vehicle_type) ? (vehicle.status === 'sold' ? expenses.find(e => e.vehicle_id === vehicle.id && e.is_daily_stay)?.amount ?? 0 : dailyStayCost * daysBetween(vehicle.entered_at)) : 0;
  return directExpenses + parking;
}

function calculateVehicleMargin(vehicle: Vehicle, expenses: VehicleExpense[], dailyStayCost = DEFAULT_DAILY_STAY_COST) {
  return vehicle.sale_price - vehicle.purchase_price - calculateVehicleExpenseTotal(vehicle, expenses, dailyStayCost);
}

function daysBetweenDates(start: string, end: string) {
  const startDate = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const endDate = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  return Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
}

function calculateSaleUtility(vehicle: Vehicle, sale: Sale, expenses: VehicleExpense[], dailyStayCost = DEFAULT_DAILY_STAY_COST) {
  const charged = new Set(sale.charged_expense_ids ?? []);

  const assumedExpenses = expenses
    .filter((expense) =>
      expense.vehicle_id === vehicle.id &&
      !expense.is_daily_stay &&
      !charged.has(expense.id)
    )
    .reduce((total, expense) =>
      total + (expense.allocation === 'shared'
        ? expense.amount / 2
        : expense.allocation === 'customer'
          ? 0
          : expense.amount), 0);

  const savedStay = expenses.find((expense) =>
    expense.vehicle_id === vehicle.id && expense.is_daily_stay
  );

  const stay = isPhysical(vehicle.vehicle_type)
    ? (savedStay?.amount ?? dailyStayCost * daysBetweenDates(vehicle.entered_at, sale.sold_at))
    : 0;

  return sale.real_sale_price - vehicle.purchase_price - assumedExpenses - (sale.parking_charged ? 0 : stay);
}

function expiringDocuments(vehicle: Vehicle) {
  return [vehicle.permit_expiry, vehicle.soap_expiry, vehicle.inspection_expiry].filter((date) => date && Math.ceil((new Date(`${date}T12:00:00`).getTime() - TODAY.getTime()) / 86400000) < 30).length;
}

function Dashboard({ isAdmin, activeVehicles, selectedMonth, setSelectedMonth, monthUtility, monthSalesTotal, officeTotal, potentialProfit, documentationAlerts, physicalAging, onSeeInventory, onSell, onManageExpenses, vehicleExpenses, vehicles, sales, officeExpenses, salePayments, dailyStayCost }: { isAdmin: boolean; activeVehicles: Vehicle[]; selectedMonth: string; setSelectedMonth: (value: string) => void; monthUtility: number; monthSalesTotal: number; officeTotal: number; potentialProfit: number; documentationAlerts: number; physicalAging: number; onSeeInventory: () => void; onSell: (v: Vehicle) => void; onManageExpenses: (v: Vehicle) => void; vehicleExpenses: VehicleExpense[]; vehicles: Vehicle[]; sales: Sale[]; officeExpenses: OfficeExpense[]; salePayments: SalePayment[]; dailyStayCost: number }) {
  const [range, setRange] = useState(3);
  const period = (offset: number) => { const d = new Date(`${selectedMonth}-15T12:00:00`); d.setMonth(d.getMonth()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const valid = sales.filter(s => s.status === 'completed');
  const metrics = (prefix: string, until = '') => { const rows = valid.filter(s => s.sold_at.startsWith(prefix) && (!until || s.sold_at.slice(0,7) <= until)); const gross = rows.reduce((sum,s) => { const v = vehicles.find(v => v.id===s.vehicle_id); return sum+(v ? calculateSaleUtility(v,s,vehicleExpenses,dailyStayCost) : 0); },0); const costs = officeExpenses.filter(e => e.expense_date.startsWith(prefix) && (!until || e.expense_date.slice(0,7)<=until)).reduce((sum,e)=>sum+e.amount,0); return {count:rows.length,gross,costs,net:gross-costs}; };
  const current = metrics(selectedMonth), previous = metrics(period(-1)), annual = metrics(selectedMonth.slice(0,4),selectedMonth);
  const series = Array.from({length:range},(_,i)=>{const key=period(i-range+1);return {key,...metrics(key)};});
  const scale = Math.max(1,...series.flatMap(m=>[Math.abs(m.gross),Math.abs(m.net)]));
  const pending = valid.reduce((sum,s)=>sum+Math.max(0,s.real_sale_price+(s.transfer_mode==='separate' ? Number(s.transfer_cost??0):0)-salePayments.filter(p=>p.sale_id===s.id&&p.verified).reduce((a,p)=>a+p.amount,0)),0);
  const types: VehicleType[] = ['own','physical_consignment','virtual_consignment'];
  const topVehicles = [...activeVehicles].sort((a,b)=>calculateVehicleMargin(b,vehicleExpenses,dailyStayCost)-calculateVehicleMargin(a,vehicleExpenses,dailyStayCost)).slice(0,4);
  return <div className="executive-dashboard"><style>{`.executive-dashboard .exec-kpis .kpi-card{box-shadow:inset 0 0 22px #ffffff0b,0 8px 24px #0005;border-width:2px}.executive-dashboard .exec-kpis .blue{background:linear-gradient(135deg,#08477d,#071e40);border-color:#22aaff}.executive-dashboard .exec-kpis .amber{background:linear-gradient(135deg,#4c3508,#201a0e);border-color:#ffcc43}.executive-dashboard .exec-kpis .red{background:linear-gradient(135deg,#651b2d,#280f20);border-color:#ff6478}.executive-dashboard .exec-kpis .green{background:linear-gradient(135deg,#075b48,#082a28);border-color:#35ecc1}.executive-dashboard .exec-kpis .purple{background:linear-gradient(135deg,#44287a,#201731);border-color:#bd9aff}.executive-dashboard .exec-panel{background:linear-gradient(145deg,#102a46,#091b30);border-color:#477ca9}.executive-dashboard .kpi-icon{color:#59caff}.executive-dashboard .amber .kpi-icon{color:#ffcf50}.executive-dashboard .red .kpi-icon{color:#ff8290}.executive-dashboard .purple .kpi-icon{color:#c5aaff}.executive-dashboard .green .kpi-icon{color:#55ffca}.inventory-card{background:linear-gradient(145deg,#142e4b,#0a1e34);border-color:#4979a7}.inventory-card.has-risk{border-color:#ff6978}.vehicle-avatar{background:#09243e;border-color:#269ed5}.bottom-nav .nav-item.active{background:#103c67;border-radius:12px;color:#65d8ff}.topbar{background:linear-gradient(100deg,#07172b,#102e4a)}.executive-dashboard{margin-bottom:32px}.exec-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}.exec-kpis .kpi-card{padding:18px;min-width:0}.exec-kpis .kpi-card>strong{font-size:clamp(20px,2.35vw,32px);overflow-wrap:anywhere}.exec-kpis .purple{background:#392663;border-color:#b99aff}.exec-pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.exec-panel{background:#102b4f;border:1px solid #527394;border-radius:16px;padding:20px;margin-bottom:18px;min-width:0}.exec-chart{display:grid;gap:5px;margin-bottom:14px;overflow-x:auto}.exec-chart-month{text-align:center;min-width:0}.exec-chart-month b,.exec-chart-month small{display:block;font-size:12px;margin-top:6px}.exec-stock{margin:18px 0}.exec-stock>div:first-child{display:flex;justify-content:space-between;gap:10px}.exec-track{height:12px;background:#061426;border-radius:8px;margin-top:9px;overflow:hidden}.exec-track>div{height:100%;border-radius:8px}.executive-dashboard .month-chip input{background:#071a35;color:white;border:0;min-width:0}.executive-dashboard .summary-line{gap:12px}.executive-dashboard .summary-line strong{text-align:right}.executive-dashboard .alert-strip{margin-top:4px}@media(max-width:900px){.exec-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.exec-pair{grid-template-columns:1fr;gap:0}.exec-panel{padding:15px}.executive-dashboard .hero-row{flex-wrap:wrap}.exec-kpis .kpi-card>strong{font-size:22px}.exec-chart-month{min-width:38px}.exec-chart{grid-auto-columns:minmax(38px,1fr)}.executive-dashboard .section-heading{flex-wrap:wrap;gap:10px}}`}</style>
    <section className="hero-row"><div><p className="eyebrow">CARWIN · CONTROL GERENCIAL</p><h2>Resumen ejecutivo</h2><p className="muted">Operación comercial y financiera</p></div><label className="month-chip"><CalendarDays size={19}/><input aria-label="Mes de análisis" type="month" value={selectedMonth} onChange={e=>{if(e.target.value)setSelectedMonth(e.target.value);}}/></label></section>
    <section className="exec-kpis">
      <KpiCard label="Stock activo" value={String(activeVehicles.length)} detail="Inventario actual" icon={<CarFront size={23}/>} tone="blue"/>
      <KpiCard label="Ventas del mes" value={String(current.count)} detail={`Mes anterior: ${previous.count}`} icon={<BarChart3 size={23}/>} tone="amber"/>
      <KpiCard label="Resultado mensual" value={money(monthUtility)} detail={`Mes anterior: ${money(previous.net)}`} icon={<TrendingUp size={23}/>} tone={monthUtility>=0?'green':'red'}/>
      <KpiCard label="Resultado acumulado anual" value={money(annual.net)} detail={`Enero a ${selectedMonth}`} icon={<Wallet size={23}/>} tone="purple"/>
    </section>
    <div className="exec-overview"><section className="exec-panel"><div className="section-heading"><div><p className="eyebrow">COMPARATIVO REAL</p><h3>Evolución comercial</h3></div><select aria-label="Período del gráfico" value={range} onChange={e=>setRange(Number(e.target.value))}><option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select></div>
    <div className="exec-chart-axis"><div className="exec-chart-labels">{[scale,scale/2,0,-scale/2,-scale].map((v,i)=><span key={i}>{Math.abs(v)>=1000000 ? `${(v/1000000).toFixed(1)} M` : Math.round(v/1000)+" mil"}</span>)}</div><div className="exec-chart" style={{gridTemplateColumns:`repeat(${range}, minmax(0,1fr))`}}>{series.map(m=><div className="exec-chart-month" key={m.key}><div style={{height:150,position:'relative',display:'flex',justifyContent:'center',gap:5,borderBottom:'1px solid #527394'}}>{[m.gross,m.net].map((v,i)=><div key={i} title={money(v)} style={{width:'35%',maxWidth:30,position:'relative',height:'100%'}}><div style={{position:'absolute',height:`${Math.abs(v)/scale*50}%`,bottom:v>=0?'50%':undefined,top:v<0?'50%':undefined,width:'100%',background:v<0?'#ff6573':i===0?'#38b6ff':'#00d99a',borderRadius:3}}/></div>)}<div style={{position:'absolute',top:'50%',left:0,right:0,borderTop:'1px solid #527394'}}/></div><b>{m.key.slice(5)}/{m.key.slice(2,4)}</b><small>{m.count} ventas</small><small className="exec-values"><span style={{color:"#65d8ff"}}>{money(m.gross)}</span><span style={{color:m.net<0?"#ff8290":"#55ffca"}}>{money(m.net)}</span></small></div>)}</div></div><p className="muted">Azul: utilidad ventas · Verde: resultado neto · Rojo: pérdidas</p><div className="summary-line"><span>Utilidad ventas del mes</span><strong>{money(monthSalesTotal)}</strong></div></section>
    <section className="exec-panel"><div className="section-heading"><h3>Composición del stock</h3><button className="text-button" onClick={onSeeInventory}>Ver stock</button></div>{types.map((t,i)=>{const n=activeVehicles.filter(v=>v.vehicle_type===t).length;return <div className="exec-stock" key={t}><div><span>{typeLabel(t)}</span><strong>{n}</strong></div><div className="exec-track"><div style={{width:`${activeVehicles.length?n/activeVehicles.length*100:0}%`,background:['#38b6ff','#00d99a','#ffb000'][i]}}/></div></div>;})}</section></div>
    <div className="exec-pair"><section className="exec-panel"><div className="section-heading"><h3>Control financiero</h3></div>{[['Gastos oficina del mes',officeTotal],['Costo compra stock propio',activeVehicles.filter(v=>v.vehicle_type==='own').reduce((a,v)=>a+v.purchase_price,0)],['Margen potencial del stock',potentialProfit],['Saldo de ventas no verificado',pending]].map(([label,value])=><div className="summary-line" key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</section>
    <section className="exec-panel cw-alerts"><h3><AlertTriangle size={22}/> Centro de alertas</h3><button onClick={onSeeInventory}><span>Documentación pendiente</span><strong>{documentationAlerts}</strong></button><button onClick={onSeeInventory}><span>Vehículos con más de 60 días</span><strong>{physicalAging}</strong></button><div><span>Saldo de ventas no verificado</span><strong>{money(pending)}</strong></div></section></div>
    <div className="section-heading"><h3>Vehículos destacados</h3><button className="text-button" onClick={onSeeInventory}>Ver todos</button></div><section className="vehicle-list">{topVehicles.map(v=><VehicleRow key={v.id} isAdmin={isAdmin} vehicle={v} margin={calculateVehicleMargin(v,vehicleExpenses,dailyStayCost)} expenseTotal={calculateVehicleExpenseTotal(v,vehicleExpenses,dailyStayCost)} onSell={()=>onSell(v)} onManageExpenses={()=>onManageExpenses(v)}/>)}</section>
  </div>;
}

function Inventory({ isAdmin, vehicles, sales, vehicleExpenses, search, setSearch, onAdd, onEdit, onDelete, onSell, onEditSale, onRestoreSale, onManageExpenses }: { isAdmin: boolean; vehicles: Vehicle[]; sales: Sale[]; vehicleExpenses: VehicleExpense[]; search: string; setSearch: (value: string) => void; onAdd: () => void; onEdit: (v: Vehicle) => void; onDelete: (v: Vehicle) => void; onSell: (v: Vehicle) => void; onEditSale: (v: Vehicle, sale: Sale) => void; onRestoreSale: (v: Vehicle, sale: Sale) => Promise<void>; onManageExpenses: (v: Vehicle) => void }) {
  const [stockView, setStockView] = useState<'active' | 'sold'>('active');
  const [contractVehicle, setContractVehicle] = useState<Vehicle | null>(null);
  const active = vehicles.filter((v) => v.status === 'active');
  const sold = vehicles.filter((v) => v.status === 'sold');
  const visibleVehicles = (stockView === 'active' ? active : sold).filter((v) => v.model.toLowerCase().includes(search.toLowerCase()) || v.plate.toLowerCase().includes(search.toLowerCase()));
  return <><section className="page-heading"><div><p className="eyebrow">GESTIÓN DE INVENTARIO</p><h2>Stock <span>{stockView === 'active' ? 'activo' : 'vendido'}</span></h2><p className="muted">{stockView === 'active' ? `${active.length} vehículos disponibles` : `${sold.length} operaciones vendidas y editables`}</p></div>{isAdmin && <button className="primary-button" onClick={onAdd}><Plus size={20} /> Nuevo auto</button>}</section><div className="stock-tabs"><button className={stockView === 'active' ? 'active' : ''} onClick={() => setStockView('active')}>Activos <b>{active.length}</b></button><button className={stockView === 'sold' ? 'active' : ''} onClick={() => setStockView('sold')}>Vendidos <b>{sold.length}</b></button></div><div className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo o patente..." /></div>{visibleVehicles.length ? <section className="inventory-grid">{visibleVehicles.map((v) => <InventoryCard isAdmin={isAdmin} key={v.id} vehicle={v} sale={sales.find((sale) => sale.vehicle_id === v.id && sale.status !== 'cancelled')} expenseTotal={calculateVehicleExpenseTotal(v, vehicleExpenses)} margin={calculateVehicleMargin(v, vehicleExpenses)} onEdit={() => onEdit(v)} onDelete={() => onDelete(v)} onSell={() => onSell(v)} onEditSale={(sale) => onEditSale(v, sale)} onRestoreSale={(sale) => void onRestoreSale(v, sale)} onManageExpenses={() => onManageExpenses(v)} onContract={() => setContractVehicle(v)} />)}</section> : <EmptyState text={stockView === 'sold' ? 'Aún no hay vehículos vendidos.' : 'No hay vehículos que coincidan con la búsqueda.'} />}{contractVehicle && <ConsignmentContractModal vehicle={contractVehicle} onClose={() => setContractVehicle(null)} />}</>;
}

function OfficeExpenses({ isAdmin, expenses, monthPrefix, onAdd, onDelete }: { isAdmin: boolean; expenses: OfficeExpense[]; monthPrefix: string; onAdd: () => void; onDelete: (id: string) => void }) {
  const [showAllYear, setShowAllYear] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(monthPrefix.slice(5, 7));
  const [selectedYear, setSelectedYear] = useState(monthPrefix.slice(0, 4));
  const selectedPeriod = `${selectedYear}-${selectedMonth}`;
  const availableYears = Array.from(
    new Set([
      todayChile().slice(0, 4),
      ...expenses.map((item) => item.expense_date.slice(0, 4)),
    ])
  ).sort().reverse();
const filtered = expenses.filter((item) => item.expense_date.startsWith(showAllYear ? selectedYear : selectedPeriod));
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);
  const grouped = filtered.reduce<Record<string, number>>((acc, item) => { acc[item.description] = (acc[item.description] ?? 0) + item.amount; return acc; }, {});
 const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date(`${selectedPeriod}-15T12:00:00`));
  return <><section className="page-heading"><div><p className="eyebrow">CONTROL FINANCIERO</p><h2>Gastos de <span>oficina</span></h2><p className="muted">Cada peso queda trazable y consolidado.</p></div>{isAdmin && <button className="primary-button" onClick={onAdd}><Plus size={20} /> Registrar gasto</button>}</section><div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
  <select
    value={selectedMonth}
    onChange={(e) => {
      setSelectedMonth(e.target.value);
      setShowAllYear(false);
    }}
    style={{ flex: 1, padding: '12px', background: '#123456', color: '#ffffff', border: '1px solid #38bdf8', borderRadius: '10px', fontSize: '16px' }}
  >
    {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, index) => (
      <option key={index} value={String(index + 1).padStart(2, '0')}>
        {month}
      </option>
    ))}
  </select>
  <select
    value={selectedYear}
    onChange={(e) => setSelectedYear(e.target.value)}
    style={{ flex: 1, padding: '12px', background: '#123456', color: '#ffffff', border: '1px solid #38bdf8', borderRadius: '10px', fontSize: '16px' }}
  >
    {availableYears.map((year) => (
      <option key={year} value={year}>{year}</option>
    ))}
  </select>
</div>
<div className="expense-total"><div><span>Total {showAllYear ? `año ${selectedYear}` : monthName}</span><strong>{money(total)}</strong></div><div className="expense-total-icon"><ReceiptText size={22} /></div></div><div className="stock-tabs"><button className={!showAllYear ? 'active' : ''} onClick={() => setShowAllYear(false)}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</button><button className={showAllYear ? 'active' : ''} onClick={() => setShowAllYear(true)}>Todo el año</button></div><section className="summary-card"><div className="section-heading compact"><div><p className="eyebrow">CONSOLIDADO POR CONCEPTO</p><h3>Resumen de gastos</h3></div></div>{Object.entries(grouped).length ? Object.entries(grouped).map(([description, amount]) => <div className="summary-line" key={description}><span>{description}</span><strong>{money(amount)}</strong></div>) : <EmptyState text="Aún no hay gastos registrados en este período." />}</section><section className="section-heading compact"><div><p className="eyebrow">MOVIMIENTOS</p><h3>Detalle día a día</h3></div></section><section className="expense-list">{filtered.map((e) => <div className="expense-row" key={e.id}><div className="expense-dot"><ReceiptText size={17} /></div><div className="expense-info"><strong>{e.description}</strong><span>{dateLabel(e.expense_date)} · Gasto de oficina</span></div><strong className="expense-amount">{money(e.amount)}</strong>{isAdmin && <button className="row-action danger" onClick={() => onDelete(e.id)}><Trash2 size={17} /></button>}</div>)}</section></>;
}

function VehiclePhoto({ path, large = false }: { path?: string | null; large?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true; setUrl('');
    if (!path) return;
    const refresh = () => { void supabase.storage.from('carwin-vehicle-photos').createSignedUrl(path, 900).then(({data,error}) => { if (active) setUrl(error ? '' : data?.signedUrl || ''); }); };
    refresh(); const timer = window.setInterval(refresh, 720000);
    return () => { active = false; window.clearInterval(timer); };
  }, [path]);
  return <div className={`vehicle-avatar ${large ? 'large' : ''}`} style={url ? {width:large?112:90,flexBasis:large?112:90,height:large?76:62,overflow:'hidden',padding:0} : undefined}>{url ? <img src={url} alt="Fotografía del vehículo" onError={()=>setUrl('')} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <CarFront size={23}/>}</div>;
}

function VehicleRow({ isAdmin, vehicle, margin, expenseTotal, onSell, onManageExpenses }: { isAdmin: boolean; vehicle: Vehicle; margin: number; expenseTotal: number; onSell: () => void; onManageExpenses: () => void }) {
  const days = daysBetween(vehicle.entered_at);
return <div className={`vehicle-row ${margin < 0 ? 'negative-row' : ''}`}><VehiclePhoto path={vehicle.photo_path}/><div className="vehicle-main"><strong>{vehicle.model}</strong><div><span>{typeLabel(vehicle.vehicle_type)}</span><i /> <span>{days} días en stock</span></div></div><div className="vehicle-cost"><span>Gastos acumulados</span><strong>{money(expenseTotal)}</strong></div><div className="vehicle-margin"><span>Margen real</span><strong className={margin < 0 ? 'negative' : ''}>{money(margin)}</strong></div><button className="row-action" onClick={onManageExpenses} title="Gastos del vehículo"><Wallet size={17} /></button>{isAdmin && <button className="sell-button" onClick={onSell}>Vender</button>}</div>;
}

function InventoryCard({ isAdmin, vehicle, sale, expenseTotal, margin, onEdit, onDelete, onSell, onEditSale, onRestoreSale, onManageExpenses, onContract }: { isAdmin: boolean; vehicle: Vehicle; sale?: Sale; expenseTotal: number; margin: number; onEdit: () => void; onDelete: () => void; onSell: () => void; onEditSale: (sale: Sale) => void; onRestoreSale: (sale: Sale) => void; onManageExpenses: () => void; onContract: () => void }) {
  const days = daysBetween(vehicle.entered_at); const aging = days > 90 ? 'red' : days > 60 ? 'yellow' : 'green'; const documentCount = expiringDocuments(vehicle); const hasAlert = documentCount > 0 || aging === 'red' || margin < 0;
  return <article className={`inventory-card ${hasAlert ? 'has-risk' : ''}`}><div className="card-top"><VehiclePhoto path={vehicle.photo_path} large/><div className="card-title"><strong>{vehicle.model}</strong><span>{vehicle.plate || 'PATENTE PENDIENTE'} · {vehicle.color}</span></div><button className="more-button"><MoreHorizontal size={20} /></button></div><div className="tag-row"><span className={`type-tag ${vehicle.vehicle_type}`}>{vehicle.vehicle_type === 'virtual_consignment' ? 'Virtual' : vehicle.vehicle_type === 'own' ? 'Propio' : 'Físico'}</span>{vehicle.status === 'sold' && <span className="sold-tag"><Check size={12} /> Vendido</span>}<span className={`aging-tag ${aging}`}><i /> {days} días</span>{documentCount > 0 && <span className="doc-tag"><AlertTriangle size={13} /> {documentCount} alerta{documentCount > 1 ? 's' : ''}</span>}</div><div className="price-grid"><div><small>Precio compra</small><strong>{money(vehicle.purchase_price)}</strong></div><div><small>Precio venta</small><strong>{money(vehicle.sale_price)}</strong></div><div><small>Margen real</small><strong className={margin < 0 ? 'negative' : 'positive'}>{money(margin)}</strong></div></div><div className="expense-balance"><span><Wallet size={14} /> Gastos acumulados</span><strong>{money(expenseTotal)}</strong></div><div className="card-footer"><span><Clock3 size={15} /> Ingreso {dateLabel(vehicle.entered_at)}</span><div><button className="row-action" onClick={onManageExpenses} title="Gastos"><Wallet size={16} /></button>{isAdmin && <><button className="row-action" onClick={onEdit}><Pencil size={16} /></button><button className="row-action" onClick={onDelete}><Trash2 size={16} /></button></>}{isAdmin && vehicle.status === 'active' && <button className="mini-sell"onClick={onSell}>Vender</button>}{isAdmin && vehicle.status === 'active' && vehicle.vehicle_type !== 'own' && <button className="contract-button" onClick={onContract} title="Generar contrato de consignación"><FileSignature size={15} /> Contrato</button>}{isAdmin && vehicle.status === 'sold' && sale && <><button className="mini-sell edit-sale-button" onClick={() => onEditSale(sale)}>Editar venta</button><button className="restore-button" onClick={() => onRestoreSale(sale)}>Volver a activos</button></>}</div></div></article>;
}

function CommercialView({finance,isAdmin,vehicles,sales,expenses,payments,dailyStayCost,onEdit,onExpenses}:{finance:boolean;isAdmin:boolean;vehicles:Vehicle[];sales:Sale[];expenses:VehicleExpense[];payments:SalePayment[];dailyStayCost:number;onEdit:(v:Vehicle,s:Sale)=>void;onExpenses:(v:Vehicle)=>void}){
  const [period,setPeriod]=useState('all'); const [query,setQuery]=useState(''); const [pendingOnly,setPendingOnly]=useState(false); const [note,setNote]=useState<{v:Vehicle;s:Sale}|null>(null);
  const valid=sales.filter(s=>s.status==='completed');
  const periods=Array.from(new Set(valid.map(s=>s.sold_at.slice(0,7)))).sort().reverse();
  const rows=valid.map(s=>{const v=vehicles.find(v=>v.id===s.vehicle_id); const ps=payments.filter(p=>p.sale_id===s.id);const due=s.real_sale_price+(s.transfer_mode==='separate'?Number(s.transfer_cost??0):0);const received=ps.filter(p=>p.verified).reduce((a,p)=>a+p.amount,0);return {s,v,ps,due,received,pending:Math.max(0,due-received),utility:v?calculateSaleUtility(v,s,expenses,dailyStayCost):null};}).filter(r=>(period==='all'||r.s.sold_at.startsWith(period))&&`${r.v?.model??''} ${r.v?.plate??''} ${r.s.folio??''}`.toLowerCase().includes(query.toLowerCase())&&(!pendingOnly||r.pending>0)).sort((a,b)=>b.s.sold_at.localeCompare(a.s.sold_at));
  const total=(f:(r:typeof rows[number])=>number)=>rows.reduce((a,r)=>a+f(r),0);
  return <><section className="page-heading"><div><p className="eyebrow">{finance?'CONTROL FINANCIERO':'GESTIÓN COMERCIAL'}</p><h2>{finance?'Finanzas':'Ventas'} <span>{finance?'y balance':'realizadas'}</span></h2><p className="muted">{finance?'Cobranza por fecha de venta; no corresponde al saldo de caja.':'Historial de operaciones completadas.'}</p></div></section><div className="commercial-filters"><select value={period} onChange={e=>setPeriod(e.target.value)} aria-label="Período de venta"><option value="all">Todos los períodos</option>{periods.map(p=><option key={p} value={p}>{p}</option>)}</select><button className="contract-button" onClick={()=>setPendingOnly(!pendingOnly)}>{pendingOnly?'Mostrar todas':'Solo con saldo pendiente'}</button></div><div className="search-box"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar modelo, patente o folio..."/></div><div className="commercial-grid">{[['Operaciones',String(rows.length)],['Total a cobrar',money(total(r=>r.due))],['Pagos verificados',money(total(r=>r.received))],['Saldo pendiente',money(total(r=>r.pending))],['Utilidad según cálculo actual',rows.some(r=>r.utility===null)?'No disponible':money(total(r=>r.utility??0))]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>{rows.length===0&&<EmptyState text="No hay operaciones para esta selección."/>}{rows.map(r=><article className="summary-card commercial-sale" key={r.s.id}><div className="card-top"><VehiclePhoto path={r.v?.photo_path} large/><div><strong>{r.v?.model??'Vehículo no encontrado'}</strong><p className="muted">{r.v?.plate} · {r.s.sold_at}</p></div></div><div className="commercial-grid">{[['Precio venta',money(r.s.real_sale_price)],['Gastos registrados',money(expenses.filter(e=>e.vehicle_id===r.s.vehicle_id).reduce((a,e)=>a+e.amount,0))],['Valor acordado',money(r.s.agreed_price)],['Liquidación registrada',money(r.s.final_transfer_amount)],['Utilidad',r.utility===null?'No disponible':money(r.utility)],['Pagos verificados',money(r.received)],['Saldo pendiente',money(r.pending)]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><p className={r.pending>0?'negative':'positive'}>{r.pending>0?'Cobranza pendiente':'Sin saldo pendiente'} · {r.ps.filter(p=>!p.verified).length} pagos sin verificar</p>{r.v&&<div className="commercial-actions"><button className="contract-button" onClick={()=>setNote({v:r.v!,s:r.s})}><FileText size={16}/> Nota de venta</button><button className="contract-button" onClick={()=>onExpenses(r.v!)}>Gastos</button>{isAdmin&&<button className="mini-sell" onClick={()=>onEdit(r.v!,r.s)}>Editar venta / pagos</button>}</div>}</article>)}{note&&<SaleNoteModal vehicle={note.v} sale={note.s} payments={payments.filter(p=>p.sale_id===note.s.id)} buyerData={note.s} onClose={()=>setNote(null)}/>}</>;
}

function Reports({ vehicles, sales, vehicleExpenses, salePayments, officeExpenses, monthPrefix, dailyStayCost }: { vehicles: Vehicle[]; sales: Sale[]; vehicleExpenses: VehicleExpense[]; salePayments: SalePayment[]; officeExpenses: OfficeExpense[]; monthPrefix: string; dailyStayCost:number }) {
 const [query,setQuery]=useState(''); const [expenseQuery,setExpenseQuery]=useState(''); const [period,setPeriod]=useState('month'); const [kind,setKind]=useState('all'); const [from,setFrom]=useState(monthPrefix+'-01'); const [to,setTo]=useState(todayChile()); const [anchor,setAnchor]=useState(monthPrefix);
 const current=todayChile().slice(0,7); const shift=(n:number)=>{const d=new Date(anchor+'-15T12:00:00');d.setMonth(d.getMonth()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
 const matches=(date:string)=>{const m=date.slice(0,7);return period==='all'||(period==='custom'?date.slice(0,10)>=from&&date.slice(0,10)<=to:period==='year'?m.startsWith(anchor.slice(0,4))&&m<=anchor:period==='quarter'?m>=shift(-2)&&m<=anchor:period==='previous'?m===shift(-1):m===anchor);};
 const normalize=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const valid=sales.filter(s=>s.status==='completed'); const selected=valid.filter(s=>matches(s.sold_at)); const utility=(s:Sale)=>{const v=vehicles.find(v=>v.id===s.vehicle_id);return v?calculateSaleUtility(v,s,vehicleExpenses,dailyStayCost):0;}; const sum=(rows:{amount:number}[])=>rows.reduce((a,r)=>a+Number(r.amount),0); const gross=selected.reduce((a,s)=>a+utility(s),0); const costs=sum(officeExpenses.filter(e=>matches(e.expense_date))); const active=vehicles.filter(v=>v.status==='active'); const visible=vehicles.filter(v=>normalize(v.model+' '+v.plate).includes(normalize(query)));
 const rows=[...vehicleExpenses.map(e=>{const v=vehicles.find(v=>v.id===e.vehicle_id);return {id:'v'+e.id,date:e.expense_date,origin:[v?.model,v?.plate].filter(Boolean).join(' · ')||'Vehículo',description:e.description,category:e.expense_type,amount:e.amount,kind:'cars'};}),...officeExpenses.map(e=>({id:'o'+e.id,date:e.expense_date,origin:'Oficina',description:e.description,category:'oficina',amount:e.amount,kind:'office'}))].filter(r=>(kind==='all'||kind===r.kind)&&normalize(r.description+' '+r.origin+' '+r.category).includes(normalize(expenseQuery))).sort((a,b)=>b.date.localeCompare(a.date)); const filtered=rows.filter(r=>matches(r.date));
 const download=()=>{const csv=[['Fecha','Origen','Concepto','Monto'],...filtered.map(r=>[r.date,r.origin,r.description,r.amount])].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='CARWIN-gastos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const cards=(items:[string,string][])=> <div className="commercial-grid">{items.map(([label,value])=><div key={label}><small>{label}</small><strong style={{color:value.startsWith('$-')?'#ff8290':'#fff'}}>{value}</strong></div>)}</div>;
 return <div className="cw-report"><section className="page-heading"><div><p className="eyebrow">CARWIN · INTELIGENCIA COMERCIAL</p><h2>Reportes <span>gerenciales</span></h2><p className="muted">Análisis comercial y financiero</p></div></section><div className="commercial-filters"><input aria-label="Mes de referencia" type="month" value={anchor} onChange={e=>e.target.value&&setAnchor(e.target.value)}/><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="month">Mes seleccionado</option><option value="previous">Mes anterior</option><option value="quarter">Últimos 3 meses</option><option value="year">Acumulado anual</option><option value="all">Todos los períodos</option><option value="custom">Personalizado</option></select>{period==='custom'&&<><input aria-label="Desde" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="Hasta" type="date" value={to} onChange={e=>setTo(e.target.value)}/></>}</div>
 <section className="summary-card"><h3>Rendimiento comercial</h3>{cards([['Unidades vendidas',String(selected.length)],['Ventas brutas',money(selected.reduce((a,s)=>a+s.real_sale_price,0))],['Utilidad comercial',money(gross)],['Gastos de oficina',money(costs)],['Resultado operativo',money(gross-costs)],['Utilidad promedio',money(selected.length?Math.round(gross/selected.length):0)]])}</section>
 <section className="summary-card"><h3>Inventario y rotación · stock actual</h3>{cards([['Capital de compra propio',money(active.filter(v=>v.vehicle_type==='own').reduce((a,v)=>a+v.purchase_price,0))],['Margen potencial',money(active.reduce((a,v)=>a+calculateVehicleMargin(v,vehicleExpenses,dailyStayCost),0))],['Días promedio en stock',String(active.length?Math.round(active.reduce((a,v)=>a+daysBetween(v.entered_at),0)/active.length):0)]])}{(['own','physical_consignment','virtual_consignment'] as VehicleType[]).map(t=>{const list=active.filter(v=>v.vehicle_type===t);const sold=selected.filter(s=>vehicles.find(v=>v.id===s.vehicle_id)?.vehicle_type===t);return <div className="summary-line" key={t}><span>{typeLabel(t)} · {list.length} activos · {sold.length} vendidos</span><strong>{money(sold.reduce((a,s)=>a+utility(s),0))} utilidad</strong></div>})}</section>
 <section className="summary-card"><h3>Control de pagos · ventas del período</h3>{cards([['Pagos verificados',money(sum(salePayments.filter(p=>p.verified&&selected.some(s=>s.id===p.sale_id))))],['Saldo pendiente',money(selected.reduce((a,s)=>a+Math.max(0,s.real_sale_price+(s.transfer_mode==='separate'?Number(s.transfer_cost??0):0)-sum(salePayments.filter(p=>p.verified&&p.sale_id===s.id))),0))]])}</section>
 <section className="summary-card"><h3>Análisis detallado de gastos</h3><div className="search-box"><Search size={18}/><input value={expenseQuery} onChange={e=>setExpenseQuery(e.target.value)} placeholder="Buscar bencina, lavado, patente..."/></div><div className="commercial-filters"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Todos los gastos</option><option value="cars">Vehículos</option><option value="office">Oficina</option></select></div>{cards([['Total mes en curso',money(sum(rows.filter(r=>r.date.startsWith(current))))],['Total período seleccionado',money(sum(filtered))],['Acumulado año en curso',money(sum(rows.filter(r=>r.date.startsWith(current.slice(0,4))&&r.date.slice(0,7)<=current)))],['Vehículos',money(sum(filtered.filter(r=>r.kind==='cars')))],['Oficina',money(sum(filtered.filter(r=>r.kind==='office')))]])}<div className="commercial-actions"><button className="secondary-button" onClick={download}>Exportar gastos CSV (Excel)</button></div><p className="muted">{filtered.length} movimientos · gastos registrados, no estimaciones de estadía.</p>{filtered.map(r=><div className="report-search-row" key={r.id}><small>{dateLabel(r.date)}</small><span>{r.origin}</span><span>{r.description}</span><strong>{money(r.amount)}</strong></div>)}</section><section className="summary-card"><div className="section-heading compact"><div><p className="eyebrow">BUSCADOR DE VEHÍCULOS</p><h3>Patente o modelo</h3></div><Search size={21} /></div><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por patente o modelo..." /></div>{visible.map((vehicle) => { const expenses = vehicleExpenses.filter((expense) => expense.vehicle_id === vehicle.id); const sale = sales.find((item) => item.vehicle_id === vehicle.id && item.status !== 'cancelled'); const payments = salePayments.filter((payment) => payment.sale_id === sale?.id); return <div className="report-result" key={vehicle.id}><div><strong>{vehicle.model}</strong><span>{vehicle.plate || 'Sin patente'} · {typeLabel(vehicle.vehicle_type)} · {vehicle.status === 'sold' ? 'Vendido' : `${daysBetween(vehicle.entered_at)} días en stock`}</span></div><div><small>Gastos</small><b>{money(expenses.reduce((sum, item) => sum + item.amount, 0))}</b></div><div><small>Venta real</small><b>{money(sale?.real_sale_price ?? vehicle.sale_price)}</b></div><div><small>Pagos recibidos</small><b>{money(payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + payment.amount, 0))}</b></div></div>; })}</section></div>;
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

function VehicleForm({ vehicle, onClose, onSave }: { vehicle: Vehicle | null; onClose: () => void; onSave: (data: Omit<Vehicle, 'id' | 'status'>, id?: string, photo?: File | null, removePhoto?: boolean) => Promise<void> }) {
  const [form, setForm] = useState<Omit<Vehicle, 'id' | 'status'>>(vehicle ? { ...vehicle, permit_expiry: vehicle.permit_expiry ?? '', soap_expiry: vehicle.soap_expiry ?? '', inspection_expiry: vehicle.inspection_expiry ?? '' } : initialVehicle);
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('');
  const [photo,setPhoto] = useState<File|null>(null); const [removePhoto,setRemovePhoto] = useState(false);
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setFormError(''); try { await onSave(form, vehicle?.id, photo, removePhoto); } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo guardar. Revisa los campos y permisos.'); } finally { setSaving(false); } };
  return <Modal title={vehicle ? 'Editar vehículo' : 'Ingresar vehículo'} onClose={onClose} wide><form className="form-grid" onSubmit={submit}>
    <div className="form-section-title">Fotografía principal</div>
    <div style={{gridColumn:'1 / -1',display:'grid',gap:10}}>
      {!removePhoto && !photo && <VehiclePhoto path={vehicle?.photo_path} large/>}
      <Field label="Cargar o cambiar fotografía"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0]; if(!file)return; if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setFormError('Usa JPG, PNG o WebP de hasta 5 MB');e.target.value='';return;}setPhoto(file);setRemovePhoto(false);setFormError('');}}/></Field>
      {photo && <span>{photo.name} · lista para guardar</span>}
      {(photo || (vehicle?.photo_path && !removePhoto)) && <button type="button" className="secondary-button" onClick={()=>{setPhoto(null);setRemovePhoto(true);}}>Eliminar fotografía al guardar</button>}
      {removePhoto && <span>Se quitará la fotografía al guardar.</span>}
    </div>
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
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayChile()); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!description || !Number(amount)) return; setSaving(true); try { await onSave(description, Number(amount), date); } finally { setSaving(false); } };
  return <Modal title="Registrar gasto de oficina" onClose={onClose}><form className="single-form" onSubmit={submit}><Field label="Descripción" required><input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Publicidad digital" /></Field><Field label="Monto CLP" required><input required min="1" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field><Field label="Fecha" required><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Guardar gasto'}</button></div></form></Modal>;
}

function VehicleExpenseModal({ isAdmin, vehicle, sale, onSaveStay, expenses, dailyStayCost, onClose, onAdd, onUpdate, onDelete }: { isAdmin: boolean; vehicle: Vehicle; sale?: Sale; onSaveStay: (days: number) => Promise<void>; expenses: VehicleExpense[]; dailyStayCost: number; onClose: () => void; onAdd: (vehicleId: string, description: string, amount: number, expenseType: ExpenseType, allocation: ExpenseAllocation) => Promise<void>; onUpdate: (id: string, description: string, amount: number, allocation: ExpenseAllocation) => Promise<void>; onDelete: (id: string) => void }) {
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [expenseType, setExpenseType] = useState<ExpenseType>('extra'); const [allocation, setAllocation] = useState<ExpenseAllocation>('carwin'); const [saving, setSaving] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [editingDescription, setEditingDescription] = useState(''); const [editingAmount, setEditingAmount] = useState(''); const [editingAllocation, setEditingAllocation] = useState<ExpenseAllocation>('carwin');
  const grouped = useMemo(() => groupExpenses(expenses.filter(e => !e.is_daily_stay)), [expenses]);
  const grandTotal = grouped.reduce((sum, g) => sum + g.total, 0);
  const savedStay = expenses.find(e => e.is_daily_stay);
  const automaticDays = sale ? daysBetweenDates(vehicle.entered_at, sale.sold_at) : vehicle.status === 'sold' ? 0 : daysBetween(vehicle.entered_at);
  const [stayDays, setStayDays] = useState(() => vehicle.status === 'sold' ? Number(savedStay?.description.match(/(\d+)\s+días/)?.[1]) || automaticDays : automaticDays);
  const [stayEdit, setStayEdit] = useState(false);
  const [staySaving, setStaySaving] = useState(false);
  const [stayError, setStayError] = useState('');
  const canEditStay = isAdmin && vehicle.status === 'sold' && !!sale && !sale.parking_charged;
  const parkingCost = isPhysical(vehicle.vehicle_type) ? (vehicle.status === 'sold' && !stayEdit ? savedStay?.amount ?? dailyStayCost * automaticDays : dailyStayCost * (vehicle.status === 'sold' ? stayDays : automaticDays)) : 0;
  const saveStay = async () => { if (!canEditStay || staySaving || !Number.isInteger(stayDays) || stayDays < 1) return; setStaySaving(true); setStayError(''); try { await onSaveStay(stayDays); setStayEdit(false); } catch (e) { setStayError(e instanceof Error ? e.message : 'No se pudo guardar'); } finally { setStaySaving(false); } };
  const totalWithParking = grandTotal + parkingCost;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!description) return; setSaving(true); try { await onAdd(vehicle.id, description, Number(amount) || 0, expenseType, allocation); setDescription(''); setAmount(''); } finally { setSaving(false); } };
  const startEdit = (expense: VehicleExpense) => { setEditingId(expense.id); setEditingDescription(expense.description); setEditingAmount(expense.amount.toString()); setEditingAllocation(expense.allocation); };
  const saveEdit = async () => { if (!editingId || !editingDescription) return; await onUpdate(editingId, editingDescription, Number(editingAmount) || 0, editingAllocation); setEditingId(null); };
  return <Modal title="Gastos del vehículo" onClose={onClose} wide>
    <div className="sale-header"><div className="vehicle-avatar large"><CarFront size={24} /></div><div><strong>{vehicle.model}</strong><span>Gestión de gastos de preparación y extras</span></div></div>
    <div className="expense-grand-total"><div><span>Total de gastos{parkingCost > 0 ? ' (incluye estacionamiento)' : ''}</span><strong>{money(totalWithParking)}</strong></div><div className="expense-total-icon"><Wallet size={22} /></div></div>
    {grouped.length > 0 && <><div className="sale-section-title"><span>Gastos consolidados</span><small>Items repetidos se suman automáticamente</small></div><div className="grouped-list">{grouped.map((g) => <div className="grouped-row" key={g.key}><div className="grouped-info"><strong>{g.description}</strong><span>{g.count} registro{g.count > 1 ? 's' : ''}</span></div><strong className="grouped-amount">{money(g.total)}</strong></div>)}</div></>}
    <div className="sale-section-title"><span>Detalle de movimientos</span></div>
    {isPhysical(vehicle.vehicle_type) && <div className="parking-detail-card"><div className="parking-detail-icon"><MapPin size={18} /></div><div className="parking-detail-info"><strong>Estacionamiento / Estadía</strong><div className="stay-edit-row"><input type="number" min="1" className="stay-days-input" readOnly={!canEditStay || staySaving} value={vehicle.status === 'sold' ? stayDays : automaticDays} onChange={(e) => { setStayDays(Number(e.target.value) || 1); setStayEdit(true); }} /><span>{money(dailyStayCost)} por día</span></div><small>{vehicle.status === 'sold' ? `Estadía según fechas: ${automaticDays} días${sale?.parking_charged ? ' · Editar desde la venta' : ''}` : 'Asignado a: CARWIN (calculado automáticamente)'}</small>{canEditStay && <div><button type="button" className="secondary-button" disabled={staySaving} onClick={() => { setStayDays(automaticDays); setStayEdit(true); }}>Usar días según fechas</button><button type="button" className="primary-button" disabled={staySaving || !stayEdit || stayDays < 1} onClick={() => void saveStay()}>{staySaving ? 'Guardando...' : 'Guardar estadía'}</button></div>}{stayError && <small>{stayError}</small>}</div><strong className="parking-detail-amount">{money(parkingCost)}</strong></div>}
    <div className="expense-list compact-list">{expenses.filter(e => !e.is_daily_stay).map((e) => editingId === e.id ? <div className="expense-row expense-edit-row" key={e.id}><input value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} /><input type="number" value={editingAmount} onChange={(event) => setEditingAmount(event.target.value)} /><select value={editingAllocation} onChange={(event) => setEditingAllocation(event.target.value as ExpenseAllocation)}><option value="carwin">CARWIN</option><option value="customer">Cliente</option><option value="shared">Compartido</option></select><button className="row-action" onClick={() => void saveEdit()}><Check size={16} /></button><button className="row-action danger" onClick={() => setEditingId(null)}><X size={16} /></button></div> : <div className="expense-row" key={e.id}><div className="expense-dot small"><ReceiptText size={14} /></div><div className="expense-info"><strong>{e.description}</strong><span>{e.expense_type === 'wash' ? 'Lavado/Pulido' : e.is_daily_stay ? 'Estadía diaria' : 'Extra'} · {e.allocation === 'customer' ? 'Cobrado al cliente' : e.allocation === 'shared' ? 'Compartido' : 'Asumido por CARWIN'} · {money(e.amount)}</span></div>{isAdmin && <><button className="row-action" onClick={() => startEdit(e)}><Pencil size={16} /></button><button className="row-action danger" onClick={() => onDelete(e.id)}><Trash2 size={16} /></button></>}</div>)}</div>
{isAdmin && <form className="add-expense-form" onSubmit={submit}>
      <div className="sale-section-title"><span>Agregar gasto</span></div>
      <Field label="Tipo"><select value={expenseType} onChange={(e) => setExpenseType(e.target.value as ExpenseType)}><option value="extra">Extra</option><option value="wash">Lavado y pulido</option></select></Field><Field label="Responsable del gasto"><select value={allocation} onChange={(e) => setAllocation(e.target.value as ExpenseAllocation)}><option value="carwin">Asumido por CARWIN</option><option value="customer">Cobrado al cliente</option><option value="shared">Compartido</option></select></Field>
      <Field label="Descripción"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Cambio de aceite" /></Field>
      <Field label="Monto CLP (0 si lo defines después)"><input min="0" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
      <div className="form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Agregar gasto'}</button></div>
</form>}
  </Modal>;
}

function SaleModal({ vehicle, sale, dailyStayCost, monthPrefix, payments, onAddPayment, onDeletePayment, expenses, onClose, onAddExpense, onSold }: { vehicle: Vehicle; sale?: Sale; dailyStayCost: number; monthPrefix: string; payments: SalePayment[]; onAddPayment: (saleId: string, payment: Omit<SalePayment, 'id' | 'sale_id'>) => Promise<void>; onDeletePayment: (id: string) => Promise<void>; expenses: VehicleExpense[]; onClose: () => void; onAddExpense: (vehicleId: string, description: string, amount: number, expenseType: ExpenseType) => Promise<void>; onSold: (selectedExpenseIds: string[], finalTransferAmount: number, realSalePrice: number, agreedPrice: number, buyer: { buyer_name: string; buyer_rut: string; buyer_address: string; buyer_phone: string; delivery_date: string | null; terms: string }, soldAt: string, stayDaysOverride: number | undefined, transferMode: 'separate' | 'included' | 'direct' | '', transferCost: number) => Promise<void> }) {
  const [transferMode, setTransferMode] = useState<'separate' | 'included' | 'direct' | ''>(sale?.transfer_mode ?? '');
const [transferCost, setTransferCost] = useState(sale?.transfer_cost ?? 0);
const defaultSoldAt = sale?.sold_at ?? todayChile();
  const [soldAt, setSoldAt] = useState(defaultSoldAt);
  const autoStayDays = isPhysical(vehicle.vehicle_type) ? daysBetweenDates(vehicle.entered_at, soldAt) : 0;
  const savedStayDays = sale ? Number(expenses.find(e => e.is_daily_stay)?.description.match(/(\d+)\s+días/)?.[1]) || autoStayDays : autoStayDays;
  const [stayDays, setStayDays] = useState(savedStayDays);
  const [stayEdit, setStayEdit] = useState(savedStayDays !== autoStayDays);
  const parking = isPhysical(vehicle.vehicle_type) ? dailyStayCost * stayDays : 0;
  const lines = useMemo(() => [...expenses.filter((e) => !e.is_daily_stay).map((e) =>({ id: e.id, description: e.description, amount: e.amount, expense_type: e.expense_type, allocation: e.allocation })), ...(parking > 0 ? [{ id: 'parking', description: `Estadía · ${stayDays} días × ${money(dailyStayCost)}`, amount: parking, expense_type: 'parking' as const, allocation: 'carwin' as const }] : [])], [expenses, parking, dailyStayCost, stayDays]);
  const initialSelected = sale ? [...sale.charged_expense_ids, ...(sale.parking_charged ? ['parking'] : [])] : lines.map((l) => l.id);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [realPrice, setRealPrice] = useState((sale?.real_sale_price ?? vehicle.sale_price).toString());
  const [agreedPrice, setAgreedPrice] = useState((sale?.agreed_price ?? vehicle.agreed_price).toString());
  const [newExpense, setNewExpense] = useState(''); const [newAmount, setNewAmount] = useState('');
  const [newExpenseType, setNewExpenseType] = useState<ExpenseType>('extra');
  const [paymentDate, setPaymentDate] = useState(todayChile()); const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer'); const [paymentAmount, setPaymentAmount] = useState(''); const [paymentBank, setPaymentBank] = useState(''); const [paymentReference, setPaymentReference] = useState(''); const [paymentVerified, setPaymentVerified] = useState(false);
  const [buyerName, setBuyerName] = useState(sale?.buyer_name ?? ''); const [buyerRut, setBuyerRut] = useState(sale?.buyer_rut ?? ''); const [buyerAddress, setBuyerAddress] = useState(sale?.buyer_address ?? ''); const [buyerPhone, setBuyerPhone] = useState(sale?.buyer_phone ?? ''); const [deliveryDate, setDeliveryDate] = useState(sale?.delivery_date ?? ''); const [terms, setTerms] = useState(sale?.terms ?? ''); const [showSaleNote, setShowSaleNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const charged = lines.filter((l) => selected.includes(l.id)).reduce((sum, l) => sum + l.amount, 0);
  const finalAmount = Number(agreedPrice || 0) - charged;
const transferExtra = transferMode === 'separate' ? Number(transferCost || 0) : 0;
const totalToCollect = Number(realPrice || 0) + transferExtra;
  const assumedExpenseTotal = lines.filter((line) => !selected.includes(line.id)).reduce((sum, line) => sum + line.amount, 0);
  const projectedUtility = Number(realPrice || 0) - vehicle.purchase_price - assumedExpenseTotal;
  const saleIsViable = projectedUtility >= 0;
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const liquidationRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const addExtra = async () => { if (!newExpense) return; await onAddExpense(vehicle.id, newExpense, Number(newAmount) || 0, newExpenseType); setNewExpense(''); setNewAmount(''); };
  const paymentLock = useRef(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const addPayment = async () => { if (!sale || paymentLock.current) return; const amount = Number(paymentAmount); if (!Number.isSafeInteger(amount) || amount <= 0 || !paymentDate) { setPaymentError('Ingresa un monto positivo en pesos y una fecha válida.'); return; } if (amount + payments.reduce((sum, p) => sum + Number(p.amount), 0) > totalToCollect && !window.confirm('Este pago supera el total a cobrar considerando los pagos registrados. ¿Continuar?')) return; paymentLock.current = true; setPaymentBusy(true); setPaymentError(''); try { await onAddPayment(sale.id, { payment_date: paymentDate, method: paymentMethod, amount: Number(paymentAmount), bank: paymentBank, operation_reference: paymentReference, receipt_url: null, verified: paymentVerified, notes: '' }); setPaymentAmount(''); setPaymentBank(''); setPaymentReference(''); setPaymentVerified(false); } catch { setPaymentError('No se pudo registrar el pago. Revisa antes de reintentar.'); } finally { paymentLock.current = false; setPaymentBusy(false); } };
  const totalReceived = payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + payment.amount, 0);
const pendingBalance = Math.max(0, totalToCollect - totalReceived);
  const handleSold = async () => {
  if (!transferMode) {
    alert('Debes seleccionar la modalidad de transferencia.');
    return;
  }
  if (transferMode !== 'direct' && (!Number.isFinite(transferCost) || transferCost <= 0)) {
    alert('Debes ingresar el costo de transferencia.');
    return;
  }
  setSaving(true); try { await onSold(selected, finalAmount, Number(realPrice), Number(agreedPrice), { buyer_name: buyerName, buyer_rut: buyerRut, buyer_address: buyerAddress, buyer_phone: buyerPhone, delivery_date: deliveryDate || null, terms }, soldAt, stayEdit ? stayDays : undefined, transferMode, transferCost); } finally { setSaving(false); } };
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

<Field label="Modalidad de transferencia">
  <select value={transferMode} onChange={(e) => setTransferMode(e.target.value as typeof transferMode)}>
    <option value="">Seleccionar modalidad</option>
    <option value="separate">Cobrada aparte al comprador</option>
    <option value="included">Incluida en el precio - Regalo CARWIN</option>
    <option value="direct">Pagada directamente por el comprador</option>
  </select>
</Field>

{transferMode !== '' && transferMode !== 'direct' && (
  <Field label="Costo de transferencia ($)">
    <input type="number" min="0" value={transferCost} onChange={(e) => setTransferCost(Math.max(0, Number(e.target.value) || 0))} />
  </Field>
)}

<Field label="Total a cobrar al comprador">
  <strong>{money(totalToCollect)}</strong>
</Field>
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
    <div className="payment-panel"><div className="sale-section-title"><span><CreditCard size={16} /> Pagos recibidos</span><small>{sale ? `${payments.filter((payment) => payment.verified).length} verificados` : 'Guarda la venta para registrar pagos'}</small></div>{sale ? <><div className="payment-summary"><div><span>Total verificado</span><strong>{money(totalReceived)}</strong></div><div><span>Saldo pendiente</span><strong>{money(pendingBalance)}</strong>{totalReceived > totalToCollect && <small>Excedente: {money(totalReceived - totalToCollect)}</small>}</div><div><span>Pagado</span><strong>{totalToCollect > 0 ? `${Math.min(100, Math.round((totalReceived / totalToCollect) * 100))}%` : '0%'}</strong></div></div><div className="payment-progress"><div className="payment-progress-fill" style={{ width: `${totalToCollect > 0 ? Math.min(100, Math.round((totalReceived / totalToCollect) * 100)) : 0}%` }} /></div><div className="payment-list">{payments.map((payment) => <div className="payment-row" key={payment.id}><div><strong>{money(payment.amount)}</strong><span>{paymentMethodLabel(payment.method)} · {dateLabel(payment.payment_date)}{payment.operation_reference ? ` · ${payment.operation_reference}` : ''}</span></div><b className={payment.verified ? 'verified-payment' : 'pending-payment'}>{payment.verified ? 'Verificado' : 'Pendiente'}</b><button className="row-action danger" onClick={() => void onDeletePayment(payment.id)}><Trash2 size={15} /></button></div>)}</div></> : <p className="form-hint"><FileText size={15} /> Guarda la venta para registrar sus pagos.</p>}</div>
    {sale && <div className="payment-form"><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}><option value="cash">Efectivo</option><option value="bank_draft">Vale vista</option><option value="bank_transfer">Transferencia</option><option value="card">Tarjeta</option><option value="trade_in">Vehículo en parte de pago</option></select><input type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Monto" /><input value={paymentBank} onChange={(event) => setPaymentBank(event.target.value)} placeholder="Banco" /><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="N° operación" /><label className="check-field"><input type="checkbox" checked={paymentVerified} onChange={(event) => setPaymentVerified(event.target.checked)} /> Verificado</label><button className="secondary-button" disabled={paymentBusy} onClick={() => void addPayment()}><Plus size={16} /> {paymentBusy ? 'Guardando...' : 'Agregar pago'}</button></div>}
    {paymentError && <p className="form-error">{paymentError}</p>}
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
  const fullDate = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${sale.sold_at}T12:00:00`));
  const noteRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  const [noteError, setNoteError] = useState('');
  const handlePrint = async (print = false) => {
    if (!noteRef.current) return;
    setPrinting(true); setNoteError('');
    try {
      await document.fonts.ready;
      const logo = noteRef.current.querySelector<HTMLImageElement>('.note-logo');
      if (!logo) throw new Error('Logo no encontrado');
      await logo.decode();
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = logo.naturalWidth; logoCanvas.height = logo.naturalHeight;
      const logoCtx = logoCanvas.getContext('2d');
      if (!logoCtx) throw new Error('Logo no disponible');
      logoCtx.drawImage(logo, 0, 0);
      const logoData = logoCanvas.toDataURL('image/png');
      const canvas = await html2canvas(noteRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true, onclone: async (doc) => {
        const n = doc.querySelector<HTMLElement>('.carwin-note-premium');
        if (n) n.style.width = '760px';
        const img = n?.querySelector<HTMLImageElement>('.note-logo');
        if (!img) throw new Error('Logo no encontrado en PDF');
        img.src = logoData; await img.decode();
        img.style.objectFit = 'fill';
        img.style.height = `${210 * logo.naturalHeight / logo.naturalWidth}px`;
        img.style.width = '210px';
      } });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const w = 195, h = canvas.height * w / canvas.width;
      const ratio = Math.min(1, 258 / h);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (215.9 - w * ratio)/2, 10, w * ratio, h * ratio);
      if (print) { pdf.autoPrint(); const url = pdf.output('bloburl'); const win = window.open(String(url), '_blank'); if (!win) { pdf.save(`nota-venta-${sale.folio}.pdf`); setNoteError('Ventana bloqueada. Se descargó el PDF para imprimir.'); } }
      else pdf.save(`nota-venta-${sale.folio}.pdf`);
    } catch { setNoteError('No se pudo generar el PDF. Intenta nuevamente.'); }
    finally { setPrinting(false); }
  };

  return <Modal title="Nota de venta" onClose={onClose} wide>
    <style>{`
      .carwin-note-premium {color:#102B4F;background:#fff;padding:24px;font-size:14px;border-radius:8px;}
      .carwin-note-premium .note-header {background:#0a1d35;border-bottom:4px solid #d5ad52;padding:16px;margin-bottom:14px;border-radius:6px;gap:12px;align-items:center;}
      .carwin-note-premium .note-brand {flex-wrap:wrap;gap:8px;}
      .carwin-note-premium .note-logo {width:210px;height:90px;object-fit:contain;background:#0a1d35;border:0;padding:0;border-radius:0;}
      .carwin-note-premium .note-brand h3,.carwin-note-premium .note-folio strong {color:#fff;}
      .carwin-note-premium .note-brand span,.carwin-note-premium .note-folio span {color:#e2c982;}
      .carwin-note-premium .note-document-title {font-size:25px;color:#102b4f;margin:8px 0;letter-spacing:1px;}
      .carwin-note-premium .note-section {margin-bottom:8px;}
      .carwin-note-premium .note-section-title {text-transform:uppercase;background:#eef3f8;border-left:4px solid #c9a34c;padding:7px 10px;margin-bottom:6px;}
      .carwin-note-premium .note-data-grid,.carwin-note-premium .note-vehicle-grid {gap:6px;}
      .carwin-note-premium .note-vehicle-grid {display:grid;grid-template-columns:minmax(0,2.5fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:10px;}
      .carwin-note-premium .note-data-grid>div,.carwin-note-premium .note-vehicle-grid>div {padding:4px 0;overflow-wrap:anywhere;}
      .carwin-note-premium .note-finance-row {padding:7px 10px;}
      .carwin-note-premium .note-signatures {display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:8px 0 14px;padding-top:0;}
      .carwin-note-premium .note-sig {padding-top:70px;text-align:center;}
      .carwin-note-premium .note-sig div {display:block;width:100%;height:2px;background:#24364b;border:0;margin:0 0 8px;}
      .carwin-note-premium .note-sig span {display:block;margin:0;color:#102b4f;font-size:12px;font-weight:600;}
      .carwin-note-premium .note-premium-footer {background:#102b4f;color:#f4da92;padding:10px;text-align:center;font-weight:700;font-size:12px;}
    `}</style>
    <div className="sale-note carwin-note-premium" ref={noteRef}>
      <div className="note-header">
        <div className="note-brand"><img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN" className="note-logo" /><div><h3>CARWIN SpA</h3><span>www.carwin.cl · Vitacura, Santiago</span></div></div>
        <div className="note-folio"><span>Folio</span><strong>{sale.folio}</strong></div>
      </div>
      <h2 className="note-document-title">NOTA DE VENTA</h2><div className="note-date"><span>Vitacura, {fullDate}</span></div>
      <div className="note-section"><div className="note-section-title">01 / Datos del comprador</div>
        <div className="note-data-grid">
          <div><small>Nombre</small><strong>{buyerData.buyer_name || 'Por completar'}</strong></div>
          <div><small>RUT</small><strong>{buyerData.buyer_rut || 'Por completar'}</strong></div>
          <div><small>Dirección</small><strong>{buyerData.buyer_address || 'Por completar'}</strong></div>
          <div><small>Teléfono</small><strong>{buyerData.buyer_phone || 'Por completar'}</strong></div>
          <div><small>Fecha entrega</small><strong>{buyerData.delivery_date ? dateLabel(buyerData.delivery_date) : 'Por definir'}</strong></div>
        </div>
      </div>
      <div className="note-section"><div className="note-section-title">02 / Identificación del vehículo</div>
        <div className="note-vehicle-grid">
          <div><small>Modelo</small><strong>{vehicle.model}</strong></div>
          <div><small>Patente</small><strong>{vehicle.plate || 'Pendiente'}</strong></div>
          <div><small>Kilómetros</small><strong>{vehicle.kilometers.toLocaleString('es-CL')}</strong></div>
          <div><small>Color</small><strong>{vehicle.color}</strong></div>
          
          
        </div>
      </div>
      {buyerData.terms && <div className="note-section"><div className="note-section-title">Condiciones</div><p className="note-terms">{buyerData.terms}</p></div>}
      <div className="note-section"><div className="note-section-title">03 / Condiciones comerciales</div>
        <div className="note-finance-table">
          <div className="note-finance-row total"><span>Precio de venta acordado</span><strong>{money(sale.real_sale_price)}</strong></div>
          <div className="note-finance-row"><span>Transferencia</span><strong>{sale.transfer_mode === 'direct' ? 'Pago directo comprador' : sale.transfer_mode === 'included' ? 'Incluida en precio' : sale.transfer_mode === 'separate' ? money(sale.transfer_cost ?? 0) : 'Por confirmar'}</strong></div>
          <div className="note-finance-row"><span>Total a pagar a CARWIN</span><strong>{money(sale.real_sale_price + (sale.transfer_mode === 'separate' ? sale.transfer_cost ?? 0 : 0))}</strong></div>
          <div className="note-finance-row"><span>Pagos recibidos y verificados</span><strong>{money(totalReceived)}</strong></div>
          <div className="note-finance-row"><span>Saldo pendiente</span><strong>{money(Math.max(0, sale.real_sale_price + (sale.transfer_mode === 'separate' ? sale.transfer_cost ?? 0 : 0) - totalReceived))}</strong></div>
        </div>
      </div>
      {payments.length > 0 && <div className="note-section"><div className="note-section-title">Pagos registrados</div>
        <div className="note-payments">{payments.map((payment) => <div className="note-payment-row" key={payment.id}><span>{paymentMethodLabel(payment.method)} · {dateLabel(payment.payment_date)}{payment.operation_reference ? ` · ${payment.operation_reference}` : ''}</span><strong>{money(payment.amount)}</strong><b className={payment.verified ? 'verified-payment' : 'pending-payment'}>{payment.verified ? 'Verificado' : 'Pendiente'}</b></div>)}</div>
      </div>}
      <div className="note-section-title">04 / Firmas</div><div className="note-signatures">
        <div className="note-sig"><div /><span>Firma CARWIN SpA</span></div>
        <div className="note-sig"><div /><span>Firma del comprador</span></div>
      </div>
      <div className="note-premium-footer">Gracias por confiar en CARWIN · www.carwin.cl</div>
    </div>
    <div className="sale-actions">
      {noteError && <p className="form-error">{noteError}</p>}
      <button className="secondary-button" onClick={() => void handlePrint(true)} disabled={printing}>Imprimir nota de venta</button>
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
  const [minimumPrice, setMinimumPrice] = useState(String(vehicle.agreed_price || 0));
  const [publication, setPublication] = useState(String(vehicle.sale_price || 0));
  const [start, setStart] = useState(todayChile());
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const kind = vehicle.vehicle_type === 'physical_consignment' ? 'Consignación física' : 'Consignación virtual';
  const valid = !!(start && Number(minimumPrice)>0 && Number(publication)>0 && vehicle.vehicle_type !== 'own');
  const draft = !ownerName.trim() || !ownerRut.trim() || Number(publication)<Number(minimumPrice);
  const generate = async (print: boolean) => {
    if (!valid || !ref.current) return;
    const printWindow = print ? window.open('about:blank', '_blank') : null;
    setBusy(true); setError('');
    try {
      await document.fonts.ready;
      const logo = ref.current.querySelector('img'); if (!logo) throw new Error('Logo'); await logo.decode();
      const lc = document.createElement('canvas'); lc.width=logo.naturalWidth; lc.height=logo.naturalHeight; const ctx=lc.getContext('2d'); if(!ctx) throw new Error('Logo'); ctx.drawImage(logo,0,0); const data=lc.toDataURL('image/png');
      const canvas = await html2canvas(ref.current,{scale:2,backgroundColor:'#ffffff',useCORS:true,onclone:async doc=>{const paper=doc.querySelector<HTMLElement>('.cw-contract-paper'); if(!paper) throw new Error('Documento'); paper.style.width='760px'; const img=paper.querySelector('img'); if(!img) throw new Error('Logo'); img.src=data; await img.decode(); img.style.width='210px'; img.style.height=`${210*logo.naturalHeight/logo.naturalWidth}px`;}});
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'letter'});
      const w=195, h=canvas.height*w/canvas.width, ratio=Math.min(1,258/h);
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',(215.9-w*ratio)/2,10,w*ratio,h*ratio);
      const filename=`contrato-consignacion-${vehicle.plate || vehicle.id}.pdf`;
      if(print && printWindow && !printWindow.closed){pdf.autoPrint(); printWindow.location.href=String(pdf.output('bloburl'));} else {pdf.save(filename); if(print) setError('Ventana bloqueada: abre el PDF descargado para imprimir.');}
    } catch {printWindow?.close(); setError('No se pudo generar el contrato. Intenta nuevamente.');} finally {setBusy(false);}
  };
  return <Modal title="Contrato de consignación" onClose={onClose} wide>
    <div className="form-grid contract-form">
      <Field label="Nombre del propietario" required><input value={ownerName} onChange={e=>setOwnerName(e.target.value)}/></Field>
      <Field label="RUT" required><input value={ownerRut} onChange={e=>setOwnerRut(e.target.value)}/></Field>
      <Field label="Teléfono"><input value={ownerPhone} onChange={e=>setOwnerPhone(e.target.value)}/></Field>
      <Field label="Dirección"><input value={ownerAddress} onChange={e=>setOwnerAddress(e.target.value)}/></Field>
      <Field label="Valor acordado para propietario" required><input type="number" min="1" value={minimumPrice} onChange={e=>setMinimumPrice(e.target.value)}/></Field>
      <Field label="Precio de publicación" required><input type="number" min="1" value={publication} onChange={e=>setPublication(e.target.value)}/></Field>
      <Field label="Fecha de inicio" required><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></Field>
      <Field label="Observaciones adicionales"><textarea rows={2} maxLength={240} value={terms} onChange={e=>setTerms(e.target.value)}/></Field>
    </div>
    <style>{`.cw-contract-paper{background:white;color:#102b4f;padding:24px;box-sizing:border-box;font-size:14px;line-height:1.4;border-radius:8px;overflow-wrap:anywhere}.cw-contract-paper h3{color:#102b4f;margin:12px 0;font-size:23px}.cw-contract-paper h4{background:#eef3f8;color:#102b4f;border-left:4px solid #c9a34c;padding:6px 9px;margin:12px 0 6px;font-size:14px}.cw-contract-paper p{margin:5px 0;color:#102b4f}.cw-contract-paper .cw-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px}.cw-contract-paper small{display:block;color:#536b83}.cw-contract-paper b{color:#102b4f}.cw-contract-paper .cw-head{display:flex;align-items:center;gap:16px;background:#0a1d35;padding:14px;border-bottom:4px solid #d5ad52;border-radius:5px}.cw-contract-paper .cw-head img{width:210px;height:auto}.cw-contract-paper .cw-head strong{color:white;font-size:21px}.cw-contract-paper .cw-head p{color:#e2c982}.cw-contract-paper .cw-sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:65px 0 15px;text-align:center}.cw-contract-paper .cw-sign div{border-top:2px solid #24364b;padding-top:7px}.cw-contract-paper footer{background:#102b4f;color:#e2c982;text-align:center;padding:8px}`}</style>
    <div ref={ref} className="cw-contract-paper">
      <div className="cw-head"><img src="/assets/images/Logo_Oficial.jpeg" alt="CARWIN"/><div><strong>CARWIN SpA</strong><p>www.carwin.cl · Vitacura, Santiago</p></div></div>
      <h3>CONTRATO DE CONSIGNACIÓN VEHICULAR</h3>{draft && <p style={{fontWeight:700}}>BORRADOR · Pendiente de revisión</p>}<p>Vitacura · {start || 'Fecha por definir'}</p>
      <h4>01 / DATOS DEL CONSIGNANTE</h4><div className="cw-grid"><div><small>Nombre</small><b>{ownerName || 'Por completar'}</b></div><div><small>RUT</small><b>{ownerRut || 'Por completar'}</b></div><div><small>Dirección</small><b>{ownerAddress || 'Por completar'}</b></div><div><small>Teléfono</small><b>{ownerPhone || 'Por completar'}</b></div></div>
      <h4>02 / VEHÍCULO</h4><div className="cw-grid"><div><small>Modelo</small><b>{vehicle.model}</b></div><div><small>Patente</small><b>{vehicle.plate}</b></div><div><small>Kilómetros / color</small><b>{vehicle.kilometers.toLocaleString('es-CL')} · {vehicle.color}</b></div><div><small>Modalidad</small><b>{vehicle.vehicle_type==='own'?'No corresponde':kind}</b></div></div>
      <h4>03 / ACUERDO COMERCIAL</h4><div className="cw-grid"><div><small>Valor acordado para el propietario</small><b>{money(Number(minimumPrice)||0)}</b></div><div><small>Precio de publicación</small><b>{money(Number(publication)||0)}</b></div></div>
      <p>El consignante autoriza a CARWIN SpA a publicar y gestionar la venta del vehículo. Toda modificación del valor acordado para el propietario requerirá su autorización. La liquidación se efectuará una vez recibidos y verificados los fondos de la venta y cumplidas las condiciones acordadas.</p>
      <h4>04 / PLAZO Y COSTO DE GESTIÓN POR RETIRO ANTICIPADO</h4><p>El plazo mínimo de consignación será de 60 días corridos desde la fecha de inicio. Si el consignante solicita voluntariamente el retiro antes de cumplirse dicho plazo, deberá pagar $100.000 más IVA ($119.000), como recuperación parcial de los costos de preparación, gestión comercial, publicación, estacionamiento cuando corresponda y administración. Cumplidos los 60 días, no se aplicará este cobro por retiro anticipado.</p>
      <p>El consignante declara estar facultado para disponer del vehículo e informar sus antecedentes y limitaciones. CARWIN se compromete a gestionar la comercialización conforme a la modalidad acordada. En consignación virtual, el vehículo permanece bajo custodia del propietario.</p>
      {terms.trim() && <p><b>Observaciones:</b> {terms}</p>}
      <div className="cw-sign"><div>Firma del consignante</div><div>Firma CARWIN SpA</div></div><footer>Gracias por confiar en CARWIN · www.carwin.cl</footer>
    </div>
    <p className="muted">Los datos editados se aplican al documento; no modifican el stock ni se guardan en la base de datos.</p>
    {(!ownerName.trim() || !ownerRut.trim()) && <p style={{color:'#ffdc78'}}>Falta nombre o RUT del consignante. Puedes imprimir un borrador.</p>}
    {Number(publication)<Number(minimumPrice) && <p style={{color:'#ffdc78'}}>Atención: el precio de publicación es inferior al valor acordado para el propietario. Revisa los valores antes de firmar.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="form-actions"><button className="secondary-button" onClick={()=>void generate(true)} disabled={!valid||busy}>Imprimir contrato</button><button className="primary-button" onClick={()=>void generate(false)} disabled={!valid||busy}>Descargar contrato PDF</button><button className="secondary-button" onClick={onClose}>Cerrar</button></div>
  </Modal>;
}

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) { return <label className="field"><span>{label}{required && <em> *</em>}</span>{children}</label>; }
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">CARWIN</p><h3>{title}</h3></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>{children}</div></div>; }

export default App;