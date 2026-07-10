'use strict';

const SHEET_ID = '1mKFPfQ0v_uVz3vSyqecQ4A5Hc1o4uvNB-clf0auOEg8';
const UPDATE_INTERVAL_MS = 15000;

const SHEETS = {
  teams: 'Gesamtwertung Teams',
  anglers: 'Gesamt Einzelwertung'
};

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
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

function cleanNumber(value) {
  const normalized = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatWeight(value) {
  const grams = cleanNumber(value);
  return `${new Intl.NumberFormat('de-DE').format(grams)} g`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function medalClass(rank) {
  if (rank === 1) return ' rank-one';
  if (rank === 2) return ' rank-two';
  if (rank === 3) return ' rank-three';
  return '';
}

function extractVisibleTable(rows) {
  // In both result sheets, row 3 contains the visible headers.
  const headerIndex = rows.findIndex(row =>
    row.some(cell => String(cell).trim().toLowerCase() === 'rang')
  );

  if (headerIndex < 0) return [];

  return rows
    .slice(headerIndex + 1)
    .filter(row => row.some(cell => String(cell).trim() !== ''));
}

function renderTeams(rows) {
  const body = document.getElementById('team-body');
  const entries = extractVisibleTable(rows)
    .map(row => ({
      rank: cleanNumber(row[0]),
      team: String(row[1] ?? '').trim(),
      points: cleanNumber(row[5]),
      weight: cleanNumber(row[6]),
      fish: cleanNumber(row[7])
    }))
    .filter(item => item.team && item.rank > 0 && item.points > 0)
    .sort((a, b) => a.rank - b.rank);

  if (!entries.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Noch keine vollständigen Team-Ergebnisse eingetragen.</td></tr>';
    return;
  }

  body.innerHTML = entries.map(item => `
    <tr class="${medalClass(item.rank).trim()}">
      <td><strong>${item.rank}</strong></td>
      <td>${escapeHtml(item.team)}</td>
      <td>${item.points}</td>
      <td>${formatWeight(item.weight)}</td>
      <td>${item.fish}</td>
    </tr>
  `).join('');
}

function renderAnglers(rows) {
  const body = document.getElementById('angler-body');
  const entries = extractVisibleTable(rows)
    .map(row => ({
      rank: cleanNumber(row[0]),
      angler: String(row[1] ?? '').trim(),
      team: String(row[2] ?? '').trim(),
      weight: cleanNumber(row[6]),
      fish: cleanNumber(row[7])
    }))
    .filter(item => item.angler && item.rank > 0 && item.weight > 0)
    .sort((a, b) => a.rank - b.rank);

  if (!entries.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Noch keine vollständigen Einzel-Ergebnisse eingetragen.</td></tr>';
    return;
  }

  body.innerHTML = entries.map(item => `
    <tr class="${medalClass(item.rank).trim()}">
      <td><strong>${item.rank}</strong></td>
      <td>${escapeHtml(item.angler)}</td>
      <td>${escapeHtml(item.team)}</td>
      <td>${formatWeight(item.weight)}</td>
      <td>${item.fish}</td>
    </tr>
  `).join('');
}

async function loadSheet(sheetName) {
  const response = await fetch(csvUrl(sheetName), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Google Tabelle nicht erreichbar (${response.status})`);
  }
  return parseCsv(await response.text());
}

async function updateLiveResults() {
  const notice = document.getElementById('notice');
  const updated = document.getElementById('last-updated');

  try {
    const [teamRows, anglerRows] = await Promise.all([
      loadSheet(SHEETS.teams),
      loadSheet(SHEETS.anglers)
    ]);

    renderTeams(teamRows);
    renderAnglers(anglerRows);

    const now = new Date();
    updated.textContent = `Letzte Aktualisierung: ${now.toLocaleTimeString('de-DE')}`;
    notice.textContent = 'LIVE – Die Ergebnisse werden automatisch alle 15 Sekunden aktualisiert.';
    notice.classList.remove('error');
  } catch (error) {
    console.error(error);
    notice.textContent = 'Die Live-Daten konnten gerade nicht geladen werden. Die zuletzt geladenen Ergebnisse bleiben sichtbar.';
    notice.classList.add('error');
    updated.textContent = 'Verbindung wird erneut versucht …';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateLiveResults();
  window.setInterval(updateLiveResults, UPDATE_INTERVAL_MS);
});
