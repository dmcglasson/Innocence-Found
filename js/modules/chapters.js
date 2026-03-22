/**
 * Chapters screen module.
 * Handles chapter list rendering, chapter access checks, and chapter-reader content.
 */

import { getCurrentSession, getSubscriberStatus } from "./auth.js";
import { getSupabaseClient } from "./supabase.js";
import { APP_CONFIG } from "../config.js";
import { waitForElement } from "../utils/dom.js";

const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
const CHAPTERS_TABLE = "Chapters";
const DEFAULT_CHAPTERS_BUCKET = "Chapters";
let activeChapterBlobUrl = null;

/**
 * Fetch chapter metadata from DB table.
 * Existing columns: id, chapter_num, free, book_id, created_at, chapter_id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} chapterNumber
 * @returns {Promise<{chapter_num:number,free:boolean,chapter_id:string}|null>}
 */
async function fetchChapterRecord(supabase, chapterNumber) {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select("chapter_num,free,chapter_id")
    .eq("chapter_num", chapterNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`Chapter table lookup failed: ${error.message}`);
  }

  if (!data || !data.chapter_id) return null;

  return data;
}

/**
 * Resolve bucket/path from storage.objects by object id via public RPC.
 * This avoids client-side direct access to the storage schema.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} chapterObjectId
 * @returns {Promise<{bucket:string,path:string}|null>}
 */
async function fetchStorageObjectById(supabase, chapterObjectId) {
  const { data, error } = await supabase.rpc("get_storage_object_by_id", {
    p_object_id: chapterObjectId,
  });

  if (error) {
    throw new Error(
      `RPC get_storage_object_by_id failed for object ${chapterObjectId}: ${error.message}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.name) return null;

  return {
    bucket: row.bucket_id || DEFAULT_CHAPTERS_BUCKET,
    path: row.name,
  };
}

/**
 * Try to resolve a usable URL for a specific bucket/path pair.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<string|null>}
 */
async function resolveStorageUrl(supabase, bucket, path) {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;

  // Preferred: download blob and embed via local blob URL to avoid frame-ancestor/X-Frame-Options issues.
  const { data: blobData, error: blobError } = await supabase.storage
    .from(cleanBucket)
    .download(cleanPath);

  if (!blobError && blobData) {
    if (activeChapterBlobUrl) {
      URL.revokeObjectURL(activeChapterBlobUrl);
      activeChapterBlobUrl = null;
    }
    activeChapterBlobUrl = URL.createObjectURL(blobData);
    return activeChapterBlobUrl;
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
 * Resolve a signed URL for a chapter PDF in Supabase Storage.
 * @param {number} chapterNumber
 * @returns {Promise<string>}
 */
async function getChapterPdfUrl(chapterNumber) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  // Primary source: chapters table row with explicit bucket/path.
  const chapterRecord = await fetchChapterRecord(supabase, chapterNumber);
  if (!chapterRecord) {
    throw new Error(
      `No ${CHAPTERS_TABLE} row for chapter ${chapterNumber}. Add chapter_num and chapter_id.`
    );
  }

  const objectRef = await fetchStorageObjectById(supabase, chapterRecord.chapter_id);
  if (!objectRef) {
    throw new Error(
      `No storage.objects entry found for chapter_id ${chapterRecord.chapter_id} (chapter ${chapterNumber}).`
    );
  }

  const bucket = objectRef.bucket || DEFAULT_CHAPTERS_BUCKET;
  const path = objectRef.path;
  const tableUrl = await resolveStorageUrl(supabase, bucket, path);

  if (!tableUrl) {
    throw new Error(`Could not resolve chapter PDF at ${bucket}/${path}.`);
  }

  return tableUrl;
}

/**
 * Initialize the chapter-reader screen.
 * @returns {Promise<void>}
 */
export async function initializeChapterReaderScreen() {
  await waitForElement("#chapterTitle", 1000);

  const chapterNumber = Number(sessionStorage.getItem("activeChapter"));

  // If someone navigates to #chapter-reader directly without selecting a chapter.
  if (!chapterNumber) {
    window.location.hash = "chapters";
    return;
  }

  if (chapterNumber > FREE_LIMIT) {
    const session = await getCurrentSession();

    // Not logged in -> send to login.
    if (!session || !session.user) {
      sessionStorage.setItem("returnTo", "chapters");
      sessionStorage.setItem("requestedChapter", String(chapterNumber));
      window.showLogin();
      return;
    }

    // Logged in but not subscriber -> block.
    const subInfo = await getSubscriberStatus();
    if (!subInfo.isSubscriber) {
      alert("Subscribers only.");
      window.location.hash = "chapters";
      return;
    }
  }

  const titleEl = document.getElementById("chapterTitle");
  const bodyEl = document.getElementById("chapterBody");
  const backBtn = document.getElementById("backToChaptersBtn");

  if (titleEl) titleEl.textContent = `Chapter ${chapterNumber}`;

  if (bodyEl) {
    bodyEl.textContent = "Loading chapter...";

    try {
      const pdfUrl = await getChapterPdfUrl(chapterNumber);
      bodyEl.innerHTML = `
        <iframe
          title="Chapter ${chapterNumber} PDF"
          src="${pdfUrl}#toolbar=1&navpanes=0"
          style="width: 100%; min-height: 78vh; border: 1px solid #ddd; border-radius: 8px;"
        ></iframe>
        <p style="margin-top: 12px;">
          Having trouble viewing this file?
          <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer">Open chapter PDF in a new tab</a>.
        </p>
      `;
    } catch (error) {
      console.error(`Failed to load chapter ${chapterNumber} from storage:`, error);
      bodyEl.innerHTML = `
        <p><em>Chapter ${chapterNumber}</em></p>
        <p>This chapter PDF is not available yet. Please check back later.</p>
      `;
    }
  }

  if (backBtn) {
    backBtn.onclick = () => {
      if (activeChapterBlobUrl) {
        URL.revokeObjectURL(activeChapterBlobUrl);
        activeChapterBlobUrl = null;
      }
      window.location.hash = "chapters";
    };
  }
}

/**
 * Initialize the chapters listing screen.
 * @returns {Promise<void>}
 */
export async function initializeChaptersScreen() {
  await waitForElement("#chapterList", 1000);

  const session = await getCurrentSession();
  let isSubscriber = false;

  if (session && session.user) {
    const subInfo = await getSubscriberStatus();
    isSubscriber = subInfo.isSubscriber;
  }

  renderChapters({ isSubscriber });

  const requestedChapter = sessionStorage.getItem("requestedChapter");
  if (requestedChapter) {
    sessionStorage.removeItem("requestedChapter");
    await handleLockedChapter(Number(requestedChapter));
  }
}

/**
 * Render chapters list with lock state.
 * @param {{isSubscriber?: boolean}} options
 */
function renderChapters({ isSubscriber = false } = {}) {
  const chapterList = document.getElementById("chapterList");
  if (!chapterList) return;

  let html = "";

  for (let i = 1; i <= APP_CONFIG.TOTAL_CHAPTERS; i += 1) {
    const isLocked = !isSubscriber && i > FREE_LIMIT;
    html += `
      <div class="chapter-item">
        <h3>${isLocked ? "🔒 " : ""}Chapter ${i}</h3>
        <button type="button" class="chapter-button" data-chapter="${i}">
          ${isLocked ? "Subscribers Only" : "Read for Free"}
        </button>
      </div>
    `;
  }

  chapterList.innerHTML = html;

  // Attach one delegated listener for chapter buttons.
  if (!chapterList.dataset.listenerAttached) {
    chapterList.addEventListener("click", (e) => {
      const btn = e.target.closest(".chapter-button");
      if (!btn) return;

      const chapterNumber = Number(btn.dataset.chapter);
      if (Number.isNaN(chapterNumber)) return;

      handleLockedChapter(chapterNumber);
    });

    chapterList.dataset.listenerAttached = "true";
  }
}

/**
 * Handle chapter access checks and navigate to chapter-reader.
 * @param {number} chapterNumber
 * @returns {Promise<void>}
 */
export async function handleLockedChapter(chapterNumber) {
  const isFreeChapter = chapterNumber <= FREE_LIMIT;

  // Only require login for locked chapters.
  if (!isFreeChapter) {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      sessionStorage.setItem("returnTo", "#chapters");
      sessionStorage.setItem("requestedChapter", String(chapterNumber));
      window.showLogin();
      return;
    }
  }

  sessionStorage.setItem("activeChapter", String(chapterNumber));
  window.location.hash = "chapter-reader";
}
