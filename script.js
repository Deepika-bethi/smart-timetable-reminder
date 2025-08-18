/* ============== Utilities ============== */
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_REGEX = new RegExp("\\b(" + DAYS.join("|") + ")\\b","i");
// Time range examples: 9:00-10:00, 09:00 – 10:00, 9:00 AM - 10:00 AM, 14:00 to 15:00
const RANGE_REGEX = /(\b\d{1,2}:\d{2}\s*(AM|PM)?\b)\s*(?:-|–|—|to)\s*(\b\d{1,2}:\d{2}\s*(AM|PM)?\b)/i;
const TIME_REGEX = /\b\d{1,2}:\d{2}\s*(AM|PM)?\b/i;

const storage = {
  get(){ return JSON.parse(localStorage.getItem("timetable_entries")||"[]"); },
  set(arr){ localStorage.setItem("timetable_entries", JSON.stringify(arr)); },
  clear(){ localStorage.removeItem("timetable_entries"); }
};

function to24h(timeStr){
  // Accepts "9:00", "9:00 AM", "14:30"
  let s = timeStr.trim().toUpperCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if(!m) return null;
  let hh = parseInt(m[1],10), mm = parseInt(m[2],10);
  const mer = m[3] || null;
  if(mer === "PM" && hh < 12) hh += 12;
  if(mer === "AM" && hh === 12) hh = 0;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function normalizeEntry(e){
  return {
    day: capitalize(e.day || ""),
    start: to24h(e.start) || e.start,
    end: to24h(e.end) || e.end,
    details: (e.details || "").replace(/\s+/g," ").trim()
  };
}
function capitalize(s){ return s ? s[0].toUpperCase()+s.slice(1).toLowerCase() : s; }

/* ============== DOM Elements ============== */
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const previewArea = document.getElementById("previewArea");
const parseBtn = document.getElementById("parseBtn");
const clearBtn = document.getElementById("clearBtn");
const startNotifBtn = document.getElementById("startNotif");
const stopNotifBtn = document.getElementById("stopNotif");
const notifStatus = document.getElementById("notifStatus");
const tbody = document.querySelector("#timetable tbody");

let uploadedFile = null;
let notifyTimer = null;
let notifiedKeysToday = new Set();

/* ============== Rendering ============== */
function renderTable(){
  const entries = storage.get();
  tbody.innerHTML = "";
  if(entries.length === 0){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.innerHTML = "<em>No entries yet. Upload and extract to see your timetable.</em>";
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  entries.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.day || "-"}</td>
      <td>${e.start || "-"}</td>
      <td>${e.end || "-"}</td>
      <td>${e.details || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============== File Handling ============== */
fileInput.addEventListener("change", (e)=>{
  uploadedFile = e.target.files[0] || null;
  if(!uploadedFile){ fileInfo.textContent = ""; previewArea.innerHTML = ""; return; }
  fileInfo.textContent = `Selected: ${uploadedFile.name} (${Math.round(uploadedFile.size/1024)} KB)`;
  previewArea.innerHTML = "";
  const ext = (uploadedFile.name.split(".").pop()||"").toLowerCase();
  if(["png","jpg","jpeg"].includes(ext)){
    const reader = new FileReader();
    reader.onload = (ev)=>{
      const img = new Image();
      img.src = ev.target.result;
      img.alt = "Timetable preview";
      previewArea.innerHTML = "";
      previewArea.appendChild(img);
    };
    reader.readAsDataURL(uploadedFile);
  } else if(ext === "pdf"){
    // Just show a note; we’ll OCR/text-extract on Parse
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "PDF selected. Click ‘Extract & Save’ to parse.";
    previewArea.appendChild(p);
  }
});

/* ============== Core: Extract & Parse ============== */
parseBtn.addEventListener("click", async ()=>{
  if(!uploadedFile){ alert("Please choose a PDF or image of your timetable."); return; }
  try{
    const ext = (uploadedFile.name.split(".").pop()||"").toLowerCase();
    let rawText = "";
    if(ext === "pdf"){
      rawText = await extractTextFromPDF(uploadedFile);
      if(!rawText.trim()){
        // likely scanned/image-based PDF → fallback OCR
        rawText = await ocrPDF(uploadedFile);
      }
    } else {
      // image
      rawText = await ocrImage(uploadedFile);
    }

    if(!rawText || !rawText.trim()){
      alert("Couldn’t read text from the file. Try a clearer scan or different file.");
      return;
    }

    const entries = parseTimetableText(rawText);
    if(entries.length === 0){
      alert("No time slots found. Ensure your timetable has clear time ranges like ‘9:00 - 10:00’.");
      return;
    }

    storage.set(entries.map(normalizeEntry));
    renderTable();
    alert(`Extracted and saved ${entries.length} entries.`);
  }catch(err){
    console.error(err);
    alert("Error while parsing. See console for details.");
  }
});

/* ============== PDF Text Extraction via PDF.js ============== */
async function extractTextFromPDF(file){
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  let full = "";
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const txt = await page.getTextContent();
    const pageText = txt.items.map(it=>it.str).join("\n");
    full += pageText + "\n";
  }
  return full;
}

/* ============== OCR Fallbacks via Tesseract ============== */
async function ocrImage(file){
  const dataURL = await fileToDataURL(file);
  const result = await Tesseract.recognize(dataURL, 'eng', { logger: ()=>{} });
  return result.data.text || "";
}
async function ocrPDF(file){
  // Render each page to canvas and OCR
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  let full = "";
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataURL = canvas.toDataURL("image/png");
    const result = await Tesseract.recognize(dataURL, 'eng', { logger: ()=>{} });
    full += (result.data.text || "") + "\n";
  }
  return full;
}
function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const reader = new FileReader();
    reader.onload = e=>res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

/* ============== Parser ============== */
/*
  Strategy:
  - Find day headings (Monday..Sunday). Text under a day belongs to that day until next day heading.
  - Inside each day’s block, split by time ranges (e.g., "9:00 - 10:00", "10:30 AM – 11:20 AM").
  - For each time range, collect the following lines (subject, section, room, etc.) until the next range/day.
  - Save: { day, start, end, details: "all text from that box" }
*/
function parseTimetableText(text){
  // Normalize line breaks / spaces
  const clean = text.replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\u00A0/g," ").trim();
  const lines = clean.split("\n").map(s=>s.trim()).filter(Boolean);

  // Build blocks per day
  const blocks = []; // [{day, lines:[]}]
  let currentDay = null;
  let buffer = [];
  function flush(){
    if(currentDay && buffer.length){
      blocks.push({ day: capitalize(currentDay), lines: buffer.slice() });
    }
    buffer = [];
  }
  for(const line of lines){
    const d = line.match(DAY_REGEX);
    if(d){
      // new day heading
      flush();
      currentDay = d[1];
      continue;
    }
    buffer.push(line);
  }
  flush();

  // If no explicit day headings found, treat entire text as "Unknown"
  if(blocks.length === 0){
    blocks.push({ day: "Unknown", lines });
  }

  // Within each day block, find time ranges and group details
  const entries = [];
  for(const blk of blocks){
    const segs = segmentByTimeRanges(blk.lines);
    for(const s of segs){
      entries.push({
        day: blk.day,
        start: s.start,
        end: s.end,
        details: s.details
      });
    }
  }
  return entries;
}

function segmentByTimeRanges(lines){
  const text = lines.join("\n");
  // Split on time ranges but keep delimiters using regex
  const matches = [];
  let m;
  const rgx = new RegExp(RANGE_REGEX.source, "gi");
  while((m = rgx.exec(text)) !== null){
    matches.push({ index: m.index, match: m[0], start: m[1], end: m[3] });
  }
  if(matches.length === 0){
    // try single times (less reliable)
    return [];
  }

  const segments = [];
  for(let i=0; i<matches.length; i++){
    const cur = matches[i];
    const nextIdx = (i+1 < matches.length) ? matches[i+1].index : text.length;
    const slice = text.slice(cur.index + cur.match.length, nextIdx).trim();
    const details = slice.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
    segments.push({
      start: cur.start,
      end: cur.end,
      details: details
    });
  }
  return segments;
}

/* ============== Notifications ============== */
function keyFor(entry, when){ // when: "pre" or "start"
  const d = new Date();
  const dateKey = d.toISOString().slice(0,10); // YYYY-MM-DD
  return `${dateKey}|${entry.day}|${entry.start}|${when}`;
}

function resetNotifiedAtMidnight(){
  const now = new Date();
  const msTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,5) - now;
  setTimeout(()=>{
    notifiedKeysToday = new Set();
    resetNotifiedAtMidnight();
  }, msTillMidnight);
}

function startNotifications(){
  if(!("Notification" in window)){ alert("Your browser does not support Notifications."); return; }
  if(Notification.permission !== "granted"){
    Notification.requestPermission().then(perm=>{
      if(perm !== "granted"){ alert("Please allow notifications to receive reminders."); }
    });
  }
  if(notifyTimer) { notifStatus.textContent = "Notifications already running."; return; }

  notifiedKeysToday = new Set();
  resetNotifiedAtMidnight();

  notifyTimer = setInterval(()=>{
    const entries = storage.get();
    if(entries.length === 0) return;

    const now = new Date();
    const todayName = now.toLocaleDateString("en-US", { weekday: "long" }); // uses local timezone
    const nowHHMM = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    entries.forEach(e=>{
      if(e.day !== "Unknown" && e.day !== todayName) return;

      const start = e.start; // already normalized to 24h where possible
      if(!start) return;

      const pre5 = minusMinutes(start, 5); // "HH:MM" string 5 minutes earlier

      // Pre-start notification
      if(pre5 && nowHHMM === pre5){
        const k = keyFor(e, "pre");
        if(!notifiedKeysToday.has(k)){
          notify(`Upcoming: ${displayTimeRange(e)} | ${e.details}`);
          notifiedKeysToday.add(k);
        }
      }
      // Start-time notification
      if(nowHHMM === start){
        const k2 = keyFor(e, "start");
        if(!notifiedKeysToday.has(k2)){
          notify(`Now: ${displayTimeRange(e)} | ${e.details}`);
          notifiedKeysToday.add(k2);
        }
      }
    });
  }, 30000); // check every 30 seconds

  notifStatus.textContent = "Notifications are running. You’ll get alerts 5 minutes before and at start time.";
}
function stopNotifications(){
  if(notifyTimer){
    clearInterval(notifyTimer);
    notifyTimer = null;
    notifStatus.textContent = "Notifications stopped.";
  }
}
function minusMinutes(hhmm, mins){
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if(!m) return null;
  const date = new Date();
  date.setHours(parseInt(m[1],10), parseInt(m[2],10), 0, 0);
  date.setMinutes(date.getMinutes() - mins);
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
function displayTimeRange(e){
  const s = e.start || "?";
  const d = e.end ? `${s}–${e.end}` : s;
  return e.day && e.day !== "Unknown" ? `${e.day} ${d}` : d;
}
function notify(body){
  if(Notification.permission === "granted"){
    new Notification("Class Reminder", { body });
  }
}

/* ============== Controls ============== */
startNotifBtn.addEventListener("click", startNotifications);
stopNotifBtn.addEventListener("click", stopNotifications);

clearBtn.addEventListener("click", ()=>{
  if(confirm("Clear all saved timetable entries?")){
    storage.clear();
    renderTable();
  }
});

/* ============== Init ============== */
renderTable();
notifStatus.textContent = "Notifications are currently stopped.";

/* ============== Notes ==============
 - Parsing relies on clear time ranges and day headings in the PDF/image text.
 - If your PDF is a weekly grid, ensure day names (Monday..Sunday) exist above each column or within cells.
 - You can improve accuracy by uploading a clean, high-contrast scan.
===================================== */
