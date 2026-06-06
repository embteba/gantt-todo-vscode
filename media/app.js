(function () {
  const vscode = acquireVsCodeApi();
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit"
  });

  const state = {
    tasks: [],
    editingId: null,
    categoryFilter: "",
    storagePath: ""
  };

  const titleInput = document.getElementById("title");
  const categoryInput = document.getElementById("category");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  const statusSelect = document.getElementById("status");
  const prioritySelect = document.getElementById("priority");
  const addTaskButton = document.getElementById("addTask");
  const formError = document.getElementById("formError");
  const taskRows = document.getElementById("taskRows");
  const gantt = document.getElementById("gantt");
  const categoryFilter = document.getElementById("categoryFilter");
  const storagePath = document.getElementById("storagePath");

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "init") {
      state.tasks = Array.isArray(message.payload.data.tasks)
        ? message.payload.data.tasks.map(normalizeTask)
        : [];
      state.storagePath = message.payload.storagePath || "";
      render();
    }
  });

  addTaskButton.addEventListener("click", () => {
    const title = titleInput.value.trim();
    const category = categoryInput.value.trim() || "General";
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const status = statusSelect.value;
    const priority = getValidPriority(prioritySelect.value);
    const dateValidation = validateDateRange(startDate, endDate);

    if (!title) {
      showFormError("タイトルを入力してください。");
      return;
    }

    if (!dateValidation.ok) {
      showFormError(dateValidation.message);
      return;
    }

    clearFormError();

    if (state.editingId) {
      state.tasks = state.tasks.map((task) =>
        task.id === state.editingId
          ? { ...task, title, category, startDate, endDate, status, priority }
          : task
      );
    } else {
      state.tasks.push({
        id: String(Date.now()),
        title,
        category,
        startDate,
        endDate,
        status,
        priority
      });
    }

    clearForm();
    persist();
    render();
  });

  categoryFilter.addEventListener("change", () => {
    state.categoryFilter = categoryFilter.value;
    render();
  });

  function clearForm() {
    state.editingId = null;
    titleInput.value = "";
    categoryInput.value = "";
    startDateInput.value = "";
    endDateInput.value = "";
    statusSelect.value = "todo";
    prioritySelect.value = "medium";
    clearFormError();
  }

  function persist() {
    vscode.postMessage({
      type: "save",
      payload: {
        tasks: state.tasks
      }
    });
  }

  function getVisibleTasks() {
    if (!state.categoryFilter) {
      return [...state.tasks];
    }
    return state.tasks.filter((task) => task.category === state.categoryFilter);
  }

  function render() {
    storagePath.textContent = state.storagePath ? `Storage: ${state.storagePath}` : "";
    renderCategoryFilter();
    renderTable();
    renderGantt();
  }

  function renderCategoryFilter() {
    const categories = Array.from(new Set(state.tasks.map((task) => task.category))).sort();
    categoryFilter.innerHTML = '<option value="">All categories</option>';
    for (const c of categories) {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = c;
      option.selected = c === state.categoryFilter;
      categoryFilter.appendChild(option);
    }
    if (state.categoryFilter && !categories.includes(state.categoryFilter)) {
      state.categoryFilter = "";
    }
  }

  function renderTable() {
    taskRows.innerHTML = "";
    const tasks = getVisibleTasks().sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const task of tasks) {
      const tr = document.createElement("tr");
      const isEditing = state.editingId === task.id;
      tr.className = `transition-colors cursor-pointer hover:bg-neutral-900 ${isEditing ? "bg-neutral-900" : ""}`;
      tr.innerHTML = `
        <td class="px-3 py-2 font-medium text-neutral-100">${escapeHtml(task.title)}</td>
        <td class="px-3 py-2 text-neutral-400">${escapeHtml(task.category)}</td>
        <td class="px-3 py-2 text-neutral-400">${task.startDate}</td>
        <td class="px-3 py-2 text-neutral-400">${task.endDate}</td>
        <td class="px-3 py-2"><span class="inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(task.status)}">${task.status}</span></td>
        <td class="px-3 py-2"><span class="inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${getPriorityBadgeClass(task.priority)}">${task.priority}</span></td>
        <td class="px-3 py-2">
          <div class="flex gap-2">
            <button class="rounded border border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-300 transition hover:border-red-900 hover:text-red-300" data-delete="${task.id}">Delete</button>
          </div>
        </td>
      `;
      tr.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (target.closest("button[data-delete]")) {
          return;
        }

        if (state.editingId === task.id) {
          clearForm();
          render();
          return;
        }

        state.editingId = task.id;
        titleInput.value = task.title;
        categoryInput.value = task.category;
        startDateInput.value = task.startDate;
        endDateInput.value = task.endDate;
        statusSelect.value = task.status;
        prioritySelect.value = getValidPriority(task.priority);
        render();
      });
      taskRows.appendChild(tr);
    }

    taskRows.querySelectorAll("button[data-delete]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.getAttribute("data-delete");
        state.tasks = state.tasks.filter((t) => t.id !== id);
        if (state.editingId === id) {
          clearForm();
        }
        persist();
        render();
      });
    });
  }

  function renderGantt() {
    gantt.innerHTML = "";
    const tasks = getVisibleTasks();
    if (tasks.length === 0) {
      gantt.innerHTML = '<p class="px-2 py-1.5 text-sm text-neutral-500">No tasks</p>';
      return;
    }

    const times = tasks.flatMap((task) => [new Date(task.startDate).getTime(), new Date(task.endDate).getTime()]);
    const today = startOfDay(Date.now());
    const min = startOfDay(Math.min(...times, today));
    const max = startOfDay(Math.max(...times, today));
    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(1, Math.round((max - min) / dayMs) + 1);
    const trackWidth = Math.max(720, totalDays * 34);
    const labelWidth = 170;
    const dayWidth = trackWidth / totalDays;
    const todayOffsetDays = Math.round((today - min) / dayMs);
    const todayPercent = ((todayOffsetDays + 0.5) / totalDays) * 100;
    const content = document.createElement("div");
    content.className = "gantt-content";
    content.style.width = `${labelWidth + trackWidth}px`;
    gantt.appendChild(content);

    renderGanttAxis(content, min, totalDays, trackWidth, labelWidth, dayWidth);

    const sorted = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const task of sorted) {
      const row = document.createElement("div");
      row.className = "gantt-row";
      row.style.gridTemplateColumns = `${labelWidth}px ${trackWidth}px`;

      const label = document.createElement("div");
      label.className = "gantt-label";

      const title = document.createElement("span");
      title.textContent = task.title;

      const dates = document.createElement("small");
      dates.className = "gantt-dates";
      dates.textContent = `${formatDate(task.startDate)} - ${formatDate(task.endDate)}`;

      label.appendChild(title);
      label.appendChild(dates);

      const track = document.createElement("div");
      track.className = "gantt-track";
      track.style.setProperty("--day-width", `${dayWidth}px`);
      appendDayBackground(track, min, totalDays, dayMs);

      const bar = document.createElement("div");
      bar.className = `gantt-bar status-${task.status}`;
      const start = startOfDay(task.startDate);
      const end = startOfDay(task.endDate);
      const startOffsetDays = Math.round((start - min) / dayMs);
      const durationDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
      bar.style.left = `${(startOffsetDays / totalDays) * 100}%`;
      bar.style.width = `${(durationDays / totalDays) * 100}%`;
      bar.title = `${task.category} (${task.startDate} - ${task.endDate})`;

      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      content.appendChild(row);
    }

    appendGlobalTodayLine(content, todayPercent, labelWidth, trackWidth);
  }

  function renderGanttAxis(container, min, totalDays, trackWidth, labelWidth, dayWidth) {
    const axis = document.createElement("div");
    axis.className = "gantt-axis";
    axis.style.gridTemplateColumns = `${labelWidth}px ${trackWidth}px`;

    const axisLabel = document.createElement("span");
    axisLabel.className = "gantt-axis-label";
    axisLabel.textContent = "Date";

    const axisLayers = document.createElement("div");
    axisLayers.className = "gantt-axis-layers";

    const monthTrack = document.createElement("div");
    monthTrack.className = "gantt-axis-month-track";

    const dayTrack = document.createElement("div");
    dayTrack.className = "gantt-axis-day-track";
    dayTrack.style.setProperty("--day-width", `${dayWidth}px`);

    const dayMs = 24 * 60 * 60 * 1000;
    appendMonthSegments(monthTrack, min, totalDays, dayMs);
    appendDayBackground(dayTrack, min, totalDays, dayMs);
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      const ts = min + dayIndex * dayMs;
      appendAxisTick(dayTrack, ts, dayIndex, totalDays);
    }

    axisLayers.appendChild(monthTrack);
    axisLayers.appendChild(dayTrack);

    axis.appendChild(axisLabel);
    axis.appendChild(axisLayers);
    container.appendChild(axis);
  }

  function appendGlobalTodayLine(container, percent, labelWidth, trackWidth) {
    const line = document.createElement("div");
    line.className = "gantt-today-line";
    line.style.left = `${labelWidth + (trackWidth * percent) / 100}px`;
    container.appendChild(line);
  }

  function validateDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
      return { ok: false, message: "開始日と終了日を入力してください。" };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { ok: false, message: "日付形式が正しくありません。" };
    }

    if (start > end) {
      return { ok: false, message: "日付が不正です。開始日は終了日以前にしてください。" };
    }

    return { ok: true, message: "" };
  }

  function showFormError(message) {
    if (!(formError instanceof HTMLElement)) {
      return;
    }
    formError.textContent = message;
    formError.classList.remove("hidden");
  }

  function clearFormError() {
    if (!(formError instanceof HTMLElement)) {
      return;
    }
    formError.textContent = "";
    formError.classList.add("hidden");
  }

  function appendAxisTick(axisTrack, tickTime, dayIndex, totalDays) {
    const left = (dayIndex / totalDays) * 100;
    const width = 100 / totalDays;
    const weekend = isWeekend(tickTime);

    const tick = document.createElement("div");
    tick.className = "gantt-axis-tick";
    tick.style.left = `${left}%`;

    const tickLabel = document.createElement("div");
    tickLabel.className = `gantt-axis-day-label ${weekend ? "weekend" : "weekday"}`;
    tickLabel.style.left = `${left}%`;
    tickLabel.style.width = `${width}%`;

    const dayNumber = document.createElement("span");
    dayNumber.className = "gantt-axis-day-number";
    dayNumber.textContent = getDayNumberLabel(tickTime);

    const weekday = document.createElement("span");
    weekday.className = "gantt-axis-weekday";
    weekday.textContent = getWeekdayLabel(tickTime);

    tickLabel.appendChild(dayNumber);
    tickLabel.appendChild(weekday);

    axisTrack.appendChild(tick);
    axisTrack.appendChild(tickLabel);
  }

  function appendMonthSegments(container, min, totalDays, dayMs) {
    let dayIndex = 0;
    while (dayIndex < totalDays) {
      const current = new Date(min + dayIndex * dayMs);
      const year = current.getFullYear();
      const month = current.getMonth();
      const startIndex = dayIndex;

      while (dayIndex < totalDays) {
        const target = new Date(min + dayIndex * dayMs);
        if (target.getFullYear() !== year || target.getMonth() !== month) {
          break;
        }
        dayIndex += 1;
      }

      const segment = document.createElement("div");
      segment.className = "gantt-axis-month-segment";
      segment.style.left = `${(startIndex / totalDays) * 100}%`;
      segment.style.width = `${((dayIndex - startIndex) / totalDays) * 100}%`;

      const label = document.createElement("span");
      label.className = "gantt-axis-month-label";
      label.textContent = getMonthLabel(year, month);
      segment.appendChild(label);

      container.appendChild(segment);
    }
  }

  function appendDayBackground(container, min, totalDays, dayMs) {
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      const dayTime = min + dayIndex * dayMs;
      const dayCell = document.createElement("div");
      dayCell.className = `gantt-day-cell ${isWeekend(dayTime) ? "weekend" : "weekday"}`;
      dayCell.style.left = `${(dayIndex / totalDays) * 100}%`;
      dayCell.style.width = `${100 / totalDays}%`;
      container.appendChild(dayCell);
    }
  }

  function isWeekend(value) {
    const day = new Date(value).getDay();
    return day === 0 || day === 6;
  }

  function getWeekdayLabel(value) {
    const labels = ["日", "月", "火", "水", "木", "金", "土"];
    return labels[new Date(value).getDay()];
  }

  function getDayNumberLabel(value) {
    return String(new Date(value).getDate()).padStart(2, "0");
  }

  function getMonthLabel(year, month) {
    return `${year}/${String(month + 1).padStart(2, "0")}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return dateFormatter.format(date);
  }

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function getStatusBadgeClass(status) {
    if (status === "done") {
      return "border-emerald-900 bg-emerald-950/30 text-emerald-300";
    }
    if (status === "doing") {
      return "border-amber-900 bg-amber-950/30 text-amber-300";
    }
    return "border-sky-900 bg-sky-950/30 text-sky-300";
  }

  function getPriorityBadgeClass(priority) {
    const normalized = getValidPriority(priority);
    if (normalized === "high") {
      return "border-rose-900 bg-rose-950/40 text-rose-300";
    }
    if (normalized === "low") {
      return "border-cyan-900 bg-cyan-950/30 text-cyan-300";
    }
    return "border-violet-900 bg-violet-950/30 text-violet-300";
  }

  function normalizeTask(task) {
    return {
      ...task,
      priority: getValidPriority(task.priority)
    };
  }

  function getValidPriority(value) {
    if (value === "high" || value === "medium" || value === "low") {
      return value;
    }
    return "medium";
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
