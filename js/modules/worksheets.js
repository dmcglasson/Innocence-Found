/**
 * Worksheets screen module.
 * Mirrors chapters flow for worksheet list, access checks, and worksheet-reader PDF rendering.
 */

import { getCurrentSession, getSubscriberStatus } from "./auth.js";
import { getSupabaseClient } from "./supabase.js";
import { APP_CONFIG } from "../config.js";
import { waitForElement } from "../utils/dom.js";

const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
const WORKSHEETS_TABLE_CANDIDATES = ["worksheets", "Worksheets"];
const DEFAULT_WORKSHEETS_BUCKET = "Worksheets";
let activeWorksheetBlobUrl = null;

/**
 * Run a table query against known worksheets table name variants.
 * @template T
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {(tableName: string) => Promise<{data: T, error: any}>} run
 * @returns {Promise<T>}
 */
async function runWorksheetsQuery(supabase, run) {
  let lastError = null;

  for (const tableName of WORKSHEETS_TABLE_CANDIDATES) {
    const { data, error } = await run(tableName);
    if (!error) return data;
    lastError = error;

    const message = String(error?.message || "").toLowerCase();
    const isMissingTable = message.includes("does not exist") || message.includes("relation") || error?.code === "42P01";
    if (!isMissingTable) break;
  }

  throw new Error(`Worksheet table lookup failed: ${lastError?.message || "Unknown error"}`);
}

/**
 * Fetch all worksheet rows for list rendering.
 * Expected columns: id, created_at, title, description, file_path.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{id:string|number,title?:string,description?:string,file_path:string,created_at?:string}>>}
 */
async function fetchWorksheets(supabase) {
  const data = await runWorksheetsQuery(supabase, (tableName) => {
    return supabase
      .from(tableName)
      .select("id,created_at,title,description,file_path")
      .order("created_at", { ascending: true });
  });

  return Array.isArray(data) ? data : [];
}

/**
 * Fetch a single worksheet row by id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} worksheetId
 * @returns {Promise<{id:string|number,title?:string,description?:string,file_path:string,created_at?:string}|null>}
 */
async function fetchWorksheetById(supabase, worksheetId) {
  const idAsNumber = Number(worksheetId);
  const isNumericId = !Number.isNaN(idAsNumber) && String(idAsNumber) === String(worksheetId);

  const data = await runWorksheetsQuery(supabase, (tableName) => {
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
 * Parse a worksheet file path and determine if it is external or storage-relative.
 * @param {string} rawFilePath
 * @returns {{externalUrl?: string, bucket?: string, path?: string}}
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
 * Probe whether a public URL is readable.
 * @param {string} url
 * @returns {Promise<boolean>}
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
 * Resolve a usable URL for a specific bucket/path pair.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<string|null>}
 */
async function resolveStorageUrl(supabase, bucket, path) {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;

  const { data: blobData, error: blobError } = await supabase.storage
    .from(cleanBucket)
    .download(cleanPath);

  if (!blobError && blobData) {
    if (activeWorksheetBlobUrl) {
      URL.revokeObjectURL(activeWorksheetBlobUrl);
      activeWorksheetBlobUrl = null;
    }
    activeWorksheetBlobUrl = URL.createObjectURL(blobData);
    return activeWorksheetBlobUrl;
  }

  const { data, error } = await supabase.storage
    .from(cleanBucket)
    .createSignedUrl(cleanPath, 60 * 60);

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
 * Resolve worksheet PDF URL from file_path.
 * @param {{file_path:string}} worksheet
 * @returns {Promise<string>}
 */
async function getWorksheetPdfUrl(worksheet) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const parsed = parseWorksheetFilePath(worksheet.file_path);

  if (parsed.externalUrl) {
    return parsed.externalUrl;
  }

  const url = await resolveStorageUrl(supabase, parsed.bucket, parsed.path);
  if (!url) {
    throw new Error(`Could not resolve worksheet PDF from file_path: ${worksheet.file_path}`);
  }

  return url;
}

/**
 * Initialize the worksheet-reader screen.
 * @returns {Promise<void>}
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
          style="width: 100%; min-height: 78vh; border: 1px solid #ddd; border-radius: 8px;"
        ></iframe>
        <p style="margin-top: 12px;">
          Having trouble viewing this file?
          <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer">Open worksheet PDF in a new tab</a>.
        </p>
      `;
    } catch (error) {
      console.error(`Failed to load worksheet ${worksheetTitle} from storage:`, error);
      bodyEl.innerHTML = `
        <p><em>${worksheetTitle}</em></p>
        <p>This worksheet PDF is not available yet. Please check back later.</p>
      `;
    }
  }

  if (backBtn) {
    backBtn.onclick = () => {
      if (activeWorksheetBlobUrl) {
        URL.revokeObjectURL(activeWorksheetBlobUrl);
        activeWorksheetBlobUrl = null;
      }
      window.location.hash = "worksheets";
    };
  }
}

/**
 * Initialize the worksheets listing screen.
 * @returns {Promise<void>}
 */
export async function initializeWorksheetsScreen() {
  await waitForElement("#worksheetList", 1000);

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

  const worksheets = await fetchWorksheets(supabase);
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
 * Render worksheets list with lock state.
 * @param {{worksheets:Array<{id:string|number,title?:string,description?:string}>,isSubscriber?:boolean}} options
 */
function renderWorksheets({ worksheets, isSubscriber = false }) {
  const worksheetList = document.getElementById("worksheetList");
  if (!worksheetList) return;

  let html = "";

  worksheets.forEach((worksheet, index) => {
    const worksheetOrder = index + 1;
    const isLocked = !isSubscriber && worksheetOrder > FREE_LIMIT;
    const title = String(worksheet.title || "").trim() || `Worksheet ${worksheetOrder}`;
    const description = String(worksheet.description || "").trim();

    html += `
      <div class="chapter-item">
        <h3>${isLocked ? "[LOCKED] " : ""}${title}</h3>
        ${description ? `<p>${description}</p>` : ""}
        <button type="button" class="worksheet-button" data-worksheet-id="${worksheet.id}" data-worksheet-order="${worksheetOrder}">
          ${isLocked ? "Subscribers Only" : "Open Worksheet"}
        </button>
      </div>
    `;
  });

  worksheetList.innerHTML = html;

  if (!worksheetList.dataset.listenerAttached) {
    worksheetList.addEventListener("click", (e) => {
      const btn = e.target.closest(".worksheet-button");
      if (!btn) return;

      const worksheetId = btn.dataset.worksheetId;
      const worksheetOrder = Number(btn.dataset.worksheetOrder || "1");
      if (!worksheetId) return;

      handleLockedWorksheet(worksheetId, worksheetOrder);
    });

    worksheetList.dataset.listenerAttached = "true";
  }
}

/**
 * Handle worksheet access checks and navigate to worksheet-reader.
 * @param {string|number} worksheetId
 * @param {number} worksheetOrder
 * @returns {Promise<void>}
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
  }

  sessionStorage.setItem("activeWorksheetId", String(worksheetId));
  window.location.hash = "worksheet-reader";
}
