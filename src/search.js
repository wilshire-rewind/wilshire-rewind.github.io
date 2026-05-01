(function () {
'use strict';

// ── styles ────────────────────────────────────────────────────────────────────
const styleEl = document.createElement('style');
styleEl.textContent = `
.search-wrapper {
  position: relative;
  margin: 1.25rem auto 0;
  max-width: 480px;
  padding: 0 1.5rem;
}
#search-input {
  width: 100%;
  padding: 0.5rem 1.1rem;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 999px;
  color: #e8e0d0;
  font-size: 0.875rem;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  outline: none;
  -webkit-appearance: none;
}
#search-input::placeholder { color: rgba(255,255,255,0.35); }
#search-input:focus {
  background: rgba(255,255,255,0.15);
  border-color: rgba(255,255,255,0.45);
}
#suggestions {
  position: absolute;
  left: 1.5rem;
  right: 1.5rem;
  top: calc(100% + 6px);
  background: #fff;
  border: 1px solid #ddd8ce;
  border-radius: 6px;
  list-style: none;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 200;
  overflow: hidden;
}
#suggestions li {
  padding: 0.6rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f0ece5;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
#suggestions li:last-child { border-bottom: none; }
#suggestions li:hover, #suggestions li[aria-selected=true] { background: #f5f2ec; }
.sugg-title { font-size: 0.875rem; font-weight: 600; color: #1a1a2e; }
.sugg-meta { font-size: 0.8rem; color: #888; }
.sugg-snippet {
  font-size: 0.78rem;
  color: #666;
  margin-top: 0.2rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
mark { background: #fff3b0; color: inherit; border-radius: 2px; }
.results-count {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 1.5rem;
}
.results-count strong { color: #2c2c2c; font-weight: normal; }
.result-card {
  background: #fff;
  border: 1px solid #ddd8ce;
  border-radius: 4px;
  padding: 1.2rem 1.5rem;
  margin-bottom: 1rem;
  cursor: pointer;
  transition: border-color 0.1s;
}
.result-card:hover { border-color: #b0a890; }
.result-top {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}
.result-title {
  font-size: 1rem;
  font-weight: bold;
  color: #1a1a2e;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
.result-speaker {
  font-size: 0.85rem;
  color: #666;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
.result-badge {
  margin-left: auto;
  font-size: 0.68rem;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.badge-meta     { background: #e8f4e8; color: #3a7a3a; }
.badge-transcript { background: #f0ece5; color: #999; }
.result-snippet {
  font-size: 0.88rem;
  color: #555;
  line-height: 1.6;
  font-family: Georgia, serif;
}
.no-results {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  color: #888;
  font-size: 0.95rem;
}
`;
document.head.appendChild(styleEl);

// ── inject search bar ─────────────────────────────────────────────────────────
document.querySelector('header').insertAdjacentHTML('beforeend', `
  <div class="search-wrapper">
    <input type="search" id="search-input"
           placeholder="Search sermons…"
           autocomplete="off" spellcheck="false"
           aria-label="Search sermons" aria-autocomplete="list">
    <ul id="suggestions" hidden role="listbox"></ul>
  </div>
`);

const input   = document.getElementById('search-input');
const suggBox = document.getElementById('suggestions');

// pre-fill on search page
const urlQ = new URLSearchParams(location.search).get('q') || '';
if (urlQ) input.value = urlQ;

// ── data loading (lazy, cached) ───────────────────────────────────────────────
let _sermons, _transcriptions;
function loadSermons()        { return _sermons        || (_sermons        = fetch('sermons.json').then(r => r.json())); }
function loadTranscriptions() { return _transcriptions || (_transcriptions = fetch('transcriptions.json').then(r => r.json())); }

// ── helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
    return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function highlight(text, query) {
    const escaped = escHtml(text);
    if (!query) return escaped;
    const re = new RegExp(escHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escaped.replace(re, '<mark>$&</mark>');
}

function snippet(text, query, ctx = 80) {
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return null;
    const s = Math.max(0, i - ctx);
    const e = Math.min(text.length, i + query.length + ctx);
    return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
}

// ── search ────────────────────────────────────────────────────────────────────
function runSearch(sermons, transcriptions, query) {
    const q = query.trim();
    if (!q) return [];
    const qLow = q.toLowerCase();
    const results = [];

    for (const s of sermons) {
        const metaText = [s.dateFormatted, s.title || '', s.speaker || '', s.series || ''].join(' ');
        const metaMatch = metaText.toLowerCase().includes(qLow);

        const t = transcriptions.find(t => t.id === s.id);
        const tText = t ? t.text : '';
        const transcriptMatch = tText.toLowerCase().includes(qLow);

        if (!metaMatch && !transcriptMatch) continue;

        results.push({
            sermon: s,
            priority: metaMatch ? 1 : 0,
            metaMatch,
            snippet: transcriptMatch ? snippet(tText, q) : null,
        });
    }

    return results.sort((a, b) => b.priority - a.priority);
}

// ── suggestions ───────────────────────────────────────────────────────────────
function showSuggestions(results, query) {
    if (!results.length) { hideSuggestions(); return; }

    suggBox.innerHTML = results.map(r => {
        const s = r.sermon;
        const byline = [s.speaker || 'Unknown speaker', s.series, s.dateFormatted].filter(Boolean).join(' · ');
        const snip = !r.metaMatch && r.snippet ? r.snippet : null;
        return `<li role="option" data-id="${escHtml(s.id)}">
            <span class="sugg-title">${highlight(s.title || 'Unknown title', query)}</span>
            <span class="sugg-meta"> · ${highlight(byline, query)}</span>
            ${snip ? `<div class="sugg-snippet">${highlight(snip, query)}</div>` : ''}
        </li>`;
    }).join('');

    suggBox.hidden = false;

    suggBox.querySelectorAll('li').forEach(li => {
        li.addEventListener('mousedown', e => {
            e.preventDefault(); // keep focus so blur doesn't race the click
            location.href = `sermon.html?id=${li.dataset.id}`;
        });
    });
}

function hideSuggestions() {
    suggBox.hidden = true;
    suggBox.innerHTML = '';
}

// ── events ────────────────────────────────────────────────────────────────────
let timer;
input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { hideSuggestions(); return; }

    timer = setTimeout(async () => {
        const [sermons, transcriptions] = await Promise.all([loadSermons(), loadTranscriptions()]);
        showSuggestions(runSearch(sermons, transcriptions, q).slice(0, 3), q);
    }, 150);
});

input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) location.href = `search.html?q=${encodeURIComponent(q)}`;
    } else if (e.key === 'Escape') {
        hideSuggestions();
        input.blur();
    }
});

input.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

// ── results page ──────────────────────────────────────────────────────────────
const resultsEl = document.getElementById('search-results');
if (resultsEl && urlQ) {
    Promise.all([loadSermons(), loadTranscriptions()]).then(([sermons, transcriptions]) => {
        const results = runSearch(sermons, transcriptions, urlQ);
        renderResults(resultsEl, results, urlQ);
    });
}

function renderResults(el, results, query) {
    const safeQ = `<strong>${escHtml(query)}</strong>`;

    if (!results.length) {
        el.innerHTML = `<p class="no-results">No results for ${safeQ}.</p>`;
        return;
    }

    const count = `${results.length} result${results.length !== 1 ? 's' : ''} for ${safeQ}`;

    el.innerHTML = `<p class="results-count">${count}</p>` + results.map(r => {
        const s = r.sermon;
        const byline = [s.speaker || 'Unknown speaker', s.series, s.dateFormatted].filter(Boolean).join(' · ');
        const badgeClass = r.priority === 1 ? 'badge-meta' : 'badge-transcript';
        const badgeLabel = r.priority === 1 ? 'metadata' : 'transcript';
        const snip = r.snippet;
        return `<div class="result-card" data-id="${escHtml(s.id)}">
            <div class="result-top">
                <span class="result-title">${highlight(s.title || 'Unknown title', query)}</span>
                <span class="result-badge ${badgeClass}">${badgeLabel}</span>
            </div>
            <p class="result-speaker">${highlight(byline, query)}</p>
            ${snip ? `<p class="result-snippet">${highlight(snip, query)}</p>` : ''}
        </div>`;
    }).join('');

    el.querySelectorAll('.result-card').forEach(card => {
        card.addEventListener('click', () => {
            location.href = `sermon.html?id=${card.dataset.id}`;
        });
    });
}

})();
