/* Offline outbox — a connectivity indicator + a write queue that replays on
   reconnect. The queue persists to localStorage, so a refresh never drops a
   pending change. In demo mode writes land straight in localStorage and never
   fail, so this is the scaffold the real-mode store hooks into: real repos
   enqueue() on a network error and flush() replays them when the browser comes
   back online. A palette command simulates offline so the UX is visible. */

import { toast } from './toast.js';

const KEY = 'svnos-outbox-v1';
let queue = load();
let simulated = false;
let pill = null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* private mode */ } }

export const isOnline = () => navigator.onLine && !simulated;

export function enqueue(op) {
  queue.push({ ...op, at: Date.now() });
  save();
  paint();
}

let replayHandler = null;
/* Real mode registers how to replay a queued op against its repo. Until one is
   set, flush() KEEPS queued ops rather than dropping them — clearing without
   replaying would silently lose writes the moment real mode starts enqueuing. */
export function setReplayHandler(fn) { replayHandler = fn; }

export async function flush() {
  if (!isOnline() || !queue.length) return; // never replay while offline
  const pending = queue.slice();
  const kept = [];
  let synced = 0;
  for (const op of pending) {
    if (!replayHandler) { kept.push(op); continue; } // nothing wired — never drop
    try { await replayHandler(op); synced += 1; }
    catch { kept.push(op); }                          // keep failures to retry next time
  }
  queue = kept;
  save();
  paint();
  if (synced) toast(`Back online — synced ${synced} change${synced === 1 ? '' : 's'}.`, 'success');
}

function paint() {
  if (!pill) return;
  const offline = !isOnline();
  if (!offline && !queue.length) { pill.hidden = true; return; }
  pill.hidden = false;
  if (offline) {
    pill.className = 'net-pill is-offline';
    pill.innerHTML = `<span class="net-dot"></span>Offline${queue.length ? ` · ${queue.length} queued` : ' · changes will sync'}`;
  } else {
    pill.className = 'net-pill is-syncing';
    pill.innerHTML = `<span class="net-dot"></span>Syncing ${queue.length}…`;
  }
}

/* Demo toggle so the offline → queue → sync cycle is demonstrable. */
export function simulateOffline(on) {
  simulated = on;
  if (on) {
    paint();
    toast('Working offline — changes queue locally and sync when you reconnect.');
  } else {
    paint();
    flush();
  }
}

export function initOutbox() {
  pill = document.getElementById('net-pill');
  window.addEventListener('online', () => { paint(); flush(); });
  window.addEventListener('offline', paint);
  paint();
}
