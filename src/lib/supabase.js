import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const isSupabaseConfigured = Boolean(supabase)

const PAGE_SIZE = 500
const UPSERT_BATCH_SIZE = 250

async function loadTable(table) {
  const records = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`No se pudo cargar ${table} desde Supabase: ${error.message}`)
    records.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return records
  }
}

export async function loadCloudState() {
  if (!supabase) return null
  const tables = ['products', 'sales', 'materials', 'loans', 'teachers', 'customers', 'cash_movements', 'purchase_orders', 'accounts_receivable', 'app_settings', 'students', 'student_book_records']
  const optionalTables = new Set(['accounts_receivable', 'app_settings', 'students', 'student_book_records'])
  const result = await Promise.all(tables.map(async (table) => {
    try {
      return [table, await loadTable(table), null]
    } catch (error) {
      const tableMissing =
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        /could not find the table|does not exist/i.test(error.message || '')
      if (optionalTables.has(table) && tableMissing) return [table, [], error.message]
      throw error
    }
  }))
  return {
    ...Object.fromEntries(result.map(([table, rows]) => [table, rows])),
    missingTables: result
      .filter(([, , missingMessage]) => missingMessage)
      .map(([table]) => table),
  }
}

function createCloudPayload({ products, sales, materials, loans, teachers, customers, purchaseOrders, cash, receivables, students, studentBookRecords }) {
  return {
    products: products.map(({ id, minStock, purchaseCost, bookCourses, ...item }) => ({ id, ...item, min_stock: Number(minStock ?? 5), purchase_cost: Number(purchaseCost || 0), book_courses: bookCourses || [] })),
    sales: sales.map(({ id, ...item }) => ({
      id,
      customer: item.customer || 'Familia del colegio',
      customer_id: item.customerId || null,
      carnet: item.carnet || '',
      family: item.family || '',
      relation: item.relation || '',
      payer: item.payer || '',
      payer_id: item.payerId || null,
      payer_relation: item.payerRelation || '',
      student_id: item.studentId || null,
      payment: item.payment || 'Efectivo',
      cash_amount: Number(item.cashAmount || 0),
      qr_amount: Number(item.qrAmount || 0),
      total: Number(item.total || 0),
      status: item.status || 'Vigente',
      voided_at: item.voidedAt || null,
      sold_at: item.date || new Date().toISOString(),
      items: Array.isArray(item.items) ? item.items : [],
    })),
    materials: materials.map(({ id, ...item }) => ({ id, ...item })),
    loans: loans.map(({ id, ...item }) => ({ id, action: item.action, material: item.material, material_id: item.materialId || null, teacher: item.teacher, teacher_id: item.teacherId || null, due: item.due || '', loaned_at: item.date })),
    teachers: teachers.map(({ id, ...item }) => ({ id, ...item })),
    customers: (customers || []).map(({ id, ...item }) => ({ id, ...item })),
    purchase_orders: (purchaseOrders || []).map(({ id, ...item }) => ({ id, supplier: item.supplier, notes: item.notes || '', items: item.items || [], total: item.total || 0, paid: item.paid || 0, balance: item.balance || 0, status: item.status || 'Pendiente', ordered_at: item.date, received_at: item.receivedAt || null })),
    cash_movements: (cash.movements || []).map(({ id, ...item }) => ({ id, type: item.type, concept: item.concept, reason: item.reason || '', operation: item.operation || '', product_id: item.productId || null, quantity: Number(item.quantity || 0), amount: Number(item.amount || 0), payment: item.payment || null, cash_amount: Number(item.cashAmount || 0), qr_amount: Number(item.qrAmount || 0), moved_at: item.date || new Date().toISOString() })),
    accounts_receivable: (receivables || []).map(({ id, ...item }) => ({
      id,
      guardian_name: item.guardianName || '',
      student_name: item.studentName || '',
      grade: item.grade || '',
      carnet: item.carnet || '',
      family: item.family || '',
      gestion: item.gestion || '',
      total: Number(item.total || 0),
      paid: Number(item.paid || 0),
      payment_history: item.paymentHistory || [],
      contract: item.contract || '',
      commitment: item.commitment || '',
      infocred_status: item.infocredStatus || 'Pendiente',
      created_at: item.createdAt || new Date().toISOString(),
    })),
    app_settings: [{ id: 'cash', value: { opening: Number(cash.opening || 0) } }],
    students: (students || []).map((student) => ({
      id: student.id,
      name: student.name,
      carnet: student.carnet || '',
      course: student.course,
      guardian_id: student.guardianId || null,
      guardian_name: student.guardianName || '',
      family: student.family || '',
      created_at: student.createdAt || new Date().toISOString(),
    })),
    student_book_records: (studentBookRecords || []).map((record) => ({
      id: record.id,
      student_id: record.studentId,
      product_id: record.productId,
      status: record.status || 'Comprado',
      source: record.source || 'Anterior al sistema',
      purchased_at: record.purchasedAt || new Date().toISOString(),
    })),
  }
}

function matchesRemoteRow(row, remoteRow) {
  if (!remoteRow) return false
  return Object.entries(row).every(([key, value]) => {
    const remoteValue = remoteRow[key]
    if (typeof value === 'number' && remoteValue !== null && remoteValue !== '') {
      return Number(remoteValue) === value
    }
    if (Array.isArray(value)) {
      return Array.isArray(remoteValue) &&
        value.length === remoteValue.length &&
        value.every((item, index) => matchesRemoteValue(item, remoteValue[index]))
    }
    if (value && typeof value === 'object') {
      return Boolean(remoteValue) &&
        Object.entries(value).every(([nestedKey, nestedValue]) =>
          matchesRemoteValue(nestedValue, remoteValue[nestedKey]),
        )
    }
    return value === remoteValue
  })
}

function matchesRemoteValue(value, remoteValue) {
  if (typeof value === 'number' && remoteValue !== null && remoteValue !== '') {
    return Number(remoteValue) === value
  }
  if (Array.isArray(value)) {
    return Array.isArray(remoteValue) &&
      value.length === remoteValue.length &&
      value.every((item, index) => matchesRemoteValue(item, remoteValue[index]))
  }
  if (value && typeof value === 'object') {
    return Boolean(remoteValue) &&
      Object.entries(value).every(([key, nestedValue]) =>
        matchesRemoteValue(nestedValue, remoteValue[key]),
      )
  }
  return value === remoteValue
}

const optionalColumns = {
  products: new Set(['section', 'book_courses']),
  sales: new Set(['student_id']),
}

function missingColumnFromError(error) {
  const match = error.message?.match(
    /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i,
  )
  return match ? { column: match[1], table: match[2] } : null
}

function withoutColumns(row, columns = []) {
  if (!columns.length) return row
  const result = { ...row }
  columns.forEach((column) => delete result[column])
  return result
}

export async function syncCloudState({
  skipTables = [],
  baseline = {},
  omittedColumns = {},
  forceFullSync = false,
  ...state
}) {
  if (!supabase)
    return { counts: {}, baseline, omittedColumns, missingColumns: [] }
  const payloads = createCloudPayload(state)
  const counts = {}
  const nextBaseline = { ...baseline }
  const nextOmittedColumns = Object.fromEntries(
    Object.entries(omittedColumns).map(([table, columns]) => [
      table,
      new Set(columns),
    ]),
  )
  for (const [table, rows] of Object.entries(payloads)) {
    if (skipTables.includes(table)) continue
    const ids = new Set()
    for (const row of rows) {
      if (!row.id) throw new Error(`No se pudo sincronizar ${table}: hay un registro sin identificador`)
      if (ids.has(row.id)) throw new Error(`No se pudo sincronizar ${table}: identificador duplicado ${row.id}`)
      ids.add(row.id)
    }
    const remoteById = new Map(
      (baseline[table] || []).map((row) => [row.id, row]),
    )
    const columnsToOmit = [...(nextOmittedColumns[table] || [])]
    const safeRows = rows.map((row) => withoutColumns(row, columnsToOmit))
    const pending = forceFullSync
      ? safeRows
      : safeRows.filter((row) => !matchesRemoteRow(row, remoteById.get(row.id)))
    for (let offset = 0; offset < pending.length; offset += UPSERT_BATCH_SIZE) {
      const batch = pending.slice(offset, offset + UPSERT_BATCH_SIZE)
      let { error } = await supabase.from(table).upsert(batch)
      if (error) {
        const missingColumn = missingColumnFromError(error)
        if (
          missingColumn?.table === table &&
          optionalColumns[table]?.has(missingColumn.column)
        ) {
          nextOmittedColumns[table] ||= new Set()
          nextOmittedColumns[table].add(missingColumn.column)
          const retryBatch = batch.map((row) =>
            withoutColumns(row, [missingColumn.column]),
          )
          const retryResult = await supabase.from(table).upsert(retryBatch)
          error = retryResult.error
        }
      }
      if (error)
        throw new Error(`No se pudo sincronizar ${table} (${offset + 1}-${offset + batch.length} de ${pending.length} cambios): ${error.message}`)
    }
    counts[table] = rows.length
    nextBaseline[table] = [
      ...[...(baseline[table] || [])].filter(
        (remoteRow) => !ids.has(remoteRow.id),
      ),
      ...safeRows,
    ]
  }
  return {
    counts,
    baseline: nextBaseline,
    omittedColumns: Object.fromEntries(
      Object.entries(nextOmittedColumns).map(([table, columns]) => [
        table,
        [...columns],
      ]),
    ),
    missingColumns: Object.entries(nextOmittedColumns).flatMap(
      ([table, columns]) =>
        [...columns].map((column) => `${table}.${column}`),
    ),
  }
}
