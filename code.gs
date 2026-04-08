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
  for (let i = 1; i <= 5; i++) {
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
    const phoneVal = row[phoneIndex];
    // getDataRange() often includes many blank rows; skip them so histogram/rank match real students (Phone = SBD).
    if (!normalizePhoneToken(phoneVal)) continue;

    const toan = sumPointsFromRow(row, pointIdxToan);
    const van = sumPointsFromRow(row, pointIdxVan);
    const anh = sumPointsFromRow(row, pointIdxAnh);
    const total = toan + van + anh;
    totals.push(total);

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

function matchPhone(phoneValue, input) {
  const phone = normalizePhoneToken(phoneValue);
  return !!phone && phone === input;
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

function buildHistogramBins(values, targetBinCount) {
  if (!values || values.length === 0) return [];

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  if (min === max) {
    return [{
      low: min,
      high: max,
      label: formatBinEdge(min),
      dataMax: max,
      isLast: true,
      count: values.length
    }];
  }

  const span = max - min;
  const t = Math.min(Math.max(targetBinCount, 10), 16);
  const rawWidth = span / t;
  const widthCandidates = [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20];
  let binWidth = widthCandidates[widthCandidates.length - 1];
  for (let i = 0; i < widthCandidates.length; i++) {
    if (widthCandidates[i] >= rawWidth * 0.65) {
      binWidth = widthCandidates[i];
      break;
    }
    binWidth = widthCandidates[i];
  }

  const start = Math.floor(min / binWidth) * binWidth;
  const bins = [];
  let low = start;

  while (low < max - 1e-9 && bins.length < 48) {
    const next = low + binWidth;
    const isLast = next >= max - 1e-9;
    if (isLast) {
      bins.push({
        low: low,
        high: max,
        label: `${formatBinEdge(low)}-${formatBinEdge(max)}`,
        dataMax: max,
        isLast: true
      });
      break;
    }
    bins.push({
      low: low,
      high: next,
      label: `${formatBinEdge(low)}-${formatBinEdge(next)}`,
      dataMax: max,
      isLast: false
    });
    low = next;
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
    bin.count = count;
  }

  return bins;
}