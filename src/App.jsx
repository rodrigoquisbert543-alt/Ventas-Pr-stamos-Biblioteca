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
  const [cash, setCash] = useState(() =>
    readStorage("vida-verdad-cash", { opening: 0, movements: [] }),
  );
  const [activeNav, setActiveNav] = useState("Resumen");
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [historyFilter, setHistoryFilter] = useState("Todos");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [scanValue, setScanValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loanScan, setLoanScan] = useState(false);
  const scannerRef = useRef(null);
  const loanScanHandlerRef = useRef(null);
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
    localStorage.setItem("vida-verdad-products", JSON.stringify(products));
  }, [products]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-sales", JSON.stringify(sales));
  }, [sales]);
  useEffect(() => {
    localStorage.setItem("vida-verdad-customers", JSON.stringify(customers));
  }, [customers]);
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
            cloud.products.map((product) => ({
              ...product,
              minStock: product.min_stock ?? product.minStock ?? 5,
            })),
          );
        if (cloud.sales?.length)
          setSales(
            cloud.sales.map((sale) => ({
              ...sale,
              date: sale.sold_at || sale.date,
              status: sale.status || "Vigente",
              voidedAt: sale.voided_at || sale.voidedAt,
            })),
          );
        if (cloud.materials?.length) setMaterials(cloud.materials);
        if (cloud.loans?.length)
          setLoans(
            cloud.loans.map((loan) => ({
              ...loan,
              date: loan.loaned_at || loan.date,
            })),
          );
        if (cloud.teachers?.length) setTeachers(cloud.teachers);
        if (cloud.customers?.length) setCustomers(cloud.customers);
        if (cloud.cash_movements?.length)
          setCash((current) => ({
            ...current,
            movements: cloud.cash_movements.map((movement) => ({
              ...movement,
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
        cash,
      }).catch(() => {});
  }, [products, sales, materials, loans, teachers, customers, cash]);
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
          setScanValue(value);
          stopScanner();
          if (loanScan) loanScanHandlerRef.current?.(value);
        },
        () => {},
      )
      .catch(() => {});
    return () => stopScanner();
  }, [modal, loanScan]);
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
                1,
                Math.min(
                  Number(quantity) || 1,
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
      setModal(null);
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
    registerLoan(material, true);
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
      stock: Number(data.get("stock")),
      minStock: 5,
      unit: "und.",
    };
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
              minStock: Number(data.get("minStock")),
            }
          : product,
      ),
    );
    setCart((current) =>
      current.map((item) =>
        item.id === editingProduct.id
          ? {
              ...item,
              stock:
                item.stock + (operation === "Salida" ? -quantity : quantity),
            }
          : item,
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
    if (!quantity || quantity < 1)
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
    const reason = data.get("reason") || "Reposición de mercadería";
    const cost = Number(data.get("cost") || 0);
    const movement = {
      id: `M-${Date.now()}`,
      type:
        operation === "Salida"
          ? "Salida de inventario"
          : cost > 0
            ? "Egreso"
            : "Entrada de inventario",
      concept: `${operation}: ${editingProduct.name}`,
      reason,
      quantity,
      amount: cost,
      date,
    };
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
  const importCsv = (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (type === "customers") {
        const imported = rows
          .map((row, index) => ({
            id:
              row.id ||
              `CLI-${String(customers.length + index + 1).padStart(3, "0")}`,
            name: row.nombre || row.name || row.cliente || "",
            carnet: row.carnet || row.ci || row.numero_de_carnet || "",
            phone: row.telefono || row.phone || "",
          }))
          .filter((item) => item.name);
        setCustomers((current) => [...current, ...imported]);
        showToast(`${imported.length} clientes importados`);
      } else {
        const imported = rows
          .map((row, index) => ({
            id:
              row.id ||
              `PRD-${String(products.length + index + 1).padStart(3, "0")}`,
            name: row.nombre || row.name || row.producto || "",
            category: row.categoria || row.category || "Otros",
            price: Number(row.precio || row.price || row.precio_de_venta || 0),
            stock: Number(row.stock || row.existencias || 0),
            minStock: Number(row.stock_minimo || row.min_stock || 5),
            unit: row.unidad || row.unit || "und.",
          }))
          .filter((item) => item.name);
        setProducts((current) => [...current, ...imported]);
        showToast(`${imported.length} productos importados`);
      }
    };
    reader.readAsText(file, "UTF-8");
    event.target.value = "";
  };
  const addCashMovement = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    if (!amount || amount <= 0) return showToast("Ingresa un monto válido");
    const payment = data.get("payment");
    const movement = {
      id: `M-${Date.now()}`,
      type: data.get("type"),
      concept: data.get("concept"),
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
    setModal(null);
    showToast(`${movement.type} registrado`);
  };
  function registerLoan(material, force = false) {
    if (material.status === "Disponible" && !force) {
      setLoanScan(true);
      setScanValue("");
      setModal("scan");
      return;
    }
    const teacher = teachers[0];
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
          material: material.name,
          teacher: material.borrower,
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
                due: "Mañana, 09:00",
              }
            : item,
        ),
      );
      setLoans((current) => [
        {
          id: `L-${Date.now()}`,
          action: "Préstamo",
          material: material.name,
          teacher: teacher.name,
          date: new Date().toISOString(),
        },
        ...current,
      ]);
      showToast("Préstamo registrado");
    }
  };
  const stats = [
    {
      label: "Ventas del día",
      value: money(
        sales
          .filter(
            (sale) =>
              new Date(sale.date).toDateString() === new Date().toDateString(),
          )
          .reduce((sum, sale) => sum + sale.total, 0),
      ),
      note: `${sales.length} comprobantes`,
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
                  : "Buenos días, Rodrigo"}
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
            <h2>Escanear producto</h2>
            <p>Apunta al QR o ingresa el código del producto.</p>
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
                  <option>Otros</option>
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
          title="Aumentar mercadería"
          icon={PackagePlus}
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
              <label>
                Cantidad recibida
                <input required name="quantity" type="number" min="1" />
              </label>
              <label>
                Costo total pagado (opcional)
                <input name="cost" type="number" step="0.01" min="0" />
              </label>
            </>
          }
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
              id: `CLI-${String(customers.length + 1).padStart(3, "0")}`,
              name: data.get("name"),
              carnet: data.get("carnet"),
              phone: data.get("phone") || "",
            };
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
                </select>
              </label>
              <label>
                Concepto
                <input
                  required
                  name="concept"
                  placeholder="Ej. Pago de proveedor"
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
              {sale.customer} ·{" "}
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
}) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const matchingCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.carnet}`
      .toLowerCase()
      .includes(customerQuery.toLowerCase()),
  );
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
                  min="1"
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
                  title="Registrar ingreso de mercadería"
                >
                  <PackagePlus size={14} />
                  Registrar ingreso
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
            Cliente / familia
            <input
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              placeholder="Buscar por nombre o número de carnet"
              aria-label="Buscar cliente por nombre o carnet"
            />
            <select
              name="customer"
              value={selectedCustomer}
              onChange={(event) => setSelectedCustomer(event.target.value)}
            >
              <option value="">Consumidor sin registro</option>
              {matchingCustomers.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.name} · Carnet {customer.carnet}
                </option>
              ))}
            </select>
          </label>
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
  search,
  setSearch,
  onAdd,
  onQr,
  onEdit,
  onStock,
}) {
  return (
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
        <div className="inventory-head">
          <span>Producto</span>
          <span>Categoría</span>
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
            <div className="inventory-row" key={product.id}>
              <span className="product-cell">
                <ProductIcon category={product.category} />
                <strong>
                  {product.name}
                  <small>{product.id}</small>
                </strong>
              </span>
              <span>{product.category}</span>
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
                  title="Aumentar mercadería"
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
  );
}
function CustomerView({ customers, sales, onImport, onAdd }) {
  return (
    <section className="panel lower-panel">
      <PanelHeader
        title="Clientes y familias"
        detail="Carnet, compras e importación masiva"
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
        <div className="inventory-head">
          <span>Cliente</span>
          <span>Carnet</span>
          <span>Teléfono</span>
          <span>Compras</span>
          <span />
        </div>
        {customers.map((customer) => (
          <div className="inventory-row" key={customer.id}>
            <span className="product-cell">
              <span className="product-icon coral">
                <UserRound size={17} />
              </span>
              <strong>
                {customer.name}
                <small>{customer.id}</small>
              </strong>
            </span>
            <span>{customer.carnet || "Sin carnet"}</span>
            <span>{customer.phone || "-"}</span>
            <span>
              {
                sales.filter(
                  (sale) =>
                    sale.customerId === customer.id ||
                    sale.customer === customer.name,
                ).length
              }
            </span>
            <span />
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
function HistoryView({ sales, cash, products, filter, setFilter, onSelect }) {
  const [query, setQuery] = useState("");
  const entries = [
    ...sales.map((sale) => ({ ...sale, kind: "Venta", dateValue: sale.date })),
    ...cash.movements.map((movement) => ({
      ...movement,
      kind: movement.type,
      dateValue: movement.date,
    })),
  ]
    .filter((entry) => filter === "Todos" || entry.kind === filter)
    .filter((entry) =>
      `${entry.id} ${entry.customer || ""} ${entry.carnet || ""} ${entry.concept || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => new Date(b.dateValue) - new Date(a.dateValue));
  const groups = sales.filter((sale) => sale.status !== "Anulada").reduce((result, sale) => {
    sale.items.forEach((item) => {
      const product =
        products.find((candidate) => candidate.id === item.id) || item;
      const group = reportGroup(product.category);
      result[group] = (result[group] || 0) + item.price * item.quantity;
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
        ].map((group) => (
          <div className="report-card" key={group}>
            <span>{group}</span>
            <strong>{money(groups[group] || 0)}</strong>
          </div>
        ))}
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
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option>Todos</option>
            <option>Venta</option>
            <option>Ingreso</option>
            <option>Egreso</option>
            <option>Entrada de inventario</option>
            <option>Salida de inventario</option>
          </select>
        </div>
        <div className="history-list">
          {entries.length ? (
            entries.map((entry) => (
              <button
                className="history-row history-button"
                key={`${entry.kind}-${entry.id}`}
                onClick={() => onSelect(entry)}
              >
                <span
                  className={`history-icon ${entry.kind === "Egreso" ? "out" : "in"}`}
                >
                  {entry.kind === "Venta" ? (
                    <Receipt size={15} />
                  ) : entry.kind === "Egreso" ? (
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
                    {entry.carnet ? `· Carnet ${entry.carnet}` : ""} ·{" "}
                    {new Date(entry.dateValue).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </small>
                </span>
                <b className={entry.kind === "Egreso" ? "" : "positive"}>
                  {entry.kind === "Egreso" ? "-" : "+"}
                  {money(entry.amount || entry.total)}
                </b>
              </button>
            ))
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
function SettingsView({ onImportProducts, onImportCustomers, online }) {
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
        <div className="import-card">
          <PackagePlus size={20} />
          <h3>Importar productos</h3>
          <p>
            Columnas: id, nombre, categoria, precio, stock, stock_minimo,
            unidad.
          </p>
          <label className="primary-button file-button">
            <Upload size={16} />
            Seleccionar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onImportProducts}
            />
          </label>
        </div>
        <div className="import-card">
          <UsersRound size={20} />
          <h3>Importar clientes</h3>
          <p>Columnas: id, nombre, carnet, telefono.</p>
          <label className="primary-button file-button">
            <Upload size={16} />
            Seleccionar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onImportCustomers}
            />
          </label>
        </div>
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
                  {material.status === "Prestado"
                    ? "Registrar devolución"
                    : "Prestar"}
                </button>
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
function FormModal({ title, icon: Icon, fields, onSubmit, onClose }) {
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
        {title === "Aumentar mercadería" && (
          <label>
            Operación
            <select name="operation">
              <option>Entrada</option>
              <option>Salida</option>
            </select>
          </label>
        )}
        {title === "Aumentar mercadería" && (
          <label>
            Motivo
            <select name="reason">
              <option>Reposición de mercadería</option>
              <option>Defecto de fábrica</option>
              <option>Daño</option>
              <option>Deterioro</option>
              <option>Libro incompleto</option>
              <option>Pérdida</option>
              <option>Otro</option>
            </select>
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
  const isMovement = sale.kind === "Ingreso" || sale.kind === "Egreso";
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
              {isMovement
                ? `Comprobante de ${sale.kind.toLowerCase()}`
                : "Recibo de venta"}
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
                  {item.quantity} x {item.name}
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
          {sale.carnet ? `· Carnet ${sale.carnet}` : ""}
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
