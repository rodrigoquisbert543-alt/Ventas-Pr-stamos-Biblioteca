import { useEffect, useMemo, useRef, useState } from "react";
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
  PackagePlus,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
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
];
const money = (value) => `Bs. ${Number(value).toFixed(2)}`;
const familyRelations = ["Estudiante", "Padre", "Madre", "Tutor", "Otro"];
const payerRelations = ["Padre", "Madre", "Tutor", "Otro"];
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
function familyMembersOf(customers, family) {
  const key = String(family || "")
    .trim()
    .toLowerCase();
  if (!key) return [];
  return customers.filter(
    (customer) => String(customer.family || "").trim().toLowerCase() === key,
  );
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
    `<!doctype html><html><head><title>Imprimir</title><style>@page{size:${kind === "qr" ? "auto" : "80mm auto"};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:${kind === "qr" ? "20mm" : "4mm"};font-family:Arial,sans-serif}.qr-print-only svg{display:block;width:210px;height:210px}.receipt-modal{width:80mm;max-width:80mm;padding:4mm;box-shadow:none;background:#fff}.receipt-modal .close-button,.receipt-modal .modal-actions{display:none!important}.receipt-modal h2{font-size:18px}.receipt-modal p,.receipt-modal small{font-size:10px}</style></head><body>${content}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
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
    );
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
    readStorage("vida-verdad-products", []),
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
  const [purchaseOrders, setPurchaseOrders] = useState(() =>
    readStorage("vida-verdad-purchase-orders", []),
  );
  const [cash, setCash] = useState(() =>
    readStorage("vida-verdad-cash", { opening: 0, movements: [] }),
  );
  const [activeNav, setActiveNav] = useState("Resumen");
  const [cart, setCart] = useState([]);
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
  const [selectedLoanMaterial, setSelectedLoanMaterial] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState(null);
  const [printPurchaseOrder, setPrintPurchaseOrder] = useState(null);
  const [scanValue, setScanValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loanScan, setLoanScan] = useState(false);
  const scannerRef = useRef(null);
  const loanScanHandlerRef = useRef(null);
  const lastScanRef = useRef({ value: "", time: 0 });
  const cloudReadyRef = useRef(!isSupabaseConfigured);
  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
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
    const persistState = () => {
      localStorage.setItem("vida-verdad-products", JSON.stringify(products));
      localStorage.setItem("vida-verdad-sales", JSON.stringify(sales));
      localStorage.setItem("vida-verdad-customers", JSON.stringify(customers));
      localStorage.setItem("vida-verdad-purchase-orders", JSON.stringify(purchaseOrders));
      localStorage.setItem("vida-verdad-materials", JSON.stringify(materials));
      localStorage.setItem("vida-verdad-loans", JSON.stringify(loans));
      localStorage.setItem("vida-verdad-teachers", JSON.stringify(teachers));
      localStorage.setItem("vida-verdad-cash", JSON.stringify(cash));
    };
    window.addEventListener("beforeunload", persistState);
    return () => window.removeEventListener("beforeunload", persistState);
  }, [products, sales, customers, materials, loans, teachers, cash, purchaseOrders]);
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
    localStorage.setItem("vida-verdad-purchase-orders", JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-materials", JSON.stringify(materials));
    localStorage.setItem("vida-verdad-loans", JSON.stringify(loans));
    localStorage.setItem("vida-verdad-teachers", JSON.stringify(teachers));
    localStorage.setItem("vida-verdad-cash", JSON.stringify(cash));
  }, [materials, loans, teachers, cash]);
  useEffect(() => {
    loadCloudState()
      .then((cloud) => {
        if (!cloud) return;
        if (cloud.products?.length)
          setProducts(
            mergeRecords(products, cloud.products).map((product) => ({
              ...product,
              purchaseCost:
                product.purchase_cost ?? product.purchaseCost ?? 0,
              minStock: product.min_stock ?? product.minStock ?? 5,
            })),
          );
        if (cloud.sales?.length)
          setSales(
            mergeRecords(sales, cloud.sales).map((sale) => ({
              ...sale,
              date: sale.sold_at || sale.date,
              status: sale.status || "Vigente",
              voidedAt: sale.voided_at || sale.voidedAt,
              customerId: sale.customer_id || sale.customerId || "",
              family: sale.family || "",
              relation: sale.relation || "",
              payer: sale.payer || "",
              payerId: sale.payer_id || sale.payerId || "",
              payerRelation: sale.payer_relation || sale.payerRelation || "",
            })),
          );
        if (cloud.materials?.length) setMaterials((current) => mergeRecords(current, cloud.materials));
        if (cloud.loans?.length)
          setLoans(
            mergeRecords(loans, cloud.loans).map((loan) => ({
              ...loan,
              materialId: loan.material_id || loan.materialId || "",
              teacherId: loan.teacher_id || loan.teacherId || "",
              due: loan.due || "",
              date: loan.loaned_at || loan.date,
            })),
          );
        if (cloud.teachers?.length) setTeachers((current) => mergeRecords(current, cloud.teachers));
        if (cloud.customers?.length) setCustomers((current) => mergeRecords(current, cloud.customers));
        if (cloud.purchase_orders?.length)
          setPurchaseOrders(
            mergeRecords(purchaseOrders, cloud.purchase_orders).map((order) => ({
              ...order,
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
              operation: movement.operation || "",
              reason: movement.reason || "",
              quantity: movement.quantity ?? 0,
              cashAmount: movement.cash_amount ?? movement.cashAmount ?? 0,
              qrAmount: movement.qr_amount ?? movement.qrAmount ?? 0,
              date: movement.moved_at || movement.date,
            })),
          }));
        cloudReadyRef.current = true;
      })
      .catch(() => {
        cloudReadyRef.current = true;
        showToast("Modo local activo: no se pudo cargar Supabase");
      });
  }, []);
  useEffect(() => {
    if (isSupabaseConfigured && cloudReadyRef.current)
      syncCloudState({
        products,
        sales,
        materials,
        loans,
        teachers,
        customers,
        purchaseOrders,
        cash,
      }).catch(() => {});
  }, [products, sales, materials, loans, teachers, customers, cash, purchaseOrders]);
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
  }, [activeNav, materials.length]);
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
            addToCart(product);
            setScanValue("");
            return;
          }
          showToast("Código de producto no registrado");
        },
        () => {},
      )
      .catch(() => {});
    return () => stopScanner();
  }, [modal, loanScan, products]);
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
  const addToCart = (product) => {
    if (product.stock <= 0) return showToast("Producto sin stock");
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
  };
  const updateQuantity = (id, quantity) =>
    setCart((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: Math.max(
                item.unit === "cm" || item.unit === "m" ? 0.01 : 1,
                Math.min(
                  Number(quantity) || (item.unit === "cm" || item.unit === "m" ? 0.01 : 1),
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
    const customer = data.get("customer") || "Familia del colegio";
    const family = String(data.get("family") || "").trim();
    const relation = String(data.get("relation") || "").trim();
    const payerChoice = String(data.get("payer") || "self");
    const newPayerName = String(data.get("payerName") || "").trim();
    const newPayerRelation = String(data.get("payerRelation") || "Padre").trim();
    let nextCustomers = customers;
    let customerRecord = nextCustomers.find(
      (item) => item.id === customer || item.name === customer,
    );
    if (customerRecord && (family || relation)) {
      customerRecord = {
        ...customerRecord,
        family: family || customerRecord.family || "",
        relation: relation || customerRecord.relation || "Estudiante",
      };
      nextCustomers = nextCustomers.map((item) =>
        item.id === customerRecord.id ? customerRecord : item,
      );
    }
    let payerRecord =
      payerChoice === "new"
        ? null
        : payerChoice && payerChoice !== "self"
          ? nextCustomers.find((item) => item.id === payerChoice)
          : customerRecord;
    if (payerChoice === "new" && newPayerName) {
      payerRecord = {
        id: nextCustomerId(nextCustomers),
        name: newPayerName,
        carnet: "",
        phone: "",
        family: family || customerRecord?.family || "",
        relation: newPayerRelation,
      };
      nextCustomers = [...nextCustomers, payerRecord];
    } else if (payerRecord && family) {
      payerRecord = {
        ...payerRecord,
        family,
        relation:
          payerRecord.id === customerRecord?.id
            ? relation || payerRecord.relation
            : payerRecord.relation || "",
      };
      nextCustomers = nextCustomers.map((item) =>
        item.id === payerRecord.id ? payerRecord : item,
      );
    }
    if (nextCustomers !== customers) setCustomers(nextCustomers);
    const sale = {
      id: `V-${String(sales.length + 1).padStart(5, "0")}`,
      date: new Date().toISOString(),
      status: "Vigente",
      customer: customerRecord?.name || customer,
      customerId: customerRecord?.id || "",
      carnet: customerRecord?.carnet || "",
      family: family || customerRecord?.family || payerRecord?.family || "",
      relation: customerRecord?.relation || relation,
      payer: payerRecord?.name || customerRecord?.name || "",
      payerId: payerRecord?.id || "",
      payerRelation: payerRecord?.relation || "",
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
  const _addMaterial = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const material = {
      id: `MAT-${String(materials.length + 1).padStart(3, "0")}`,
      name: data.get("name"),
      category: data.get("category"),
      location: data.get("location"),
      status: "Disponible",
      borrower: "",
      due: "",
    };
    setMaterials((current) => [...current, material]);
    setModal(null);
    setSelectedQr(material);
    showToast("Objeto añadido y QR generado");
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
            price: Number(row.precio || row.price || row.precio_de_venta || 0),
            purchaseCost: Number(
              row.costo_de_compra || row.purchase_cost || row.purchaseCost || 0,
            ),
            stock: Number(row.stock || row.existencias || 0),
            minStock: Number(row.stock_minimo || row.min_stock || 5),
            unit: row.unidad || row.unit || "und.",
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
      const group = reportGroup(product.category);
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
              (movement.type === "Ingreso"
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
      </button>
    );
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={20} />
          </span>
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
            <span key={label}>{nav(label)}</span>
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
              title="Notificaciones"
            >
              <Bell size={19} />
              <i />
            </button>
            <span className="date-chip">14 SEP 2026</span>
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
                  : "Bienvenido Rodrigo"}
              </h1>
              <p className="subtitle">
                {activeNav === "Nueva venta"
                  ? "Registra una venta rápida para las familias del colegio."
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
                {[
                  "LIBROS",
                  "AGENDAS",
                  "POLERAS",
                  "BLUSAS Y CAMISAS",
                  "TELA",
                  "DEPORTIVOS",
                  "VARIOS",
                ].map((group) => {
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
            />
          )}
          {activeNav === "Clientes" && (
            <CustomerView
              customers={customers}
              sales={sales}
              onImport={(event) => importCsv(event, "customers")}
              onAdd={() => setModal("customer")}
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
                  ["id", "nombre", "categoria", "costo_de_compra", "precio", "stock", "stock_minimo", "unidad"],
                  products.map((item) => [item.id, item.name, item.category, item.purchaseCost || 0, item.price, item.stock, item.minStock, item.unit]),
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
                  products: ["id", "nombre", "categoria", "costo_de_compra", "precio", "stock", "stock_minimo", "unidad"],
                  customers: ["id", "nombre", "carnet", "telefono", "familia", "parentesco"],
                  materials: ["id", "nombre", "categoria", "ubicacion", "estado", "prestado_a", "devolucion"],
                };
                downloadCsv(`${type}-plantilla.csv`, templates[type], [templates[type].map(() => "")]);
              }}
              online={isSupabaseConfigured}
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
                  Precio
                  <input
                    required
                    name="price"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </label>
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
                  Stock inicial
                  <input required name="stock" type="number" min="0" />
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
              <div className="form-row">
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
                        (movement.type === "Ingreso"
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
              <PaymentFields />
            </>
          }
        />
      )}
      {selectedQr && (
        <QrModal item={selectedQr} onClose={() => setSelectedQr(null)} />
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
function PaymentFields() {
  const [payment, setPayment] = useState("Efectivo");
  return (
    <>
      <label>
        Medio de pago
        <select
          name="payment"
          value={payment}
          onChange={(event) => setPayment(event.target.value)}
        >
          <option>Efectivo</option>
          <option>QR</option>
          <option>Ambos</option>
        </select>
      </label>
      <div className="form-row">
        {(payment === "Efectivo" || payment === "Ambos") && (
          <label>
            Efectivo
            <input
              name="cashAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </label>
        )}
        {(payment === "QR" || payment === "Ambos") && (
          <label>
            QR
            <input
              name="qrAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </label>
        )}
      </div>
    </>
  );
}
function SaleView({
  products,
  customers,
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
  const [familyName, setFamilyName] = useState("");
  const [relation, setRelation] = useState("Estudiante");
  const [payerId, setPayerId] = useState("self");
  const matchingCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.carnet} ${customer.phone || ""} ${customer.family || ""} ${customer.relation || ""}`
      .toLowerCase()
      .includes(customerQuery.toLowerCase()),
  );
  const customerSuggestions = matchingCustomers.slice(0, 8);
  const selectedRecord = customers.find((item) => item.id === selectedCustomer);
  const familyOptions = uniqueFamilies(customers);
  const relatives = familyMembersOf(customers, familyName).filter(
    (item) => item.id !== selectedCustomer,
  );
  const chooseCustomer = (id) => {
    setSelectedCustomer(id);
    const record = customers.find((item) => item.id === id);
    setCustomerQuery(record?.name || "");
    setFamilyName(record?.family || "");
    setRelation(record?.relation || "Estudiante");
    setPayerId("self");
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
            <button
              type="button"
              className="product-card"
              key={product.id}
              onClick={() => addToCart(product)}
            >
              <ProductIcon category={product.category} />
              <span>
                <strong>{product.name}</strong>
                <small>
                  {product.id} · {product.stock} disponibles
                </small>
              </span>
              <b>{money(product.price)}</b>
            </button>
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
                setPayerId("self");
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
          <div className="family-link">
            <label>
              Vincular a familia
              <input
                name="family"
                list="sale-family-options"
                value={familyName}
                onChange={(event) => {
                  setFamilyName(event.target.value);
                  setPayerId("self");
                }}
                placeholder="Ej. Familia Pérez"
              />
              <datalist id="sale-family-options">
                {familyOptions.map((family) => (
                  <option value={family} key={family} />
                ))}
              </datalist>
            </label>
            <label>
              Parentesco del cliente
              <select
                name="relation"
                value={relation}
                onChange={(event) => setRelation(event.target.value)}
              >
                {familyRelations.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Quién paga
              <select
                name="payer"
                value={payerId}
                onChange={(event) => setPayerId(event.target.value)}
              >
                <option value="self">
                  {selectedRecord
                    ? `El mismo cliente (${selectedRecord.name})`
                    : "El mismo cliente"}
                </option>
                {relatives.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.name}
                    {member.relation ? ` · ${member.relation}` : " · Familiar"}
                  </option>
                ))}
                <option value="new">Registrar padre, madre o tutor</option>
              </select>
            </label>
            {payerId === "new" && (
              <>
                <label>
                  Nombre de quien paga
                  <input
                    required
                    name="payerName"
                    placeholder="Nombre del padre, madre o tutor"
                  />
                </label>
                <label>
                  Parentesco de quien paga
                  <select name="payerRelation" defaultValue="Padre">
                    {payerRelations.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {(familyName || selectedRecord?.family) && (
              <p className="form-note">
                {selectedRecord?.name || "Este cliente"} quedará en{" "}
                {familyName || selectedRecord?.family}
                {payerId === "self"
                  ? "."
                  : payerId === "new"
                    ? " y el pago se registrará a nombre del familiar."
                    : ` y paga ${relatives.find((item) => item.id === payerId)?.name || "un familiar"}.`}
              </p>
            )}
          </div>
          <PaymentFields />
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
      <section className="panel lower-panel">
      <PanelHeader
        title="Inventario de productos"
        detail="Uniformes, libros, fotocopias y útiles"
        action={
          <button className="primary-button small" onClick={onAdd}>
            <Plus size={16} />
            Nuevo producto
          </button>
        }
      />
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
          <span>Categoría</span>
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
              <span>{product.category}</span>
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
      </section>
      <section className="panel lower-panel inventory-report">
        <PanelHeader
          title="Informe de inventario"
          detail="Existencias, costos, ventas y valorización del período"
          action={
            <button
              className="secondary-button small"
              type="button"
              onClick={() => window.print()}
            >
              <FileText size={15} />
              Imprimir informe
            </button>
          }
        />
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
      </section>
      <section className="panel lower-panel purchase-orders">
        <PanelHeader
          title="Pedidos a proveedores"
          detail="Control de pedidos, entregas parciales y pagos"
          action={
            <button className="primary-button small" type="button" onClick={onNewOrder}>
              <Plus size={15} /> Nuevo pedido
            </button>
          }
        />
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
            <button className="icon-action" type="button" title="Imprimir orden" onClick={() => onPrintOrder(order)}>
              <FileText size={15} />
            </button>
          </div>
        )) : (
          <div className="empty-state"><ClipboardList size={26} /><p>No hay pedidos registrados.</p></div>
        )}
      </section>
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
              <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} aria-label="Cantidad pedida" />
              <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(index, "unitCost", event.target.value)} aria-label="Costo unitario" />
              <button type="button" className="icon-action" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={14} /></button>
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
        <div className="receipt-top"><span className="brand-mark"><ClipboardList size={18} /></span><span><strong>Vida y Verdad Caranavi</strong><small>Orden de pedido a proveedor</small></span></div>
        <div className="receipt-number"><span>{order.id}</span><small>{new Date(order.date).toLocaleString("es-BO")}</small></div>
        <p className="receipt-note"><strong>Proveedor:</strong> {order.supplier}<br />Estado: {order.status}</p>
        <div className="receipt-lines">
          {order.items.map((item) => <div key={item.productId}><span><strong>{item.productName}</strong><small>{item.quantity} {item.unit} x {money(item.unitCost)}</small></span><b>{money(item.quantity * item.unitCost)}</b></div>)}
        </div>
        <div className="receipt-total"><span>Total</span><strong>{money(order.total)}</strong></div>
        <p className="receipt-note">Adelanto/pagado: {money(order.paid)}<br />Saldo: {money(order.balance)}<br />{order.notes}</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cerrar</button><button className="primary-button" onClick={() => window.print()}><FileText size={16} /> Imprimir</button></div>
      </div>
    </div>
  );
}
function CustomerView({ customers, sales, onImport, onAdd }) {
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
      <div className="inventory-table">
        <div className="inventory-head customers-head">
          <span>Cliente</span>
          <span>Familia</span>
          <span>Carnet</span>
          <span>Teléfono</span>
          <span>Compras</span>
        </div>
        {customers.map((customer) => (
          <div className="inventory-row customers-row" key={customer.id}>
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
          </div>
        ))}
      </div>
    </section>
  );
}
const reportGroup = (category = "") => {
  const value = category.toLowerCase();
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
      const group = reportGroup(product.category);
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
        {[
          "LIBROS",
          "AGENDAS",
          "POLERAS",
          "BLUSAS Y CAMISAS",
          "TELA",
          "DEPORTIVOS",
          "VARIOS",
        ].map((group) => {
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
                <button
                  className="history-row history-button"
                  key={`${entry.kind}-${entry.id}`}
                  onClick={() => onSelect(entry)}
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
                </button>
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
}) {
  return (
    <section className="panel lower-panel settings-view">
      <PanelHeader
        title="Configuración"
        detail="Carga masiva y estado de conexión"
      />
      <div className="settings-status">
        <span className={`status-dot ${online ? "" : "borrowed"}`} />
        <strong>{online ? "Supabase conectado" : "Modo local activo"}</strong>
        <small>
          {online
            ? "Los cambios se sincronizan entre dispositivos."
            : "Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para operar en línea."}
        </small>
      </div>
      <div className="import-grid">
        <CsvDataCard
          icon={PackagePlus}
          title="Productos para la venta"
          description="id, nombre, categoria, costo_de_compra, precio, stock, stock_minimo, unidad"
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
function CashView({ cash, sales, onClose, onMovement }) {
  const balance =
    cash.opening +
    cash.movements.reduce(
      (sum, movement) =>
        sum +
        (movement.type === "Ingreso" ? movement.amount : -movement.amount),
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
                min="0.01"
                step={editingProduct?.unit === "cm" ? "0.01" : "1"}
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
          <span className="brand-mark">
            <BookOpen size={18} />
          </span>
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
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => window.print()}>
            <Download size={16} />
            Reimprimir
          </button>
          {!isMovement && sale.status !== "Anulada" && (
            <button className="secondary-button" onClick={() => onVoid(sale)}>
              <Trash2 size={16} />
              Anular recibo
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
          <button className="secondary-button" onClick={() => window.print()}>
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
export default App;
