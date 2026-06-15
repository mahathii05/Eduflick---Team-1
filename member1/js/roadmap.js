/* ============================================================
   EduFlick AI — roadmap.html logic
   Requirements #2 & #3: render the generated roadmap with
   locked/unlocked/completed states, and let the student
   complete the current lesson — the DB trigger
   fn_unlock_next_lesson then unlocks the next one.
   ============================================================ */

const pathwayContainer = document.getElementById("pathway-container");
const trackPill = document.getElementById("track-pill");
const progressSummary = document.getElementById("progress-summary");
const progressTrackLabel = document.getElementById("progress-track-label");
const progressFill = document.getElementById("progress-fill");
const progressPct = document.getElementById("progress-pct");

const overlay = document.getElementById("overlay");
const panelEyebrow = document.getElementById("panel-eyebrow");
const panelTitle = document.getElementById("panel-title");
const panelBody = document.getElementById("panel-body");
const panelClose = document.getElementById("panel-close");
const panelComplete = document.getElementById("panel-complete");

let currentUserId = null;
let activeProgressRow = null; // the lesson_progress row currently open in the panel

function statusFor(row) {
  if (row.is_completed) return "completed";
  if (row.is_unlocked) return "unlocked";
  return "locked";
}

function iconFor(row, lessonOrder) {
  const status = statusFor(row);
  if (status === "completed") return "✓";
  if (status === "locked") return "🔒";
  return String(lessonOrder);
}

function statusLabel(row) {
  const status = statusFor(row);
  if (status === "completed") return "Completed";
  if (status === "unlocked") return "Up next";
  return "Locked";
}

/**
 * Groups the flat lesson_progress rows (each carrying its
 * joined lesson + module) into an ordered module -> lessons tree.
 */
function groupByModule(rows) {
  const modulesMap = new Map();

  for (const row of rows) {
    const lesson = row.lessons;
    const module = lesson.modules;

    if (!modulesMap.has(module.id)) {
      modulesMap.set(module.id, { id: module.id, title: module.title, order: module.order, lessons: [] });
    }
    modulesMap.get(module.id).lessons.push(row);
  }

  const modules = Array.from(modulesMap.values());
  modules.sort((a, b) => a.order - b.order);
  modules.forEach((m) => m.lessons.sort((a, b) => a.lessons.order - b.lessons.order));
  return modules;
}

function renderPathway(modules) {
  pathwayContainer.innerHTML = `
    <div class="pathway">
      ${modules
        .map(
          (module) => `
        <div class="module-block">
          <div class="module-node">
            <span class="module-node__dot"></span>
            <div>
              <h2>${module.title}</h2>
              <div class="module-node__meta">Module ${module.order}</div>
            </div>
          </div>
          <div class="lesson-list">
            ${module.lessons
              .map((row) => {
                const status = statusFor(row);
                const lesson = row.lessons;
                return `
                  <button class="lesson-node lesson-node--${status}" data-progress-id="${row.id}" type="button">
                    <span class="lesson-node__icon">${iconFor(row, lesson.order)}</span>
                    <span class="lesson-node__title">${lesson.title}</span>
                    <span class="lesson-node__status">${statusLabel(row)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  pathwayContainer.querySelectorAll(".lesson-node").forEach((node) => {
    if (node.classList.contains("lesson-node--locked")) return;
    node.addEventListener("click", () => openPanel(node.dataset.progressId, modules));
  });
}

function findRow(modules, progressId) {
  for (const module of modules) {
    for (const row of module.lessons) {
      if (String(row.id) === String(progressId)) {
        return { row, module };
      }
    }
  }
  return null;
}

let lastModules = [];

function openPanel(progressId, modules) {
  const found = findRow(modules, progressId);
  if (!found) return;

  const { row, module } = found;
  activeProgressRow = row;

  panelEyebrow.textContent = `Module ${module.order} · Lesson ${row.lessons.order}`;
  panelTitle.textContent = row.lessons.title;

  if (row.is_completed) {
    panelBody.textContent = "You've already completed this lesson. Revisit it any time.";
    panelComplete.hidden = true;
  } else {
    panelBody.textContent = "This is the lesson currently unlocked on your roadmap. Mark it complete once you're done to unlock the next one.";
    panelComplete.hidden = false;
  }

  overlay.hidden = false;
}

function closePanel() {
  overlay.hidden = true;
  activeProgressRow = null;
}

panelClose.addEventListener("click", closePanel);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closePanel();
});

panelComplete.addEventListener("click", async () => {
  if (!activeProgressRow) return;
  panelComplete.disabled = true;
  panelComplete.textContent = "Saving…";

  // This update flips is_completed to true. The
  // fn_unlock_next_lesson trigger in Postgres then unlocks the
  // next lesson in sequence for this student automatically.
  const { error } = await sb
    .from("lesson_progress")
    .update({ is_completed: true })
    .eq("id", activeProgressRow.id);

  panelComplete.disabled = false;
  panelComplete.textContent = "Mark as complete";

  if (error) {
    panelBody.textContent = "Couldn't save progress: " + error.message;
    return;
  }

  closePanel();
  await loadRoadmap();
});

function updateProgressSummary(modules, profile) {
  const allRows = modules.flatMap((m) => m.lessons);
  const total = allRows.length;
  const completed = allRows.filter((r) => r.is_completed).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  progressTrackLabel.textContent = `${profile.tracks?.name ?? "Your track"} · ${completed}/${total} lessons complete`;
  progressFill.style.width = `${pct}%`;
  progressPct.textContent = `${pct}%`;
  progressSummary.hidden = false;
}

async function loadRoadmap() {
  const { data: rows, error } = await sb
    .from("lesson_progress")
    .select("id, is_unlocked, is_completed, completed_at, lessons(id, title, order, modules(id, title, order))")
    .eq("user_id", currentUserId);

  if (error) {
    pathwayContainer.innerHTML = `<div class="loading-state">Couldn't load your roadmap: ${error.message}</div>`;
    return;
  }

  if (!rows || rows.length === 0) {
    pathwayContainer.innerHTML = `<div class="loading-state">Your roadmap is being generated… try refreshing in a moment.</div>`;
    return;
  }

  lastModules = groupByModule(rows);
  renderPathway(lastModules);

  const { profile } = await requireSession();
  updateProgressSummary(lastModules, profile);
}

async function init() {
  const result = await requireSession();
  if (!result) return;

  const { session, profile } = result;
  currentUserId = session.user.id;

  if (!profile?.onboarding_complete) {
    routeForProfile(profile);
    return;
  }

  trackPill.textContent = `${profile.tracks?.name ?? "Track"} · ${profile.mentors?.name ?? "Mentor"}`;

  if (profile.mentors) {
    document.getElementById("mentor-widget").hidden = false;
    document.getElementById("mentor-widget-name").textContent = profile.mentors.name;
    document.getElementById("mentor-widget-specialty").textContent = profile.mentors.specialty;
    
    // Create initials for avatar (first letter of first and last word if any)
    const nameParts = profile.mentors.name.split(" ");
    let initials = nameParts[0][0];
    if (nameParts.length > 1) {
      initials += nameParts[nameParts.length - 1][0];
    }
    document.getElementById("mentor-widget-avatar").textContent = initials.toUpperCase();
  }

  await loadRoadmap();
}

init();
