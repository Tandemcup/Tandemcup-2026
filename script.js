console.log('Tandem-Cup Live-Version 3 geladen');
'use strict';

const SHEET_ID = '1mKFPfQ0v_uVz3vSyqecQ4A5Hc1o4uvNB-clf0auOEg8';
const UPDATE_INTERVAL_MS = 15000;
const INPUT_SHEETS = ['D1 Eingabe', 'D2 Eingabe', 'D3 Eingabe'];

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => String(value).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => String(value).trim() !== '')) rows.push(row);
  return rows;
}

function toNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;

  // Handles 1.234,56 and 1234.56
  let normalized = text.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatWeight(grams) {
  return `${new Intl.NumberFormat('de-DE').format(grams)} g`;
}

function medalClass(rank) {
  if (rank === 1) return 'rank-one';
  if (rank === 2) return 'rank-two';
  if (rank === 3) return 'rank-three';
  return '';
}

async function loadSheet(sheetName) {
  const response = await fetch(csvUrl(sheetName), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${sheetName}: HTTP ${response.status}`);
  return parseCsv(await response.text());
}

function parseInputSheet(rows, roundNumber) {
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => {
    const team = String(row[0] ?? '').trim();
    const place = toNumber(row[1]);
    const sector = String(row[2] ?? '').trim();

    const angler1 = String(row[3] ?? '').trim();
    const weight1 = toNumber(row[4]);
    const fish1 = toNumber(row[5]);

    const angler2 = String(row[6] ?? '').trim();
    const weight2 = toNumber(row[7]);
    const fish2 = toNumber(row[8]);

    return {
      round: roundNumber,
      team,
      place,
      sector,
      angler1,
      weight1,
      fish1,
      angler2,
      weight2,
      fish2,
      teamWeight: weight1 + weight2,
      teamFish: fish1 + fish2
    };
  }).filter(item => item.team);
}

function assignSectorPlacings(roundEntries) {
  const groups = new Map();

  for (const entry of roundEntries) {
    const sectorKey = entry.sector || `Platz-${entry.place || 'offen'}`;
    if (!groups.has(sectorKey)) groups.set(sectorKey, []);
    groups.get(sectorKey).push(entry);
  }

  for (const entries of groups.values()) {
    const completed = entries
      .filter(entry => entry.teamWeight > 0 || entry.teamFish > 0)
      .sort((a, b) =>
        b.teamWeight - a.teamWeight ||
        b.teamFish - a.teamFish ||
        a.team.localeCompare(b.team, 'de')
      );

    completed.forEach((entry, index) => {
      entry.sectorPlacing = index + 1;
    });
  }
}

function calculateTeamStandings(rounds) {
  rounds.forEach(assignSectorPlacings);

  const teams = new Map();

  for (const round of rounds) {
    for (const entry of round) {
      if (!teams.has(entry.team)) {
        teams.set(entry.team, {
          team: entry.team,
          placings: [],
          totalWeight: 0,
          totalFish: 0
        });
      }

      const team = teams.get(entry.team);
      if (entry.sectorPlacing) team.placings.push(entry.sectorPlacing);
      team.totalWeight += entry.teamWeight;
      team.totalFish += entry.teamFish;
    }
  }

  return [...teams.values()]
    .map(team => ({
      ...team,
      points: team.placings.reduce((sum, value) => sum + value, 0),
      completedRounds: team.placings.length
    }))
    .filter(team => team.completedRounds > 0)
    .sort((a, b) =>
      b.completedRounds - a.completedRounds ||
      a.points - b.points ||
      b.totalWeight - a.totalWeight ||
      b.totalFish - a.totalFish ||
      a.team.localeCompare(b.team, 'de')
    )
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function calculateAnglerStandings(rounds) {
  const anglers = new Map();

  for (const round of rounds) {
    for (const entry of round) {
      const records = [
        { name: entry.angler1, weight: entry.weight1, fish: entry.fish1 },
        { name: entry.angler2, weight: entry.weight2, fish: entry.fish2 }
      ];

      for (const record of records) {
        if (!record.name) continue;
        const key = `${record.name}|||${entry.team}`;

        if (!anglers.has(key)) {
          anglers.set(key, {
            angler: record.name,
            team: entry.team,
            totalWeight: 0,
            totalFish: 0
          });
        }

        const angler = anglers.get(key);
        angler.totalWeight += record.weight;
        angler.totalFish += record.fish;
      }
    }
  }

  return [...anglers.values()]
    .filter(angler => angler.totalWeight > 0 || angler.totalFish > 0)
    .sort((a, b) =>
      b.totalWeight - a.totalWeight ||
      b.totalFish - a.totalFish ||
      a.angler.localeCompare(b.angler, 'de')
    )
    .map((angler, index) => ({ ...angler, rank: index + 1 }));
}

function renderTeams(teams) {
  const body = document.getElementById('team-body');

  if (!teams.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Noch keine Ergebnisse eingetragen.</td></tr>';
    return;
  }

  body.innerHTML = teams.map(item => `
    <tr class="${medalClass(item.rank)}">
      <td><strong>${item.rank}</strong></td>
      <td>${escapeHtml(item.team)}</td>
      <td>${item.points}</td>
      <td>${formatWeight(item.totalWeight)}</td>
      <td>${item.totalFish}</td>
    </tr>
  `).join('');
}

function renderAnglers(anglers) {
  const body = document.getElementById('angler-body');

  if (!anglers.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Noch keine Einzelergebnisse eingetragen.</td></tr>';
    return;
  }

  body.innerHTML = anglers.map(item => `
    <tr class="${medalClass(item.rank)}">
      <td><strong>${item.rank}</strong></td>
      <td>${escapeHtml(item.angler)}</td>
      <td>${escapeHtml(item.team)}</td>
      <td>${formatWeight(item.totalWeight)}</td>
      <td>${item.totalFish}</td>
    </tr>
  `).join('');
}

async function updateLiveResults() {
  const notice = document.getElementById('notice');
  const updated = document.getElementById('last-updated');

  try {
    const rawSheets = await Promise.all(INPUT_SHEETS.map(loadSheet));
    const rounds = rawSheets.map((rows, index) => parseInputSheet(rows, index + 1));

    renderTeams(calculateTeamStandings(rounds));
    renderAnglers(calculateAnglerStandings(rounds));

    const now = new Date();
    updated.textContent = `Letzte Aktualisierung: ${now.toLocaleTimeString('de-DE')}`;
    notice.textContent = 'LIVE – direkte Auswertung aus D1, D2 und D3. Aktualisierung alle 15 Sekunden.';
    notice.classList.remove('error');
  } catch (error) {
    console.error(error);
    notice.textContent = 'Live-Daten konnten nicht geladen werden. Prüfe, ob die Google-Tabelle weiterhin öffentlich veröffentlicht ist.';
    notice.classList.add('error');
    updated.textContent = 'Neuer Versuch in 15 Sekunden …';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateLiveResults();
  window.setInterval(updateLiveResults, UPDATE_INTERVAL_MS);
});
