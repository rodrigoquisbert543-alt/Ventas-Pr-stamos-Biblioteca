const reportCategories = [
  "LIBROS",
  "AGENDAS",
  "POLERAS",
  "BLUSAS Y CAMISAS",
  "TELA",
  "DEPORTIVOS",
  "VARIOS",
  "OTROS",
];

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function reportDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function saleCategories(sale, productsById) {
  const amounts = Array(reportCategories.length).fill(0);
  (sale.items || []).forEach((item) => {
    const product = productsById.get(item.id);
    const section = String(item.section || product?.section || "")
      .trim()
      .toUpperCase();
    const category = String(item.category || product?.category || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let index = reportCategories.indexOf(section);
    if (index < 0) {
      if (category.includes("libro")) index = 0;
      else if (category.includes("agenda")) index = 1;
      else if (category.includes("polera") || category.includes("polo")) index = 2;
      else if (category.includes("blusa") || category.includes("camisa")) index = 3;
      else if (category.includes("tela")) index = 4;
      else if (category.includes("deport")) index = 5;
      else index = 6;
    }
    const amount = Number(item.price || 0) * Number(item.quantity || 0);
    if (Number.isFinite(amount)) amounts[index] += amount;
  });
  return amounts.map(roundMoney);
}

function allocateCategories(categories, amount, paymentTotal) {
  if (!amount || !paymentTotal) return Array(reportCategories.length).fill(0);
  const total = categories.reduce((sum, value) => sum + value, 0);
  if (!total) {
    const fallback = Array(reportCategories.length).fill(0);
    fallback[6] = roundMoney(amount);
    return fallback;
  }
  const allocated = categories.map((value) =>
    roundMoney((value * amount) / total),
  );
  const difference = roundMoney(
    amount - allocated.reduce((sum, value) => sum + value, 0),
  );
  const largestCategory = categories.indexOf(Math.max(...categories));
  allocated[largestCategory] = roundMoney(
    allocated[largestCategory] + difference,
  );
  return allocated;
}

function makeRow(date, description, receipt, categories) {
  const amounts = categories.map(roundMoney);
  return [
    date,
    description,
    receipt,
    ...amounts,
    roundMoney(amounts.reduce((sum, amount) => sum + amount, 0)),
  ];
}

export function buildCashReportRows({
  sales,
  movements,
  products,
  startDate,
  endDate,
}) {
  if (!startDate || !endDate || startDate > endDate)
    throw new Error("Selecciona un rango de fechas válido.");

  const productsById = new Map(products.map((product) => [product.id, product]));
  const days = new Map();
  const getDay = (date) => {
    if (!days.has(date))
      days.set(date, { sales: [], movements: [] });
    return days.get(date);
  };
  const inRange = (date) =>
    date && date >= startDate && date <= endDate;

  sales
    .filter((sale) => sale.status !== "Anulada")
    .forEach((sale) => {
      const date = reportDate(sale.date || sale.sold_at);
      if (inRange(date)) getDay(date).sales.push(sale);
    });

  const saleIds = new Set(sales.map((sale) => String(sale.id)));
  movements
    .filter((movement) => {
      if (movement.status === "Anulada") return false;
      const concept = String(movement.concept || "");
      if (movement.type === "Ingreso")
        return (
          !saleIds.has(String(movement.id)) && !concept.startsWith("Venta ")
        );
      return (
        movement.type === "Egreso" &&
        !concept.startsWith("Anulación ")
      );
    })
    .forEach((movement) => {
      const date = reportDate(movement.date || movement.moved_at);
      if (inRange(date)) getDay(date).movements.push(movement);
    });

  const rows = [];
  [...days.keys()].sort().forEach((date) => {
    const day = days.get(date);
    const cashCategories = Array(reportCategories.length).fill(0);
    const qrRows = [];
    day.sales
      .sort((first, second) =>
        String(first.date || first.sold_at).localeCompare(
          String(second.date || second.sold_at),
        ),
      )
      .forEach((sale) => {
        const categories = saleCategories(sale, productsById);
        const cashAmount = roundMoney(
          Number(sale.cashAmount ?? sale.cash_amount ?? 0),
        );
        const qrAmount = roundMoney(
          Number(sale.qrAmount ?? sale.qr_amount ?? 0),
        );
        const qrCategories = allocateCategories(
          categories,
          qrAmount,
          cashAmount + qrAmount,
        );
        categories.forEach((amount, index) => {
          cashCategories[index] += amount - qrCategories[index];
        });
        if (qrAmount > 0) {
          qrRows.push(
            makeRow(
              date,
              `QR-${String(sale.payer || sale.customer || "Cliente").trim()}`,
              sale.id || "",
              qrCategories,
            ),
          );
        }
      });

    if (cashCategories.some((amount) => amount > 0))
      rows.push(makeRow(date, "EFECTIVO", "", cashCategories));
    rows.push(...qrRows);

    day.movements
      .sort((first, second) =>
        String(first.date || first.moved_at).localeCompare(
          String(second.date || second.moved_at),
        ),
      )
      .forEach((movement) => {
        const amount = Math.abs(
          Number(
            movement.amount ||
              movement.cashAmount ||
              movement.cash_amount ||
              movement.qrAmount ||
              movement.qr_amount ||
              0,
          ),
        );
        if (!amount) return;
        const categories = Array(reportCategories.length).fill(0);
        const isIncome = movement.type === "Ingreso";
        categories[isIncome ? 6 : 7] = roundMoney(amount) * (isIncome ? 1 : -1);
        rows.push(
          makeRow(
            date,
            String(
              movement.concept ||
                movement.reason ||
                (isIncome ? "INGRESO" : "EGRESO"),
            ).trim(),
            movement.id || "",
            categories,
          ),
        );
      });
  });
  return rows;
}

export async function downloadCashReport(options) {
  const rows = buildCashReportRows(options);
  const headers = [
    "FECHA",
    "DESCRIPCIÓN",
    "N°RECIBO",
    "LIBROS",
    "AGENDAS",
    "POLERAS",
    "BLU/CAM",
    "TELA",
    "DEXTIVO",
    "VARIOS",
    "OTROS",
    "TOTAL",
  ];
  const { strToU8, zipSync } = await import("fflate");
  const escapeXml = (value) =>
    Array.from(String(value ?? ""))
      .filter((character) => {
        const code = character.codePointAt(0);
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && code <= 0xd7ff) ||
          (code >= 0xe000 && code <= 0xfffd) ||
          (code >= 0x10000 && code <= 0x10ffff)
        );
      })
      .join("")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const columnName = (column) => String.fromCharCode(64 + column);
  const stringCell = (reference, value, style) =>
    `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  const numberCell = (reference, value, style) =>
    `<c r="${reference}" s="${style}"><v>${Number(value)}</v></c>`;
  const formulaCell = (reference, formula, value, style) =>
    `<c r="${reference}" s="${style}"><f>${escapeXml(formula)}</f><v>${Number(value)}</v></c>`;
  const dateSerial = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
  };
  const headerCells = headers
    .map((header, index) =>
      stringCell(`${columnName(index + 1)}5`, header, 3),
    )
    .join("");
  const dataRows = rows
    .map((reportRow, index) => {
      const rowNumber = index + 6;
      const zebra = index % 2 === 1;
      const cells = [
        numberCell(`A${rowNumber}`, dateSerial(reportRow[0]), zebra ? 7 : 4),
        stringCell(`B${rowNumber}`, reportRow[1], zebra ? 8 : 5),
        stringCell(`C${rowNumber}`, reportRow[2], zebra ? 8 : 5),
        ...reportRow.slice(3, 11).map((amount, amountIndex) =>
          numberCell(`${columnName(amountIndex + 4)}${rowNumber}`, amount, zebra ? 9 : 6),
        ),
        formulaCell(
          `L${rowNumber}`,
          `SUM(D${rowNumber}:K${rowNumber})`,
          reportRow[11],
          zebra ? 9 : 6,
        ),
      ];
      return `<row r="${rowNumber}">${cells.join("")}</row>`;
    })
    .join("");
  const totalRowNumber = rows.length + 6;
  const totalRow = rows.length
    ? `<row r="${totalRowNumber}">${stringCell(`A${totalRowNumber}`, "TOTAL", 10)}${reportCategories
        .map((_, index) =>
          numberCell(
            `${columnName(index + 4)}${totalRowNumber}`,
            roundMoney(rows.reduce((sum, row) => sum + row[index + 3], 0)),
            11,
          ),
        )
        .join(""        )}${formulaCell(
        `L${totalRowNumber}`,
        `SUM(D${totalRowNumber}:K${totalRowNumber})`,
        roundMoney(rows.reduce((sum, row) => sum + row[11], 0)),
        11,
      )}</row>`
    : `<row r="6">${stringCell("A6", "Sin movimientos en el período seleccionado.", 2)}</row>`;
  const lastRow = rows.length ? totalRowNumber : 6;
  const mergedRanges = rows.length
    ? `<mergeCell ref="A1:L1"/><mergeCell ref="A2:L2"/><mergeCell ref="A${totalRowNumber}:C${totalRowNumber}"/>`
    : '<mergeCell ref="A1:L1"/><mergeCell ref="A2:L2"/><mergeCell ref="A6:L6"/>';
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:L${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A6" sqref="A6"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/><col min="4" max="11" width="13" customWidth="1"/><col min="12" max="12" width="14" customWidth="1"/></cols>
<sheetData><row r="1" ht="30" customHeight="1">${stringCell("A1", "CAJA LIBRERÍA · INFORME DE CAJA", 1)}</row><row r="2">${stringCell("A2", `Período: ${options.startDate} al ${options.endDate}`, 2)}</row><row r="5" ht="24" customHeight="1">${headerCells}</row>${dataRows}${totalRow}</sheetData>
${rows.length ? `<autoFilter ref="A5:L${rows.length + 5}"/>` : ""}
<mergeCells count="3">${mergedRanges}</mergeCells>
<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00;-"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Arial"/></font><font><i/><color rgb="FF667085"/><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1118A8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176C67"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F7F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color rgb="FF1118A8"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="165" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Informe de caja" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": stylesXml,
    "xl/worksheets/sheet1.xml": worksheetXml,
  };
  const archive = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, strToU8(content)]),
  );
  const buffer = zipSync(archive, { level: 6 });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `caja_${options.startDate}_al_${options.endDate}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}
