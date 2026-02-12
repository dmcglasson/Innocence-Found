// import { getSupabaseClient } from "./supabase.js";

// const supabase = getSupabaseClient()

const worksheets = [
  {
    id: "ela-evidence",
    title: "Finding Evidence in the Text",
    subject: "ELA",
    grade: 4,
    chapter: "Close Reading",
    ageRange: "9-10",
    topic: "Text Evidence",
    duration: 30,
    skills: ["citing evidence", "inference"],
    format: "PDF + Google Doc",
    description: "Short passages with scaffolds that guide students to cite and explain textual evidence.",
    file: "ela-evidence.pdf",
    access: "free",
  },
  {
    id: "math-fractions",
    title: "Fractions in Word Problems",
    subject: "Math",
    grade: 5,
    chapter: "Fractions",
    ageRange: "10-11",
    topic: "Fraction Operations",
    duration: 35,
    skills: ["modeling", "number sense"],
    format: "PDF + Jamboard",
    description: "Real world scenarios that ask students to model and solve fraction addition and subtraction.",
    file: "math-fractions.pdf",
    access: "locked",
  },
  {
    id: "science-tectonics",
    title: "Evidence of Plate Tectonics",
    subject: "Science",
    grade: 6,
    chapter: "Earth Systems",
    ageRange: "11-12",
    topic: "Plate Tectonics",
    duration: 40,
    skills: ["data analysis", "CER writing"],
    format: "PDF + slide deck",
    description: "Data tables, maps, and diagrams for students to analyze patterns in earthquakes and volcanoes.",
    file: "science-tectonics.pdf",
    access: "locked",
  },
  {
    id: "history-sources",
    title: "Evaluating Primary Sources",
    subject: "Social Studies",
    grade: 7,
    chapter: "Historical Thinking",
    ageRange: "12-13",
    topic: "Primary Sources",
    duration: 30,
    skills: ["sourcing", "corroboration"],
    format: "PDF + editable doc",
    description: "Source sets with guiding questions that ask students to evaluate credibility and perspective.",
    file: "history-sources.pdf",
    access: "free",
  },
  {
    id: "ela-argument",
    title: "Argument Writing Planner",
    subject: "ELA",
    grade: 8,
    chapter: "Writing Workshop",
    ageRange: "13-14",
    topic: "Argument Writing",
    duration: 25,
    skills: ["argument structure", "drafting"],
    format: "PDF + fillable form",
    description: "Graphic organizers that guide claim, evidence, and reasoning with mentor sentence stems.",
    file: "ela-argument.pdf",
    access: "locked",
  },
  {
    id: "math-word-problems",
    title: "Multi Step Word Problems",
    subject: "Math",
    grade: 3,
    chapter: "Problem Solving",
    ageRange: "8-9",
    topic: "Word Problems",
    duration: 20,
    skills: ["problem solving", "modeling"],
    format: "PDF + printable cards",
    description: "Visual models and scaffolds for two step problems using the four operations.",
    file: "math-word-problems.pdf",
    access: "free",
  },
  {
    id: "science-energy",
    title: "Energy Transfer Scenarios",
    subject: "Science",
    grade: 5,
    chapter: "Matter & Energy",
    ageRange: "10-11",
    topic: "Energy",
    duration: 28,
    skills: ["cause and effect", "data tables"],
    format: "PDF + lab sheet",
    description: "Short scenarios that ask students to identify the direction of energy flow and support claims.",
    file: "science-energy.pdf",
    access: "free",
  },
  {
    id: "ela-context-clues",
    title: "Context Clues Sprint",
    subject: "ELA",
    grade: 3,
    chapter: "Vocabulary",
    ageRange: "8-9",
    topic: "Context Clues",
    duration: 18,
    skills: ["vocabulary", "context clues"],
    format: "PDF",
    description: "Quick passages where students use nearby words to infer meaning of bolded terms.",
    file: "ela-context-clues.pdf",
    access: "locked",
  },
];

const state = {
  subject: "all",
  grade: "all",
  chapter: "all",
  ageRange: "all",
  topic: "all",
  duration: "all",
  access: "all",
  sort: "grade-asc",
  search: "",
};

document.addEventListener("DOMContentLoaded", () => {
  populateDynamicFilters();
  wireFilters();
  render(worksheets);
  wireHowTo();
  wireModalClose();
});

function wireFilters() {
  const chipRow = document.getElementById("subjectChips");
  const searchInput = document.getElementById("searchInput");
  const gradeSelect = document.getElementById("gradeSelect");
  const chapterSelect = document.getElementById("chapterSelect");
  const ageSelect = document.getElementById("ageSelect");
  const durationSelect = document.getElementById("durationSelect");
  const topicSelect = document.getElementById("topicSelect");
  const accessSelect = document.getElementById("accessSelect");
  const sortSelect = document.getElementById("sortSelect");

  chipRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-subject]");
    if (!btn) return;
    chipRow.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
    btn.classList.add("active");
    state.subject = btn.dataset.subject;
    applyFilters();
  });

  searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.toLowerCase();
    applyFilters();
  });

  gradeSelect.addEventListener("change", (e) => {
    state.grade = e.target.value;
    applyFilters();
  });

  chapterSelect.addEventListener("change", (e) => {
    state.chapter = e.target.value;
    applyFilters();
  });

  ageSelect.addEventListener("change", (e) => {
    state.ageRange = e.target.value;
    applyFilters();
  });

  durationSelect.addEventListener("change", (e) => {
    state.duration = e.target.value;
    applyFilters();
  });

  topicSelect.addEventListener("change", (e) => {
    state.topic = e.target.value;
    applyFilters();
  });

  accessSelect.addEventListener("change", (e) => {
    state.access = e.target.value;
    applyFilters();
  });

  sortSelect.addEventListener("change", (e) => {
    state.sort = e.target.value;
    applyFilters();
  });

  document.querySelectorAll("[data-clear-filters]").forEach((btn) => {
    btn.addEventListener("click", resetFilters);
  });
}

function resetFilters() {
  state.subject = "all";
  state.grade = "all";
  state.chapter = "all";
  state.ageRange = "all";
  state.topic = "all";
  state.duration = "all";
  state.access = "all";
  state.sort = "grade-asc";
  state.search = "";

  document.getElementById("searchInput").value = "";
  document.getElementById("gradeSelect").value = "all";
  document.getElementById("chapterSelect").value = "all";
  document.getElementById("ageSelect").value = "all";
  document.getElementById("durationSelect").value = "all";
  document.getElementById("topicSelect").value = "all";
  document.getElementById("accessSelect").value = "all";
  document.getElementById("sortSelect").value = "grade-asc";
  document.querySelectorAll("#subjectChips .chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.subject === "all");
  });

  render(worksheets);
}

function applyFilters() {
  const filtered = worksheets
    .filter(matchesSubject)
    .filter(matchesGrade)
    .filter(matchesChapter)
    .filter(matchesAgeRange)
    .filter(matchesDuration)
    .filter(matchesTopic)
    .filter(matchesAccess)
    .filter(matchesSearch)
    .sort(applySort);

  render(filtered);
}

function matchesSubject(item) {
  return state.subject === "all" || item.subject === state.subject;
}

function matchesGrade(item) {
  return state.grade === "all" || String(item.grade) === state.grade;
}

function matchesChapter(item) {
  return state.chapter === "all" || item.chapter === state.chapter;
}

function matchesAgeRange(item) {
  return state.ageRange === "all" || item.ageRange === state.ageRange;
}

function matchesDuration(item) {
  const dur = item.duration;
  switch (state.duration) {
    case "under-25":
      return dur < 25;
    case "25-35":
      return dur >= 25 && dur <= 35;
    case "over-35":
      return dur > 35;
    default:
      return true;
  }
}

function matchesTopic(item) {
  return state.topic === "all" || item.topic === state.topic;
}

function matchesAccess(item) {
  return state.access === "all" || item.access === state.access;
}

function matchesSearch(item) {
  if (!state.search) return true;
  const haystack = [
    item.title,
    item.description,
    item.format,
    ...(item.skills || []),
    item.subject,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.search);
}

function applySort(a, b) {
  switch (state.sort) {
    case "grade-desc":
      return b.grade - a.grade || a.title.localeCompare(b.title);
    case "title":
      return a.title.localeCompare(b.title);
    case "grade-asc":
    default:
      return a.grade - b.grade || a.title.localeCompare(b.title);
  }
}

function render(list) {
  const container = document.getElementById("worksheetList");
  const empty = document.getElementById("emptyState");
  container.innerHTML = "";

  if (!list.length) {
    empty.hidden = false;
    updateStats(list);
    return;
  }

  empty.hidden = true;
  const fragment = document.createDocumentFragment();

  list.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <header>
        <span class="pill">${item.subject}</span>
        <span class="pill outline">Grade ${item.grade}</span>
        <span class="pill access ${item.access}">
          ${item.access === "free" ? "Free" : "Locked"}
        </span>
      </header>
      <h3>${item.title}</h3>
      <p>${item.description}</p>
      <ul class="meta-list">
        <li>Chapter: ${item.chapter}</li>
        <li>Age range: ${item.ageRange}</li>
        <li>Time: ${item.duration} min</li>
        <li>Skills: ${item.skills.join(", ")}</li>
        <li>Format: ${item.format}</li>
        <li>Topic: ${item.topic}</li>
      </ul>
      <div class="tags">
        <span class="pill outline">${item.topic}</span>
        <span class="pill outline">Chapter: ${item.chapter}</span>
        ${item.skills.map((skill) => `<span class="pill outline">${skill}</span>`).join("")}
      </div>
      <div class="card-actions">
        <a class="btn primary" href="./${item.file}" target="_blank" rel="noopener">Download PDF</a>
        <button class="btn ghost" data-preview="${item.id}" type="button">Preview</button>
      </div>
    `;
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
  updateStats(list);
  wirePreviewButtons(list);
}

function updateStats(list) {
  const countEl = document.getElementById("statCount");
  const subjectsEl = document.getElementById("statSubjects");
  const avgEl = document.getElementById("statAvgTime");

  const total = list.length;
  const subjects = new Set(list.map((w) => w.subject)).size;
  const avg = total
    ? Math.round(list.reduce((sum, w) => sum + w.duration, 0) / total)
    : 0;

  countEl.textContent = total;
  subjectsEl.textContent = subjects;
  avgEl.textContent = `${avg} min`;
}

function wirePreviewButtons(list) {
  document.querySelectorAll("[data-preview]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-preview");
      const item = list.find((w) => w.id === id);
      if (item) openPreview(item);
    });
  });
}

function openPreview(item) {
  const modal = document.getElementById("previewModal");
  document.getElementById("previewSubject").textContent = item.subject;
  document.getElementById("previewGrade").textContent = `Grade ${item.grade}`;
  const accessEl = document.getElementById("previewAccess");
  accessEl.textContent = item.access === "free" ? "Free" : "Locked";
  accessEl.className = `pill access ${item.access}`;
  document.getElementById("previewTitle").textContent = item.title;
  document.getElementById("previewDescription").textContent = item.description;

  const metaList = document.getElementById("previewMeta");
  metaList.innerHTML = "";
  const metaItems = [
    `Chapter: ${item.chapter}`,
    `Age range: ${item.ageRange}`,
    `Time: ${item.duration} min`,
    `Skills: ${item.skills.join(", ")}`,
    `Format: ${item.format}`,
    `Topic: ${item.topic}`,
  ];
  metaItems.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    metaList.appendChild(li);
  });

  const download = document.getElementById("previewDownload");
  download.href = `./${item.file}`;
  download.textContent = "Download PDF";

  modal.hidden = false;
}

function wireModalClose() {
  const modal = document.getElementById("previewModal");
  document.getElementById("closePreview").addEventListener("click", () => {
    modal.hidden = true;
  });
  document.getElementById("closePreviewBottom").addEventListener("click", () => {
    modal.hidden = true;
  });
  modal.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) {
      modal.hidden = true;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) {
      modal.hidden = true;
    }
  });
}

function wireHowTo() {
  const toggle = document.getElementById("howToToggle");
  const panel = document.getElementById("howToPanel");
  toggle.addEventListener("click", () => {
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    toggle.textContent = isHidden ? "Hide steps" : "How it works";
  });
}

function populateDynamicFilters() {
  const chapterSelect = document.getElementById("chapterSelect");
  const ageSelect = document.getElementById("ageSelect");
  const topicSelect = document.getElementById("topicSelect");

  const chapters = Array.from(new Set(worksheets.map((w) => w.chapter))).sort();
  const ages = Array.from(new Set(worksheets.map((w) => w.ageRange))).sort();
  const topics = Array.from(new Set(worksheets.map((w) => w.topic))).sort();

  chapters.forEach((chapter) => {
    const opt = document.createElement("option");
    opt.value = chapter;
    opt.textContent = chapter;
    chapterSelect.appendChild(opt);
  });

  ages.forEach((age) => {
    const opt = document.createElement("option");
    opt.value = age;
    opt.textContent = age;
    ageSelect.appendChild(opt);
  });

  topics.forEach((topic) => {
    const opt = document.createElement("option");
    opt.value = topic;
    opt.textContent = topic;
    topicSelect.appendChild(opt);
  });
}
