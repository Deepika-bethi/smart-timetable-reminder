document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("timetable-form");
  const tbody = document.querySelector("#timetable tbody");

  let timetable = JSON.parse(localStorage.getItem("timetable")) || [];

  // Render timetable
  function renderTable() {
    tbody.innerHTML = "";
    timetable.forEach(entry => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${entry.subject}</td><td>${entry.day}</td><td>${entry.time}</td>`;
      tbody.appendChild(tr);
    });
  }

  renderTable();

  // Add new entry
  form.addEventListener("submit", e => {
    e.preventDefault();
    const subject = document.getElementById("subject").value;
    const day = document.getElementById("day").value;
    const time = document.getElementById("time").value;

    const entry = { subject, day, time };
    timetable.push(entry);
    localStorage.setItem("timetable", JSON.stringify(timetable));

    renderTable();
    form.reset();
  });

  // Notifications
  if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
  }

  setInterval(() => {
    const now = new Date();
    const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
    const currentTime = now.toTimeString().slice(0,5); // HH:MM

    timetable.forEach(entry => {
      if (entry.day === currentDay && entry.time === currentTime) {
        new Notification("Class Reminder", {
          body: `Your ${entry.subject} class starts now!`
        });
      }
    });
  }, 60000); // check every minute
});
