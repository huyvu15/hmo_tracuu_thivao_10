const API_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxFNHvUobhfHFP_6cdWGAyDx8cakKfuH99xMlSGnKLXfSWAl4obbcyANxTba1kBI-JpXA/exec";
const API_SHEET_NAME = "Data";

const KEY_LINK_TOAN = "Link kết quả";
const KEY_LINK_VAN = "Link kết quả_2";
const KEY_LINK_ANH = "Link kết quả_3";
const KEY_EXAM_SCORE = "Điểm thi";
const KEY_ROOM = "Phòng thi";
const KEY_PROMO = "Mức ưu đãi";

const form = document.querySelector("#lookup-form");
const messageEl = document.querySelector("#lookup-message");
const resultCard = document.querySelector("#result-card");
const tableBody = document.querySelector("#result-table-body");
const compositeScoreText = document.querySelector("#result-composite-score-text");
const submitBtn = document.querySelector("#lookup-submit");
const candidateInput = document.querySelector("#candidate-id");

const summaryName = document.querySelector("#summary-name");
const summaryPhone = document.querySelector("#summary-phone");
const summaryExamScore = document.querySelector("#summary-exam-score");
const summaryRoom = document.querySelector("#summary-room");
const summaryRank = document.querySelector("#summary-rank");

const scoreChartWrap = document.querySelector("#score-chart-wrap");
const scoreChart = document.querySelector("#score-chart");
const scoreChartYAxis = document.querySelector("#score-chart-y-axis");
const scoreChartHint = document.querySelector("#score-chart-hint");
const scholarshipPercentInline = document.querySelector("#scholarship-percent-inline");
const scholarshipPromoBody = document.querySelector("#scholarship-promo-body");

let cachedRows = null;

function setFormLoading(loading) {
  if (!form) return;
  form.classList.toggle("is-loading", loading);
  form.setAttribute("aria-busy", loading ? "true" : "false");
  if (submitBtn) submitBtn.disabled = loading;
  if (candidateInput) candidateInput.disabled = loading;
  const label = submitBtn?.querySelector(".submit-text");
  if (label) label.textContent = loading ? "Đang tra cứu..." : "Tra cứu";
}

function setMessage(text) {
  messageEl.textContent = text;
}

function displayText(value) {
  if (value == null || String(value).trim() === "") return "—";
  return String(value).trim();
}

function clearResult() {
  resultCard.classList.add("hidden");
  tableBody.textContent = "";
  if (compositeScoreText) compositeScoreText.textContent = "";
  if (summaryName) summaryName.textContent = "";
  if (summaryPhone) summaryPhone.textContent = "";
  if (summaryExamScore) summaryExamScore.textContent = "";
  if (summaryRoom) summaryRoom.textContent = "";
  if (summaryRank) summaryRank.textContent = "";
  if (scoreChart) scoreChart.textContent = "";
  if (scoreChartYAxis) scoreChartYAxis.textContent = "";
  if (scoreChartHint) scoreChartHint.textContent = "";
  if (scoreChartWrap) scoreChartWrap.hidden = true;
  if (scholarshipPercentInline) scholarshipPercentInline.textContent = "—";
  if (scholarshipPromoBody) scholarshipPromoBody.textContent = "";
}

function parseObtainedScore(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return null;

  const slash = s.indexOf("/");
  if (slash === -1) return null;

  const leftPart = s.slice(0, slash).trim();
  const obtained = leftPart === "" ? 0 : Number.parseFloat(leftPart.replace(",", "."));
  if (Number.isNaN(obtained)) return null;
  return obtained;
}

function sumPointsFromKeys(record, keySuffix) {
  let sum = 0;
  for (let i = 1; i <= 5; i += 1) {
    const key = keySuffix === "" ? `Point${i}` : `Point${i}_${keySuffix}`;
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const v = parseObtainedScore(record[key]);
    if (v != null) sum += v;
  }
  return sum;
}

function subjectScores(record) {
  const toan = sumPointsFromKeys(record, "");
  const van = sumPointsFromKeys(record, "2");
  const anh = sumPointsFromKeys(record, "3");
  return { toan, van, anh };
}

function compositeScore({ toan, van, anh }) {
  return toan + van + anh;
}

function totalForRecord(record) {
  return compositeScore(subjectScores(record));
}

function formatScore(n) {
  const s = n.toFixed(2);
  if (s.endsWith(".00")) return String(Math.round(n));
  if (s.endsWith("0")) return s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function rankByTotal(rows, studentTotal) {
  const strictlyAbove = rows.filter((r) => totalForRecord(r) > studentTotal).length;
  return strictlyAbove + 1;
}

function formatBinEdge(x) {
  const r = Math.round(x * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
  return String(r);
}

function buildHistogramBins(values, targetBinCount = 14) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [
      {
        low: min,
        high: max,
        label: formatBinEdge(min),
        dataMax: max,
        isLast: true,
        count: values.length,
      },
    ];
  }

  const span = max - min;
  const t = Math.min(Math.max(targetBinCount, 10), 16);
  const rawWidth = span / t;
  const widthCandidates = [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20];
  let binWidth = widthCandidates[widthCandidates.length - 1];
  for (let i = 0; i < widthCandidates.length; i += 1) {
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
        low,
        high: max,
        label: `${formatBinEdge(low)}-${formatBinEdge(max)}`,
        dataMax: max,
        isLast: true,
      });
      break;
    }
    bins.push({
      low,
      high: next,
      label: `${formatBinEdge(low)}-${formatBinEdge(next)}`,
      dataMax: max,
      isLast: false,
    });
    low = next;
  }

  for (const b of bins) {
    b.count = values.filter((v) => {
      if (b.isLast) return v >= b.low && v <= b.dataMax;
      return v >= b.low && v < b.high;
    }).length;
  }

  return bins;
}

function niceAxisMax(n) {
  const x = Math.max(n, 1);
  const pow10 = 10 ** Math.floor(Math.log10(x));
  const f = x / pow10;
  let nf = 10;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 5) nf = 5;
  const candidate = nf * pow10;
  return Math.max(candidate, x);
}

function valueInBin(v, bin) {
  if (bin.isLast) return v >= bin.low && v <= (bin.dataMax != null ? bin.dataMax : bin.high);
  return v >= bin.low && v < bin.high;
}

function renderYAxisScale(axisMax) {
  if (!scoreChartYAxis) return;
  scoreChartYAxis.textContent = "";
  const steps = 5;
  const cap = Math.max(1, axisMax);
  for (let i = 0; i < steps; i += 1) {
    const val = Math.round((cap * (steps - 1 - i)) / (steps - 1));
    const span = document.createElement("span");
    span.textContent = String(val);
    scoreChartYAxis.appendChild(span);
  }
}

function buildChartColumn(bin, axisMax, highlightYou) {
  const col = document.createElement("div");
  col.className = "chart-col";
  if (highlightYou) col.classList.add("chart-col--you");

  const wrap = document.createElement("div");
  wrap.className = "chart-col-bar-wrap";

  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "chart-col-bar";
  bar.setAttribute("aria-label", `Giá trị cột: ${bin.count} thí sinh, khoảng điểm ${bin.label}`);
  const pct = axisMax > 0 ? (bin.count / axisMax) * 100 : 0;
  col.style.setProperty("--bar-pct", `${pct}%`);
  if (bin.count === 0) {
    bar.style.height = "0";
    bar.style.minHeight = "0";
  } else {
    bar.style.minHeight = "2px";
    bar.style.height = `${pct}%`;
  }

  const tooltip = document.createElement("span");
  tooltip.className = "chart-col-tooltip";
  const tooltipRange = document.createElement("span");
  tooltipRange.className = "chart-col-tooltip-range";
  tooltipRange.textContent = bin.label;
  const tooltipCount = document.createElement("span");
  tooltipCount.className = "chart-col-tooltip-count";
  tooltipCount.textContent = `${bin.count} thí sinh`;
  tooltip.append(tooltipRange, tooltipCount);

  if (highlightYou) {
    const fixedValue = document.createElement("span");
    fixedValue.className = "chart-col-fixed-value";
    fixedValue.textContent = String(bin.count);
    wrap.appendChild(fixedValue);
  }

  wrap.append(bar, tooltip);

  const xlabel = document.createElement("span");
  xlabel.className = "chart-col-xlabel";
  xlabel.textContent = bin.label;

  col.append(wrap, xlabel);
  return col;
}

function renderScoreChart(rows, studentTotal) {
  if (!scoreChart || !scoreChartWrap || !scoreChartHint) return;

  const totals = rows.map((r) => totalForRecord(r));
  const bins = buildHistogramBins(totals, 14);
  if (!bins.length) {
    scoreChartWrap.hidden = true;
    return;
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const axisMax = niceAxisMax(maxCount);
  renderYAxisScale(axisMax);

  scoreChart.textContent = "";
  scoreChartHint.textContent = `Thanh màu đỏ là khoảng điểm chứa tổng điểm xét tuyển của bạn (${formatScore(studentTotal)} điểm).`;

  for (const bin of bins) {
    const col = buildChartColumn(bin, axisMax, valueInBin(studentTotal, bin));
    scoreChart.appendChild(col);
  }

  scoreChartWrap.hidden = false;
}

function renderScoreChartFromBins(bins, studentTotal, youBinIndex) {
  if (!scoreChart || !scoreChartWrap || !scoreChartHint) return;

  if (!bins || !bins.length) {
    scoreChartWrap.hidden = true;
    return;
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const axisMax = niceAxisMax(maxCount);
  renderYAxisScale(axisMax);

  scoreChart.textContent = "";
  scoreChartHint.textContent = `Thanh màu đỏ là khoảng điểm chứa tổng điểm xét tuyển của bạn (${formatScore(studentTotal)} điểm).`;

  scoreChartWrap.hidden = false;
  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    const col = buildChartColumn(bin, axisMax, i === youBinIndex);
    scoreChart.appendChild(col);
  }
}

function normalizePhoneToken(value) {
  return String(value).trim().replace(/\s+/g, "");
}

function recordMatchesInput(record, inputRaw) {
  const input = normalizePhoneToken(inputRaw);
  if (!input) return false;

  const phone = record.Phone != null ? normalizePhoneToken(record.Phone) : "";
  return !!phone && phone === input;
}

function appendResultLink(cell, url) {
  const u = url != null ? String(url).trim() : "";
  if (!u || !/^https?:\/\//i.test(u)) {
    cell.textContent = "—";
    return;
  }
  const a = document.createElement("a");
  a.href = u;
  a.textContent = "Xem chi tiết";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "result-link";
  cell.appendChild(a);
}

async function loadRows() {
  if (cachedRows) return cachedRows;

  const response = await fetch(
    `${API_SCRIPT_URL}?action=getAll&sheet=${encodeURIComponent(API_SHEET_NAME)}`
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = await response.json();
  if (!json || json.status !== true || !Array.isArray(json.data)) {
    throw new Error("Du lieu API khong hop le.");
  }
  cachedRows = json.data;
  return cachedRows;
}

async function fetchStudentByPhone(phoneRaw) {
  const url = `${API_SCRIPT_URL}?action=getByPhone&sheet=${encodeURIComponent(
    API_SHEET_NAME
  )}&phone=${encodeURIComponent(phoneRaw)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  if (!json || json.status !== true) {
    throw new Error(json?.message ? String(json.message) : "Not found");
  }

  return json;
}

function renderSummary(record) {
  const name = record.Name != null ? String(record.Name) : "";
  const phone = record.Phone != null ? String(record.Phone) : "";

  if (summaryName) summaryName.textContent = displayText(name);
  if (summaryPhone) summaryPhone.textContent = displayText(phone);
  if (summaryExamScore) summaryExamScore.textContent = displayText(record[KEY_EXAM_SCORE]);
  if (summaryRoom) summaryRoom.textContent = displayText(record[KEY_ROOM]);
}

function extractLeadingPercent(text) {
  const s = String(text).trim();
  if (!s) return "";
  const m = s.match(/^(\d+\s*%)/);
  if (m) return m[1].replace(/\s+/g, "");
  const m2 = s.match(/^(\d+%)/);
  return m2 ? m2[1] : "";
}

function renderPromo(record) {
  const raw = record[KEY_PROMO];
  const full = raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";

  if (!full) {
    if (scholarshipPercentInline) scholarshipPercentInline.textContent = "—";
    if (scholarshipPromoBody) scholarshipPromoBody.textContent = "";
    return;
  }

  const pct = extractLeadingPercent(full);
  if (scholarshipPercentInline) {
    scholarshipPercentInline.textContent = pct || "—";
  }
  if (scholarshipPromoBody) {
    scholarshipPromoBody.textContent = full;
  }
}

function renderTable(payload) {
  const student = payload.student;
  const computed = payload.computed;
  const rankInfo = payload.rank;
  const histogram = payload.histogram;

  renderSummary(student);
  renderPromo(student);

  const { toan, van, anh, total } = computed;
  const n = rankInfo?.n ?? 0;
  const rank = rankInfo?.rank ?? 0;

  if (summaryRank) {
    summaryRank.textContent = `Hạng ${rank} / ${n} thí sinh.`;
  }

  const rows = [
    {
      mon: "Toán",
      diem: formatScore(toan),
      link: student[KEY_LINK_TOAN],
    },
    {
      mon: "Văn",
      diem: formatScore(van),
      link: student[KEY_LINK_VAN],
    },
    {
      mon: "Anh",
      diem: formatScore(anh),
      link: student[KEY_LINK_ANH],
    },
  ];

  tableBody.textContent = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = r.mon;
    const tdDiem = document.createElement("td");
    tdDiem.textContent = r.diem;
    tdDiem.className = "result-score-cell";
    const tdLink = document.createElement("td");
    appendResultLink(tdLink, r.link);
    tr.append(th, tdDiem, tdLink);
    tableBody.appendChild(tr);
  }

  if (compositeScoreText) compositeScoreText.textContent = formatScore(total);
  renderScoreChartFromBins(histogram?.bins, total, histogram?.youBinIndex);
  resultCard.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const originalInput = String(formData.get("candidateId") || "").trim();

  if (!originalInput) {
    clearResult();
    setMessage("Vui lòng nhập số báo danh.");
    return;
  }

  clearResult();
  setMessage("");
  setFormLoading(true);

  try {
    const result = await fetchStudentByPhone(originalInput);
    renderTable(result);
  } catch (err) {
    clearResult();
    const msg = err?.message ? String(err.message) : "";
    if (msg === "Not found") {
      setMessage("Không tìm thấy kết quả.");
    } else {
      setMessage("Không tải được dữ liệu. Vui lòng thử lại sau.");
    }
  } finally {
    setFormLoading(false);
  }
});
