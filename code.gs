function doGet(req) {

  const action = req?.parameter?.action || "getByPhone";
  const sheetName = req?.parameter?.sheet || "Data";

  if (action === "getByPhone") {
    const phoneRaw = req?.parameter?.phone || "";
    const data = getByPhoneData(sheetName, phoneRaw);
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Security: do not expose the full dataset to the browser.
  if (action === "getAll") {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: false,
        message: "Endpoint getAll has been disabled."
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      status: false,
      message: "Invalid action"
    }))
    .setMimeType(ContentService.MimeType.JSON);
}


function getAllData(sheetName) {

  const spreadsheetId = '1-pSCH22vTLd-hKiBco6xkAVtxbMzf2qW6mDOl64itrg';

  const sheet = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName(sheetName);

  if (!sheet) {
    return {
      status: false,
      message: 'Sheet không tồn tại'
    };
  }

  const data = sheet.getDataRange().getDisplayValues();

  if (data.length === 0) {
    return {
      status: false,
      message: 'Sheet rỗng'
    };
  }

  let headers = data.shift();

  // fix header trùng
  const headerCount = {};

  headers = headers.map(h => {

    if (!h) h = "EMPTY";

    if (!headerCount[h]) {
      headerCount[h] = 1;
      return h;
    }

    headerCount[h]++;
    return `${h}_${headerCount[h]}`;

  });

  const result = data.map(row => {

    const obj = {};

    headers.forEach((header, i) => {
      obj[header] = row[i];
    });

    return obj;

  });

  return {
    status: true,
    total: result.length,
    data: result
  };

}

function getByPhoneData(sheetName, phoneRaw) {
  const spreadsheetId = '1-pSCH22vTLd-hKiBco6xkAVtxbMzf2qW6mDOl64itrg';

  const sheet = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName(sheetName);

  if (!sheet) {
    return { status: false, message: 'Sheet không tồn tại' };
  }

  const allValues = sheet.getDataRange().getDisplayValues();
  if (!allValues || allValues.length === 0) {
    return { status: false, message: 'Sheet rỗng' };
  }

  const headersRaw = allValues[0];
  let headers = headersRaw;

  // Fix duplicate headers to keep stable keys.
  const headerCount = {};
  headers = headers.map(h => {
    let v = h;
    if (!v) v = "EMPTY";

    if (!headerCount[v]) {
      headerCount[v] = 1;
      return v;
    }
    headerCount[v]++;
    return `${v}_${headerCount[v]}`;
  });

  const headerIndex = {};
  headers.forEach((h, i) => { headerIndex[h] = i; });

  const phoneIndex = headerIndex["Phone"];
  if (phoneIndex == null) {
    return { status: false, message: "Không tìm thấy cột Phone trong sheet." };
  }

  // Point columns used by the scoring logic.
  const pointIdxToan = [];
  const pointIdxVan = [];
  const pointIdxAnh = [];
  for (let i = 1; i <= 6; i++) {
    pointIdxToan.push(headerIndex[`Point${i}`]);
    pointIdxVan.push(headerIndex[`Point${i}_2`]);
    pointIdxAnh.push(headerIndex[`Point${i}_3`]);
  }

  const totals = [];
  let matchedRow = null;
  let studentComputed = null;
  const input = normalizePhoneToken(phoneRaw);

  for (let r = 1; r < allValues.length; r++) {
    const row = allValues[r];

    const toan = sumPointsFromRow(row, pointIdxToan);
    const van = sumPointsFromRow(row, pointIdxVan);
    const anh = sumPointsFromRow(row, pointIdxAnh);
    const total = 2 * toan + 2 * van + anh;
    totals.push(total);

    const phoneVal = row[phoneIndex];
    if (!matchedRow && input && matchPhone(phoneVal, input)) {
      matchedRow = row;
      studentComputed = { toan, van, anh, total };
    }
  }

  if (!matchedRow) {
    return { status: false, message: "Not found" };
  }

  const n = totals.length;
  const strictlyAbove = totals.filter((t) => t > studentComputed.total).length;
  const rank = strictlyAbove + 1;

  const bins = buildHistogramBins(totals, 14);
  let youBinIndex = -1;
  for (let i = 0; i < bins.length; i++) {
    if (valueInBin(studentComputed.total, bins[i])) {
      youBinIndex = i;
      break;
    }
  }

  const studentObj = {};
  headers.forEach((h, i) => { studentObj[h] = matchedRow[i]; });

  return {
    status: true,
    student: studentObj,
    computed: studentComputed,
    rank: { rank, n },
    histogram: {
      bins: bins.map(b => ({ label: b.label, count: b.count })),
      youBinIndex
    }
  };
}

function normalizePhoneToken(value) {
  if (value == null) return "";
  return String(value).trim().replace(/\s+/g, "");
}

function phoneTail(phone) {
  const p = normalizePhoneToken(phone);
  if (!p) return "";
  const i = p.lastIndexOf("-");
  return i === -1 ? p : p.slice(i + 1);
}

function matchPhone(phoneValue, input) {
  const phone = normalizePhoneToken(phoneValue);
  if (!phone) return false;

  if (phone === input) return true;
  if (phoneTail(phoneValue) === input) return true;

  const tail = phoneTail(phoneValue);
  const stripLeading = (s) => (s ? s.replace(/^0+/, "") : "0") || "0";
  return stripLeading(tail) === stripLeading(input);
}

function parseObtainedScore(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return null;

  const slash = s.indexOf("/");
  if (slash === -1) return null;

  const leftPart = s.slice(0, slash).trim();
  const obtained = leftPart === "" ? 0 : parseFloat(leftPart.replace(",", "."));
  if (Number.isNaN(obtained)) return null;
  return obtained;
}

function sumPointsFromRow(row, indices) {
  let sum = 0;
  for (let i = 0; i < indices.length; i++) {
    const colIdx = indices[i];
    if (colIdx == null) continue;
    const v = parseObtainedScore(row[colIdx]);
    if (v != null) sum += v;
  }
  return sum;
}

function valueInBin(v, bin) {
  if (bin.isLast) return v >= bin.low && v <= (bin.dataMax != null ? bin.dataMax : bin.high);
  return v >= bin.low && v < bin.high;
}

function formatBinEdge(x) {
  const r = Math.round(x * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
  return String(r);
}

function buildHistogramBins(values, binCount) {
  if (!values || values.length === 0) return [];

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  if (min === max) {
    return [{
      low: min,
      high: max,
      label: formatBinEdge(min),
      dataMax: max,
      isLast: true
    }];
  }

  const n = Math.min(Math.max(binCount, 8), 20);
  const step = (max - min) / n;
  const bins = [];

  for (let i = 0; i < n; i++) {
    const low = min + i * step;
    const high = i === n - 1 ? max : min + (i + 1) * step;
    const isLast = i === n - 1;
    const label = isLast
      ? `${formatBinEdge(low)}-${formatBinEdge(max)}`
      : `${formatBinEdge(low)}-${formatBinEdge(high)}`;
    bins.push({ low, high, label, dataMax: max, isLast });
  }

  for (let b = 0; b < bins.length; b++) {
    const bin = bins[b];
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      let inBin = false;
      if (bin.isLast) {
        inBin = v >= bin.low && v <= (bin.dataMax != null ? bin.dataMax : bin.high);
      } else {
        inBin = v >= bin.low && v < bin.high;
      }
      if (inBin) count++;
    }
    bins[b].count = count;
  }

  return bins;
}