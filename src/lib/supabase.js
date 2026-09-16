import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const isSupabaseConfigured = Boolean(supabase)

export async function loadCloudState() {
  if (!supabase) return null
  const tables = ['products', 'sales', 'materials', 'loans', 'teachers', 'customers', 'cash_movements', 'purchase_orders']
  const result = await Promise.all(tables.map(async (table) => {
    const { data, error } = await supabase.from(table).select('*')
    if (error) console.error(`No se pudo cargar ${table} desde Supabase`, error)
    return [table, error ? [] : data]
  }))
  return Object.fromEntries(result)
}

export async function syncCloudState({ products, sales, materials, loans, teachers, customers, purchaseOrders, cash }) {
  if (!supabase) return
  const payloads = {
    products: products.map(({ id, minStock, purchaseCost, ...item }) => ({ id, ...item, min_stock: minStock, purchase_cost: purchaseCost || 0 })),
    sales: sales.map(({ id, ...item }) => ({ id, customer: item.customer, customer_id: item.customerId, carnet: item.carnet, family: item.family || '', relation: item.relation || '', payer: item.payer || '', payer_id: item.payerId || '', payer_relation: item.payerRelation || '', payment: item.payment, cash_amount: item.cashAmount, qr_amount: item.qrAmount, total: item.total, status: item.status || 'Vigente', voided_at: item.voidedAt || null, sold_at: item.date, items: item.items })),
    materials: materials.map(({ id, ...item }) => ({ id, ...item })),
    loans: loans.map(({ id, ...item }) => ({ id, action: item.action, material: item.material, material_id: item.materialId || null, teacher: item.teacher, teacher_id: item.teacherId || null, due: item.due || '', loaned_at: item.date })),
    teachers: teachers.map(({ id, ...item }) => ({ id, ...item })),
    customers: (customers || []).map(({ id, ...item }) => ({ id, ...item })),
    purchase_orders: (purchaseOrders || []).map(({ id, ...item }) => ({ id, supplier: item.supplier, notes: item.notes || '', items: item.items || [], total: item.total || 0, paid: item.paid || 0, balance: item.balance || 0, status: item.status || 'Pendiente', ordered_at: item.date, received_at: item.receivedAt || null })),
    cash_movements: (cash.movements || []).map(({ id, ...item }) => ({ id, type: item.type, concept: item.concept, reason: item.reason || '', operation: item.operation || '', product_id: item.productId || null, quantity: item.quantity || 0, amount: item.amount, payment: item.payment, cash_amount: item.cashAmount || 0, qr_amount: item.qrAmount || 0, moved_at: item.date })),
  }
  await Promise.all(Object.entries(payloads).map(([table, rows]) => rows.length ? supabase.from(table).upsert(rows) : Promise.resolve()))
}
