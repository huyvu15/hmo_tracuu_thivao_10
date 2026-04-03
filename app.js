const scoreDatabase = [
  {
    candidateId: "HM26001234",
    fullName: "Nguyen Minh Anh",
    location: "THPT Chuyen Ha Noi - Amsterdam",
    scores: { math: 9.0, literature: 8.5, english: 9.25, priority: 0.5 },
    preference1: "THPT Chuyen Ha Noi - Amsterdam",
  },
  {
    candidateId: "HM26004567",
    fullName: "Tran Quang Huy",
    location: "THPT Viet Duc",
    scores: { math: 8.0, literature: 7.25, english: 8.75, priority: 0.0 },
    preference1: "THPT Viet Duc",
  },
  {
    candidateId: "HM26007890",
    fullName: "Le Khanh Linh",
    location: "THPT Kim Lien",
    scores: { math: 9.5, literature: 8.75, english: 9.5, priority: 1.0 },
    preference1: "THPT Kim Lien",
  },
];

const form = document.querySelector("#lookup-form");
const messageEl = document.querySelector("#lookup-message");
const resultCard = document.querySelector("#result-card");

const resultName = document.querySelector("#result-name");
const resultId = document.querySelector("#result-id");
const resultLocation = document.querySelector("#result-location");
const scoreMath = document.querySelector("#score-math");
const scoreLiterature = document.querySelector("#score-literature");
const scoreEnglish = document.querySelector("#score-english");
const scorePriority = document.querySelector("#score-priority");
const scoreTotal = document.querySelector("#score-total");
const resultPreference = document.querySelector("#result-preference");
const resultStatus = document.querySelector("#result-status");

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toLowerCase();
}

function formatScore(score) {
  return Number.isInteger(score) ? `${score}.00` : score.toFixed(2);
}

function calculateTotal(scores) {
  return scores.math + scores.literature + scores.english + scores.priority;
}

function renderResult(record) {
  const total = calculateTotal(record.scores);
  const isPass = total >= 24;

  resultName.textContent = record.fullName;
  resultId.textContent = record.candidateId;
  resultLocation.textContent = record.location;
  scoreMath.textContent = formatScore(record.scores.math);
  scoreLiterature.textContent = formatScore(record.scores.literature);
  scoreEnglish.textContent = formatScore(record.scores.english);
  scorePriority.textContent = formatScore(record.scores.priority);
  scoreTotal.textContent = formatScore(total);
  resultPreference.textContent = record.preference1;
  resultStatus.textContent = isPass ? "Dat" : "Chua dat";
  resultStatus.style.background = isPass ? "rgba(4, 165, 97, 0.15)" : "rgba(193, 18, 31, 0.15)";
  resultStatus.style.color = isPass ? "#007b47" : "#9e0e18";

  resultCard.classList.remove("hidden");
}

function clearResult() {
  resultCard.classList.add("hidden");
}

function setMessage(text) {
  messageEl.textContent = text;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const candidateId = normalizeText(String(formData.get("candidateId") || ""));

  if (!candidateId) {
    clearResult();
    setMessage("Vui long nhap so bao danh.");
    return;
  }

  const matchedRecord = scoreDatabase.find((record) => {
    return normalizeText(record.candidateId) === candidateId;
  });

  if (!matchedRecord) {
    clearResult();
    setMessage("Khong tim thay ket qua. Vui long kiem tra lai thong tin tra cuu.");
    return;
  }

  setMessage("");
  renderResult(matchedRecord);
});
