const REPORT_TIME_ZONE = "America/La_Paz";
const REPORT_START_DATE = "2026-11-12";
const MONTH_SHEETS = [
  "ENE.",
  "FEB.",
  "MAR.",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOS.",
  "SEP.",
  "OCT.",
  "NOV.",
  "DICIEM.",
];
const CATEGORY_INDEX = {
  LIBROS: 0,
  AGENDAS: 1,
  POLERAS: 2,
  "BLUSAS Y CAMISAS": 3,
  TELA: 4,
  DEPORTIVOS: 5,
  VARIOS: 6,
  OTROS: 7,
};

function installDailyReportTrigger() {
  getConfig();
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "writeDailyReport")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("writeDailyReport")
    .timeBased()
    .atHour(21)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(REPORT_TIME_ZONE)
    .create();
}

function writeDailyReport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30_000)) throw new Error("Ya hay un informe diario en ejecucion.");
  try {
    writeDailyReportLocked();
  } finally {
    lock.releaseLock();
  }
}

function writeDailyReportLocked() {
  const config = getConfig();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Vincula este script a la hoja de caja.");

  const now = new Date();
  const date = Utilities.formatDate(now, REPORT_TIME_ZONE, "yyyy-MM-dd");
  if (date < REPORT_START_DATE) return;
  const month = Number(Utilities.formatDate(now, REPORT_TIME_ZONE, "M")) - 1;
  const sheet = spreadsheet.getSheetByName(MONTH_SHEETS[month]);
  if (!sheet) throw new Error(`No existe la pestaña ${MONTH_SHEETS[month]}.`);
  validateHeaders(sheet);

  const start = new Date(`${date}T00:00:00-04:00`).toISOString();
  const end = new Date(
    new Date(`${date}T00:00:00-04:00`).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();
  const sales = fetchRows(
    config,
    "sales",
    "id,customer,payer,items,total,cash_amount,qr_amount,status,sold_at",
    `sold_at=gte.${encodeURIComponent(start)}&sold_at=lt.${encodeURIComponent(end)}`,
  );
  const movements = fetchRows(
    config,
    "cash_movements",
    "id,type,concept,reason,amount,cash_amount,qr_amount,status,moved_at",
    `moved_at=gte.${encodeURIComponent(start)}&moved_at=lt.${encodeURIComponent(end)}`,
  );

  const cashCategories = Array(8).fill(0);
  const reportRows = [];
  sales
    .filter((sale) => sale.status !== "Anulada")
    .sort((first, second) => String(first.sold_at).localeCompare(String(second.sold_at)))
    .forEach((sale) => {
      const categories = getSaleCategories(sale.items || []);
      const cashAmount = roundMoney(Number(sale.cash_amount || 0));
      const qrAmount = roundMoney(Number(sale.qr_amount || 0));
      const paymentTotal = cashAmount + qrAmount;
      const qrCategories = allocateCategories(categories, qrAmount, paymentTotal);
      categories.forEach((amount, index) => {
        cashCategories[index] += amount - qrCategories[index];
      });
      if (qrAmount > 0) {
        const payer = String(sale.payer || sale.customer || "Cliente").trim();
        reportRows.push(
          makeReportRow(
            date,
            `QR ${payer}`,
            `APP:QR:${sale.id}`,
            qrCategories,
            sale.id,
          ),
        );
      }
    });

  const cashTotal = roundMoney(cashCategories.reduce((sum, amount) => sum + amount, 0));
  if (cashTotal > 0) {
    reportRows.unshift(
      makeReportRow(date, "EFECTIVO", `APP:EFECTIVO:${date}`, cashCategories, ""),
    );
  }

  movements
    .filter(
      (movement) =>
        movement.type === "Egreso" &&
        movement.status !== "Anulada" &&
        !String(movement.concept || "").startsWith("Anulación "),
    )
    .forEach((movement) => {
      const amount = Math.abs(
        Number(movement.amount || movement.cash_amount || movement.qr_amount || 0),
      );
      if (!amount) return;
      const categories = Array(8).fill(0);
      categories[CATEGORY_INDEX.OTROS] = -roundMoney(amount);
      reportRows.push(
        makeReportRow(
          date,
          String(movement.concept || movement.reason || "EGRESO").trim(),
          `APP:EGRESO:${movement.id}`,
          categories,
          movement.id,
        ),
      );
    });

  upsertReportRows(sheet, reportRows);
}

function getConfig() {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = properties.getProperty("SUPABASE_ANON_KEY");
  if (!url || !key)
    throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en las propiedades del script.");
  return { url, key };
}

function fetchRows(config, table, columns, filters) {
  const response = UrlFetchApp.fetch(
    `${config.url}/rest/v1/${table}?select=${columns}&${filters}`,
    {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      muteHttpExceptions: true,
    },
  );
  const status = response.getResponseCode();
  if (status < 200 || status >= 300)
    throw new Error(`No se pudo consultar ${table} en Supabase (${status}).`);
  return JSON.parse(response.getContentText());
}

function validateHeaders(sheet) {
  const headers = sheet
    .getRange(5, 1, 1, 12)
    .getDisplayValues()[0]
    .map((value) => normalizeText(value));
  const expected = [
    "fecha",
    "descripcion",
    "nºrecibo",
    "libros",
    "agendas",
    "poleras",
    "blu/cam",
    "tela",
  ];
  expected.forEach((value, index) => {
    if (headers[index] !== value)
      throw new Error(`Encabezado inesperado en la columna ${index + 1}. No se modifico la hoja.`);
  });
  if (!["dextivo", "deportivo"].includes(headers[8]) ||
      headers[9] !== "varios" ||
      headers[10] !== "otros" ||
      headers[11] !== "total")
    throw new Error("Las columnas de categorias no coinciden. No se modifico la hoja.");
}

function getSaleCategories(items) {
  const categories = Array(8).fill(0);
  items.forEach((item) => {
    const amount = Number(item.price || 0) * Number(item.quantity || 0);
    if (!Number.isFinite(amount)) return;
    const section = normalizeSection(item.section, item.category);
    categories[CATEGORY_INDEX[section]] += amount;
  });
  if (!categories.some((amount) => amount))
    categories[CATEGORY_INDEX.VARIOS] = 0;
  return categories.map(roundMoney);
}

function normalizeSection(section, category) {
  const explicit = normalizeText(section);
  if (explicit === "libros") return "LIBROS";
  if (explicit === "agendas") return "AGENDAS";
  if (explicit === "poleras") return "POLERAS";
  if (explicit === "blusas y camisas") return "BLUSAS Y CAMISAS";
  if (explicit === "tela") return "TELA";
  if (explicit === "deportivos") return "DEPORTIVOS";
  if (explicit === "varios") return "VARIOS";
  const value = normalizeText(category);
  if (value.includes("libro")) return "LIBROS";
  if (value.includes("agenda")) return "AGENDAS";
  if (value.includes("polera") || value.includes("polo")) return "POLERAS";
  if (value.includes("blusa") || value.includes("camisa")) return "BLUSAS Y CAMISAS";
  if (value.includes("tela")) return "TELA";
  if (value.includes("deport")) return "DEPORTIVOS";
  return "VARIOS";
}

function allocateCategories(categories, amount, paymentTotal) {
  if (!amount || !paymentTotal) return Array(8).fill(0);
  const total = categories.reduce((sum, value) => sum + value, 0);
  if (!total) {
    const fallback = Array(8).fill(0);
    fallback[CATEGORY_INDEX.VARIOS] = roundMoney(amount);
    return fallback;
  }
  const allocated = categories.map((value) => roundMoney((value * amount) / total));
  const difference = roundMoney(amount - allocated.reduce((sum, value) => sum + value, 0));
  const largestCategory = categories.indexOf(Math.max(...categories));
  allocated[largestCategory] = roundMoney(allocated[largestCategory] + difference);
  return allocated;
}

function makeReportRow(date, description, key, categories, receipt) {
  const total = roundMoney(categories.reduce((sum, amount) => sum + amount, 0));
  return {
    key,
    values: [
      new Date(`${date}T12:00:00-04:00`),
      description,
      receipt,
      ...categories.map(roundMoney),
      total,
    ],
  };
}

function upsertReportRows(sheet, reportRows) {
  const lastRow = sheet.getLastRow();
  const rowCount = Math.max(0, lastRow - 5);
  const existing = new Map();
  let lastDataRow = 5;
  if (rowCount) {
    const values = sheet.getRange(6, 1, rowCount, 3).getDisplayValues();
    const notes = sheet.getRange(6, 3, rowCount, 1).getNotes();
    values.forEach((row, index) => {
      if (row.some((cell) => cell.trim())) lastDataRow = index + 6;
      if (notes[index][0].startsWith("APP:"))
        existing.set(notes[index][0], index + 6);
    });
  }

  reportRows.forEach((entry) => {
    let row = existing.get(entry.key);
    if (!row) {
      row = Math.max(6, lastDataRow + 1);
      const templateRow = lastDataRow >= 9 ? lastDataRow : 9;
      if (templateRow <= sheet.getMaxRows())
        sheet.getRange(templateRow, 1, 1, 12).copyTo(
          sheet.getRange(row, 1, 1, 12),
          { formatOnly: true },
        );
      lastDataRow = row;
      existing.set(entry.key, row);
    }
    sheet.getRange(row, 1, 1, 12).setValues([entry.values]);
    sheet.getRange(row, 3).setNote(entry.key);
  });
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
