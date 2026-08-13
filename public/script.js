const socket = io();

const cursorContainer = document.getElementById("cursor-container");
const activeCountEl = document.getElementById("active-count");
const countryListEl = document.getElementById("country-list");

let myId = null;
let myColor = "#101010";
let lastX = 0;
let lastY = 0;
const visitorMap = new Map();

function formatNumber(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

// SVG Arrow generator
function createArrowSVG(color, isMe = false) {
  if (isMe) {
    return `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 22L12 18L22 22Z" 
                      fill="none" 
                       />
                <path d="M12 2L2 22L12 18L22 22Z" 
                      fill="${color}" 
                      stroke="${color}" 
                      stroke-width="1.5" 
                      stroke-linejoin="round" />
            </svg>
        `;
  }
  return `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 22L12 18L22 22Z" 
                  fill="${color}" 
                  stroke="${color}" 
                  stroke-width="1.5" 
                  stroke-linejoin="round" />
        </svg>
    `;
}

// Render arrow element
function renderVisitor(visitor, isMe = false) {
  let el = visitorMap.get(visitor.id);

  if (!el) {
    el = document.createElement("div");
    el.id = `arrow-${visitor.id}`;
    el.className = `visitor-arrow ${isMe ? "highlighted" : "normal"}`;
    el.innerHTML = createArrowSVG(visitor.color, isMe);
    cursorContainer.appendChild(el);
    visitorMap.set(visitor.id, el);
  }

  const x = visitor.xRatio * window.innerWidth;
  const y = visitor.yRatio * window.innerHeight;

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.transform = `rotate(${visitor.angle}deg)`;
}

// Render Top-Right Country List
function updateCountryList(countryCounts) {
  countryListEl.innerHTML = "";

  const sortedCountries = Object.entries(countryCounts).sort(
    (a, b) => b[1] - a[1],
  );

  sortedCountries.forEach(([code, count]) => {
    if (count > 0) {
      const item = document.createElement("div");
      item.className = "country-item";
      item.innerHTML = `
                <span class="country-code">${code}</span>
                <span class="country-num">${formatNumber(count)}</span>
            `;
      countryListEl.appendChild(item);
    }
  });
}

// Socket Communication
socket.on("init", (data) => {
  myId = data.id;
  myColor = data.color;
  cursorContainer.innerHTML = "";
  visitorMap.clear();

  Object.values(data.visitors).forEach((v) => {
    renderVisitor(v, v.id === myId);
  });

  activeCountEl.textContent = formatNumber(data.activeVisitors);
  updateCountryList(data.countryCounts);
});

socket.on("visitor-connected", (data) => {
  renderVisitor(data.visitor, data.visitor.id === myId);
  activeCountEl.textContent = formatNumber(data.activeVisitors);
  updateCountryList(data.countryCounts);
});

socket.on("visitor-moved", (visitor) => {
  if (visitor.id !== myId) {
    renderVisitor(visitor, false);
  }
});

socket.on("visitor-disconnected", (data) => {
  const el = visitorMap.get(data.id);
  if (el) {
    el.remove();
    visitorMap.delete(data.id);
  }
  activeCountEl.textContent = formatNumber(data.activeVisitors);
  updateCountryList(data.countryCounts);
});

// Cursor Movement Handler
function handlePointerMove(clientX, clientY) {
  const deltaX = clientX - lastX;
  const deltaY = clientY - lastY;

  let angle = 225;
  if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
    angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
  } else {
    return;
  }

  lastX = clientX;
  lastY = clientY;

  const xRatio = clientX / window.innerWidth;
  const yRatio = clientY / window.innerHeight;

  // Render local arrow immediately
  if (myId) {
    renderVisitor(
      {
        id: myId,
        color: myColor,
        xRatio: xRatio,
        yRatio: yRatio,
        angle: angle,
      },
      true,
    );
  }

  socket.emit("mousemove", { xRatio, yRatio, angle });
}

window.addEventListener("mousemove", (e) =>
  handlePointerMove(e.clientX, e.clientY),
);
window.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  },
  { passive: true },
);
