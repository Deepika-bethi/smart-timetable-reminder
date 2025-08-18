let reminderInterval = null;

function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file!");
    return;
  }

  document.getElementById("filePreview").innerHTML = 
    `<p>Uploaded: <b>${file.name}</b></p>`;
}

function startReminders() {
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
  }

  if (!reminderInterval) {
    reminderInterval = setInterval(() => {
      new Notification("Class Reminder", {
        body: "Check your timetable! 📖",
        icon: "https://cdn-icons-png.flaticon.com/512/2910/2910768.png"
      });
    }, 60000); // every 1 min (for demo, later change to class timings)
    alert("Notifications started!");
  }
}

function stopReminders() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    alert("Notifications stopped!");
  }
}
