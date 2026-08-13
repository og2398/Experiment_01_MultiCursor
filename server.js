const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const geoip = require("geoip-lite");

const app = express();
app.set("trust proxy", true);

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// SINGLE SOURCE OF TRUTH
const visitors = {};

const iso2To3 = {
  IN: "IND",
  US: "USA",
  GB: "GBR",
  DE: "DEU",
  FR: "FRA",
  JP: "JPN",
  CA: "CAN",
  AU: "AUS",
  BR: "BRA",
  CN: "CHN",
  RU: "RUS",
  IT: "ITA",
  ES: "ESP",
  MX: "MEX",
  KR: "KOR",
  NL: "NLD",
};

const mockCountries = ["IND", "USA", "DEU", "GBR", "JPN", "FRA"];

function getRandomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 85%, 60%)`;
}

function getRealClientIp(socket) {
  const headers = socket.handshake.headers;
  let ip =
    headers["cf-connecting-ip"] ||
    headers["x-real-ip"] ||
    headers["x-forwarded-for"] ||
    socket.handshake.address ||
    "";

  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }
  return ip;
}

function getCountryFromIp(socket) {
  const cleanIp = getRealClientIp(socket);

  if (
    cleanIp === "127.0.0.1" ||
    cleanIp === "::1" ||
    cleanIp.startsWith("192.168.") ||
    cleanIp.startsWith("10.")
  ) {
    return mockCountries[Math.floor(Math.random() * mockCountries.length)];
  }

  const geo = geoip.lookup(cleanIp);
  if (geo && geo.country) {
    return iso2To3[geo.country] || geo.country;
  }

  return "UNK";
}

// Calculate country counts dynamically from active visitors ONLY
function getActiveCountryCounts() {
  const counts = {};
  Object.values(visitors).forEach((v) => {
    counts[v.country] = (counts[v.country] || 0) + 1;
  });
  return counts;
}

io.on("connection", (socket) => {
  const country = getCountryFromIp(socket);

  visitors[socket.id] = {
    id: socket.id,
    color: getRandomColor(),
    country: country,
    xRatio: 0.5,
    yRatio: 0.5,
    angle: 225,
  };

  const countryCounts = getActiveCountryCounts();
  const activeCount = Object.keys(visitors).length;

  // Send initial state to new connection
  socket.emit("init", {
    id: socket.id,
    color: visitors[socket.id].color,
    visitors,
    countryCounts,
    activeVisitors: activeCount,
  });

  // Broadcast connection to other visitors
  socket.broadcast.emit("visitor-connected", {
    visitor: visitors[socket.id],
    countryCounts,
    activeVisitors: activeCount,
  });

  // Handle cursor movement
  socket.on("mousemove", (data) => {
    if (visitors[socket.id]) {
      visitors[socket.id].xRatio = data.xRatio;
      visitors[socket.id].yRatio = data.yRatio;
      visitors[socket.id].angle = data.angle;

      socket.broadcast.emit("visitor-moved", visitors[socket.id]);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    if (visitors[socket.id]) {
      delete visitors[socket.id]; // Delete visitor first

      // Recalculate exact counts after deletion
      const updatedCountryCounts = getActiveCountryCounts();
      const updatedActiveCount = Object.keys(visitors).length;

      io.emit("visitor-disconnected", {
        id: socket.id,
        countryCounts: updatedCountryCounts,
        activeVisitors: updatedActiveCount,
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
