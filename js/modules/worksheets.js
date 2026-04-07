import { getSupabaseClient } from "./supabase.js";
import { getCurrentSession, getSubscriberStatus } from "./auth.js";
import { waitForElement } from "../utils/dom.js";
import { APP_CONFIG, SUPABASE_CONFIG } from "../config.js";

const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
const WORKSHEETS_TABLE_CANDIDATES = ["worksheets", "Worksheets"];
const DEFAULT_WORKSHEETS_BUCKET = "Worksheets";
let activeWorksheetBlobUrl = null;

const WORKSHEETS_CONFIG = {
  TABLE: "worksheets",
  BUCKET: "worksheets",
  SIGNED_URL_EXPIRES_IN: 60 * 5,
  FUNCTIONS_BASE_URL: `${String(SUPABASE_CONFIG?.URL || "").replace(/\/+$/, "")}/functions/v1`,
};

/**
 * Clears and revokes the active in-memory worksheet Blob URL, if one exists.
 */
function clearActiveWorksheetBlobUrl() {
  if (!activeWorksheetBlobUrl) return;

  URL.revokeObjectURL(activeWorksheetBlobUrl);
  activeWorksheetBlobUrl = null;
}

/**
 * Runs a worksheet query against known table name candidates and returns the first successful result.
 */
async function runWorksheetsQuery(run) {
  let lastError = null;

  for (const tableName of WORKSHEETS_TABLE_CANDIDATES) {
    const { data, error } = await run(tableName);
    if (!error) return data;

    lastError = error;
    const message = String(error?.message || "").toLowerCase();
    const isMissingTable =
      message.includes("does not exist") ||
      message.includes("relation") ||
      error?.code === "42P01";

    if (!isMissingTable) break;
  }

  throw new Error(`Worksheet table lookup failed: ${lastError?.message || "Unknown error"}`);
}

/**
 * Fetches all worksheets ordered by creation date.
 */
async function fetchWorksheets(supabase) {
  const data = await runWorksheetsQuery((tableName) => {
    return supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: true });
  });

  return Array.isArray(data) ? data : [];
}

/**
 * Fetches a single worksheet by ID while supporting both numeric and string identifiers.
 */
async function fetchWorksheetById(supabase, worksheetId) {
  const idAsNumber = Number(worksheetId);
  const isNumericId = !Number.isNaN(idAsNumber) && String(idAsNumber) === String(worksheetId);

  const data = await runWorksheetsQuery((tableName) => {
    let query = supabase
      .from(tableName)
      .select("id,created_at,title,description,file_path")
      .limit(1);

    query = isNumericId ? query.eq("id", idAsNumber) : query.eq("id", worksheetId);
    return query.maybeSingle();
  });

  return data || null;
}

/**
 * Parses a worksheet file path into an external URL or storage bucket/path pair.
 */
function parseWorksheetFilePath(rawFilePath) {
  const filePath = String(rawFilePath || "").trim();
  if (!filePath) return {};

  if (/^https?:\/\//i.test(filePath)) {
    return { externalUrl: filePath };
  }

  const storageProtocolMatch = filePath.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageProtocolMatch) {
    return {
      bucket: storageProtocolMatch[1],
      path: storageProtocolMatch[2],
    };
  }

  const cleaned = filePath.replace(/^\/+/, "");
  const segments = cleaned.split("/");

  if (segments.length > 1) {
    const first = segments[0];
    if (first.toLowerCase() === DEFAULT_WORKSHEETS_BUCKET.toLowerCase()) {
      return {
        bucket: DEFAULT_WORKSHEETS_BUCKET,
        path: segments.slice(1).join("/"),
      };
    }
  }

  return {
    bucket: DEFAULT_WORKSHEETS_BUCKET,
    path: cleaned,
  };
}

/**
 * Performs a lightweight request to check whether a public URL is accessible.
 */
async function isPublicUrlReadable(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });

    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

/**
 * Resolves a storage file into a browser-openable URL using download, signed URL, then public URL fallback.
 */
async function resolveStorageUrl(supabase, bucket, path, options = {}) {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;

  const { data: blobData, error: blobError } = await supabase.storage
    .from(cleanBucket)
    .download(cleanPath);

  if (!blobError && blobData) {
    clearActiveWorksheetBlobUrl();

    activeWorksheetBlobUrl = URL.createObjectURL(blobData);
    return activeWorksheetBlobUrl;
  }

  const expiresIn = Number(options.expiresIn || WORKSHEETS_CONFIG.SIGNED_URL_EXPIRES_IN);
  const { data, error } = await supabase.storage
    .from(cleanBucket)
    .createSignedUrl(cleanPath, expiresIn);

  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  const publicData = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
  const publicUrl = publicData?.data?.publicUrl;

  if (publicUrl) {
    const isReadable = await isPublicUrlReadable(publicUrl);
    if (isReadable) return publicUrl;
  }

  return null;
}

/**
 * Returns the resolved PDF URL for a worksheet file path.
 */
async function getWorksheetPdfUrl(worksheet, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const parsed = parseWorksheetFilePath(worksheet?.file_path);

  if (parsed.externalUrl) {
    return parsed.externalUrl;
  }

  const url = await resolveStorageUrl(supabase, parsed.bucket, parsed.path, options);
  if (!url) {
    throw new Error(`Could not resolve worksheet PDF from file_path: ${worksheet?.file_path || ""}`);
  }

  return url;
}

/**
 * Escapes text for safe HTML rendering.
 */
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formats a worksheet date for card metadata.
 */
function formatWorksheetDate(value) {
  if (!value) return "Recently updated";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Renders a user-friendly worksheet loading error state.
 */
function renderWorksheetError(error) {
  const worksheetList = document.getElementById("worksheetList");
  if (!worksheetList) return;

  const message = String(error?.message || "Failed to load worksheets. Please try again.");
  worksheetList.innerHTML = `
    <article class="worksheet-state worksheet-state--error" role="alert">
      <h3>Could not load worksheets</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

/**
 * Renders worksheet cards and wires click handling for opening accessible worksheets.
 */
function renderWorksheets({ worksheets, isSubscriber = false }) {
  const worksheetList = document.getElementById("worksheetList");
  if (!worksheetList) return;

  if (!Array.isArray(worksheets) || worksheets.length === 0) {
    worksheetList.innerHTML = `
      <article class="worksheet-state worksheet-state--empty" role="status">
        <h3>No worksheets available</h3>
        <p>Please check back soon for new worksheet activities.</p>
      </article>
    `;
    return;
  }

  let html = "";

  worksheets.forEach((worksheet, index) => {
    const worksheetOrder = index + 1;
    const isLocked = !isSubscriber && worksheetOrder > FREE_LIMIT;
    const title = escapeHtml(String(worksheet.title || "").trim() || `Worksheet ${worksheetOrder}`);
    const description = escapeHtml(String(worksheet.description || "").trim());
    const statusText = isLocked ? "Locked" : "Available";
    const statusClass = isLocked ? "worksheet-card__status--locked" : "worksheet-card__status--available";
    const ctaLabel = isLocked ? "Subscribers Only" : "Open Worksheet";
    const updatedLabel = escapeHtml(formatWorksheetDate(worksheet.created_at));

    html += `
      <article class="worksheet-card ${isLocked ? "worksheet-card--locked" : ""}">
        <div class="worksheet-card__metaRow">
          <h3 class="worksheet-card__title worksheet-card__title--inline">${title}</h3>
          <span class="worksheet-card__status ${statusClass}">${statusText}</span>
        </div>

        <div class="worksheet-card__tags" aria-label="Worksheet metadata">
          <span class="worksheet-card__tag">PDF</span>
          <span class="worksheet-card__tag">Updated ${updatedLabel}</span>
        </div>

        ${description ? `<p class="worksheet-card__description">${description}</p>` : ""}

        <button
          type="button"
          class="worksheet-button worksheet-card__cta"
          data-worksheet-id="${worksheet.id}"
          data-worksheet-order="${worksheetOrder}"
          ${isLocked ? "disabled aria-disabled=\"true\"" : ""}
        >
          ${ctaLabel}
        </button>
      </article>
    `;
  });

  worksheetList.innerHTML = html;

  if (!worksheetList.dataset.listenerAttached) {
    worksheetList.addEventListener("click", (e) => {
      const btn = e.target.closest(".worksheet-button");
      if (!btn || btn.disabled) return;

      const worksheetId = btn.dataset.worksheetId;
      const worksheetOrder = Number(btn.dataset.worksheetOrder || "1");
      if (!worksheetId) return;

      handleLockedWorksheet(worksheetId, worksheetOrder);
    });

    worksheetList.dataset.listenerAttached = "true";
  }
}

/**
 * Retrieves worksheet metadata for list views.
 */
export async function fetchWorksheetMetadata() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, data: [], message: "Supabase client not initialized" };
  }

  try {
    const data = await fetchWorksheets(supabase);
    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      data: [],
      message: error.message || "Failed to fetch worksheet metadata",
    };
  }
}

/**
 * Resolves a worksheet's file URL by worksheet ID.
 */
export async function getWorksheetFileUrl(worksheetId, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  try {
    const worksheet = await fetchWorksheetById(supabase, worksheetId);
    if (!worksheet || !worksheet.file_path) {
      return { success: false, message: "Worksheet file not found" };
    }

    const url = await getWorksheetPdfUrl(worksheet, options);
    return { success: true, data: { url } };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to retrieve worksheet file URL",
    };
  }
}

/**
 * Opens a worksheet file in a new tab for download or viewing.
 */
export async function downloadWorksheet(worksheetId) {
  const result = await getWorksheetFileUrl(worksheetId, { expiresIn: 60 });
  if (!result.success || !result.data?.url) {
    return { success: false, message: result.message || "Failed to create download link" };
  }

  window.open(result.data.url, "_blank");
  return { success: true, message: "Download started" };
}

/**
 * Initializes the worksheet reader screen and enforces worksheet access rules.
 */
export async function initializeWorksheetReaderScreen() {
  await waitForElement("#worksheetTitle", 1000);

  const worksheetId = sessionStorage.getItem("activeWorksheetId");
  if (!worksheetId) {
    window.location.hash = "worksheets";
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const worksheet = await fetchWorksheetById(supabase, worksheetId);
  if (!worksheet) {
    window.location.hash = "worksheets";
    return;
  }

  const allWorksheets = await fetchWorksheets(supabase);
  const worksheetIndex = allWorksheets.findIndex((item) => String(item.id) === String(worksheet.id));
  const worksheetOrder = worksheetIndex >= 0 ? worksheetIndex + 1 : 1;

  if (worksheetOrder > FREE_LIMIT) {
    const session = await getCurrentSession();

    if (!session || !session.user) {
      sessionStorage.setItem("returnTo", "worksheets");
      sessionStorage.setItem("requestedWorksheetId", String(worksheet.id));
      window.showLogin();
      return;
    }

    const subInfo = await getSubscriberStatus();
    if (!subInfo.isSubscriber) {
      alert("Subscribers only.");
      window.location.hash = "worksheets";
      return;
    }
  }

  const titleEl = document.getElementById("worksheetTitle");
  const bodyEl = document.getElementById("worksheetBody");
  const backBtn = document.getElementById("backToWorksheetsBtn");

  const worksheetTitle = String(worksheet.title || "").trim() || `Worksheet ${worksheetOrder}`;
  if (titleEl) titleEl.textContent = worksheetTitle;

  if (bodyEl) {
    bodyEl.textContent = "Loading worksheet...";

    try {
      const pdfUrl = await getWorksheetPdfUrl(worksheet);
      bodyEl.innerHTML = `
        <iframe
          title="${worksheetTitle} PDF"
          src="${pdfUrl}#toolbar=1&navpanes=0"
        ></iframe>
        <p class="worksheet-reader-page__fallbackLink">
          Having trouble viewing this file?
          <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer">Open worksheet PDF in a new tab</a>.
        </p>
      `;
    } catch (error) {
      console.error(`Failed to load worksheet ${worksheetTitle} from storage:`, error);
      bodyEl.innerHTML = `
        <article class="worksheet-state worksheet-state--error" role="alert">
          <h3>${worksheetTitle}</h3>
          <p>This worksheet PDF is not available yet. Please check back later.</p>
        </article>
      `;
    }
  }

  if (backBtn) {
    backBtn.onclick = () => {
      clearActiveWorksheetBlobUrl();
      window.location.hash = "worksheets";
    };
  }
}

/**
 * Initializes the worksheets list screen, subscription state, and deferred worksheet routing.
 */
export async function initializeWorksheetsScreen() {
  await waitForElement("#worksheetList", 1000);
  const worksheetList = document.getElementById("worksheetList");

  if (worksheetList) {
    worksheetList.innerHTML = `
      <article class="worksheet-state worksheet-state--loading" role="status">
        <p>Loading worksheets...</p>
      </article>
    `;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const session = await getCurrentSession();
  let isSubscriber = false;

  if (session && session.user) {
    const subInfo = await getSubscriberStatus();
    isSubscriber = subInfo.isSubscriber;
  }

  let worksheets = [];
  try {
    worksheets = await fetchWorksheets(supabase);
  } catch (error) {
    renderWorksheetError(error);
    return;
  }

  renderWorksheets({ worksheets, isSubscriber });

  const requestedWorksheetId = sessionStorage.getItem("requestedWorksheetId");
  if (requestedWorksheetId) {
    sessionStorage.removeItem("requestedWorksheetId");

    const requestedIndex = worksheets.findIndex((item) => String(item.id) === String(requestedWorksheetId));
    const requestedOrder = requestedIndex >= 0 ? requestedIndex + 1 : 1;
    await handleLockedWorksheet(requestedWorksheetId, requestedOrder);
  }
}

/**
 * Handles worksheet navigation and access control for free and subscriber-only worksheets.
 */
export async function handleLockedWorksheet(worksheetId, worksheetOrder = 1) {
  const isFreeWorksheet = worksheetOrder <= FREE_LIMIT;

  if (!isFreeWorksheet) {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      sessionStorage.setItem("returnTo", "#worksheets");
      sessionStorage.setItem("requestedWorksheetId", String(worksheetId));
      window.showLogin();
      return;
    }

    const subInfo = await getSubscriberStatus();
    if (!subInfo?.isSubscriber) {
      alert("Subscribers only.");
      return;
    }
  }

  sessionStorage.setItem("activeWorksheetId", String(worksheetId));
  window.location.hash = "worksheet-reader";
}
