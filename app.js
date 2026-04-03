const API_URL =
  "https://script.google.com/macros/s/AKfycbxAv_9qruzkWTmNZz4-4n6OlZ_3ytBI2-5P-KPjW_Fqbgv25PjnCYm2lAoS4sbcI8DlMQ/exec?action=getAll&sheet=Data";

const KEY_LINK_TOAN = "Link kết quả";
const KEY_LINK_VAN = "Link kết quả_2";
const KEY_LINK_ANH = "Link kết quả_3";
const KEY_EXAM_SCORE = "Điểm thi";
const KEY_ROOM = "Phòng thi";

const form = document.querySelector("#lookup-form");
const messageEl = document.querySelector("#lookup-message");
const resultCard = document.querySelector("#result-card");
const tableBody = document.querySelector("#result-table-body");
const compositeCell = document.querySelector("#result-composite-score");
const submitBtn = form?.querySelector('button[type="submit"]');

const summaryName = document.querySelector("#summary-name");
const summaryPhone = document.querySelector("#summary-phone");
const summaryExamScore = document.querySelector("#summary-exam-score");
const summaryRoom = document.querySelector("#summary-room");

let cachedRows = null;

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
  compositeCell.textContent = "";
  if (summaryName) summaryName.textContent = "";
  if (summaryPhone) summaryPhone.textContent = "";
  if (summaryExamScore) summaryExamScore.textContent = "";
  if (summaryRoom) summaryRoom.textContent = "";
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
  for (let i = 1; i <= 6; i += 1) {
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
  return 2 * toan + 2 * van + anh;
}

function formatScore(n) {
  const s = n.toFixed(2);
  if (s.endsWith(".00")) return String(Math.round(n));
  if (s.endsWith("0")) return s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function normalizePhoneToken(value) {
  return String(value).trim().replace(/\s+/g, "");
}

function phoneTail(phone) {
  const p = normalizePhoneToken(phone);
  if (!p) return "";
  const i = p.lastIndexOf("-");
  return i === -1 ? p : p.slice(i + 1);
}

function recordMatchesInput(record, inputRaw) {
  const input = normalizePhoneToken(inputRaw);
  if (!input) return false;

  const phone = record.Phone != null ? normalizePhoneToken(record.Phone) : "";
  if (!phone) return false;

  if (phone === input) return true;
  if (phoneTail(record.Phone) === input) return true;

  const tail = phoneTail(record.Phone);
  const stripLeading = (s) => s.replace(/^0+/, "") || "0";
  if (stripLeading(tail) === stripLeading(input)) return true;

  return false;
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

  const response = await fetch(API_URL);
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

function renderSummary(record) {
  const name = record.Name != null ? String(record.Name) : "";
  const phone = record.Phone != null ? String(record.Phone) : "";

  if (summaryName) summaryName.textContent = displayText(name);
  if (summaryPhone) summaryPhone.textContent = displayText(phone);
  if (summaryExamScore) summaryExamScore.textContent = displayText(record[KEY_EXAM_SCORE]);
  if (summaryRoom) summaryRoom.textContent = displayText(record[KEY_ROOM]);
}

function renderTable(record) {
  renderSummary(record);

  const { toan, van, anh } = subjectScores(record);
  const total = compositeScore({ toan, van, anh });

  const rows = [
    {
      mon: "Toán",
      diem: formatScore(toan),
      link: record[KEY_LINK_TOAN],
    },
    {
      mon: "Văn",
      diem: formatScore(van),
      link: record[KEY_LINK_VAN],
    },
    {
      mon: "Anh",
      diem: formatScore(anh),
      link: record[KEY_LINK_ANH],
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

  compositeCell.textContent = formatScore(total);
  resultCard.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const originalInput = String(formData.get("candidateId") || "").trim();

  if (!originalInput) {
    clearResult();
    setMessage("Vui lòng nhập số báo danh (Phone).");
    return;
  }

  clearResult();
  setMessage("");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const rows = await loadRows();
    const matched = rows.find((row) => recordMatchesInput(row, originalInput));

    if (!matched) {
      setMessage("Không tìm thấy kết quả. Vui lòng kiểm tra lại số báo danh trong cột Phone.");
      return;
    }

    renderTable(matched);
  } catch {
    clearResult();
    setMessage("Không tải được dữ liệu. Vui lòng thử lại sau.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});
