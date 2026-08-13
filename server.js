const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const geoip = require("geoip-lite");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const visitors = {};
const countryCounts = {};

// 2-letter to 3-letter ISO Code Mapping
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

function getCountryFromIp(ip) {
  let cleanIp = ip.replace(/^.*:/, "");
  if (
    cleanIp === "127.0.0.1" ||
    cleanIp === "1" ||
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

io.on("connection", (socket) => {
  const clientIp =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const country = getCountryFromIp(clientIp);

  visitors[socket.id] = {
    id: socket.id,
    color: getRandomColor(),
    country: country,
    xRatio: 0.5,
    yRatio: 0.5,
    angle: 225,
  };

  countryCounts[country] = (countryCounts[country] || 0) + 1;

  // Send initial state to newly connected visitor
  socket.emit("init", {
    id: socket.id,
    color: visitors[socket.id].color,
    visitors,
    countryCounts,
    activeVisitors: Object.keys(visitors).length,
  });

  // Broadcast new connection to other visitors
  socket.broadcast.emit("visitor-connected", {
    visitor: visitors[socket.id],
    countryCounts,
    activeVisitors: Object.keys(visitors).length,
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
    const visitor = visitors[socket.id];
    if (visitor) {
      const country = visitor.country;
      delete visitors[socket.id];

      if (countryCounts[country]) {
        countryCounts[country]--;
        if (countryCounts[country] <= 0) {
          delete countryCounts[country];
        }
      }

      io.emit("visitor-disconnected", {
        id: socket.id,
        countryCounts,
        activeVisitors: Object.keys(visitors).length,
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
