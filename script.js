// Ask permission for notifications
document.getElementById("notifyBtn").addEventListener("click", () => {
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        alert("Notifications enabled!");
      }
    });
  } else {
    alert("This browser does not support notifications.");
  }
});

// Handle PDF upload
document.getElementById("pdfUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function () {
    const typedArray = new Uint8Array(this.result);
    const pdf = await pdfjsLib.getDocument(typedArray).promise;
    let textContent = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      text.items.forEach(item => {
        textContent += item.str + " ";
      });
    }

    document.getElementById("output").innerText = "Extracted Timetable:\n" + textContent;

    // 🔹 Basic parsing example (you can improve regex for your format)
    const events = extractEvents(textContent);

    // Show parsed events
    document.getElementById("output").innerText += "\n\nDetected Events:\n" + JSON.stringify(events, null, 2);

    // Schedule notifications
    scheduleNotifications(events);
  };
  reader.readAsArrayBuffer(file);
});

// Example parser (very simple regex)
function extractEvents(text) {
  // Example: "Monday 10:00 AM - Math Class"
  const regex = /(\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\b)\s+(\d{1,2}:\d{2}\s?(?:AM|PM))\s*-\s*([A-Za-z ]+)/gi;
  let events = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    events.push({
      day: match[1],
      time: match[2],
      subject: match[3].trim()
    });
  }
  return events;
}

// Schedule notifications
function scheduleNotifications(events) {
  events.forEach(event => {
    const time = parseTime(event.time);
    if (!time) return;

    const now = new Date();
    const eventDate = new Date();
    eventDate.setHours(time.hours, time.minutes, 0, 0);

    if (eventDate > now) {
      const timeout = eventDate.getTime() - now.getTime() - (5 * 60 * 1000); // 5 min before
      if (timeout > 0) {
        setTimeout(() => {
          new Notification("Class Reminder", {
            body: `${event.subject} at ${event.time} (${event.day})`
          });
        }, timeout);
      }
    }
  });
}

// Convert "10:30 AM" → {hours: 10, minutes: 30}
function parseTime(timeStr) {
  const match = /(\d{1,2}):(\d{2})\s?(AM|PM)/i.exec(timeStr);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}
