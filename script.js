
"use strict";

const API = "https://statsapi.mlb.com/api/v1";
const REFRESH_INTERVAL = 60000;

const scoreboard = document.getElementById("scoreboard");
const scoreMessage = document.getElementById("score-message");
const updated = document.getElementById("last-updated");
const dateInput = document.getElementById("game-date");
const teamFilter = document.getElementById("team-filter");
const dialog = document.getElementById("game-dialog");

let currentGames = [];
let allTeams = [];
let activeTab = "scores";
let requestNumber = 0;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateString, number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + number);
  return localDateString(date);
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function logo(teamId) {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const codes = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return codes[character];
  });
}

async function getJSON(path) {
  const response = await fetch(`${API}${path}`);

  if (!response.ok) {
    throw new Error(`MLB API returned HTTP ${response.status}`);
  }

  return response.json();
}

function gameState(game) {
  const state = game.status.abstractGameState;

  if (state === "Live") return "live";
  if (state === "Final") return "final";
  if (state === "Preview") return "scheduled";

  return "other";
}

function statusText(game) {
  const state = gameState(game);

  if (state === "live") {
    const inning = game.linescore?.currentInningOrdinal;
    const half = game.linescore?.inningHalf;

    if (inning && half) return `${half} ${inning}`;

    return game.status.detailedState || "In Progress";
  }

  if (state === "scheduled") {
    return formatTime(game.gameDate);
  }

  return game.status.detailedState || "Status unavailable";
}

// NAVIGATION

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;

    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab === button);
    });

    document.querySelectorAll(".panel").forEach(panel => {
      panel.hidden = panel.id !== `${activeTab}-panel`;
    });
  });
});

// SCORES AND SCHEDULE

dateInput.value = localDateString();

async function loadScores() {
  const requestedDate = dateInput.value;
  const thisRequest = ++requestNumber;

  scoreMessage.textContent = "Loading MLB games...";
  scoreboard.replaceChildren();

  const params = new URLSearchParams({
    sportId: "1",
    date: requestedDate,
    hydrate: "linescore"
  });

  try {
    const data = await getJSON(`/schedule?${params}`);

    if (thisRequest !== requestNumber) return;

    currentGames = (data.dates || []).flatMap(day => day.games);

    renderScores();

    updated.textContent =
      `Last updated: ${new Date().toLocaleTimeString()}`;

  } catch (error) {
    if (thisRequest !== requestNumber) return;

    console.error("Scoreboard error:", error);

    scoreMessage.textContent =
      "Unable to load MLB scores. Please try refreshing.";
    updated.textContent = "";
  }
}

function renderScores() {
  scoreboard.replaceChildren();

  const filter = teamFilter.value;

  const games = currentGames.filter(game => {
    if (filter === "all") return true;

    return [game.teams.away.team.id, game.teams.home.team.id]
      .includes(Number(filter));
  });

  if (!games.length) {
    scoreMessage.textContent =
      filter === "all"
        ? "No MLB games scheduled for this date."
        : "No games scheduled for the selected team on this date.";
    return;
  }

  scoreMessage.textContent = "";

  games.forEach(game => {
    const away = game.teams.away;
    const home = game.teams.home;
    const state = gameState(game);

    const card = document.createElement("article");
    card.className = "game-card";

    function teamRow(team) {
      const id = Number(team.team.id);
      const name = safe(team.team.name);
      const score = team.score ?? "–";
      const record = team.leagueRecord;

      const recordText = record
        ? `${record.wins}-${record.losses}`
        : "";

      return `
        <div class="score-team">
          <img src="${logo(id)}" alt="${name} logo" loading="lazy">
          <div class="team-info">
            <strong>${name}</strong>
            <small>${recordText}</small>
          </div>
          <span class="score-number">${safe(score)}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="game-top">
        <span class="status ${state === "live" ? "live" : ""}">
          ${safe(statusText(game))}
        </span>
        <span class="status">
          ${state === "live" ? "LIVE" :
            state === "final" ? "FINAL" : "MLB"}
        </span>
      </div>

      <div class="matchup">
        ${teamRow(away)}
        ${teamRow(home)}
      </div>

      <div class="game-bottom">
        <span>${safe(game.venue?.name || "Venue TBD")}</span>
        <button class="details-btn">Game Center →</button>
      </div>
    `;

    card.querySelector(".details-btn").addEventListener(
      "click",
      () => openGame(game)
    );

    scoreboard.appendChild(card);
  });
}

document.getElementById("prev-date").addEventListener("click", () => {
  dateInput.value = addDays(dateInput.value, -1);
  loadScores();
});

document.getElementById("next-date").addEventListener("click", () => {
  dateInput.value = addDays(dateInput.value, 1);
  loadScores();
});

document.getElementById("today-btn").addEventListener("click", () => {
  dateInput.value = localDateString();
  loadScores();
});

dateInput.addEventListener("change", loadScores);
teamFilter.addEventListener("change", renderScores);

document.getElementById("refresh-btn")
  .addEventListener("click", loadScores);

// GAME CENTER

async function openGame(game) {
  const details = document.getElementById("game-details");

  details.textContent = "Loading game details...";
  dialog.showModal();

  try {
    const data = await getJSON(
      `/game/${game.gamePk}/linescore`
    );

    if (!dialog.open) return;

    const away = game.teams.away.team;
    const home = game.teams.home.team;

    const innings = data.innings || [];

    const rows = innings.map(inning => {
      return `
        <th>${safe(inning.num)}</th>
      `;
    }).join("");

    function lineRow(side, team) {
      const inningScores = innings.map(inning => {
        return `<td>${safe(inning[side]?.runs ?? "–")}</td>`;
      }).join("");

      const totals = data.teams?.[side] || {};

      return `
        <tr>
          <td>${safe(team.abbreviation || team.name)}</td>
          ${inningScores}
          <td>${safe(totals.runs ?? "–")}</td>
          <td>${safe(totals.hits ?? "–")}</td>
          <td>${safe(totals.errors ?? "–")}</td>
        </tr>
      `;
    }

    details.innerHTML = `
      <p class="status">${safe(statusText(game))}</p>

      <div class="detail-teams">
        <div>
          <img src="${logo(away.id)}" alt="">
          <p>${safe(away.name)}</p>
        </div>
        <div class="detail-score">
          ${safe(game.teams.away.score ?? "–")}
          :
          ${safe(game.teams.home.score ?? "–")}
        </div>
        <div>
          <img src="${logo(home.id)}" alt="">
          <p>${safe(home.name)}</p>
        </div>
      </div>

      <p>${safe(game.venue?.name || "Venue TBD")}</p>
      <h3>Line Score</h3>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              ${rows}
              <th>R</th><th>H</th><th>E</th>
            </tr>
          </thead>
          <tbody>
            ${lineRow("away", away)}
            ${lineRow("home", home)}
          </tbody>
        </table>
      </div>

      ${innings.length === 0
        ? "<p class='message'>Inning data is not available yet.</p>"
        : ""}
    `;

  } catch (error) {
    console.error("Game details error:", error);
    details.textContent = "Unable to load game details.";
  }
}

document.getElementById("close-dialog")
  .addEventListener("click", () => dialog.close());

dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
});

// STANDINGS

const divisionNames = {
  200: "AL West",
  201: "AL East",
  202: "AL Central",
  203: "NL West",
  204: "NL East",
  205: "NL Central"
};

async function loadStandings() {
  const season = new Date().getFullYear();

  const message = document.getElementById("standings-message");
  const grid = document.getElementById("standings-grid");

  document.getElementById("standings-season").textContent =
    `${season} Season`;

  message.textContent = "Loading standings...";

  try {
    const params = new URLSearchParams({
      leagueId: "103,104",
      season: String(season),
      standingsTypes: "regularSeason",
      hydrate: "team,division"
    });

    const data = await getJSON(`/standings?${params}`);

    grid.replaceChildren();

    const records = (data.records || []).sort((a, b) => {
      const nameA = divisionNames[a.division?.id] || "";
      const nameB = divisionNames[b.division?.id] || "";
      return nameA.localeCompare(nameB);
    });

    if (!records.length) {
      message.textContent = "Standings are not available.";
      return;
    }

    records.forEach(division => {
      const name = divisionNames[division.division?.id] ||
        division.division?.name ||
        "Division";

      const card = document.createElement("article");
      card.className = "standing-card";

      const teams = [...division.teamRecords].sort(
        (a, b) => Number(a.divisionRank) - Number(b.divisionRank)
      );

      const rows = teams.map(record => {
        const id = record.team.id;
        const team = record.team.name;

        return `
          <tr>
            <td>
              <img src="${logo(id)}" alt="">
              ${safe(team)}
            </td>
            <td>${safe(record.wins)}</td>
            <td>${safe(record.losses)}</td>
            <td>${safe(record.winningPercentage)}</td>
            <td>${safe(record.gamesBack)}</td>
          </tr>
        `;
      }).join("");

      card.innerHTML = `
        <h3>${safe(name)}</h3>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
                <th>GB</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      grid.appendChild(card);
    });

    message.textContent = "";

  } catch (error) {
    console.error("Standings error:", error);
    message.textContent = "Unable to load league standings.";
  }
}

// TEAMS

async function loadTeams() {
  const message = document.getElementById("teams-message");

  try {
    const season = new Date().getFullYear();

    const params = new URLSearchParams({
      sportId: "1",
      season: String(season)
    });

    const data = await getJSON(`/teams?${params}`);

    allTeams = (data.teams || [])
      .filter(team => team.sport?.id === 1)
      .sort((a, b) => a.name.localeCompare(b.name));

    teamFilter.innerHTML = '<option value="all">All Teams</option>';

    allTeams.forEach(team => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;
      teamFilter.appendChild(option);
    });

    message.textContent = "";
    renderTeams();

  } catch (error) {
    console.error("Teams error:", error);
    message.textContent = "Unable to load MLB teams.";
  }
}

function renderTeams() {
  const grid = document.getElementById("teams-grid");
  const search = document.getElementById("team-search")
    .value.toLowerCase().trim();

  grid.replaceChildren();

  const filtered = allTeams.filter(team =>
    team.name.toLowerCase().includes(search)
  );

  filtered.forEach(team => {
    const card = document.createElement("article");
    card.className = "team-card";

    card.innerHTML = `
      <img src="${logo(team.id)}"
           alt="${safe(team.name)} logo" loading="lazy">
      <h3>${safe(team.name)}</h3>
      <p>${safe(team.division?.name || "Major League Baseball")}</p>
      <p>${safe(team.venue?.name || "")}</p>
    `;

    grid.appendChild(card);
  });

  if (!filtered.length) {
    const message = document.createElement("p");
    message.className = "message";
    message.textContent = "No teams match your search.";
    grid.appendChild(message);
  }
}

document.getElementById("team-search")
  .addEventListener("input", renderTeams);

// INITIALIZE

async function initialize() {
  await Promise.all([
    loadScores(),
    loadStandings(),
    loadTeams()
  ]);

  setInterval(() => {
    if (activeTab === "scores") {
      loadScores();
    }
  }, REFRESH_INTERVAL);
}

initialize();
