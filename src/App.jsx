import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  CalendarRange,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  LayoutDashboard,
  Menu,
  Moon,
  PackagePlus,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  isSupabaseConfigured,
  loadCloudState,
  syncCloudState,
} from "./lib/supabase";
import "./App.css";

const navItems = [
  ["Resumen", LayoutDashboard],
  ["Nueva venta", ShoppingCart],
  ["Inventario", Archive],
  ["Clientes", UsersRound],
  ["Historial", BarChart3],
  ["Caja", WalletCards],
  ["Préstamos", ClipboardList],
  ["Cuentas por cobrar", Receipt],
  ["Recordatorios", CalendarRange],
  ["Libros por curso", BookOpen],
];
const money = (value) => `Bs. ${Number(value).toFixed(2)}`;
const familyRelations = ["Estudiante", "Padre", "Madre", "Tutor", "Otro"];
const reportSections = [
  "LIBROS",
  "AGENDAS",
  "POLERAS",
  "BLUSAS Y CAMISAS",
  "TELA",
  "DEPORTIVOS",
  "VARIOS",
];
const sectionLabel = (value = "") =>
  value ? `${value.charAt(0)}${value.slice(1).toLowerCase()}` : "";

function nextCustomerId(list) {
  const used = new Set(list.map((item) => item.id));
  let index = list.length + 1;
  let id = `CLI-${String(index).padStart(3, "0")}`;
  while (used.has(id)) {
    index += 1;
    id = `CLI-${String(index).padStart(3, "0")}`;
  }
  return id;
}
function nextPurchaseOrderId(list) {
  const used = new Set(list.map((item) => item.id));
  let index = list.length + 1;
  let id = `PED-${String(index).padStart(4, "0")}`;
  while (used.has(id)) {
    index += 1;
    id = `PED-${String(index).padStart(4, "0")}`;
  }
  return id;
}
function uniqueFamilies(customers) {
  return [
    ...new Set(
      customers
        .map((customer) => String(customer.family || "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
}

function studentHasPurchasedBook(studentId, productId, sales, records) {
  return (
    sales.some(
      (sale) =>
        sale.status !== "Anulada" &&
        sale.studentId === studentId &&
        sale.items?.some((item) => item.id === productId),
    ) ||
    records.some(
      (record) =>
        record.studentId === studentId &&
        record.productId === productId &&
        record.status !== "Anulado",
    )
  );
}

function bookAssignedToCourse(product, course) {
  return (product.bookCourses || []).some(
    (assignedCourse) => normalizedValue(assignedCourse) === normalizedValue(course),
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function printCourseBooks(course, books) {
  const rows = books
    .map((book, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(book.name)}</td><td>${escapeHtml(book.id)}</td><td>${money(book.price)}</td></tr>`)
    .join("");
  printCourseDocument(
    `Lista de libros · ${course}`,
    `<h1>Lista de libros</h1><h2>${escapeHtml(course)}</h2><p>Vida y Verdad Caranavi · Gestión ${new Date().getFullYear()}</p><table><thead><tr><th>N°</th><th>Libro</th><th>Código</th><th>Precio</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No hay libros asignados a este curso.</td></tr>'}</tbody></table>`,
  );
}

function printCourseProgress(course, students, books, purchased) {
  const headers = books.map((book) => `<th>${escapeHtml(book.name)}</th>`).join("");
  const rows = students
    .map((student) => `<tr><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.guardianName || "")}</td>${books.map((book) => `<td>${purchased(student.id, book.id) ? "Comprado" : "Pendiente"}</td>`).join("")}</tr>`)
    .join("");
  printCourseDocument(
    `Control de libros · ${course}`,
    `<h1>Control de libros comprados</h1><h2>${escapeHtml(course)}</h2><p>Los libros pendientes son informativos; no representan una obligación de compra.</p><table><thead><tr><th>Estudiante</th><th>Familia</th>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${books.length + 2}">No hay estudiantes registrados en este curso.</td></tr>`}</tbody></table>`,
  );
}

function printCourseDocument(title, content) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#17212b}h1{font-size:22px;margin:0 0 6px}h2{font-size:17px;margin:0 0 8px}p{color:#555;margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #adb5bd;text-align:left}th{background:#eef2f5}td{vertical-align:top}</style></head><body>${content}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
function mergeRecords(localRecords = [], cloudRecords = []) {
  const merged = new Map(localRecords.map((record) => [record.id, record]));
  cloudRecords.forEach((record) => {
    if (record?.id) merged.set(record.id, { ...merged.get(record.id), ...record });
  });
  return [...merged.values()];
}
function normalizedValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function sameCustomer(first, second) {
  if (first.id && second.id && first.id === second.id) return true;
  const firstCarnet = normalizedValue(first.carnet);
  const secondCarnet = normalizedValue(second.carnet);
  if (firstCarnet && secondCarnet && firstCarnet === secondCarnet) return true;
  return (
    normalizedValue(first.name) === normalizedValue(second.name) &&
    normalizedValue(first.phone) === normalizedValue(second.phone)
  );
}
function sameProduct(first, second) {
  if (first.id && second.id && first.id === second.id) return true;
  return (
    normalizedValue(first.name) === normalizedValue(second.name) &&
    normalizedValue(first.unit || "und.") === normalizedValue(second.unit || "und.")
  );
}
function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
function readMaterials() {
  const current = readStorage("vida-verdad-materials", null);
  const legacy = readStorage("vida-verdad-materials-v1", null);
  return current?.length ? current : legacy?.length ? legacy : [];
}
const monthlyTasks = [
  { id: "personal-deductions", day: 1, title: "Empezar a calcular descuentos del personal", office: "Personal del colegio" },
  { id: "infocred", day: 10, title: "Declarar planilla de deudores", office: "INFOCRED" },
  { id: "sedem", day: 10, title: "Registrar planilla", office: "SEDEM" },
  { id: "labor-ministry", day: 11, title: "Declarar planilla de cuentas por cobrar", office: "Ministerio de Trabajo" },
  { id: "gestora", day: 21, title: "Declarar planilla", office: "Gestora" },
];
function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function currentMonthlyReminders(date = new Date(), completed = {}) {
  const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return monthlyTasks.flatMap((task) => {
    const due = new Date(date.getFullYear(), date.getMonth(), task.day);
    const daysUntilDue = Math.ceil((due - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
    if (completed[`${period}:${task.id}`] || daysUntilDue > 3) return [];
    return [{ ...task, period, daysUntilDue }];
  });
}
function productsFromSalesHistory(sales) {
  const recovered = new Map();
  for (const sale of sales) {
    for (const line of sale.items || []) {
      if (!line?.id || !line?.name) continue;
      const existing = recovered.get(line.id);
      const saleTime = Date.parse(sale.date || sale.sold_at || "") || 0;
      if (existing && existing.saleTime >= saleTime) continue;
      const category = line.category || "Otros";
      recovered.set(line.id, {
        id: line.id,
        name: line.name,
        category,
        section: reportGroup(category, line.section),
        price: Number(line.price || 0),
        purchaseCost: Number(line.purchaseCost || 0),
        stock: 0,
        minStock: 5,
        unit: line.unit || "und.",
        saleTime,
      });
    }
  }
  return [...recovered.values()].map((product) => {
    const recoveredProduct = { ...product };
    delete recoveredProduct.saleTime;
    return recoveredProduct;
  });
}

function printElement(selector, kind = "receipt") {
  const element = document.querySelector(selector);
  if (!element) return;
  const printWindow = window.open("", "_blank", "width=480,height=700");
  if (!printWindow) return;
  const content =
    kind === "qr"
      ? element.outerHTML
      : element.outerHTML.replace(
          /<div class="modal-actions">[\s\S]*?<\/div>/,
          "",
        );
  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html><head><title>Comprobante Vida y Verdad</title><style>@page{size:${kind === "qr-sheet" ? "A4 portrait" : kind === "qr" ? "auto" : "80mm auto"};margin:${kind === "qr-sheet" ? "8mm" : "0"}}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{display:${kind === "qr-sheet" ? "block" : "flex"};justify-content:center;align-items:flex-start;min-height:100vh;padding:${kind === "qr-sheet" ? "0" : kind === "qr" ? "20mm" : "4mm"};font-family:Arial,sans-serif;color:#17212b}.qr-print-only svg{display:block;width:210px;height:210px}.qr-sheet-print-only{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3mm}.qr-sheet-label{display:grid;grid-template-columns:20mm minmax(0,1fr);align-items:center;gap:2mm;min-height:27mm;padding:1mm;border:1px solid #ddd;break-inside:avoid;overflow:hidden}.qr-sheet-label svg{display:block;width:20mm;height:20mm}.qr-sheet-label span{min-width:0;overflow-wrap:anywhere;font-size:7pt;line-height:1.2}.qr-sheet-label strong{display:block;font-size:8pt;margin-bottom:1mm}.receipt-modal{width:72mm;max-width:72mm;padding:0;box-shadow:none;background:#fff}.receipt-modal .close-button,.receipt-modal .modal-actions{display:none!important}.receipt-top{display:flex;align-items:center;gap:8px;background:#f7faf8;border-bottom:2px solid #1118a8;box-shadow:inset 4px 0 0 #e30613;padding:8px 6px 10px}.receipt-top>span{display:flex;flex:1;flex-direction:column;gap:3px}.receipt-top strong{display:block;font-size:12px;line-height:1.15}.receipt-top small{display:block;color:#1118a8;font-size:8px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.receipt-logo{width:36px;height:36px;object-fit:contain;flex-shrink:0}.receipt-number{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px;align-items:start;padding:11px 0 9px;border-bottom:1px solid #e2e5ed;font-size:10px}.receipt-number span{font-weight:600;white-space:nowrap}.receipt-number small{min-width:0;text-align:right;font-size:8px;line-height:1.3;overflow-wrap:anywhere}.receipt-lines{display:flex;flex-direction:column}.receipt-lines>div{display:grid;grid-template-columns:minmax(0,1fr) max-content;align-items:start;gap:8px;padding:8px 0;border-bottom:1px solid #e2e5ed;font-size:10px;line-height:1.3}.receipt-lines>div>span{min-width:0;overflow-wrap:anywhere}.receipt-lines strong{display:block}.receipt-lines small{display:block;color:#667085;font-size:8px;margin-top:2px}.receipt-lines b{white-space:nowrap;font-size:10px}.receipt-total{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 0 9px;border-bottom:1px solid #e2e5ed}.receipt-total span{font-size:11px}.receipt-total strong{color:#176c67;font-size:20px;white-space:nowrap}.receipt-note{margin:12px 0 0;text-align:center;color:#667085;font-size:8px!important;line-height:1.45}.receipt-signature{page-break-inside:avoid;margin-top:16px;padding-top:10px;border-top:1px solid #e2e5ed}.signature-fields{display:block}.signature-line{position:relative;min-height:38px;border-bottom:1px solid #17212b;padding-top:24px}.signature-line span{position:absolute;top:6px;left:0;color:#667085;font-size:8px}.receipt-footer{display:flex;flex-direction:column;gap:3px;margin-top:16px;padding-top:8px;border-top:1px solid #e2e5ed;text-align:center;color:#667085;font-size:8px}.receipt-footer strong{color:#1118a8;font-size:9px;letter-spacing:.06em}.receipt-institution{text-align:center;font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#1118a8;margin:5px 0 0}</style></head><body>${content}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function printInventoryReport(reportData, totals, range) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) return;

  const fmtDate = (value) => {
    if (!value) return "—";
    const d = new Date(value + "T00:00:00");
    return d.toLocaleDateString("es-BO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const periodLabel =
    range.start || range.end
      ? `Del ${range.start ? fmtDate(range.start) : "inicio"} al ${range.end ? fmtDate(range.end) : "hoy"}`
      : "Todo el período";

  const rowsHtml = reportData
    .map(
      (p) => `
      <tr>
        <td class="product-cell">
          <strong>${p.name}</strong>
          <small>${p.id}</small>
        </td>
        <td class="num">Bs. ${Number(p.purchaseCost || 0).toFixed(2)}</td>
        <td class="num">Bs. ${Number(p.salePrice || 0).toFixed(2)}</td>
        <td class="num">${p.initialStock} ${p.unit}</td>
        <td class="num">${p.sold} ${p.unit}</td>
        <td class="num">${p.finalStock} ${p.unit}</td>
        <td class="num">Bs. ${Number(p.finalCostValue || 0).toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Informe de Inventario · Vida y Verdad Caranavi</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Helvetica', 'Arial', sans-serif;
          color: #17212b;
          margin: 0;
          padding: 0;
          font-size: 10px;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 3px solid #1118a8;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .header img { width: 54px; height: 54px; object-fit: contain; }
        .header-text { flex: 1; }
        .header-text h1 {
          margin: 0;
          font-size: 20px;
          color: #1118a8;
          letter-spacing: -.3px;
        }
        .header-text small {
          display: block;
          color: #667085;
          font-size: 10px;
          margin-top: 3px;
        }
        .doc-title {
          background: #f5f6fb;
          border-left: 4px solid #e30613;
          padding: 8px 12px;
          margin-bottom: 16px;
        }
        .doc-title h2 {
          margin: 0;
          font-size: 16px;
          color: #17212b;
        }
        .doc-title p {
          margin: 3px 0 0;
          font-size: 10px;
          color: #667085;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5px;
        }
        thead th {
          background: #1118a8;
          color: #fff;
          text-align: left;
          padding: 7px 6px;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: .03em;
          border: 1px solid #1118a8;
        }
        thead th.num { text-align: right; }
        tbody td {
          padding: 6px;
          border-bottom: 1px solid #e2e5ed;
          vertical-align: top;
        }
        tbody td.num { text-align: right; white-space: nowrap; }
        tbody tr:nth-child(even) { background: #fafbfd; }
        .product-cell strong { display: block; font-size: 10px; }
        .product-cell small { display: block; color: #667085; font-size: 8px; margin-top: 1px; }
        tfoot td {
          padding: 8px 6px;
          border-top: 2px solid #17212b;
          background: #f5f6fb;
          font-weight: 700;
          font-size: 10px;
        }
        tfoot td.num { text-align: right; }
        .summary {
          margin-top: 20px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .summary-card {
          border: 1px solid #e2e5ed;
          border-radius: 6px;
          padding: 10px 12px;
          background: #f8fbf9;
        }
        .summary-card span {
          display: block;
          font-size: 8px;
          color: #667085;
          text-transform: uppercase;
          letter-spacing: .04em;
          font-weight: 700;
        }
        .summary-card strong {
          display: block;
          font-size: 13px;
          color: #1118a8;
          margin-top: 4px;
        }
        .footer {
          margin-top: 26px;
          padding-top: 10px;
          border-top: 1px solid #e2e5ed;
          display: flex;
          justify-content: space-between;
          font-size: 8px;
          color: #667085;
        }
        .signatures {
          margin-top: 40px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
        }
        .signature-line {
          border-top: 1px solid #17212b;
          padding-top: 4px;
          text-align: center;
          font-size: 8px;
          color: #667085;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="/logo-vida-verdad.jpg" alt="Logo" />
        <div class="header-text">
          <h1>Vida y Verdad Caranavi</h1>
          <small>Gestión comercial · Sistema de control de inventario</small>
        </div>
      </div>

      <div class="doc-title">
        <h2>Informe de Inventario</h2>
        <p>${periodLabel} · Emitido el ${new Date().toLocaleString("es-BO", { dateStyle: "long", timeStyle: "short" })}</p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th class="num">Costo compra</th>
            <th class="num">Precio venta</th>
            <th class="num">Inv. inicial</th>
            <th class="num">Cant. vendida</th>
            <th class="num">Saldo final</th>
            <th class="num">Valor costo final</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTALES</td>
            <td class="num">—</td>
            <td class="num">—</td>
            <td class="num">${totals.initialStock} und.</td>
            <td class="num">${totals.sold} und.</td>
            <td class="num">${totals.finalStock} und.</td>
            <td class="num">Bs. ${Number(totals.finalCostValue).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="summary">
        <div class="summary-card">
          <span>Valor inicial al costo</span>
          <strong>Bs. ${Number(totals.initialCostValue).toFixed(2)}</strong>
        </div>
        <div class="summary-card">
          <span>Ventas a precio de venta</span>
          <strong>Bs. ${Number(totals.soldSalesValue).toFixed(2)}</strong>
        </div>
        <div class="summary-card">
          <span>Costo de lo vendido</span>
          <strong>Bs. ${Number(totals.soldCostValue).toFixed(2)}</strong>
        </div>
        <div class="summary-card">
          <span>Margen bruto estimado</span>
          <strong>Bs. ${Number(totals.grossMarginValue).toFixed(2)}</strong>
        </div>
      </div>

      <div class="signatures">
        <div class="signature-line">Elaborado por</div>
        <div class="signature-line">Revisado por auditoría</div>
      </div>

      <div class="footer">
        <span>Colegio Vida y Verdad · Caranavi</span>
        <span>Documento generado automáticamente</span>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

function parseCsv(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((row) =>
      row
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map((cell) => cell.trim().replace(/^"|"$/g, "")),
    )
    .filter(Boolean);
  if (!rows.length) return [];
  const headers = rows.shift().map((header) =>
    header
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_"),
  );
  return rows.map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, row[index] || ""]),
    ),
  );
}
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function downloadCsv(filename, headers, rows) {
  const content = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function ProductIcon({ category }) {
  const Icon =
    category === "Uniformes"
      ? UserRound
      : category === "Fotocopias"
        ? FileText
        : BookOpen;
  return (
    <span
      className={`product-icon ${category === "Uniformes" ? "coral" : category === "Fotocopias" ? "blue" : "green"}`}
    >
      <Icon size={18} />
    </span>
  );
}

function App() {
  const [products, setProducts] = useState(() =>
    (() => {
      const stored = readStorage("vida-verdad-products", []);
      const knownIds = new Set(stored.map((product) => product.id));
      const recovered = productsFromSalesHistory(
        readStorage("vida-verdad-sales", []),
      ).filter((product) => !knownIds.has(product.id));
      return [...stored, ...recovered];
    })(),
  );
  const [sales, setSales] = useState(() => readStorage("vida-verdad-sales", []));
  const [materials, setMaterials] = useState(readMaterials);
  const [loans, setLoans] = useState(() => readStorage("vida-verdad-loans", []));
  const [teachers, setTeachers] = useState(() =>
    readStorage("vida-verdad-teachers", []),
  );
  const [customers, setCustomers] = useState(() =>
    readStorage("vida-verdad-customers", []),
  );
  const [students, setStudents] = useState(() =>
    readStorage("vida-verdad-students", []),
  );
  const [studentBookRecords, setStudentBookRecords] = useState(() =>
    readStorage("vida-verdad-student-book-records", []),
  );
  const [purchaseOrders, setPurchaseOrders] = useState(() =>
    readStorage("vida-verdad-purchase-orders", []),
  );
  const [cash, setCash] = useState(() =>
    readStorage("vida-verdad-cash", { opening: 0, movements: [] }),
  );
  const [receivables, setReceivables] = useState(() =>
    readStorage("vida-verdad-receivables", []),
  );
  const productsRef = useRef(products);
  const salesRef = useRef(sales);
  const [theme, setTheme] = useState(() =>
    readStorage("vida-verdad-theme", "light"),
  );
  const [remindersCompleted, setRemindersCompleted] = useState(() =>
    readStorage("vida-verdad-reminders-completed", {}),
  );
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured ? "loading" : "local",
  );
  const [schemaWarnings, setSchemaWarnings] = useState([]);
  const [syncedRecordCounts, setSyncedRecordCounts] = useState({});
  const [syncVersion, setSyncVersion] = useState(0);
  const [cloudRetry, setCloudRetry] = useState(0);
  const [activeNav, setActiveNav] = useState("Resumen");
  const [cart, setCart] = useState([]);
  const [selectedSaleStudentId, setSelectedSaleStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [historyFilter, setHistoryFilter] = useState("Todos");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [summaryStartDate, setSummaryStartDate] = useState("");
  const [summaryEndDate, setSummaryEndDate] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [qrSheetOpen, setQrSheetOpen] = useState(false);
  const [selectedLoanMaterial, setSelectedLoanMaterial] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState(null);
  const [printPurchaseOrder, setPrintPurchaseOrder] = useState(null);
  const [scanValue, setScanValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loanScan, setLoanScan] = useState(false);
  const scannerRef = useRef(null);
  const addToCartRef = useRef(null);
  const loanScanHandlerRef = useRef(null);
  const lastScanRef = useRef({ value: "", time: 0 });
  const cloudReadyRef = useRef(!isSupabaseConfigured);
  const cloudSkipTablesRef = useRef([]);
  const cloudOmittedColumnsRef = useRef(
    readStorage("vida-verdad-supabase-omitted-columns", {}),
  );
  const cloudBaselineRef = useRef({});
  const syncErrorShownRef = useRef(false);
  const syncQueueRef = useRef(Promise.resolve());
  const syncAttemptRef = useRef(0);
  const syncTimerRef = useRef(null);
  const forceFullSyncRef = useRef(false);
  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => {
    const nativePrint = window.print.bind(window);
    window.print = () => {
      if (document.querySelector(".qr-print-only"))
        printElement(".qr-print-only", "qr");
      else if (document.querySelector(".receipt-modal"))
        printElement(".receipt-modal");
      else nativePrint();
    };
    return () => {
      window.print = nativePrint;
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("vida-verdad-theme", JSON.stringify(theme));
  }, [theme]);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);
  useEffect(() => {
    salesRef.current = sales;
  }, [sales]);
  useEffect(() => {
    localStorage.setItem(
      "vida-verdad-reminders-completed",
      JSON.stringify(remindersCompleted),
    );
  }, [remindersCompleted]);
  useEffect(() => {
    const persistState = () => {
      localStorage.setItem("vida-verdad-products", JSON.stringify(products));
      localStorage.setItem("vida-verdad-sales", JSON.stringify(sales));
      localStorage.setItem("vida-verdad-customers", JSON.stringify(customers));
      localStorage.setItem("vida-verdad-students", JSON.stringify(students));
      localStorage.setItem("vida-verdad-student-book-records", JSON.stringify(studentBookRecords));
      localStorage.setItem("vida-verdad-purchase-orders", JSON.stringify(purchaseOrders));
      localStorage.setItem("vida-verdad-materials", JSON.stringify(materials));
      localStorage.setItem("vida-verdad-loans", JSON.stringify(loans));
      localStorage.setItem("vida-verdad-teachers", JSON.stringify(teachers));
      localStorage.setItem("vida-verdad-cash", JSON.stringify(cash));
      localStorage.setItem("vida-verdad-receivables", JSON.stringify(receivables));
    };
    window.addEventListener("beforeunload", persistState);
    return () => window.removeEventListener("beforeunload", persistState);
  }, [products, sales, customers, students, studentBookRecords, materials, loans, teachers, cash, purchaseOrders, receivables]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-products", JSON.stringify(products));
  }, [products]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-sales", JSON.stringify(sales));
  }, [sales]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-customers", JSON.stringify(customers));
  }, [customers]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-students", JSON.stringify(students));
  }, [students]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-student-book-records", JSON.stringify(studentBookRecords));
  }, [studentBookRecords]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-purchase-orders", JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-receivables", JSON.stringify(receivables));
  }, [receivables]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-materials", JSON.stringify(materials));
    localStorage.setItem("vida-verdad-loans", JSON.stringify(loans));
    localStorage.setItem("vida-verdad-teachers", JSON.stringify(teachers));
    localStorage.setItem("vida-verdad-cash", JSON.stringify(cash));
  }, [materials, loans, teachers, cash]);
  useEffect(() => {
    cloudReadyRef.current = !isSupabaseConfigured;
    loadCloudState()
      .then((cloud) => {
        if (!cloud) {
          setSyncStatus("local");
          return;
        }
        cloudSkipTablesRef.current = cloud.missingTables || [];
        cloudBaselineRef.current = cloud;
        setSchemaWarnings(cloudSkipTablesRef.current);
        setSyncedRecordCounts(
          Object.fromEntries(
            Object.entries(cloud)
              .filter(([, rows]) => Array.isArray(rows))
              .map(([table, rows]) => [table, rows.length]),
          ),
        );
        if (cloudSkipTablesRef.current.length)
          showToast("Supabase conectado. Ejecuta supabase-schema.sql para habilitar las tablas nuevas.");
        const mergedProducts = cloud.products?.length
          ? mergeRecords(productsRef.current, cloud.products).map((product) => ({
              ...product,
              price: Number(product.price || 0),
              stock: Number(product.stock || 0),
              purchaseCost:
                Number(product.purchase_cost ?? product.purchaseCost ?? 0),
              minStock: Number(product.min_stock ?? product.minStock ?? 5),
              bookCourses: product.book_courses || product.bookCourses || [],
            }))
          : productsRef.current;
        const mergedSales = cloud.sales?.length
          ? mergeRecords(salesRef.current, cloud.sales).map((sale) => ({
              ...sale,
              date: sale.sold_at || sale.date,
              total: Number(sale.total || 0),
              cashAmount: Number(sale.cash_amount ?? sale.cashAmount ?? 0),
              qrAmount: Number(sale.qr_amount ?? sale.qrAmount ?? 0),
              items: (sale.items || []).map((item) => ({
                ...item,
                price: Number(item.price || 0),
                quantity: Number(item.quantity || 0),
              })),
              status: sale.status || "Vigente",
              voidedAt: sale.voided_at || sale.voidedAt,
              customerId: sale.customer_id || sale.customerId || "",
              family: sale.family || "",
              relation: sale.relation || "",
              payer: sale.payer || "",
              payerId: sale.payer_id || sale.payerId || "",
              payerRelation: sale.payer_relation || sale.payerRelation || "",
              studentId: sale.student_id || sale.studentId || "",
            }))
          : salesRef.current;
        const knownProductIds = new Set(mergedProducts.map((product) => product.id));
        const recoveredProducts = productsFromSalesHistory(mergedSales).filter(
          (product) => !knownProductIds.has(product.id),
        );
        setProducts([...mergedProducts, ...recoveredProducts]);
        setSales(mergedSales);
        if (recoveredProducts.length)
          showToast(
            `${recoveredProducts.length} producto(s) recuperados del historial con stock 0; confirma las existencias reales`,
          );
        if (cloud.materials?.length) setMaterials((current) => mergeRecords(current, cloud.materials));
        if (cloud.loans?.length)
          setLoans((current) =>
            mergeRecords(current, cloud.loans).map((loan) => ({
              ...loan,
              materialId: loan.material_id || loan.materialId || "",
              teacherId: loan.teacher_id || loan.teacherId || "",
              due: loan.due || "",
              date: loan.loaned_at || loan.date,
            })),
          );
        if (cloud.teachers?.length) setTeachers((current) => mergeRecords(current, cloud.teachers));
        if (cloud.customers?.length) setCustomers((current) => mergeRecords(current, cloud.customers));
        if (cloud.students?.length)
          setStudents((current) =>
            mergeRecords(current, cloud.students).map((student) => ({
              ...student,
              guardianId: student.guardian_id || student.guardianId || "",
              guardianName: student.guardian_name || student.guardianName || "",
              createdAt: student.created_at || student.createdAt || "",
            })),
          );
        if (cloud.student_book_records?.length)
          setStudentBookRecords((current) =>
            mergeRecords(current, cloud.student_book_records).map((record) => ({
              ...record,
              studentId: record.student_id || record.studentId,
              productId: record.product_id || record.productId,
              purchasedAt: record.purchased_at || record.purchasedAt || "",
            })),
          );
        if (cloud.purchase_orders?.length)
          setPurchaseOrders((current) =>
            mergeRecords(current, cloud.purchase_orders).map((order) => ({
              ...order,
              total: Number(order.total || 0),
              paid: Number(order.paid || 0),
              balance: Number(order.balance || 0),
              items: (order.items || []).map((item) => ({
                ...item,
                quantity: Number(item.quantity || 0),
                unitCost: Number(item.unitCost || item.unit_cost || 0),
                received: Number(item.received || 0),
              })),
              date: order.ordered_at || order.date,
              receivedAt: order.received_at || order.receivedAt || "",
            })),
          );
        if (cloud.cash_movements?.length)
          setCash((current) => ({
            ...current,
            movements: mergeRecords(current.movements, cloud.cash_movements).map((movement) => ({
              ...movement,
              productId: movement.product_id || movement.productId || "",
              amount: Number(movement.amount || 0),
              operation: movement.operation || "",
              reason: movement.reason || "",
              quantity: Number(movement.quantity ?? 0),
              cashAmount: Number(movement.cash_amount ?? movement.cashAmount ?? 0),
              qrAmount: Number(movement.qr_amount ?? movement.qrAmount ?? 0),
              date: movement.moved_at || movement.date,
            })),
          }));
        if (cloud.accounts_receivable?.length)
          setReceivables((current) =>
            mergeRecords(current, cloud.accounts_receivable).map((record) => ({
              ...record,
              guardianName: record.guardian_name || record.guardianName || "",
              studentName: record.student_name || record.studentName || "",
              carnet: record.carnet || "",
              family: record.family || "",
              gestion: record.gestion || "",
              total: Number(record.total || 0),
              paid: Number(record.paid || 0),
              paymentHistory: record.payment_history || record.paymentHistory || [],
              contract: record.contract || "",
              commitment: record.commitment || "",
              infocredStatus: record.infocred_status || record.infocredStatus || "Pendiente",
              createdAt: record.created_at || record.createdAt || "",
            })),
          );
        const cashSettings = cloud.app_settings?.find((setting) => setting.id === "cash");
        if (cashSettings?.value)
          setCash((current) => ({
            ...current,
            opening: Number(cashSettings.value.opening ?? current.opening ?? 0),
          }));
        cloudReadyRef.current = true;
        setSyncStatus(cloudSkipTablesRef.current.length ? "schema" : "synced");
      })
      .catch((error) => {
        cloudReadyRef.current = false;
        setSyncStatus("error");
        showToast(error.message || "No se pudo cargar la información de Supabase");
      });
  }, [cloudRetry, showToast]);
  useEffect(() => {
    if (!isSupabaseConfigured || !cloudReadyRef.current) return undefined;
    const attempt = ++syncAttemptRef.current;
    const snapshot = {
      products,
      sales,
      materials,
      loans,
      teachers,
      customers,
      purchaseOrders,
      cash,
      receivables,
      students,
      studentBookRecords,
      skipTables: cloudSkipTablesRef.current,
      omittedColumns: cloudOmittedColumnsRef.current,
      baseline: cloudBaselineRef.current,
      forceFullSync: forceFullSyncRef.current,
    };
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setSyncStatus("syncing");
      syncQueueRef.current = syncQueueRef.current
        .catch(() => {})
        .then(() => syncCloudState(snapshot))
        .then(({ counts, baseline, omittedColumns, missingColumns }) => {
          if (attempt !== syncAttemptRef.current) return;
          cloudBaselineRef.current = baseline;
          cloudOmittedColumnsRef.current = omittedColumns;
          localStorage.setItem(
            "vida-verdad-supabase-omitted-columns",
            JSON.stringify(omittedColumns),
          );
          setSchemaWarnings([
            ...cloudSkipTablesRef.current,
            ...missingColumns,
          ]);
          forceFullSyncRef.current = false;
          syncErrorShownRef.current = false;
          setSyncedRecordCounts(counts);
          setSyncStatus(
            cloudSkipTablesRef.current.length || missingColumns.length
              ? "schema"
              : "synced",
          );
        })
        .catch((error) => {
          if (attempt !== syncAttemptRef.current) return;
          setSyncStatus("error");
          if (!syncErrorShownRef.current) {
            syncErrorShownRef.current = true;
            showToast(error.message || "No se pudieron sincronizar los cambios");
          }
        });
    }, 250);
    return () => window.clearTimeout(syncTimerRef.current);
  }, [products, sales, materials, loans, teachers, customers, cash, purchaseOrders, receivables, students, studentBookRecords, syncVersion, showToast]);
  useEffect(() => {
    const openQr = (event) => setSelectedQr(event.detail);
    window.addEventListener("open-material-qr", openQr);
    return () => window.removeEventListener("open-material-qr", openQr);
  }, []);
  useEffect(() => {
    if (activeNav !== "Préstamos") return undefined;
    const tools = document.createElement("div");
    tools.className = "loan-floating-actions";
    const addButton = document.createElement("button");
    addButton.className = "primary-button small";
    addButton.textContent = "+ Agregar objeto";
    addButton.onclick = () => {
      const name = window.prompt("Nombre del material prestable");
      if (!name?.trim()) return;
      const category =
        window.prompt("Categoría del material", "Tecnología") || "Otros";
      const location = window.prompt("Ubicación", "Depósito A") || "Depósito A";
      const material = {
        id: `MAT-${String(materials.length + 1).padStart(3, "0")}`,
        name: name.trim(),
        category,
        location,
        status: "Disponible",
        borrower: "",
        due: "",
      };
      setMaterials((current) => [...current, material]);
      setSelectedQr(material);
      showToast("Objeto añadido y QR generado");
    };
    const scanButton = document.createElement("button");
    scanButton.className = "secondary-button small";
    scanButton.textContent = "QR Registrar préstamo";
    scanButton.onclick = () => {
      setLoanScan(true);
      setScanValue("");
      setModal("scan");
    };
    tools.append(addButton, scanButton);
    document.querySelector(".loans-layout .panel")?.prepend(tools);
    return () => tools.remove();
  }, [activeNav, materials.length, showToast]);
  useEffect(() => {
    if (activeNav !== "Préstamos") return undefined;
    const panel = document.querySelector(".loans-layout .panel");
    if (!panel) return undefined;
    const searchBox = document.createElement("div");
    searchBox.className = "loan-search search-box";
    searchBox.innerHTML =
      '<span aria-hidden="true">⌕</span><input placeholder="Buscar objeto, código o ubicación" />';
    const input = searchBox.querySelector("input");
    const filter = () => {
      const query = input.value.toLowerCase();
      panel.querySelectorAll(".loan-card").forEach((card) => {
        card.style.display = card.textContent.toLowerCase().includes(query)
          ? ""
          : "none";
      });
    };
    input.addEventListener("input", filter);
    panel.querySelector(".loan-floating-actions")?.after(searchBox);
    return () => {
      input.removeEventListener("input", filter);
      searchBox.remove();
    };
  }, [activeNav, materials.length]);
  function stopScanner() {
    if (scannerRef.current?.isScanning)
      scannerRef.current.stop().catch(() => {});
    scannerRef.current = null;
  }
  useEffect(() => {
    if (modal !== "scan") return undefined;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 190, height: 190 } },
        (value) => {
          const now = Date.now();
          if (
            lastScanRef.current.value === value &&
            now - lastScanRef.current.time < 900
          )
            return;
          lastScanRef.current = { value, time: now };
          setScanValue(value);
          if (loanScan) {
            stopScanner();
            loanScanHandlerRef.current?.(value);
            return;
          }
          const product = products.find(
            (item) => item.id === value.trim().toUpperCase(),
          );
          if (product) {
            addToCartRef.current?.(product);
            setScanValue("");
            return;
          }
          showToast("Código de producto no registrado");
        },
        () => {},
      )
      .catch(() => {});
    return () => stopScanner();
  }, [modal, loanScan, products, showToast]);
  const saleTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (item) =>
          (category === "Todos" || item.category === category) &&
          `${item.name} ${item.id}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [products, search, category],
  );
  const addToCart = useCallback((product) => {
    if (product.stock <= 0) return showToast("Producto sin stock");
    if (product.bookCourses?.length) {
      const student = students.find((item) => item.id === selectedSaleStudentId);
      if (!student)
        return showToast("Selecciona al estudiante para vender sus libros");
      if (!bookAssignedToCourse(product, student.course))
        return showToast(`${product.name} no está asignado al curso ${student.course}`);
      if (studentHasPurchasedBook(student.id, product.id, sales, studentBookRecords))
        return showToast(`${student.name} ya tiene registrado este libro`);
      if (cart.some((item) => item.id === product.id))
        return showToast("Este libro ya está en la venta para el estudiante");
    }
    setCart((current) =>
      current.some((item) => item.id === product.id)
        ? current.map((item) =>
            item.id === product.id && item.quantity < product.stock
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [...current, { ...product, quantity: 1 }],
    );
    showToast(`${product.name} añadido a la venta`);
  }, [students, selectedSaleStudentId, sales, studentBookRecords, cart, showToast]);
  useEffect(() => {
    addToCartRef.current = addToCart;
  }, [addToCart]);
  const updateQuantity = (id, quantity) =>
    setCart((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: Math.max(
                item.unit === "cm" || item.unit === "m" ? 0.01 : 1,
                Math.min(
                  products.find((product) => product.id === id)?.bookCourses?.length
                    ? 1
                    : Number(quantity) || (item.unit === "cm" || item.unit === "m" ? 0.01 : 1),
                  products.find((product) => product.id === id)?.stock || 1,
                ),
              ),
            }
          : item,
      ),
    );
  const completeSale = (event) => {
    event.preventDefault();
    if (!cart.length) return showToast("Agrega productos antes de cobrar");
    const data = new FormData(event.currentTarget);
    const payment = data.get("payment");
    const cashAmount =
      payment === "Ambos"
        ? Number(data.get("cashAmount") || 0)
        : payment === "Efectivo"
          ? saleTotal
          : 0;
    const qrAmount =
      payment === "Ambos"
        ? Number(data.get("qrAmount") || 0)
        : payment === "QR"
          ? saleTotal
          : 0;
    if (Math.abs(cashAmount + qrAmount - saleTotal) > 0.01)
      return showToast("El efectivo y QR deben sumar el total");
    const unavailable = cart.find(
      (item) =>
        (products.find((product) => product.id === item.id)?.stock || 0) <
        item.quantity,
    );
    if (unavailable)
      return showToast(`Stock insuficiente: ${unavailable.name}`);
    const student = students.find((item) => item.id === selectedSaleStudentId);
    const courseBook = cart.find((item) => item.bookCourses?.length);
    if (courseBook && !student)
      return showToast("Selecciona al estudiante para registrar la compra de libros");
    if (courseBook && cart.some((item) => item.bookCourses?.length &&
      (!bookAssignedToCourse(item, student.course) ||
        item.quantity > 1 ||
        studentHasPurchasedBook(student.id, item.id, sales, studentBookRecords))))
      return showToast("Revisa el curso y los libros ya registrados para este estudiante");
    const customer = data.get("customer") || "Familia del colegio";
    const customerRecord = customers.find(
      (item) => item.id === customer || item.name === customer,
    );
    const sale = {
      id: `V-${String(sales.length + 1).padStart(5, "0")}`,
      date: new Date().toISOString(),
      status: "Vigente",
      customer: customerRecord?.name || customer,
      customerId: customerRecord?.id || "",
      carnet: customerRecord?.carnet || "",
      family: customerRecord?.family || "",
      relation: customerRecord?.relation || "",
      payer: customerRecord?.name || "",
      payerId: customerRecord?.id || "",
      payerRelation: customerRecord?.relation || "",
      studentId: student?.id || "",
      payment,
      cashAmount,
      qrAmount,
      items: cart,
      total: saleTotal,
    };
    setSales((current) => [sale, ...current]);
    setProducts((current) =>
      current.map((product) => {
        const line = cart.find((item) => item.id === product.id);
        return line
          ? { ...product, stock: product.stock - line.quantity }
          : product;
      }),
    );
    setCash((current) => ({
      ...current,
      movements: [
        {
          id: sale.id,
          type: "Ingreso",
          concept: `Venta ${sale.id}`,
          amount: saleTotal,
          cashAmount,
          qrAmount,
          date: sale.date,
          payment,
        },
        ...current.movements,
      ],
    }));
    setCart([]);
    setSelectedSaleStudentId("");
    setModal(null);
    setSelectedSale(sale);
    showToast(`Venta ${sale.id} registrada`);
  };
  const voidSale = (sale) => {
    if (!sale || sale.status === "Anulada")
      return showToast("Este recibo ya está anulado");
    if (!window.confirm(`¿Anular el recibo ${sale.id}? Se devolverá el stock.`))
      return;
    const voided = {
      ...sale,
      status: "Anulada",
      voidedAt: new Date().toISOString(),
    };
    setSales((current) =>
      current.map((item) => (item.id === sale.id ? voided : item)),
    );
    setProducts((current) =>
      current.map((product) => {
        const line = sale.items.find((item) => item.id === product.id);
        return line
          ? { ...product, stock: product.stock + line.quantity }
          : product;
      }),
    );
    setCash((current) => ({
      ...current,
      movements: [
        {
          id: `AN-${sale.id}`,
          type: "Egreso",
          concept: `Anulación ${sale.id}`,
          amount: sale.total,
          cashAmount: sale.cashAmount,
          qrAmount: sale.qrAmount,
          date: new Date().toISOString(),
          payment: sale.payment,
        },
        ...current.movements,
      ],
    }));
    setSelectedSale(voided);
    showToast(`Recibo ${sale.id} anulado y stock restaurado`);
  };
  const voidMovement = (movement) => {
    if (!movement || movement.status === "Anulada")
      return showToast("Este comprobante ya está anulado");
    if (!window.confirm(`¿Anular el comprobante ${movement.id}?`)) return;
    const voided = { ...movement, status: "Anulada", voidedAt: new Date().toISOString() };
    setCash((current) => ({
      ...current,
      movements: current.movements.map((item) =>
        item.id === movement.id ? voided : item,
      ),
    }));
    setSelectedSale(voided);
    showToast(`Comprobante ${movement.id} anulado`);
  };
  const voidEntry = (entry) =>
    entry.kind === "Venta" ? voidSale(entry) : voidMovement(entry);
  const handleScan = () => {
    if (loanScan) return loanScanHandlerRef.current?.();
    const product = products.find(
      (item) => item.id === scanValue.trim().toUpperCase(),
    );
    if (product) {
      addToCart(product);
      setScanValue("");
      return;
    }
    showToast("Código no registrado");
  };
  const handleLoanScan = (value = scanValue) => {
    const material = materials.find(
      (item) => item.id === value.trim().toUpperCase(),
    );
    if (!material) return showToast("QR de material no registrado");
    if (material.status !== "Disponible")
      return showToast("Ese material no está disponible");
    setLoanScan(false);
    setScanValue("");
    setSelectedLoanMaterial(material);
    setModal("loan");
  };
  useEffect(() => {
    loanScanHandlerRef.current = handleLoanScan;
  });
  const addProduct = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const product = {
      id: `PRD-${String(products.length + 1).padStart(3, "0")}`,
      name: data.get("name"),
      category: data.get("category"),
      section: reportGroup(data.get("category"), data.get("section")),
      price: Number(data.get("price")),
      purchaseCost: Number(data.get("purchaseCost") || 0),
      stock: Number(data.get("stock")),
      minStock: 5,
      unit: data.get("unit") || "und.",
    };
    if (products.some((item) => sameProduct(item, product))) {
      showToast("Ese producto ya está registrado");
      return;
    }
    setProducts((current) => [...current, product]);
    setModal(null);
    showToast("Producto añadido al inventario");
  };
  const editProduct = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProducts((current) =>
      current.map((product) =>
        product.id === editingProduct.id
          ? {
              ...product,
              name: data.get("name"),
              category: data.get("category"),
              section: reportGroup(data.get("category"), data.get("section")),
              price: Number(data.get("price")),
              purchaseCost: Number(data.get("purchaseCost") || 0),
              unit: data.get("unit") || product.unit || "und.",
              minStock: Number(data.get("minStock")),
            }
          : product,
      ),
    );
    setEditingProduct(null);
    setModal(null);
    showToast("Producto actualizado");
  };
  const addStock = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("quantity"));
    const operation = data.get("operation");
    if (!quantity || quantity <= 0)
      return showToast("Ingresa una cantidad válida");
    if (operation === "Salida" && quantity > editingProduct.stock)
      return showToast("La salida supera el stock disponible");
    const date = new Date().toISOString();
    setProducts((current) =>
      current.map((product) =>
        product.id === editingProduct.id
          ? {
              ...product,
              stock:
                product.stock + (operation === "Salida" ? -quantity : quantity),
            }
          : product,
      ),
    );
    const reason = data.get("reason") || "Otro";
    const cost = operation === "Entrada" ? Number(data.get("cost") || 0) : 0;
    const movement = {
      id: `M-${Date.now()}`,
      productId: editingProduct.id,
      type:
        operation === "Salida"
          ? "Salida de inventario"
          : cost > 0
            ? "Egreso"
            : "Entrada de inventario",
      concept: `${operation}: ${editingProduct.name}`,
      reason,
      operation,
      quantity,
      amount: cost,
      date,
    };
    if (operation === "Entrada" && cost > 0) {
      setProducts((current) =>
        current.map((product) =>
          product.id === editingProduct.id
            ? { ...product, purchaseCost: cost / quantity }
            : product,
        ),
      );
    }
    setCash((current) => ({
      ...current,
      movements: [movement, ...current.movements],
    }));
    setEditingProduct(null);
    setModal(null);
    showToast(
      operation === "Salida"
        ? `${quantity} unidades retiradas del inventario`
        : `${quantity} unidades agregadas al stock`,
    );
  };
  const createPurchaseOrder = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const items = JSON.parse(String(data.get("items") || "[]"));
    const supplier = String(data.get("supplier") || "").trim();
    if (!supplier || !items.length)
      return showToast("Indica proveedor y al menos un producto");
    const total = items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );
    const paid = Math.min(Number(data.get("paid") || 0), total);
    const order = {
      id: nextPurchaseOrderId(purchaseOrders),
      supplier,
      notes: String(data.get("notes") || "").trim(),
      items: items.map((item) => ({ ...item, received: 0 })),
      total,
      paid,
      balance: total - paid,
      status: "Pendiente",
      date: new Date().toISOString(),
    };
    setPurchaseOrders((current) => [order, ...current]);
    if (paid > 0) {
      setCash((current) => ({
        ...current,
        movements: [
          {
            id: `M-${Date.now()}`,
            type: "Egreso",
            kind: "Egreso",
            concept: `Adelanto pedido ${order.id} · ${supplier}`,
            amount: paid,
            cashAmount: paid,
            qrAmount: 0,
            payment: "Efectivo",
            date: order.date,
          },
          ...current.movements,
        ],
      }));
    }
    setModal(null);
    showToast(`Pedido ${order.id} registrado`);
  };
  const receivePurchaseOrder = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const order = purchaseOrders.find((item) => item.id === data.get("orderId"));
    if (!order) return showToast("Pedido no encontrado");
    const received = order.items.map((item, index) => ({
      ...item,
      received: Math.min(
        Math.max(Number(data.get(`received-${index}`) || 0), 0),
        item.quantity,
      ),
    }));
    const extraPayment = Math.max(Number(data.get("payment") || 0), 0);
    const nextOrder = {
      ...order,
      items: received,
      paid: Math.min(order.total, order.paid + extraPayment),
      balance: Math.max(0, order.total - order.paid - extraPayment),
      status: received.every((item) => item.received >= item.quantity)
        ? "Completado"
        : received.some((item) => item.received > 0)
          ? "Recibido incompleto"
          : order.status,
      receivedAt: new Date().toISOString(),
    };
    setProducts((current) =>
      current.map((product) => {
        const line = received.find((item) => item.productId === product.id);
        const previous = order.items.find((item) => item.productId === product.id)?.received || 0;
        const added = (line?.received || 0) - previous;
        return added > 0
          ? { ...product, stock: product.stock + added, purchaseCost: line.unitCost }
          : product;
      }),
    );
    setPurchaseOrders((current) => current.map((item) => item.id === order.id ? nextOrder : item));
    if (extraPayment > 0) {
      setCash((current) => ({
        ...current,
        movements: [{
          id: `M-${Date.now()}`,
          type: "Egreso",
          kind: "Egreso",
          concept: `Pago pedido ${order.id} · ${order.supplier}`,
          amount: extraPayment,
          cashAmount: extraPayment,
          qrAmount: 0,
          payment: "Efectivo",
          date: new Date().toISOString(),
        }, ...current.movements],
      }));
    }
    setModal(null);
    showToast(`Recepción de ${order.id} registrada`);
  };
  const importCsv = (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (type === "customers") {
        const candidates = rows
          .map((row, index) => ({
            id:
              row.id ||
              `CLI-${String(customers.length + index + 1).padStart(3, "0")}`,
            name: row.nombre || row.name || row.cliente || "",
            carnet: row.carnet || row.ci || row.numero_de_carnet || "",
            phone: row.telefono || row.phone || "",
            family: row.familia || row.family || "",
            relation: row.parentesco || row.relacion || row.relation || "",
          }))
          .filter((item) => item.name);
        setCustomers((current) => {
          const added = candidates.filter(
            (candidate) =>
              !current.some((existing) => sameCustomer(existing, candidate)) &&
              !candidates.some(
                (other) => other !== candidate && sameCustomer(other, candidate),
              ),
          );
          showToast(
            `${added.length} clientes importados${
              candidates.length - added.length
                ? `; ${candidates.length - added.length} duplicados omitidos`
                : ""
            }`,
          );
          return [...current, ...added];
        });
      } else if (type === "materials") {
        const candidates = rows
          .map((row, index) => ({
            id:
              row.id ||
              `MAT-${String(materials.length + index + 1).padStart(3, "0")}`,
            name: row.nombre || row.name || row.material || "",
            category: row.categoria || row.category || "Otros",
            location: row.ubicacion || row.location || "",
            status: row.estado || row.status || "Disponible",
            borrower: row.prestado_a || row.borrower || "",
            due: row.devolucion || row.due || "",
          }))
          .filter((item) => item.name && item.location);
        setMaterials((current) => [...current, ...candidates]);
        showToast(`${candidates.length} materiales importados`);
      } else {
        const candidates = rows
          .map((row, index) => ({
            id:
              row.id ||
              `PRD-${String(products.length + index + 1).padStart(3, "0")}`,
            name: row.nombre || row.name || row.producto || "",
            category: row.categoria || row.category || "Otros",
            section: reportGroup(
              row.categoria || row.category || "Otros",
              row.seccion || row.section || "",
            ),
            price: Number(row.precio || row.price || row.precio_de_venta || 0),
            purchaseCost: Number(
              row.costo_de_compra || row.purchase_cost || row.purchaseCost || 0,
            ),
            stock: Number(row.stock || row.existencias || 0),
            minStock: Number(row.stock_minimo || row.min_stock || 5),
            unit: row.unidad || row.unit || "und.",
            bookCourses: String(row.cursos || row.book_courses || "")
              .split("|")
              .map((course) => course.trim())
              .filter(Boolean),
          }))
          .filter((item) => item.name);
        setProducts((current) => {
          const added = candidates.filter(
            (candidate) =>
              !current.some((existing) => sameProduct(existing, candidate)) &&
              !candidates.some(
                (other) => other !== candidate && sameProduct(other, candidate),
              ),
          );
          showToast(
            `${added.length} productos importados${
              candidates.length - added.length
                ? `; ${candidates.length - added.length} duplicados omitidos`
                : ""
            }`,
          );
          return [...current, ...added];
        });
      }
    };
    reader.readAsText(file, "UTF-8");
    event.target.value = "";
  };
  const addStudent = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const carnet = String(data.get("carnet") || "").trim();
    const course = String(data.get("course") || "").trim();
    const guardianId = String(data.get("guardianId") || "");
    const guardian = customers.find((item) => item.id === guardianId);
    if (!name || !course || !guardian)
      return showToast("Completa nombre, curso y familia responsable");
    if (students.some((item) =>
      item.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
      item.course.toLocaleLowerCase() === course.toLocaleLowerCase() &&
      item.guardianId === guardianId))
      return showToast("Este estudiante ya está registrado en ese curso");
    setStudents((current) => [{
      id: `EST-${crypto.randomUUID()}`,
      name,
      carnet,
      course,
      guardianId,
      guardianName: guardian.name,
      family: guardian.family || "",
      createdAt: new Date().toISOString(),
    }, ...current]);
    event.currentTarget.reset();
    showToast("Estudiante registrado");
  };
  const assignBookToCourse = (productId, course) => {
    const normalizedCourse = course.trim();
    if (!normalizedCourse) return showToast("Escribe el nombre del curso");
    setProducts((current) => current.map((product) => {
      if (product.id !== productId) return product;
      const courses = product.bookCourses || [];
      if (courses.some((item) => normalizedValue(item) === normalizedValue(normalizedCourse)))
        return product;
      return { ...product, bookCourses: [...courses, normalizedCourse] };
    }));
    showToast("Libro asignado al curso");
  };
  const unassignBookFromCourse = (productId, course) => {
    setProducts((current) => current.map((product) =>
      product.id === productId
        ? { ...product, bookCourses: (product.bookCourses || []).filter(
            (assignedCourse) => normalizedValue(assignedCourse) !== normalizedValue(course),
          ) }
        : product,
    ));
    showToast("Libro retirado de este curso");
  };
  const toggleStudentBookRecord = (student, product, purchased) => {
    const recordId = `COMPRA-${student.id}-${product.id}`;
    const existing = studentBookRecords.find((record) => record.id === recordId);
    if (purchased && !existing) {
      setStudentBookRecords((current) => [{
        id: recordId,
        studentId: student.id,
        productId: product.id,
        status: "Comprado",
        source: "Compra anterior al sistema",
        purchasedAt: new Date().toISOString(),
      }, ...current]);
    } else if (existing) {
      setStudentBookRecords((current) => current.map((record) =>
        record.id === recordId
          ? { ...record, status: purchased ? "Comprado" : "Anulado" }
          : record,
      ));
    }
  };
  const addCashMovement = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawType = data.get("type");
    const amount = Number(data.get("amount"));
    const concept = String(data.get("concept") || "").trim();
    if (!amount || amount <= 0) return showToast("Ingresa un monto válido");
    if (!concept) return showToast("Escribe el concepto del movimiento");
    const payment = data.get("payment");
    const movementType =
      rawType === "Otro ingreso"
        ? "Ingreso"
        : rawType === "Otro egreso"
          ? "Egreso"
          : rawType;
    const movement = {
      id: `M-${Date.now()}`,
      type: movementType,
      kind: rawType,
      concept,
      amount,
      cashAmount:
        payment === "Ambos"
          ? Number(data.get("cashAmount") || 0)
          : payment === "Efectivo"
            ? amount
            : 0,
      qrAmount:
        payment === "Ambos"
          ? Number(data.get("qrAmount") || 0)
          : payment === "QR"
            ? amount
            : 0,
      payment,
      date: new Date().toISOString(),
    };
    if (Math.abs(movement.cashAmount + movement.qrAmount - amount) > 0.01)
      return showToast("Los medios de pago deben sumar el monto");
    setCash((current) => ({
      ...current,
      movements: [movement, ...current.movements],
    }));
    setSelectedSale(movement);
    setModal(null);
    showToast(`${movement.kind} registrado`);
  };
  function registerLoan(material, force = false, teacherId = "", due = "") {
    if (material.status === "Disponible" && !force) {
      setLoanScan(true);
      setScanValue("");
      setModal("scan");
      return;
    }
    const teacher = teachers.find((item) => item.id === teacherId) || teachers[0];
    if (!teacher)
      return showToast("Registra al menos un maestro antes de prestar material");
    if (material.status === "Prestado") {
      setMaterials((current) =>
        current.map((item) =>
          item.id === material.id
            ? { ...item, status: "Disponible", borrower: "", due: "" }
            : item,
        ),
      );
      setLoans((current) => [
        {
          id: `L-${Date.now()}`,
          action: "Devolución",
          materialId: material.id,
          material: material.name,
          teacherId: teacher?.id || "",
          teacher: material.borrower,
          due: "",
          date: new Date().toISOString(),
        },
        ...current,
      ]);
      showToast("Devolución registrada");
    } else {
      setMaterials((current) =>
        current.map((item) =>
          item.id === material.id
            ? {
                ...item,
                status: "Prestado",
                borrower: teacher.name,
                due: due || "Sin fecha definida",
              }
            : item,
        ),
      );
      setLoans((current) => [
        {
          id: `L-${Date.now()}`,
          action: "Préstamo",
          materialId: material.id,
          material: material.name,
          teacherId: teacher.id,
          teacher: teacher.name,
          due: due || "Sin fecha definida",
          date: new Date().toISOString(),
        },
        ...current,
      ]);
      showToast("Préstamo registrado");
    }
  };
  const saveManualLoan = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const teacherId = String(data.get("teacherId") || "");
    const due = String(data.get("due") || "").trim();
    if (!selectedLoanMaterial) return showToast("Selecciona un material");
    registerLoan(selectedLoanMaterial, true, teacherId, due);
    setSelectedLoanMaterial(null);
    setModal(null);
  };
  const addReceivable = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const total = Number(data.get("total"));
    if (!Number.isFinite(total) || total <= 0)
      return showToast("Ingresa un importe de deuda válido");
    const receivable = {
      id: `CXC-${Date.now()}`,
      guardianName: String(data.get("guardianName") || "").trim(),
      studentName: String(data.get("studentName") || "").trim(),
      grade: String(data.get("grade") || "").trim(),
      carnet: String(data.get("carnet") || "").trim(),
      family: String(data.get("family") || "").trim(),
      gestion: String(data.get("gestion") || "").trim(),
      total,
      paid: 0,
      paymentHistory: [],
      contract: String(data.get("contract") || "").trim(),
      commitment: String(data.get("commitment") || "").trim(),
      infocredStatus: "Pendiente",
      createdAt: new Date().toISOString(),
    };
    setReceivables((current) => [receivable, ...current]);
    showToast("Cuenta por cobrar registrada; no afecta la caja");
    event.currentTarget.reset();
  };
  const registerReceivablePayment = (receivableId, data) => {
    const record = receivables.find((item) => item.id === receivableId);
    if (!record) {
      showToast("No se encontró la cuenta por cobrar");
      return false;
    }
    const balance = Math.max(0, Number(record.total) - Number(record.paid));
    const amount =
      data.mode === "total" ? balance : Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance + 0.001) {
      showToast("El importe debe ser mayor a cero y no superar el saldo");
      return false;
    }
    const payment = {
      id: `AB-${Date.now()}`,
      amount: Math.min(amount, balance),
      date: data.date || localDateString(),
      mode: data.mode,
      note: String(data.note || "").trim(),
    };
    setReceivables((current) =>
      current.map((item) =>
        item.id === receivableId
          ? {
              ...item,
              paid: Math.min(Number(item.total), Number(item.paid) + payment.amount),
              paymentHistory: [payment, ...(item.paymentHistory || [])],
            }
          : item,
      ),
    );
    showToast(
      `Abono de ${money(payment.amount)} anotado; no se registró en caja`,
    );
    return true;
  };
  const updateInfocredStatus = (receivableId, infocredStatus) => {
    setReceivables((current) =>
      current.map((record) =>
        record.id === receivableId ? { ...record, infocredStatus } : record,
      ),
    );
  };
  const toggleReminderCompleted = (task) => {
    const key = `${task.period}:${task.id}`;
    setRemindersCompleted((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };
  const summaryMatchesDate = (value) => {
    if (!value) return true;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return true;
    const from = summaryStartDate ? new Date(`${summaryStartDate}T00:00:00`) : null;
    const to = summaryEndDate ? new Date(`${summaryEndDate}T23:59:59.999`) : null;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  };
  const summarySales = sales.filter(
    (sale) => sale.status !== "Anulada" && summaryMatchesDate(sale.date),
  );
  const summaryGroups = summarySales.reduce((result, sale) => {
    sale.items.forEach((item) => {
      const product =
        products.find((candidate) => candidate.id === item.id) || item;
      const group = reportGroup(product.category, product.section);
      const itemValue = item.price * item.quantity;
      const share = sale.total ? itemValue / sale.total : 0;
      const cash = sale.cashAmount * share;
      const qr = sale.qrAmount * share;
      const current = result[group] || { total: 0, cash: 0, qr: 0 };
      result[group] = {
        total: current.total + itemValue,
        cash: current.cash + cash,
        qr: current.qr + qr,
      };
    });
    return result;
  }, {});
  const stats = [
    {
      label: "Ventas del día",
      value: money(
        summarySales.reduce((sum, sale) => sum + sale.total, 0),
      ),
      note: `${summarySales.length} comprobantes${summaryStartDate || summaryEndDate ? ` en rango` : ""}`,
      icon: Banknote,
      tone: "teal",
    },
    {
      label: "Productos en inventario",
      value: products.reduce((sum, item) => sum + item.stock, 0),
      note: `${products.filter((item) => item.stock <= item.minStock).length} por reponer`,
      icon: Archive,
      tone: "blue",
    },
    {
      label: "Caja disponible",
      value: money(
        cash.opening +
          cash.movements.reduce(
            (sum, movement) =>
              sum +
              (movement.status === "Anulada" ? 0 : movement.type === "Ingreso"
                ? movement.amount
                : -movement.amount),
            0,
          ),
      ),
      note: "Corte pendiente",
      icon: WalletCards,
      tone: "orange",
    },
    {
      label: "Préstamos activos",
      value: materials.filter((item) => item.status === "Prestado").length,
      note: "Material de profesores",
      icon: ClipboardList,
      tone: "purple",
    },
  ];
  const activeReminders = currentMonthlyReminders(new Date(), remindersCompleted);
  const nav = (name) => {
    const Icon = navItems.find(([label]) => label === name)[1];
    return (
      <button
        type="button"
        className={activeNav === name ? "active" : ""}
        onClick={() => {
          setActiveNav(name);
          setMenuOpen(false);
        }}
      >
        <Icon size={18} />
        {name}
        {name === "Historial" && sales.length > 0 && (
          <span className="nav-count">{sales.length}</span>
        )}
        {name === "Recordatorios" && activeReminders.length > 0 && (
          <span className="nav-count">{activeReminders.length}</span>
        )}
      </button>
    );
  };
  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={`sidebar ${menuOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src="/logo-vida-verdad.jpg" alt="Logo Vida y Verdad" />
          <span>
            Vida y Verdad<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">C</span>
          <span>
            <small>Institución</small>
            <strong>Vida y Verdad Caranavi</strong>
          </span>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav">
          {navItems.map(([label]) => (
            <span key={label} style={{ display: "contents" }}>{nav(label)}</span>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            onClick={() => {
              setActiveNav("Configuración");
              setMenuOpen(false);
            }}
          >
            <Settings size={18} />
            Configuración
          </button>
          <div className="help-box">
            <ShieldCheck size={19} />
            <div>
              <strong>Datos protegidos</strong>
              <span>
                {isSupabaseConfigured
                  ? "Sincronización en línea"
                  : "Guardado local activo"}
              </span>
            </div>
          </div>
          <div className="profile">
            <span className="profile-avatar">R</span>
            <span>
              <strong>Rodrigo</strong>
              <small>Administrador</small>
            </span>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Vida y Verdad Caranavi</span>
            <b>/</b>
            <strong>{activeNav}</strong>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-button"
              title={`${activeReminders.length} recordatorios pendientes`}
              onClick={() => setActiveNav("Recordatorios")}
            >
              <Bell size={19} />
              {activeReminders.length > 0 && <i />}
            </button>
            <span className="date-chip">
              {new Date().toLocaleDateString("es-BO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }).toUpperCase()}
            </span>
            <span className="profile-avatar">R</span>
          </div>
        </header>
        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">GESTIÓN COMERCIAL · VIDA Y VERDAD CARANAVI</p>
              <h1>
                {activeNav === "Nueva venta"
                  ? "Punto de venta"
                  : activeNav === "Libros por curso"
                    ? "Control de libros por curso"
                    : "Bienvenido Rodrigo"}
              </h1>
              <p className="subtitle">
                {activeNav === "Nueva venta"
                  ? "Registra una venta rápida para las familias del colegio."
                  : activeNav === "Libros por curso"
                    ? "Administra listas de lectura y verifica las compras por estudiante."
                    : "Todo lo que necesitas para operar la tienda escolar."}
              </p>
            </div>
            {activeNav !== "Nueva venta" && (
              <button
                type="button"
                className="primary-button"
                onClick={() => setActiveNav("Nueva venta")}
              >
                <Plus size={18} />
                Nueva venta
              </button>
            )}
          </section>
          {activeNav === "Resumen" && (
            <>
              <div className="date-range-toolbar" style={{ marginBottom: 16 }}>
                <div className="date-filter-block">
                  <div className="date-filter-header">
                    <strong className="date-range-title">Buscar por rango de fechas</strong>
                    <span className="date-filter-badge">
                      <CalendarRange size={13} />
                      {summaryStartDate || summaryEndDate ? "Rango activo" : "Todo el período"}
                    </span>
                    {(summaryStartDate || summaryEndDate) && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setSummaryStartDate("");
                          setSummaryEndDate("");
                        }}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="date-filter-fields">
                    <label>
                      <span>Desde</span>
                      <input
                        type="date"
                        value={summaryStartDate}
                        onChange={(event) => setSummaryStartDate(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Hasta</span>
                      <input
                        type="date"
                        value={summaryEndDate}
                        onChange={(event) => setSummaryEndDate(event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>
              <section className="report-grid" style={{ marginBottom: 20 }}>
                {reportSections.map((group) => {
                  const summary = summaryGroups[group] || { total: 0, cash: 0, qr: 0 };
                  return (
                    <div className="report-card" key={group}>
                      <span>{group}</span>
                      <strong>{money(summary.total)}</strong>
                      <small>
                        Efectivo {money(summary.cash)} · QR {money(summary.qr)}
                      </small>
                    </div>
                  );
                })}
              </section>
              <section className="stats-grid">
                {stats.map(({ label, value, note, icon: Icon, tone }) => (
                  <div className="stat-card" key={label}>
                    <div className={`stat-icon ${tone}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p>{label}</p>
                      <strong>{value}</strong>
                      <small>{note}</small>
                    </div>
                  </div>
                ))}
              </section>
              <section className="content-grid">
                <div className="panel">
                  <PanelHeader
                    title="Ventas recientes"
                    detail="Últimos comprobantes emitidos"
                    action={
                      <button
                        className="text-button"
                        onClick={() => setActiveNav("Historial")}
                      >
                        Ver historial <ArrowUpRight size={15} />
                      </button>
                    }
                  />
                  <SaleList
                    sales={sales.slice(0, 5)}
                    onSelect={setSelectedSale}
                  />
                </div>
                <div className="panel alert-panel">
                  <PanelHeader
                    title="Atención requerida"
                    detail="Inventario y caja"
                  />
                  <div className="alert-list">
                    <div>
                      <span className="alert-mark orange">
                        <Archive size={17} />
                      </span>
                      <span>
                        <strong>
                          {
                            products.filter(
                              (item) => item.stock <= item.minStock,
                            ).length
                          }{" "}
                          productos con stock bajo
                        </strong>
                        <small>Revisa el inventario para reponer</small>
                      </span>
                    </div>
                    <div>
                      <span className="alert-mark teal">
                        <WalletCards size={17} />
                      </span>
                      <span>
                        <strong>Arqueo de caja pendiente</strong>
                        <small>Último corte: no registrado hoy</small>
                      </span>
                    </div>
                  </div>
                  <button
                    className="secondary-button full"
                    onClick={() => setActiveNav("Caja")}
                  >
                    Ir a caja <ArrowUpRight size={15} />
                  </button>
                </div>
              </section>
            </>
          )}
          {activeNav === "Nueva venta" && (
            <SaleView
              products={filteredProducts}
              customers={customers}
              students={students}
              sales={sales}
              studentBookRecords={studentBookRecords}
              selectedStudentId={selectedSaleStudentId}
              onStudentChange={setSelectedSaleStudentId}
              categories={[
                "Todos",
                ...new Set(products.map((item) => item.category)),
              ]}
              category={category}
              setCategory={setCategory}
              search={search}
              setSearch={setSearch}
              addToCart={addToCart}
              cart={cart}
              updateQuantity={updateQuantity}
              setCart={setCart}
              saleTotal={saleTotal}
              onSubmit={completeSale}
              onQuickStock={(product) => {
                setEditingProduct(product);
                setModal("stock");
              }}
              onScan={() => {
                setModal("scan");
                setScanValue("");
              }}
              onNewCustomer={() => setModal("customer")}
            />
          )}
          {activeNav === "Inventario" && (
            <InventoryView
              products={products}
              sales={sales}
              cash={cash}
              purchaseOrders={purchaseOrders}
              search={search}
              setSearch={setSearch}
              onAdd={() => setModal("product")}
              onQr={setSelectedQr}
              onEdit={(product) => {
                setEditingProduct(product);
                setModal("editProduct");
              }}
              onStock={(product) => {
                setEditingProduct(product);
                setModal("stock");
              }}
              onNewOrder={() => setModal("purchaseOrder")}
              onReceiveOrder={(order) => {
                setEditingPurchaseOrder(order);
                setModal("receiveOrder");
              }}
              onPrintOrder={setPrintPurchaseOrder}
              onPrintAllQrs={() => setQrSheetOpen(true)}
            />
          )}
          {activeNav === "Clientes" && (
            <CustomerView
              customers={customers}
              sales={sales}
              onImport={(event) => importCsv(event, "customers")}
              onAdd={() => setModal("customer")}
              onEdit={(customer) => {
                setEditingCustomer(customer);
                setModal("editCustomer");
              }}
            />
          )}
          {activeNav === "Historial" && (
            <HistoryView
              sales={sales}
              cash={cash}
              products={products}
              filter={historyFilter}
              setFilter={setHistoryFilter}
              startDate={historyStartDate}
              endDate={historyEndDate}
              setStartDate={setHistoryStartDate}
              setEndDate={setHistoryEndDate}
              onSelect={setSelectedSale}
              onVoid={voidEntry}
            />
          )}
          {activeNav === "Caja" && (
            <CashView
              cash={cash}
              sales={sales}
              onClose={() => setModal("cash")}
              onMovement={() => setModal("movement")}
            />
          )}
          {activeNav === "Cuentas por cobrar" && (
            <AccountsReceivableView
              receivables={receivables}
              schemaWarnings={schemaWarnings}
              onAdd={addReceivable}
              onPayment={registerReceivablePayment}
              onInfocredStatus={updateInfocredStatus}
            />
          )}
          {activeNav === "Recordatorios" && (
            <RemindersView
              reminders={activeReminders}
              completed={remindersCompleted}
              onToggle={toggleReminderCompleted}
            />
          )}
          {activeNav === "Libros por curso" && (
            <CourseBooksView
              products={products}
              students={students}
              customers={customers}
              sales={sales}
              studentBookRecords={studentBookRecords}
              onAddStudent={addStudent}
              onAssignBook={assignBookToCourse}
              onUnassignBook={unassignBookFromCourse}
              onToggleBookRecord={toggleStudentBookRecord}
            />
          )}
          {activeNav === "Préstamos" && (
            <LoansView
              materials={materials}
              loans={loans}
              onLoan={registerLoan}
              onManualLoan={(material) => {
                setSelectedLoanMaterial(material);
                setModal("loan");
              }}
              onEdit={(material) => {
                const name = window.prompt("Nombre del objeto", material.name);
                if (!name?.trim()) return;
                const category = window.prompt("Categoría", material.category) || material.category;
                const location = window.prompt("Ubicación", material.location) || material.location;
                setMaterials((current) => current.map((item) => item.id === material.id ? { ...item, name: name.trim(), category, location } : item));
                showToast("Objeto actualizado");
              }}
              teachers={teachers}
              onAddTeacher={() => setModal("teacher")}
            />
          )}
          {activeNav === "Configuración" && (
            <SettingsView
              onImportProducts={(event) => importCsv(event, "products")}
              onImportCustomers={(event) => importCsv(event, "customers")}
              onImportMaterials={(event) => importCsv(event, "materials")}
              onExportProducts={() =>
                downloadCsv(
                  "productos.csv",
                  ["id", "nombre", "categoria", "seccion", "costo_de_compra", "precio", "stock", "stock_minimo", "unidad", "cursos"],
                  products.map((item) => [item.id, item.name, item.category, reportGroup(item.category, item.section), item.purchaseCost || 0, item.price, item.stock, item.minStock, item.unit, (item.bookCourses || []).join("|")]),
                )
              }
              onExportCustomers={() =>
                downloadCsv(
                  "clientes.csv",
                  ["id", "nombre", "carnet", "telefono", "familia", "parentesco"],
                  customers.map((item) => [item.id, item.name, item.carnet, item.phone, item.family, item.relation]),
                )
              }
              onExportMaterials={() =>
                downloadCsv(
                  "materiales.csv",
                  ["id", "nombre", "categoria", "ubicacion", "estado", "prestado_a", "devolucion"],
                  materials.map((item) => [item.id, item.name, item.category, item.location, item.status, item.borrower, item.due]),
                )
              }
              onDownloadTemplate={(type) => {
                const templates = {
                  products: ["id", "nombre", "categoria", "seccion", "costo_de_compra", "precio", "stock", "stock_minimo", "unidad", "cursos"],
                  customers: ["id", "nombre", "carnet", "telefono", "familia", "parentesco"],
                  materials: ["id", "nombre", "categoria", "ubicacion", "estado", "prestado_a", "devolucion"],
                };
                downloadCsv(`${type}-plantilla.csv`, templates[type], [templates[type].map(() => "")]);
              }}
              online={isSupabaseConfigured}
              syncStatus={syncStatus}
              schemaWarnings={schemaWarnings}
              syncedRecordCounts={syncedRecordCounts}
              onRetrySync={() => {
                syncErrorShownRef.current = false;
                forceFullSyncRef.current = true;
                if (!cloudReadyRef.current || syncStatus === "schema") {
                  cloudOmittedColumnsRef.current = {};
                  localStorage.removeItem("vida-verdad-supabase-omitted-columns");
                  setSyncStatus("loading");
                  setCloudRetry((current) => current + 1);
                } else setSyncVersion((current) => current + 1);
              }}
              theme={theme}
              onToggleTheme={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
            />
          )}
        </div>
      </main>
      {modal === "scan" && (
        <div
          className="modal-backdrop"
          onClick={() => {
            stopScanner();
            setModal(null);
          }}
        >
          <div
            className="modal scan-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => {
                stopScanner();
                setModal(null);
              }}
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <QrCode size={22} />
            </div>
            <h2>{loanScan ? "Registrar préstamo" : "Escanear productos"}</h2>
            <p>
              {loanScan
                ? "Apunta al QR del material para registrar el préstamo."
                : "Apunta al QR de cada producto; se añadirá al carrito automáticamente."}
            </p>
            <div id="qr-reader" />
            <div className="scan-input">
              <QrCode size={17} />
              <input
                autoFocus
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleScan()}
                placeholder="Ej. UNI-001"
              />
              <button onClick={handleScan}>
                <ArrowUpRight size={17} />
              </button>
            </div>
            <small className="camera-note">
              <Camera size={14} />
              Se solicitará permiso para usar la cámara
            </small>
          </div>
        </div>
      )}
      {modal === "product" && (
      <FormModal
        title="Nuevo producto"
        icon={PackagePlus}
        onSubmit={addProduct}
        onClose={() => setModal(null)}
        fields={
          <>
            <label>
              Nombre
              <input
                required
                name="name"
                placeholder="Ej. Polo institucional"
              />
            </label>
            <label>
              Categoría
              <select name="category">
                <option>Uniformes</option>
                <option>Libros y útiles</option>
                <option>Fotocopias</option>
                <option>Tela</option>
                <option>Otros</option>
              </select>
            </label>
            <label>
              Sección del resumen
              <select required name="section" defaultValue="">
                <option value="" disabled>
                  Selecciona la sección del resumen
                </option>
                {reportSections.map((item) => (
                  <option value={item} key={item}>
                    {sectionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-note">
              La sección define en qué tarjeta de Resumen e Historial se
              sumarán las ventas de este producto.
            </p>
            <label>
              Unidad de venta
              <select name="unit" defaultValue="und.">
                <option value="und.">Unidad</option>
                <option value="cm">Centímetro lineal</option>
                <option value="m">Metro lineal</option>
                <option value="rollo">Rollo</option>
              </select>
            </label>
            <div className="form-row">
              <label>
                Costo de compra
                <input
                  name="purchaseCost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </label>
              <label>
                Precio de venta
                <input
                  required
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </label>
              <label>
                Stock inicial
                <input required name="stock" type="number" min="0" placeholder="0" />
              </label>
            </div>
          </>
        }
      />
    )}
      {modal === "editProduct" && (
      <FormModal
        title="Editar producto"
        icon={Archive}
        onSubmit={editProduct}
        onClose={() => {
          setEditingProduct(null);
          setModal(null);
        }}
        fields={
          <>
            <label>
              Nombre
              <input
                required
                name="name"
                defaultValue={editingProduct?.name}
              />
            </label>
            <label>
              Categoría
              <input
                required
                name="category"
                defaultValue={editingProduct?.category}
              />
            </label>
            <label>
              Sección del resumen
              <select
                required
                name="section"
                defaultValue={
                  editingProduct?.section ||
                  reportGroup(editingProduct?.category || "")
                }
              >
                {reportSections.map((item) => (
                  <option value={item} key={item}>
                    {sectionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-note">
              Cambia la sección si el producto no está sumando en la tarjeta
              correcta de Resumen e Historial.
            </p>
            <div className="form-row">
              <label>
                Costo de compra
                <input
                  name="purchaseCost"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingProduct?.purchaseCost || 0}
                />
              </label>
              <label>
                Precio de venta
                <input
                  required
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingProduct?.price}
                />
              </label>
              <label>
                Unidad de venta
                <select name="unit" defaultValue={editingProduct?.unit || "und."}>
                  <option value="und.">Unidad</option>
                  <option value="cm">Centímetro lineal</option>
                  <option value="m">Metro lineal</option>
                  <option value="rollo">Rollo</option>
                </select>
              </label>
              <label>
                Stock mínimo
                <input
                  required
                  name="minStock"
                  type="number"
                  min="0"
                  defaultValue={editingProduct?.minStock}
                />
              </label>
            </div>
          </>
        }
      />
    )}
      {modal === "stock" && (
        <FormModal
          title="Movimiento de inventario"
          icon={PackagePlus}
          stockMode
          editingProduct={editingProduct}
          onSubmit={addStock}
          onClose={() => {
            setEditingProduct(null);
            setModal(null);
          }}
          fields={
            <>
              <p className="form-note">
                Producto: {editingProduct?.name} · Stock actual:{" "}
                {editingProduct?.stock}
              </p>
            </>
          }
        />
      )}
      {modal === "loan" && (
        <FormModal
          title="Registrar préstamo"
          icon={ClipboardList}
          onSubmit={saveManualLoan}
          onClose={() => {
            setSelectedLoanMaterial(null);
            setModal(null);
          }}
          fields={
            <>
              <p className="form-note">
                Material: {selectedLoanMaterial?.name || "-"}
              </p>
              <label>
                Maestro
                <select required name="teacherId" defaultValue="">
                  <option value="" disabled>
                    Selecciona un maestro
                  </option>
                  {teachers.map((teacher) => (
                    <option value={teacher.id} key={teacher.id}>
                      {teacher.name} · {teacher.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha o detalle de devolución (opcional)
                <input name="due" placeholder="Ej. 25/09/2026" />
              </label>
            </>
          }
        />
      )}
      {modal === "purchaseOrder" && (
        <PurchaseOrderModal
          products={products}
          onSubmit={createPurchaseOrder}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "receiveOrder" && editingPurchaseOrder && (
        <ReceiveOrderModal
          order={editingPurchaseOrder}
          onSubmit={receivePurchaseOrder}
          onClose={() => {
            setEditingPurchaseOrder(null);
            setModal(null);
          }}
        />
      )}
      {printPurchaseOrder && (
        <PurchaseOrderPrint
          order={printPurchaseOrder}
          onClose={() => setPrintPurchaseOrder(null)}
        />
      )}
      {modal === "customer" && (
        <FormModal
          title="Registrar cliente"
          icon={UserRound}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const customer = {
              id: nextCustomerId(customers),
              name: data.get("name"),
              carnet: data.get("carnet"),
              phone: data.get("phone") || "",
              family: String(data.get("family") || "").trim(),
              relation: String(data.get("relation") || "").trim(),
            };
            if (customers.some((item) => sameCustomer(item, customer))) {
              showToast("Ese cliente ya está registrado");
              return;
            }
            setCustomers((current) => [...current, customer]);
            setModal(null);
            showToast("Cliente registrado; ya puede seleccionarse en la venta");
          }}
          onClose={() => setModal(null)}
          fields={
            <>
              <label>
                Nombre del cliente / familia
                <input required name="name" />
              </label>
              <label>
                Número de carnet
                <input required name="carnet" />
              </label>
              <label>
                Teléfono (opcional)
                <input name="phone" />
              </label>
              <label>
                Familia (opcional)
                <input
                  name="family"
                  placeholder="Ej. Familia Pérez"
                  list="customer-family-options"
                />
                <datalist id="customer-family-options">
                  {uniqueFamilies(customers).map((family) => (
                    <option value={family} key={family} />
                  ))}
                </datalist>
              </label>
              <label>
                Parentesco
                <select name="relation" defaultValue="Estudiante">
                  {familyRelations.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </>
          }
        />
      )}
      {modal === "editCustomer" && editingCustomer && (
        <FormModal
          title="Editar cliente"
          icon={UserRound}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const customer = {
              ...editingCustomer,
              name: data.get("name"),
              carnet: data.get("carnet"),
              phone: data.get("phone") || "",
              family: String(data.get("family") || "").trim(),
              relation: String(data.get("relation") || "").trim(),
            };
            if (customers.some((item) => item.id !== customer.id && sameCustomer(item, customer))) {
              showToast("Ese cliente ya está registrado");
              return;
            }
            setCustomers((current) => current.map((item) => item.id === customer.id ? customer : item));
            setEditingCustomer(null);
            setModal(null);
            showToast("Datos del cliente actualizados");
          }}
          onClose={() => {
            setEditingCustomer(null);
            setModal(null);
          }}
          fields={
            <>
              <label>
                Nombre del cliente / familia
                <input required name="name" defaultValue={editingCustomer.name} />
              </label>
              <label>
                Número de carnet
                <input required name="carnet" defaultValue={editingCustomer.carnet} />
              </label>
              <label>
                Teléfono (opcional)
                <input name="phone" defaultValue={editingCustomer.phone} />
              </label>
              <label>
                Familia (opcional)
                <input
                  name="family"
                  placeholder="Ej. Familia Pérez"
                  list="customer-family-options-edit"
                  defaultValue={editingCustomer.family}
                />
                <datalist id="customer-family-options-edit">
                  {uniqueFamilies(customers).map((family) => (
                    <option value={family} key={family} />
                  ))}
                </datalist>
              </label>
              <label>
                Parentesco
                <select name="relation" defaultValue={editingCustomer.relation || "Estudiante"}>
                  {familyRelations.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </>
          }
        />
      )}
      {modal === "teacher" && (
        <FormModal
          title="Nuevo profesor"
          icon={UserRound}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setTeachers((current) => [
              ...current,
              {
                id: `DOC-${String(current.length + 1).padStart(3, "0")}`,
                name: data.get("name"),
                role: data.get("role"),
              },
            ]);
            setModal(null);
            showToast("Profesor registrado");
          }}
          onClose={() => setModal(null)}
          fields={
            <>
              <label>
                Nombre completo
                <input required name="name" />
              </label>
              <label>
                Área o especialidad
                <input required name="role" />
              </label>
            </>
          }
        />
      )}
      {modal === "cash" && (
        <FormModal
          title="Registrar arqueo"
          icon={WalletCards}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setCash((current) => ({
              ...current,
              lastClose: {
                date: new Date().toISOString(),
                expected: Number(data.get("expected")),
                counted: Number(data.get("counted")),
                difference:
                  Number(data.get("counted")) - Number(data.get("expected")),
              },
            }));
            setModal(null);
            showToast("Arqueo guardado correctamente");
          }}
          onClose={() => setModal(null)}
          fields={
            <>
              <p className="form-note">
                Cuenta el efectivo y registra el monto encontrado.
              </p>
              <label>
                Monto esperado
                <input
                  readOnly
                  name="expected"
                  value={
                    cash.opening +
                    cash.movements.reduce(
                      (sum, movement) =>
                        sum +
                        (movement.status === "Anulada" ? 0 : movement.type === "Ingreso"
                          ? movement.amount
                          : -movement.amount),
                      0,
                    )
                  }
                />
              </label>
              <label>
                Monto contado
                <input
                  required
                  name="counted"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </label>
            </>
          }
        />
      )}
      {modal === "movement" && (
        <FormModal
          title="Nuevo movimiento de caja"
          icon={Banknote}
          onSubmit={addCashMovement}
          onClose={() => setModal(null)}
          fields={
            <>
              <label>
                Tipo
                <select name="type">
                  <option>Ingreso</option>
                  <option>Egreso</option>
                  <option>Otro ingreso</option>
                  <option>Otro egreso</option>
                </select>
              </label>
              <label>
                Concepto
                <input
                  required
                  name="concept"
                  placeholder="Ej. Donación, servicio, pago de transporte, multa, etc."
                />
              </label>
              <label>
                Monto
                <input
                  required
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                />
              </label>
              <PaymentFields total={0} />
            </>
          }
        />
      )}
      {selectedQr && (
        <QrModal item={selectedQr} onClose={() => setSelectedQr(null)} />
      )}
      {qrSheetOpen && (
        <QrSheetModal products={products} onClose={() => setQrSheetOpen(false)} />
      )}
      {selectedSale && (
        <ReceiptModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onVoid={voidSale}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function PanelHeader({ title, detail, action }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function CollapsiblePanel({ title, detail, action, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`panel lower-panel collapsible-panel ${open ? "" : "collapsed"}`}>
      <div className="panel-heading">
        <div
          className="collapsible-title"
          onClick={() => setOpen((current) => !current)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
        >
          <span className={`collapse-chevron ${open ? "open" : ""}`}>
            <ChevronDown size={18} />
          </span>
          <div>
            <h2>{title}</h2>
            <p>{detail}</p>
          </div>
        </div>
        {action && (
          <div
            className="panel-action"
            onClick={(event) => event.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

function SaleList({
  sales,
  onSelect,
  empty = "Aún no hay comprobantes emitidos.",
}) {
  return sales.length ? (
    <div className="sale-list">
      {sales.map((sale) => (
        <button
          className="sale-row"
          key={sale.id}
          onClick={() => onSelect(sale)}
        >
          <span className="receipt-icon">
            <Receipt size={17} />
          </span>
          <span>
            <strong>{sale.id}</strong>
            <small>
              {sale.customer}
              {sale.family ? ` · ${sale.family}` : ""}
              {sale.payer && sale.payer !== sale.customer
                ? ` · Pagó ${sale.payer}`
                : ""}{" "}
              ·{" "}
              {new Date(sale.date).toLocaleString("es-PE", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </small>
          </span>
          <b>{money(sale.total)}</b>
          <ChevronDown size={16} />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <Receipt size={28} />
      <p>{empty}</p>
    </div>
  );
}
function PaymentFields({ total = 0 }) {
  const [payment, setPayment] = useState("Efectivo");
  const [received, setReceived] = useState("");
  const receivedNumber = Number(received) || 0;
  const change = receivedNumber - total;
  const showCashField = payment === "Efectivo" || payment === "Ambos";
  const showQrField = payment === "QR" || payment === "Ambos";

  return (
    <>
      <label>
        Medio de pago
        <select
          name="payment"
          value={payment}
          onChange={(event) => {
            setPayment(event.target.value);
            setReceived("");
          }}
        >
          <option>Efectivo</option>
          <option>QR</option>
          <option>Ambos</option>
        </select>
      </label>
      <div className="form-row">
        {showCashField && (
          <label>
            Efectivo
            <input
              name="cashAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              readOnly={payment === "Efectivo"}
              defaultValue={payment === "Efectivo" ? total : ""}
              key={`cash-${payment}-${total}`}
            />
          </label>
        )}
        {showQrField && (
          <label>
            QR
            <input
              name="qrAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              readOnly={payment === "QR"}
              defaultValue={payment === "QR" ? total : ""}
              key={`qr-${payment}-${total}`}
            />
          </label>
        )}
      </div>

      {/* Calculadora de cambio: solo si hay efectivo involucrado */}
      {showCashField && total > 0 && (
        <div className="change-calculator">
          <label>
            Monto recibido del cliente
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Ej. 100"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
            />
          </label>
          {receivedNumber > 0 && (
            <div className={`change-result ${change >= 0 ? "ok" : "pending"}`}>
              <span>
                {change >= 0 ? "Cambio a devolver" : "Falta por cubrir"}
              </span>
              <strong>{money(Math.abs(change))}</strong>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function CourseBooksView({
  products,
  students,
  customers,
  sales,
  studentBookRecords,
  onAddStudent,
  onAssignBook,
  onUnassignBook,
  onToggleBookRecord,
}) {
  const courses = [
    ...new Map(
      [
        ...students.map((student) => student.course),
        ...products.flatMap((product) => product.bookCourses || []),
      ]
        .filter(Boolean)
        .map((item) => [normalizedValue(item), item]),
    ).values(),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const [selectedCourse, setSelectedCourse] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const course = selectedCourse || courses[0] || "";
  const courseStudents = students
    .filter((student) => normalizedValue(student.course) === normalizedValue(course))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const courseBooks = products
    .filter((product) => bookAssignedToCourse(product, course))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const bought = (studentId, productId) =>
    studentHasPurchasedBook(studentId, productId, sales, studentBookRecords);
  const assign = (event) => {
    event.preventDefault();
    if (!selectedProductId) return;
    const assignedCourse = courseInput || course;
    onAssignBook(selectedProductId, assignedCourse);
    setSelectedCourse(assignedCourse);
    setCourseInput("");
  };
  return (
    <section className="course-books-view">
      <div className="panel">
        <PanelHeader
          title="Libros asignados por curso"
          detail="Elige los productos del inventario que corresponden a cada curso."
        />
        <div className="course-books-toolbar">
          <label>
            Curso para consultar
            <select value={course} onChange={(event) => setSelectedCourse(event.target.value)}>
              {!courses.length && <option value="">Registra estudiantes o asigna un libro</option>}
              {courses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <form className="course-book-assign" onSubmit={assign}>
            <label>
              Libro del inventario
              <select
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.target.value)}
                required
              >
                <option value="">Seleccionar producto</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>{product.name} · {product.id}</option>
                ))}
              </select>
            </label>
            <label>
              Asignar al curso
              <input
                value={courseInput || course}
                onChange={(event) => setCourseInput(event.target.value)}
                placeholder="Ej. 1ro Primaria A"
                required
              />
            </label>
            <button className="primary-button" type="submit"><Plus size={16} /> Asignar libro</button>
          </form>
          <div className="course-book-list">
            {courseBooks.length ? courseBooks.map((book) => (
              <div key={book.id}>
                <span><strong>{book.name}</strong><small>{book.id} · {money(book.price)}</small></span>
                <button className="icon-button" type="button" title="Quitar del curso" onClick={() => onUnassignBook(book.id, course)}>
                  <Trash2 size={14} />
                </button>
              </div>
            )) : <p className="empty-state">Aún no hay libros asignados a este curso.</p>}
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={!courseBooks.length}
            onClick={() => printCourseBooks(course, courseBooks)}
          >
            <Printer size={16} /> Imprimir lista para familias
          </button>
        </div>
      </div>

      <div className="panel">
        <PanelHeader
          title="Estudiantes y avance de compra"
          detail="El registro es individual y está vinculado a la familia responsable. Los libros pendientes son solo informativos."
          action={courseStudents.length > 0 && courseBooks.length > 0 ? (
            <button className="secondary-button" type="button" onClick={() => printCourseProgress(course, courseStudents, courseBooks, bought)}>
              <Printer size={16} /> Imprimir control
            </button>
          ) : null}
        />
        {courseBooks.length && courseStudents.length ? (
          <div className="course-progress-table">
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Familia / padre</th>
                  {courseBooks.map((book) => <th key={book.id}>{book.name}</th>)}
                  <th>Avance</th>
                </tr>
              </thead>
              <tbody>
                {courseStudents.map((student) => {
                  const boughtCount = courseBooks.filter((book) => bought(student.id, book.id)).length;
                  return (
                    <tr key={student.id}>
                      <td><strong>{student.name}</strong>{student.carnet && <small>{student.carnet}</small>}</td>
                      <td>{student.guardianName || "—"}{student.family && <small>{student.family}</small>}</td>
                      {courseBooks.map((book) => {
                        const purchased = bought(student.id, book.id);
                        const hasSale = sales.some((sale) =>
                          sale.status !== "Anulada" && sale.studentId === student.id &&
                          sale.items?.some((item) => item.id === book.id));
                        const manualRecord = studentBookRecords.some((record) =>
                          record.studentId === student.id && record.productId === book.id &&
                          record.status !== "Anulado");
                        return (
                          <td key={book.id}>
                            {hasSale ? (
                              <span className="book-purchase-status purchased">Comprado</span>
                            ) : (
                              <button
                                type="button"
                                className={`book-purchase-status ${purchased ? "purchased" : "pending"}`}
                                onClick={() => onToggleBookRecord(student, book, !manualRecord)}
                                title={manualRecord ? "Deshacer registro manual" : "Registrar compra anterior hecha fuera del sistema"}
                              >
                                {purchased ? "Comprado · manual" : "Pendiente"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td>{boughtCount}/{courseBooks.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            {!courseStudents.length ? "Registra estudiantes para consultar quién compró sus libros." : "Asigna los libros del curso para mostrar el avance."}
          </p>
        )}
      </div>

      <div className="panel">
        <PanelHeader
          title="Registrar estudiante"
          detail="Cada alumno tiene su propio historial de libros, aunque comparta familia con otros."
        />
        {!customers.length && <p className="schema-warning-banner">Primero registra a la madre, padre o tutor en la sección Clientes.</p>}
        <form className="course-student-form" onSubmit={onAddStudent}>
          <label>Nombre completo<input name="name" required placeholder="Nombre del estudiante" /></label>
          <label>Carnet / código (opcional)<input name="carnet" placeholder="Carnet de identidad" /></label>
          <label>Curso<input name="course" required list="registered-courses" placeholder="Ej. 1ro Primaria A" /></label>
          <datalist id="registered-courses">{courses.map((item) => <option key={item} value={item} />)}</datalist>
          <label>Madre, padre o tutor
            <select name="guardianId" required defaultValue="">
              <option value="" disabled>Seleccionar familia</option>
              {customers.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.name}{customer.family ? ` · ${customer.family}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={!customers.length}><Plus size={16} /> Registrar estudiante</button>
        </form>
        {students.length > 0 && (
          <div className="course-student-list">
            <strong>{students.length} estudiante(s) registrado(s)</strong>
            <span>{students.map((student) => `${student.name} · ${student.course}`).join("  |  ")}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SaleView({
  products,
  customers,
  students,
  sales,
  studentBookRecords,
  selectedStudentId,
  onStudentChange,
  categories,
  category,
  setCategory,
  search,
  setSearch,
  addToCart,
  cart,
  updateQuantity,
  setCart,
  saleTotal,
  onSubmit,
  onScan,
  onQuickStock,
  onNewCustomer,
}) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const matchingCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.carnet} ${customer.phone || ""} ${customer.family || ""} ${customer.relation || ""}`
      .toLowerCase()
      .includes(customerQuery.toLowerCase()),
  );
  const customerSuggestions = matchingCustomers.slice(0, 8);
  const selectedRecord = customers.find((item) => item.id === selectedCustomer);
  const selectedStudent = students.find((item) => item.id === selectedStudentId);
  const chooseCustomer = (id) => {
    setSelectedCustomer(id);
    const record = customers.find((item) => item.id === id);
    setCustomerQuery(record?.name || "");
  };
  return (
    <section className="sale-layout">
      <div className="panel product-picker">
        <PanelHeader
          title="Catálogo"
          detail="Selecciona productos o escanea un código"
          action={
            <button className="secondary-button" type="button" onClick={onScan}>
              <QrCode size={16} />
              Escanear
            </button>
          }
        />
        <div className="table-tools">
          <div className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o código"
            />
          </div>
        </div>
        <div className="category-tabs">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="product-grid">
          {products.map((product) => (
            (() => {
              const isCourseBook = Boolean(product.bookCourses?.length);
              const alreadyPurchased = isCourseBook && selectedStudent &&
                studentHasPurchasedBook(selectedStudent.id, product.id, sales, studentBookRecords);
              const wrongCourse = isCourseBook && selectedStudent &&
                !bookAssignedToCourse(product, selectedStudent.course);
              const disabled = isCourseBook && (!selectedStudent || alreadyPurchased || wrongCourse);
              return (
            <button
              type="button"
              className={`product-card ${disabled ? "book-product-disabled" : ""}`}
              key={product.id}
              onClick={() => addToCart(product)}
              disabled={disabled}
            >
              <ProductIcon category={product.category} />
              <span>
                <strong>{product.name}</strong>
                <small>
                  {product.id} · {product.stock} disponibles
                  {isCourseBook && ` · ${alreadyPurchased ? "Ya comprado" : wrongCourse ? "Otro curso" : product.bookCourses.join(", ")}`}
                </small>
              </span>
              <b>{money(product.price)}</b>
            </button>
              );
            })()
          ))}
        </div>
      </div>
      <form className="panel cart-panel" onSubmit={onSubmit}>
        <PanelHeader
          title="Venta actual"
          detail={`${cart.length} productos`}
          action={
            <span className="cart-badge">
              <ShoppingCart size={15} />
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          }
        />
        {cart.length ? (
          <div className="cart-lines">
            {cart.map((item) => (
              <div className="cart-line" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {money(item.price)} c/u · Stock restante: {Math.max(0, item.stock - item.quantity)}
                  </small>
                  {item.stock - item.quantity <= 0 && (
                    <em className="stock-warning">Stock agotado al emitir</em>
                  )}
                </span>
                <input
                  aria-label={`Cantidad de ${item.name}`}
                  type="number"
                  min={item.unit === "cm" || item.unit === "m" ? "0.01" : "1"}
                  max={item.bookCourses?.length ? "1" : undefined}
                  step={item.unit === "cm" || item.unit === "m" ? "0.01" : "1"}
                  value={item.quantity}
                  onChange={(event) =>
                    updateQuantity(item.id, event.target.value)
                  }
                />
                <b>{money(item.price * item.quantity)}</b>
                <button
                  type="button"
                  onClick={() =>
                    setCart((current) =>
                      current.filter((line) => line.id !== item.id),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  className="stock-entry-button"
                  onClick={() => onQuickStock(item)}
                  title="Registrar movimiento de inventario"
                >
                  <PackagePlus size={14} />
                  Movimiento de inventario
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-cart">
            <ShoppingCart size={29} />
            <p>La venta está vacía</p>
            <small>Selecciona un producto para comenzar</small>
          </div>
        )}
        <div className="sale-summary">
          <label>
            Cliente
            <input
              value={customerQuery}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                setSelectedCustomer("");
              }}
              placeholder="Buscar por nombre, carnet o familia"
              aria-label="Buscar cliente por nombre, carnet o familia"
            />
            <span className="customer-entry">
              <select
                name="customer"
                value={selectedCustomer}
                onChange={(event) => chooseCustomer(event.target.value)}
              >
                <option value="">Consumidor sin registro</option>
                {matchingCustomers.map((customer) => (
                  <option value={customer.id} key={customer.id}>
                    {customer.name}
                    {customer.relation ? ` · ${customer.relation}` : ""}
                    {customer.family ? ` · ${customer.family}` : ""}
                    {customer.carnet ? ` · Carnet ${customer.carnet}` : ""}
                  </option>
                ))}
              </select>
              <button
                className="secondary-button"
                type="button"
                onClick={onNewCustomer}
                title="Registrar cliente"
              >
                <Plus size={15} />
              </button>
            </span>
          </label>
          <label>
            Estudiante que recibe los libros
            <select
              value={selectedStudentId}
              onChange={(event) => onStudentChange(event.target.value)}
            >
              <option value="">Sin estudiante seleccionado</option>
              {students.map((student) => (
                <option value={student.id} key={student.id}>
                  {student.name} · {student.course} · {student.guardianName || "Sin familia"}
                </option>
              ))}
            </select>
            <small className="form-note">
              Obligatorio para libros asignados por curso; evita duplicados y atribuye la compra.
            </small>
          </label>
          {customerQuery && customerSuggestions.length > 0 && (
            <div className="customer-suggestions" role="listbox">
              {customerSuggestions.map((customer) => (
                <button
                  type="button"
                  key={customer.id}
                  onClick={() => chooseCustomer(customer.id)}
                >
                  <strong>{customer.name}</strong>
                  <small>
                    {[customer.carnet && `Carnet ${customer.carnet}`, customer.family, customer.relation]
                      .filter(Boolean)
                      .join(" · ") || "Cliente registrado"}
                  </small>
                </button>
              ))}
            </div>
          )}
          {selectedRecord && (
            <p className="selected-customer-note">
              Datos del cliente: {selectedRecord.name}
              {selectedRecord.carnet ? ` · Carnet ${selectedRecord.carnet}` : ""}
              {selectedRecord.phone ? ` · ${selectedRecord.phone}` : ""}
            </p>
          )}
          <PaymentFields total={saleTotal} />
          <div className="total-line">
            <span>Total a cobrar</span>
            <strong>{money(saleTotal)}</strong>
          </div>
          <button className="primary-button full" type="submit">
            <Receipt size={17} />
            Emitir recibo
          </button>
        </div>
      </form>
    </section>
  );
}
function InventoryView({
  products,
  sales,
  cash,
  purchaseOrders,
  search,
  setSearch,
  onAdd,
  onQr,
  onEdit,
  onStock,
  onNewOrder,
  onReceiveOrder,
  onPrintOrder,
  onPrintAllQrs,
}) {
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const matchesReportDate = (value, afterEnd = false) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const from = reportStart ? new Date(`${reportStart}T00:00:00`) : null;
    const to = reportEnd ? new Date(`${reportEnd}T23:59:59.999`) : null;
    if (afterEnd) return Boolean(to && date > to);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  };
  const inventoryReport = products.map((product) => {
    const saleLines = sales.flatMap((sale) =>
      sale.status === "Anulada" || !matchesReportDate(sale.date)
        ? []
        : sale.items
            .filter((item) => item.id === product.id)
            .map((item) => ({ ...item, date: sale.date })),
    );
    const futureSales = sales.flatMap((sale) =>
      sale.status === "Anulada" || !matchesReportDate(sale.date, true)
        ? []
        : sale.items.filter((item) => item.id === product.id),
    );
    const productMovements = (cash.movements || []).filter(
      (movement) => movement.productId === product.id,
    );
    const periodMovements = productMovements.filter((movement) =>
      matchesReportDate(movement.date),
    );
    const futureMovements = productMovements.filter((movement) =>
      matchesReportDate(movement.date, true),
    );
    const entries = periodMovements
      .filter((movement) => movement.operation === "Entrada")
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    const exits = periodMovements
      .filter((movement) => movement.operation === "Salida")
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    const futureEntries = futureMovements
      .filter((movement) => movement.operation === "Entrada")
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    const futureExits = futureMovements
      .filter((movement) => movement.operation === "Salida")
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    const sold = saleLines.reduce((sum, item) => sum + item.quantity, 0);
    const futureSold = futureSales.reduce((sum, item) => sum + item.quantity, 0);
    const finalStock = product.stock - futureEntries + futureExits + futureSold;
    const initialStock = finalStock - entries + exits + sold;
    const purchaseCost = Number(product.purchaseCost || 0);
    const salePrice = Number(product.price || 0);
    return {
      ...product,
      initialStock,
      sold,
      finalStock,
      purchaseCost,
      salePrice,
      initialCostValue: initialStock * purchaseCost,
      soldCostValue: sold * purchaseCost,
      soldSalesValue: sold * salePrice,
      finalCostValue: finalStock * purchaseCost,
      finalSalesValue: finalStock * salePrice,
      grossMarginValue: sold * (salePrice - purchaseCost),
    };
  });
  const reportTotals = inventoryReport.reduce(
    (totals, product) => ({
      initialStock: totals.initialStock + product.initialStock,
      sold: totals.sold + product.sold,
      finalStock: totals.finalStock + product.finalStock,
      initialCostValue: totals.initialCostValue + product.initialCostValue,
      soldCostValue: totals.soldCostValue + product.soldCostValue,
      soldSalesValue: totals.soldSalesValue + product.soldSalesValue,
      finalCostValue: totals.finalCostValue + product.finalCostValue,
      finalSalesValue: totals.finalSalesValue + product.finalSalesValue,
      grossMarginValue: totals.grossMarginValue + product.grossMarginValue,
    }),
    {
      initialStock: 0,
      sold: 0,
      finalStock: 0,
      initialCostValue: 0,
      soldCostValue: 0,
      soldSalesValue: 0,
      finalCostValue: 0,
      finalSalesValue: 0,
      grossMarginValue: 0,
    },
  );
  return (
    <section className="inventory-stack">
      <CollapsiblePanel
        title="Pedidos a proveedores"
        detail="Control de pedidos, entregas parciales y pagos"
        defaultOpen={false}
        action={
          <button className="primary-button small" type="button" onClick={onNewOrder}>
            <Plus size={15} /> Nuevo pedido
          </button>
        }
      >
        {purchaseOrders.length ? purchaseOrders.map((order) => (
          <div className="purchase-order-row" key={order.id}>
            <span>
              <strong>{order.id} · {order.supplier}</strong>
              <small>
                {order.status} · {order.items.reduce((sum, item) => sum + item.received, 0)} de {order.items.reduce((sum, item) => sum + item.quantity, 0)} recibidos · Saldo {money(order.balance)}
              </small>
            </span>
            <b>{money(order.total)}</b>
            <button className="secondary-button small" type="button" onClick={() => onReceiveOrder(order)}>
              Registrar recepción
            </button>
            <button className="secondary-button small purchase-order-print-button" type="button" onClick={() => onPrintOrder(order)}>
              <FileText size={15} />
              Imprimir nota
            </button>
          </div>
        )) : (
          <div className="empty-state"><ClipboardList size={26} /><p>No hay pedidos registrados.</p></div>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Inventario de productos"
        detail="Uniformes, libros, fotocopias y útiles"
        defaultOpen={true}
        action={
          <span className="button-pair">
            <button
              className="secondary-button small"
              type="button"
              disabled={!products.length}
              onClick={onPrintAllQrs}
            >
              <QrCode size={15} />
              Imprimir todos los QRs
            </button>
            <button className="primary-button small" onClick={onAdd}>
              <Plus size={16} />
              Nuevo producto
            </button>
          </span>
        }
      >
        <div className="table-tools">
          <div className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto..."
            />
          </div>
        </div>
        <div className="inventory-table">
          <div className="inventory-head inventory-products-head">
            <span>Producto</span>
            <span>Categoría / sección</span>
            <span>Costo compra</span>
            <span>Precio</span>
            <span>Existencia</span>
            <span>Acciones</span>
          </div>
          {products
            .filter((item) =>
              `${item.name} ${item.id}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((product) => (
              <div className="inventory-row inventory-products-row" key={product.id}>
                <span className="product-cell">
                  <ProductIcon category={product.category} />
                  <strong>
                    {product.name}
                    <small>{product.id}</small>
                  </strong>
                </span>
                <span>
                  {product.category}
                  <small className="report-section-tag">
                    {reportGroup(product.category, product.section)}
                  </small>
                </span>
                <span>{money(product.purchaseCost || 0)}</span>
                <span>{money(product.price)}</span>
                <span
                  className={product.stock <= product.minStock ? "low-stock" : ""}
                >
                  {product.stock} {product.unit}
                </span>
                <span className="inventory-actions">
                  <button
                    className="icon-action"
                    onClick={() => onEdit(product)}
                    title="Editar producto"
                  >
                    <Settings size={15} />
                  </button>
                  <button
                    className="icon-action"
                    onClick={() => onStock(product)}
                    title="Registrar movimiento de inventario"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    className="icon-action"
                    onClick={() => onQr(product)}
                    title="Ver código QR"
                  >
                    <QrCode size={15} />
                  </button>
                </span>
              </div>
            ))}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Informe de inventario"
        detail="Existencias, costos, ventas y valorización del período"
        defaultOpen={false}
        action={
          <button
            className="secondary-button small"
            type="button"
            onClick={() =>
              printInventoryReport(inventoryReport, reportTotals, {
                start: reportStart,
                end: reportEnd,
              })
            }
          >
            <FileText size={15} />
            Imprimir informe
          </button>
        }
      >
        <div className="date-filter-fields">
          <label>
            <span>Desde</span>
            <input
              type="date"
              value={reportStart}
              onChange={(event) => setReportStart(event.target.value)}
            />
          </label>
          <label>
            <span>Hasta</span>
            <input
              type="date"
              value={reportEnd}
              onChange={(event) => setReportEnd(event.target.value)}
            />
          </label>
        </div>
        <div className="inventory-table">
          <div className="inventory-head inventory-report-head">
            <span>Producto</span>
            <span>Costo compra</span>
            <span>Precio venta</span>
            <span>Inventario inicial</span>
            <span>Cantidad vendida</span>
            <span>Saldo final</span>
            <span>Valor costo final</span>
          </div>
          {inventoryReport.map((product) => (
            <div className="inventory-row inventory-report-row" key={product.id}>
              <span className="product-cell">
                <ProductIcon category={product.category} />
                <strong>
                  {product.name}
                  <small>{product.id}</small>
                </strong>
              </span>
              <span>{money(product.purchaseCost)}</span>
              <span>{money(product.salePrice)}</span>
              <span>{product.initialStock} {product.unit}</span>
              <span>{product.sold} {product.unit}</span>
              <span>{product.finalStock} {product.unit}</span>
              <span>{money(product.finalCostValue)}</span>
            </div>
          ))}
          <div className="inventory-row inventory-report-total">
            <strong>Totales</strong>
            <span>-</span>
            <span>-</span>
            <strong>{reportTotals.initialStock} und.</strong>
            <strong>{reportTotals.sold} und.</strong>
            <strong>{reportTotals.finalStock} und.</strong>
            <strong>{money(reportTotals.finalCostValue)}</strong>
          </div>
        </div>
        <div className="inventory-report-summary">
          <span>Valor inicial al costo: <strong>{money(reportTotals.initialCostValue)}</strong></span>
          <span>Ventas a precio de venta: <strong>{money(reportTotals.soldSalesValue)}</strong></span>
          <span>Costo de lo vendido: <strong>{money(reportTotals.soldCostValue)}</strong></span>
          <span>Margen bruto estimado: <strong>{money(reportTotals.grossMarginValue)}</strong></span>
        </div>
      </CollapsiblePanel>
    </section>
  );
}

function PurchaseOrderModal({ products, onSubmit, onClose }) {
  const [lines, setLines] = useState([{ productId: products[0]?.id || "", quantity: 1, unitCost: products[0]?.purchaseCost || 0 }]);
  const updateLine = (index, field, value) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: field === "productId" ? value : Number(value) } : line));
  return (
    <div className="modal-backdrop">
      <form className="modal form-modal purchase-order-modal" onSubmit={(event) => { event.preventDefault(); event.currentTarget.elements.items.value = JSON.stringify(lines.filter((line) => line.productId && line.quantity > 0).map((line) => ({ ...line, productName: products.find((product) => product.id === line.productId)?.name || "", unit: products.find((product) => product.id === line.productId)?.unit || "und." }))); onSubmit(event); }}>
        <button type="button" className="close-button" onClick={onClose}><X size={18} /></button>
        <div className="modal-icon"><ClipboardList size={22} /></div>
        <h2>Nuevo pedido a proveedor</h2>
        <label>Proveedor<input required name="supplier" placeholder="Nombre del proveedor" /></label>
        <div className="purchase-order-lines">
          {lines.map((line, index) => (
            <div className="purchase-order-line" key={`${index}-${line.productId}`}>
              <select value={line.productId} onChange={(event) => updateLine(index, "productId", event.target.value)}>
                <option value="">Producto</option>
                {products.map((product) => <option value={product.id} key={product.id}>{product.name} · {product.unit || "und."}</option>)}
              </select>
              <input 
                type="number" 
                min="0" 
                step="any" 
                value={line.quantity} 
                onChange={(event) => updateLine(index, "quantity", event.target.value)} 
                aria-label="Cantidad pedida" 
              />

              <input 
                type="number" 
                min="0" 
                step="any" 
                value={line.unitCost} 
                onChange={(event) => updateLine(index, "unitCost", event.target.value)} 
                aria-label="Costo unitario" 
              />

              <button 
                type="button" 
                className="icon-action" 
                onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="secondary-button small" onClick={() => setLines((current) => [...current, { productId: products[0]?.id || "", quantity: 1, unitCost: products[0]?.purchaseCost || 0 }])}><Plus size={14} /> Añadir producto</button>
        <label>Adelanto o pago inicial<input name="paid" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label>Notas<input name="notes" placeholder="Condiciones o fecha prometida" /></label>
        <input type="hidden" name="items" />
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit"><Check size={17} /> Guardar pedido</button></div>
      </form>
    </div>
  );
}

function ReceiveOrderModal({ order, onSubmit, onClose }) {
  return (
    <div className="modal-backdrop">
      <form className="modal form-modal" onSubmit={onSubmit}>
        <button type="button" className="close-button" onClick={onClose}><X size={18} /></button>
        <div className="modal-icon"><PackagePlus size={22} /></div>
        <h2>Recibir pedido {order.id}</h2>
        <p className="form-note">Proveedor: {order.supplier}. Registra solo lo que llegó.</p>
        {order.items.map((item, index) => (
          <label key={item.productId}>{item.productName} · pedido: {item.quantity} {item.unit}
            <input name={`received-${index}`} type="number" min="0" max={item.quantity} step="0.01" defaultValue={item.received} />
          </label>
        ))}
        <label>Pago adicional<input name="payment" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <input type="hidden" name="orderId" value={order.id} />
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit"><Check size={17} /> Registrar recepción</button></div>
      </form>
    </div>
  );
}

function PurchaseOrderPrint({ order, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal receipt-modal purchase-order-print" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose}><X size={18} /></button>
        <div className="receipt-top"><img className="receipt-logo" src="/logo-vida-verdad.jpg" alt="Logo Vida y Verdad" /><span><strong>Vida y Verdad Caranavi</strong><small>Orden de pedido a proveedor</small></span></div>
        <div className="receipt-number"><span>{order.id}</span><small>{new Date(order.date).toLocaleString("es-BO")}</small></div>
        <p className="receipt-note"><strong>Proveedor:</strong> {order.supplier}<br />Estado: {order.status}</p>
        <div className="receipt-lines">
          {order.items.map((item) => <div key={item.productId}><span><strong>{item.productName}</strong><small>{item.quantity} {item.unit} x {money(item.unitCost)}</small></span><b>{money(item.quantity * item.unitCost)}</b></div>)}
        </div>
        <div className="receipt-total"><span>Total</span><strong>{money(order.total)}</strong></div>
        <p className="receipt-note">Adelanto/pagado: {money(order.paid)}<br />Saldo: {money(order.balance)}<br />{order.notes}</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cerrar</button><button className="primary-button" onClick={() => printElement(".purchase-order-print")}><FileText size={16} /> Imprimir</button></div>
      </div>
    </div>
  );
}
function CustomerView({ customers, sales, onImport, onAdd, onEdit }) {
  const [query, setQuery] = useState("");
  const filteredCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.id} ${customer.carnet} ${customer.phone || ""} ${customer.family || ""} ${customer.relation || ""}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  return (
    <section className="panel lower-panel">
      <PanelHeader
        title="Clientes y familias"
        detail="Carnet, parentesco, compras e importación masiva"
        action={
          <span className="button-pair">
            <button className="primary-button small" type="button" onClick={onAdd}>
              <Plus size={16} />
              Nuevo cliente
            </button>
            <label className="secondary-button file-button">
              <Upload size={16} />
              Importar CSV
              <input type="file" accept=".csv,text/csv" onChange={onImport} />
            </label>
          </span>
        }
      />
      <div className="customer-search-row" style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
        <div className="search-box">
          <Search size={16} />
          <input
            type="search"
            placeholder="Buscar por nombre, carnet, teléfono o familia"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="customer-result-count" style={{ color: "var(--muted)", fontSize: 10, whiteSpace: "nowrap" }}>
          {filteredCustomers.length} clientes
        </span>
      </div>
      <div className="inventory-table">
        <div className="inventory-head customers-head" style={{ gridTemplateColumns: "2fr 1.3fr .9fr .9fr .7fr 35px" }}>
          <span>Cliente</span>
          <span>Familia</span>
          <span>Carnet</span>
          <span>Teléfono</span>
          <span>Compras</span>
          <span>Acciones</span>
        </div>
        {filteredCustomers.map((customer) => (
          <div className="inventory-row customers-row" key={customer.id} style={{ gridTemplateColumns: "2fr 1.3fr .9fr .9fr .7fr 35px" }}>
            <span className="product-cell">
              <span className="product-icon coral">
                <UserRound size={17} />
              </span>
              <strong>
                {customer.name}
                <small>
                  {customer.id}
                  {customer.relation ? ` · ${customer.relation}` : ""}
                </small>
              </strong>
            </span>
            <span>{customer.family || "Sin familia"}</span>
            <span>{customer.carnet || "Sin carnet"}</span>
            <span>{customer.phone || "-"}</span>
            <span>
              {
                sales.filter(
                  (sale) =>
                    sale.customerId === customer.id ||
                    sale.payerId === customer.id ||
                    sale.customer === customer.name,
                ).length
              }
            </span>
            <span className="inventory-actions">
              <button
                className="icon-action"
                type="button"
                title="Editar cliente"
                onClick={() => onEdit(customer)}
              >
                <Settings size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
const reportGroup = (category = "", section = "") => {
  const explicit = String(section || "").trim().toUpperCase();
  if (reportSections.includes(explicit)) return explicit;
  const value = normalizedValue(category);
  if (value.includes("libro")) return "LIBROS";
  if (value.includes("agenda")) return "AGENDAS";
  if (value.includes("polera") || value.includes("polo")) return "POLERAS";
  if (value.includes("blusa") || value.includes("camisa"))
    return "BLUSAS Y CAMISAS";
  if (value.includes("tela")) return "TELA";
  if (value.includes("deport")) return "DEPORTIVOS";
  return "VARIOS";
};
function HistoryView({
  sales,
  cash,
  products,
  filter,
  setFilter,
  onSelect,
  onVoid,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
}) {
  const [query, setQuery] = useState("");
  const matchesDate = (value) => {
    if (!value) return true;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return true;
    const from = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const to = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  };
  const matchesFilter = (entry, activeFilter) => {
    if (activeFilter === "Todos") return true;
    const incoming = ["Ingreso", "Otro ingreso"];
    const outgoing = ["Egreso", "Otro egreso"];
    const groups = {
      Venta: ["Venta"],
      Ingreso: incoming,
      Egreso: outgoing,
      "Entrada de inventario": ["Entrada de inventario"],
      "Salida de inventario": ["Salida de inventario"],
    };
    return (groups[activeFilter] || [activeFilter]).includes(entry.kind);
  };
  const entries = [
    ...sales.map((sale) => ({ ...sale, kind: "Venta", dateValue: sale.date })),
    ...cash.movements.map((movement) => ({
      ...movement,
      kind: movement.kind || movement.type,
      dateValue: movement.date,
    })),
  ]
    .filter((entry) => matchesDate(entry.dateValue))
    .filter((entry) => matchesFilter(entry, filter))
    .filter((entry) =>
      `${entry.id} ${entry.customer || ""} ${entry.carnet || ""} ${entry.concept || ""} ${entry.family || ""} ${entry.payer || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => new Date(b.dateValue) - new Date(a.dateValue));
  const filteredSales = sales.filter(
    (sale) => sale.status !== "Anulada" && matchesDate(sale.date),
  );
  const groups = filteredSales.reduce((result, sale) => {
    sale.items.forEach((item) => {
      const product =
        products.find((candidate) => candidate.id === item.id) || item;
      const group = reportGroup(product.category, product.section);
      const itemValue = item.price * item.quantity;
      const share = sale.total ? itemValue / sale.total : 0;
      const cash = sale.cashAmount * share;
      const qr = sale.qrAmount * share;
      const current = result[group] || { total: 0, cash: 0, qr: 0 };
      result[group] = {
        total: current.total + itemValue,
        cash: current.cash + cash,
        qr: current.qr + qr,
      };
    });
    return result;
  }, {});
  return (
    <section className="history-stack">
      <div className="report-grid">
        {reportSections.map((group) => {
          const summary = groups[group] || { total: 0, cash: 0, qr: 0 };
          return (
            <div className="report-card" key={group}>
              <span>{group}</span>
              <strong>{money(summary.total)}</strong>
              <small>
                Efectivo {money(summary.cash)} · QR {money(summary.qr)}
              </small>
            </div>
          );
        })}
      </div>
      <section className="panel lower-panel">
        <PanelHeader
          title="Historial general"
          detail="Ventas, ingresos y egresos por recibo o cliente"
        />
        <div className="history-tools">
          <div className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Recibo, cliente, carnet o concepto..."
            />
          </div>
          <div className="date-filter-block">
            <div className="date-filter-header">
              <strong className="date-range-title">Buscar por rango de fechas</strong>
              <span className="date-filter-badge">
                <CalendarRange size={13} />
                {startDate || endDate ? "Rango activo" : "Todo el período"}
              </span>
              {(startDate || endDate) && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="date-filter-fields">
              <label>
                <span>Desde</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                <span>Hasta</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option>Todos</option>
            <option>Venta</option>
            <option>Ingreso</option>
            <option>Egreso</option>
            <option>Otro ingreso</option>
            <option>Otro egreso</option>
            <option>Entrada de inventario</option>
            <option>Salida de inventario</option>
          </select>
        </div>
        <div className="history-summary">
          <small>
            {entries.length} recibos emitidos
            {(startDate || endDate) &&
              ` entre ${startDate || "inicio"} y ${endDate || "hoy"}`}
          </small>
        </div>
        <div className="history-list">
          {entries.length ? (
            entries.map((entry) => {
              const isOutgoing = ["Egreso", "Otro egreso"].includes(entry.kind);
              return (
                <div
                  className="history-row history-button"
                  key={`${entry.kind}-${entry.id}`}
                  onClick={() => onSelect(entry)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onSelect(entry);
                  }}
                >
                  <span
                    className={`history-icon ${isOutgoing ? "out" : "in"}`}
                  >
                    {entry.kind === "Venta" ? (
                      <Receipt size={15} />
                    ) : isOutgoing ? (
                      <ArrowUpRight size={15} />
                    ) : (
                      <ArrowDownToLine size={15} />
                    )}
                  </span>
                  <span>
                    <strong>
                      {entry.kind} · {entry.id}
                    </strong>
                    <small>
                      {entry.customer || entry.concept}{" "}
                      {entry.family ? `· ${entry.family} ` : ""}
                      {entry.payer && entry.payer !== entry.customer
                        ? `· Pagó ${entry.payer} `
                        : ""}
                      {entry.carnet ? `· Carnet ${entry.carnet} ` : ""}
                      ·{" "}
                      {new Date(entry.dateValue).toLocaleString("es-BO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </small>
                  </span>
                  <b className={isOutgoing ? "" : "positive"}>
                    {isOutgoing ? "-" : "+"}
                    {money(entry.amount || entry.total)}
                  </b>
                  <button
                    type="button"
                    className="history-void-button"
                    disabled={entry.status === "Anulada"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onVoid(entry);
                    }}
                  >
                    {entry.status === "Anulada" ? "Anulado" : "Anular"}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <ClipboardList size={28} />
              <p>No hay resultados con estos filtros.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
function CsvDataCard({
  icon: Icon,
  title,
  description,
  onImport,
  onExport,
  onTemplate,
}) {
  return (
    <div className="import-card">
      <Icon size={20} />
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="csv-actions">
        <button className="secondary-button small" type="button" onClick={onTemplate}>
          <Download size={15} /> Plantilla
        </button>
        <button className="secondary-button small" type="button" onClick={onExport}>
          <Download size={15} /> Exportar actual
        </button>
        <label className="primary-button small file-button">
          <Upload size={15} /> Importar CSV
          <input type="file" accept=".csv,text/csv" onChange={onImport} />
        </label>
      </div>
    </div>
  );
}
function SettingsView({
  onImportProducts,
  onImportCustomers,
  onImportMaterials,
  onExportProducts,
  onExportCustomers,
  onExportMaterials,
  onDownloadTemplate,
  online,
  syncStatus,
  schemaWarnings,
  syncedRecordCounts,
  onRetrySync,
  theme,
  onToggleTheme,
}) {
  const missingTables = schemaWarnings.filter((warning) => !warning.includes("."));
  const missingColumns = schemaWarnings.filter((warning) => warning.includes("."));
  const statusLabels = {
    loading: "Conectando con Supabase…",
    syncing: "Sincronizando cambios…",
    synced: "Sincronizado con Supabase",
    schema: "Supabase conectado; esquema incompleto",
    error: "No se pudo sincronizar con Supabase",
    local: "Modo local activo",
  };
  return (
    <section className="panel lower-panel settings-view">
      <PanelHeader
        title="Configuración"
        detail="Carga masiva y estado de conexión"
      />
      <div className="settings-status">
        <span className={`status-dot ${syncStatus === "error" || !online ? "borrowed" : syncStatus === "schema" ? "schema-warning" : ""}`} />
        <strong>{statusLabels[syncStatus] || statusLabels.local}</strong>
        <small>
          {online
            ? schemaWarnings?.length
              ? `${missingTables.length ? `Faltan tablas: ${missingTables.join(", ")}. ` : ""}${missingColumns.length ? `Faltan columnas: ${missingColumns.join(", ")}. ` : ""}Los datos restantes se sincronizan; ejecuta supabase-schema.sql y vuelve a revisar el esquema para sincronizar también esos campos.`
              : "La carga y cada guardado confirman errores de Supabase; si hay un fallo se indica aquí."
            : "Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para operar en línea."}
        </small>
        {online && Number.isFinite(syncedRecordCounts?.products) && (
          <small className="sync-count">
            Confirmados en Supabase: {syncedRecordCounts.products} productos
          </small>
        )}
        {online && (
          <button className="secondary-button small" type="button" onClick={onRetrySync}>
            <Upload size={14} />
            {syncStatus === "error" || syncStatus === "schema" ? "Revisar conexión / esquema" : "Sincronizar ahora"}
          </button>
        )}
      </div>
      <div className="settings-theme">
        <div>
          <strong>Tema de la aplicación</strong>
          <small>El tema elegido se conserva en este dispositivo.</small>
        </div>
        <button className="secondary-button" type="button" onClick={onToggleTheme}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Usar tema claro" : "Usar tema oscuro"}
        </button>
      </div>
      <div className="import-grid">
        <CsvDataCard
          icon={PackagePlus}
          title="Productos para la venta"
          description="id, nombre, categoria, seccion, costo_de_compra, precio, stock, stock_minimo, unidad, cursos"
          onImport={onImportProducts}
          onExport={onExportProducts}
          onTemplate={() => onDownloadTemplate("products")}
        />
        <CsvDataCard
          icon={UsersRound}
          title="Clientes"
          description="id, nombre, carnet, telefono, familia, parentesco"
          onImport={onImportCustomers}
          onExport={onExportCustomers}
          onTemplate={() => onDownloadTemplate("customers")}
        />
        <CsvDataCard
          icon={ClipboardList}
          title="Materiales prestables"
          description="id, nombre, categoria, ubicacion, estado, prestado_a, devolucion"
          onImport={onImportMaterials}
          onExport={onExportMaterials}
          onTemplate={() => onDownloadTemplate("materials")}
        />
      </div>
    </section>
  );
}
function AccountsReceivableView({
  receivables,
  schemaWarnings,
  onAdd,
  onPayment,
  onInfocredStatus,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [paymentFor, setPaymentFor] = useState("");
  const [paymentMode, setPaymentMode] = useState("total");
  const totalOwed = receivables.reduce(
    (sum, record) => sum + Math.max(0, Number(record.total) - Number(record.paid)),
    0,
  );
  const visibleRecords = receivables.filter((record) => {
    const balance = Number(record.total) - Number(record.paid);
    const matchesFilter =
      filter === "Todas" ||
      (filter === "Con deuda" && balance > 0.001) ||
      (filter === "Canceladas" && balance <= 0.001);
    const text = `${record.guardianName} ${record.studentName} ${record.family} ${record.carnet} ${record.gestion} ${record.grade}`
      .toLowerCase();
    return matchesFilter && text.includes(query.trim().toLowerCase());
  });
  return (
    <section className="receivables-view">
      <div className="stats-grid receivables-stats">
        <article className="stat-card">
          <span className="stat-icon orange"><WalletCards size={18} /></span>
          <div><p>Saldo pendiente total</p><strong>{money(totalOwed)}</strong></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue"><UsersRound size={18} /></span>
          <div><p>Cuentas registradas</p><strong>{receivables.length}</strong></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon purple"><ShieldCheck size={18} /></span>
          <div><p>Familias con deuda</p><strong>{receivables.filter((record) => Number(record.total) - Number(record.paid) > 0.001).length}</strong></div>
        </article>
      </div>
      {schemaWarnings.includes("accounts_receivable") && (
        <p className="schema-warning-banner">La conexión con Supabase está activa, pero las cuentas por cobrar aún no se sincronizan en la nube. Ejecuta <code>supabase-schema.sql</code> desde SQL Editor y luego pulsa “Revisar conexión / esquema” en Configuración.</p>
      )}
      <details className="panel receivable-create" open={receivables.length === 0}>
        <summary>Registrar una cuenta por cobrar</summary>
        <p className="form-note">Incluye deudas de la gestión actual o anteriores. Los abonos se registran aquí y nunca ingresan a Caja.</p>
        <form className="receivable-form" onSubmit={onAdd}>
          <label>Nombre del padre, madre o tutor<input name="guardianName" required /></label>
          <label>Estudiante<input name="studentName" /></label>
          <label>Curso / nivel<input name="grade" placeholder="Ej. 5to de primaria" /></label>
          <label>Carnet de identidad<input name="carnet" /></label>
          <label>Familia<input name="family" placeholder="Ej. Familia Pérez" /></label>
          <label>Gestión de la deuda<input name="gestion" type="number" min="1900" max="2100" defaultValue={new Date().getFullYear()} required /></label>
          <label>Importe total adeudado (Bs.)<input name="total" type="number" step="0.01" min="0.01" required /></label>
          <label>Contrato<input name="contract" placeholder="Nro. / detalle / Sin contrato" /></label>
          <label className="receivable-wide">Compromisos de pago<input name="commitment" placeholder="Fecha acordada, cuotas u otro compromiso" /></label>
          <button className="primary-button" type="submit"><Plus size={16} />Registrar deuda</button>
        </form>
      </details>
      <section className="panel receivable-list-panel">
        <PanelHeader title="Cuentas y pagos" detail="Historial de abonos, saldos y situación INFOCRED" />
        <div className="receivable-tools">
          <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar padre, estudiante, carnet o gestión" /></div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar cuentas">
            <option>Todas</option><option>Con deuda</option><option>Canceladas</option>
          </select>
        </div>
        {visibleRecords.length ? (
          <div className="receivable-records">
            {visibleRecords.map((record) => {
              const balance = Math.max(0, Number(record.total) - Number(record.paid));
              return (
                <article className="receivable-record" key={record.id}>
                  <div className="receivable-record-head">
                    <div><strong>{record.guardianName}</strong><small>{record.studentName || "Estudiante no indicado"}{record.grade ? ` · ${record.grade}` : ""}</small></div>
                    <span className={`receivable-badge ${balance <= 0.001 ? "paid" : "owing"}`}>{balance <= 0.001 ? "Cancelada" : "Con deuda"}</span>
                  </div>
                  <div className="receivable-facts">
                    <span>Gestión <b>{record.gestion}</b></span>
                    <span>Familia <b>{record.family || "—"}</b></span>
                    <span>Carnet <b>{record.carnet || "—"}</b></span>
                    <span>Contrato <b>{record.contract || "No indicado"}</b></span>
                    <span>Compromiso <b>{record.commitment || "No indicado"}</b></span>
                  </div>
                  <div className="receivable-balance">
                    <span>Total {money(record.total)}</span><span>Pagado {money(record.paid)}</span><strong>Saldo {money(balance)}</strong>
                  </div>
                  <div className="receivable-actions">
                    <label>INFOCRED
                      <select value={record.infocredStatus || "Pendiente"} onChange={(event) => onInfocredStatus(record.id, event.target.value)}>
                        <option>Pendiente</option><option>Reportado</option><option>No corresponde</option>
                      </select>
                    </label>
                    {balance > 0.001 && <button type="button" className="secondary-button small" onClick={() => { setPaymentFor(paymentFor === record.id ? "" : record.id); setPaymentMode("total"); }}><Banknote size={15} />Registrar pago</button>}
                  </div>
                  {paymentFor === record.id && balance > 0.001 && (
                    <form className="receivable-payment-form" onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const saved = onPayment(record.id, {
                        mode: paymentMode,
                        amount: Number(data.get("amount")),
                        date: String(data.get("date") || ""),
                        note: String(data.get("note") || ""),
                      });
                      if (saved) setPaymentFor("");
                    }}>
                      <label>Tipo de pago<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="total">Pago total · {money(balance)}</option><option value="partial">Pago parcial</option></select></label>
                      <label>Importe (Bs.)<input key={paymentMode} name="amount" type="number" min="0.01" max={balance} step="0.01" disabled={paymentMode === "total"} defaultValue={paymentMode === "total" ? balance : ""} required /></label>
                      <label>Fecha<input name="date" type="date" defaultValue={localDateString()} required /></label>
                      <label>Nota<input name="note" placeholder="Referencia opcional" /></label>
                      <button className="primary-button small" type="submit"><Check size={15} />Guardar abono</button>
                    </form>
                  )}
                  {(record.paymentHistory || []).length > 0 && (
                    <details className="payment-history">
                      <summary>Ver {record.paymentHistory.length} abono(s)</summary>
                      {record.paymentHistory.map((payment) => <div key={payment.id}><span>{payment.date} · {payment.mode === "total" ? "Pago total" : "Pago parcial"}{payment.note ? ` · ${payment.note}` : ""}</span><strong>{money(payment.amount)}</strong></div>)}
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><Receipt size={26} /><p>{receivables.length ? "No se encontraron cuentas con esos filtros." : "Todavía no hay cuentas por cobrar."}</p></div>}
      </section>
    </section>
  );
}
function RemindersView({ reminders, onToggle }) {
  return (
    <section className="panel reminders-view">
      <PanelHeader title="Recordatorios administrativos" detail="Avisos mensuales para las declaraciones y tareas del colegio" />
      <p className="form-note">Se muestran desde tres días antes de la fecha límite y permanecen hasta marcarlos como realizados. La confirmación se guarda en este dispositivo.</p>
      {reminders.length ? (
        <div className="reminder-list">
          {reminders.map((task) => (
            <article className="reminder-item" key={`${task.period}:${task.id}`}>
              <span className="reminder-date"><strong>{String(task.day).padStart(2, "0")}</strong><small>{new Date(`${task.period}-01T12:00:00`).toLocaleDateString("es-BO", { month: "short" })}</small></span>
              <div><strong>{task.title}</strong><small>{task.office} · Cada día {task.day} del mes</small></div>
              <span className={`reminder-status ${task.daysUntilDue < 0 ? "overdue" : ""}`}>{task.daysUntilDue < 0 ? `Vencido hace ${Math.abs(task.daysUntilDue)} día(s)` : task.daysUntilDue === 0 ? "Vence hoy" : `En ${task.daysUntilDue} día(s)`}</span>
              <button className="secondary-button small" type="button" onClick={() => onToggle(task)}><Check size={15} />Marcar realizado</button>
            </article>
          ))}
        </div>
      ) : <div className="empty-state"><CalendarRange size={26} /><p>No hay recordatorios próximos. Las tareas aparecen tres días antes de su fecha.</p></div>}
    </section>
  );
}
function CashView({ cash, sales, onClose, onMovement }) {
  const balance =
    cash.opening +
    cash.movements.reduce(
      (sum, movement) =>
        sum +
        (movement.status === "Anulada"
          ? 0
          : movement.type === "Ingreso"
            ? movement.amount
            : -movement.amount),
      0,
    );
  return (
    <section className="cash-layout">
      <div className="panel cash-main">
        <PanelHeader
          title="Caja del día"
          detail="Ventas, ingresos, egresos y arqueo"
          action={
            <span className="button-pair">
              <button
                className="secondary-button small"
                onClick={() => onMovement()}
              >
                <Plus size={15} />
                Movimiento
              </button>
              <button className="primary-button small" onClick={onClose}>
                <Check size={16} />
                Cerrar caja
              </button>
            </span>
          }
        />
        <div className="cash-balance">
          <span>Saldo esperado</span>
          <strong>{money(balance)}</strong>
          <small>
            Base inicial: {money(cash.opening)} · {sales.length} ventas
            acumuladas
          </small>
        </div>
        <div className="cash-metrics">
          <div>
            <span>Ingresos</span>
            <strong className="positive">
              {money(
                cash.movements
                  .filter((item) => item.type === "Ingreso")
                  .reduce((sum, item) => sum + item.amount, 0),
              )}
            </strong>
          </div>
          <div>
            <span>Egresos</span>
            <strong>
              {money(
                cash.movements
                  .filter((item) => item.type === "Egreso")
                  .reduce((sum, item) => sum + item.amount, 0),
              )}
            </strong>
          </div>
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Últimos movimientos" detail="Registro de caja" />
        {cash.movements.length ? (
          <div className="movement-list">
            {cash.movements.slice(0, 8).map((movement) => (
              <button
                className="movement-row movement-button"
                key={movement.id}
                onClick={() => onMovement(movement)}
              >
                <span
                  className={
                    movement.type === "Ingreso"
                      ? "movement-icon in"
                      : "movement-icon out"
                  }
                >
                  {movement.type === "Ingreso" ? (
                    <ArrowDownToLine size={15} />
                  ) : (
                    <ArrowUpRight size={15} />
                  )}
                </span>
                <span>
                  <strong>{movement.concept}</strong>
                  <small>
                    {movement.payment || "Efectivo"} · Efectivo{" "}
                    {money(movement.cashAmount || 0)} · QR{" "}
                    {money(movement.qrAmount || 0)}
                  </small>
                </span>
                <b className={movement.type === "Ingreso" ? "positive" : ""}>
                  {movement.type === "Ingreso" ? "+" : "-"}
                  {money(movement.amount)}
                </b>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Banknote size={28} />
            <p>Aún no hay movimientos.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function LoansView({
  materials,
  loans,
  onLoan,
  onManualLoan,
  onEdit,
  teachers,
  onAddTeacher,
  onQr = (material) =>
    window.dispatchEvent(
      new CustomEvent("open-material-qr", { detail: material }),
    ),
}) {
  return (
    <section className="loans-layout">
      <div className="panel">
        <PanelHeader
          title="Material prestado a profesores"
          detail="Objetos institucionales disponibles para préstamo"
          action={
            <button className="secondary-button" onClick={onAddTeacher}>
              <UsersRound size={16} />
              Profesores
            </button>
          }
        />
        <div className="loan-cards">
          {materials.map((material) => (
            <div className="loan-card" key={material.id}>
              <div>
                <span
                  className={`status-dot ${material.status === "Prestado" ? "borrowed" : ""}`}
                />
                <strong>{material.name}</strong>
                <small>
                  {material.id} · {material.location}
                </small>
              </div>
              <span
                className={
                  material.status === "Prestado"
                    ? "status borrowed-text"
                    : "status"
                }
              >
                {material.status}
              </span>
              <span className="loan-actions">
                <button
                  className="icon-action"
                  title="Generar QR del objeto"
                  onClick={() => onQr(material)}
                >
                  <QrCode size={15} />
                </button>
                <button
                  className="icon-action"
                  title="Editar objeto"
                  onClick={() => onEdit(material)}
                >
                  <Settings size={15} />
                </button>
                <button
                  className="text-button"
                  onClick={() => onLoan(material)}
                >
                  {material.status === "Prestado" ? "Registrar devolución" : "Prestar con QR"}
                </button>
                {material.status === "Disponible" && (
                  <button
                    className="text-button"
                    onClick={() => onManualLoan(material)}
                  >
                    Manual
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <PanelHeader
          title="Últimos movimientos"
          detail={`${teachers.length} profesores registrados`}
        />
        {loans.length ? (
          loans.slice(0, 6).map((loan) => (
            <div className="history-row" key={loan.id}>
              <span className="history-icon">
                <ClipboardList size={15} />
              </span>
              <span>
                <strong>
                  {loan.action}: {loan.material}
                </strong>
                <small>
                  {loan.teacher} ·{" "}
                  {new Date(loan.date).toLocaleString("es-PE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </small>
              </span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <ClipboardList size={28} />
            <p>Sin movimientos todavía.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function FormModal({
  title,
  icon: Icon,
  fields,
  onSubmit,
  onClose,
  stockMode = false,
  editingProduct = null,
}) {
  const [operation, setOperation] = useState("Entrada");
  return (
    <div className="modal-backdrop">
      <form className="modal form-modal" onSubmit={onSubmit}>
        <button type="button" className="close-button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="modal-icon">
          <Icon size={22} />
        </div>
        <h2>{title}</h2>

        <div className="modal-scroll-body">
          {stockMode && (
            <label>
              Operación
              <select
                name="operation"
                value={operation}
                onChange={(event) => setOperation(event.target.value)}
              >
                <option>Entrada</option>
                <option>Salida</option>
              </select>
            </label>
          )}
          {stockMode && (
            <label>
              Motivo
              <select name="reason">
                {operation === "Entrada" ? (
                  <option>Compra o reposición de mercadería</option>
                ) : (
                  <>
                    <option>Deterioro</option>
                    <option>Defecto de fábrica</option>
                    <option>Daño</option>
                    <option>Libro incompleto</option>
                    <option>Pérdida</option>
                    <option>Donación o retiro autorizado</option>
                    <option>Otro</option>
                  </>
                )}
              </select>
            </label>
          )}
          {stockMode && (
            <label>
              {operation === "Entrada" ? "Cantidad recibida" : "Cantidad retirada"}
              <input
                required
                name="quantity"
                type="number"
                min="0"
                step="any"
              />
            </label>
          )}        
          {stockMode && operation === "Entrada" && (
            <label>
              Costo total de compra (opcional)
              <input name="cost" type="number" step="0.01" min="0" />
            </label>
          )}

          {fields}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" type="submit">
            <Check size={17} />
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
function ReceiptModal({ sale, onClose, onVoid }) {
  const movementKind = sale.kind || sale.type || "Venta";
  const isMovement = [
    "Ingreso",
    "Egreso",
    "Otro ingreso",
    "Otro egreso",
  ].includes(movementKind);
  const movementTitle =
    movementKind === "Otro ingreso"
      ? "Comprobante de otro ingreso"
      : movementKind === "Otro egreso"
        ? "Comprobante de otro egreso"
        : isMovement
          ? `Comprobante de ${movementKind.toLowerCase()}`
          : "Recibo de venta";
    const needsSignature = movementKind === "Egreso" || movementKind === "Otro egreso";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal receipt-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="close-button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="receipt-top">
          <img className="receipt-logo" src="/logo-vida-verdad.jpg" alt="Logo Vida y Verdad" />
          <span>
            <strong>Vida y Verdad Caranavi</strong>
            <small>
              {movementTitle}
              {!isMovement && sale.status === "Anulada" ? " · ANULADO" : ""}
            </small>
          </span>
        </div>
        <div className="receipt-number">
          <span>{sale.id}</span>
          <small>
            {new Date(sale.date || sale.dateValue).toLocaleString("es-BO", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </small>
        </div>
        {isMovement ? (
          <div className="receipt-lines">
            <div>
              <span>{sale.concept}</span>
              <b>{money(sale.amount)}</b>
            </div>
          </div>
        ) : (
          <div className="receipt-lines">
            {sale.items.map((item) => (
              <div key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.quantity} {item.unit || "und."} x {money(item.price)}
                  </small>
                </span>
                <b>{money(item.price * item.quantity)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="receipt-total">
          <span>Total</span>
          <strong>{money(sale.amount || sale.total)}</strong>
        </div>
        <p className="receipt-note">
          Pago: {sale.payment || "Efectivo"} · Efectivo{" "}
          {money(sale.cashAmount || 0)} · QR {money(sale.qrAmount || 0)}
          <br />
          {sale.customer || sale.concept}{" "}
          {sale.relation ? `· ${sale.relation} ` : ""}
          {sale.family ? `· ${sale.family} ` : ""}
          {sale.carnet ? `· Carnet ${sale.carnet}` : ""}
          {sale.payer && sale.payer !== sale.customer ? (
            <>
              <br />
              Pagó: {sale.payer}
              {sale.payerRelation ? ` (${sale.payerRelation})` : ""}
            </>
          ) : null}
        </p>
        {needsSignature && (
          <div className="receipt-signature">
            <div className="signature-fields">
              <div className="signature-line signature-wide">
                <span>Firma de quien recibe</span>
              </div>
            </div>
          </div>
        )}
        <div className="receipt-footer">
          <strong>COLEGIO VIDA Y VERDAD</strong>
          <span>Servicio, integridad y mayordomía cristiana</span>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => printElement(".receipt-modal")}>
            <Download size={16} />
            Reimprimir
          </button>
          {!isMovement && sale.status !== "Anulada" && (
            <button className="secondary-button" onClick={() => onVoid(sale)}>
              <Trash2 size={16} />
              Anular recibo
            </button>
          )}
          {isMovement && sale.status !== "Anulada" && (
            <button className="secondary-button" onClick={() => onVoid(sale)}>
              <Trash2 size={16} />
              Anular comprobante
            </button>
          )}
          <button className="primary-button" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
function QrModal({ item, onClose }) {
  return (
    <div className="modal-backdrop qr-print-backdrop" onClick={onClose}>
      <div
        className="modal receipt-modal qr-print-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="close-button" onClick={onClose}>
          <X size={18} />
        </button>
        <span className="eyebrow">IDENTIFICACIÓN DE PRODUCTO</span>
        <h2>{item.name}</h2>
        <p>{item.id} · Escanea para añadir al carrito.</p>
        <div className="qr-print-only">
          <QRCodeSVG
            value={item.id}
            size={210}
            bgColor="#ffffff"
            fgColor="#17212b"
          />
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => printElement(".qr-print-only", "qr")}>
            <Download size={16} />
            Imprimir etiqueta
          </button>
          <button className="primary-button" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
function QrSheetModal({ products, onClose }) {
  return (
    <div className="modal-backdrop qr-sheet-backdrop" onClick={onClose}>
      <div className="modal qr-sheet-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
        <PanelHeader title="Etiquetas QR de inventario" detail={`${products.length} productos · Hoja A4 con códigos pequeños para etiquetar mercadería`} />
        <div className="qr-sheet-preview qr-sheet-print-only">
          {products.map((product) => (
            <div className="qr-sheet-label" key={product.id}>
              <QRCodeSVG value={product.id} size={110} marginSize={1} bgColor="#ffffff" fgColor="#000000" />
              <span><strong>{product.name}</strong>{product.id}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="button" onClick={() => printElement(".qr-sheet-print-only", "qr-sheet")}><QrCode size={16} />Imprimir hoja de QRs</button>
        </div>
      </div>
    </div>
  );
}
export default App;
export { QrModal };