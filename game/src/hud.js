// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// killfeed, the buy menu, the bomb timer and the overlays. It never touches
// the simulation; main.js pushes numbers in and reads the play/buy callbacks
// out. Every setter skips a DOM write when nothing changed.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

const COPY = {
  start: {
    title: 'NEON STRIKE',
    copy: 'Round-based tactical FPS in a dusk yard. Plant the charge at site A or B — or wipe the Jackals out. Win rounds, earn cash, buy better guns.',
    action: 'Click to play',
  },
  paused: {
    title: 'NEON STRIKE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

const BUY_ITEMS = [
  { id: 'rifle', key: '1' },
  { id: 'smg', key: '2' },
  { id: 'sniper', key: '3' },
  { id: 'armor', key: '4' },
  { id: 'grenade', key: '5' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const scoreboard = $('scoreboard');
  const crosshair = $('crosshair');
  const scopeOverlay = $('scope-overlay');
  const hitmarker = $('hitmarker');
  const healthValue = $('health-value');
  const healthFill = $('health-fill');
  const armorValue = $('armor-value');
  const armorFill = $('armor-fill');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreV = $('score-vipers');
  const scoreJ = $('score-jackals');
  const roundLabel = $('round-label');
  const killfeedEl = $('killfeed');
  const promptEl = $('prompt');
  const channelEl = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const bombBar = $('bomb-bar');
  const bombFill = $('bomb-fill');
  const bombLabel = $('bomb-label');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const deadPanel = $('dead-panel');
  const vignette = $('damage-vignette');

  let hitTimer = 0;
  let last = {};
  let buyOpen = false;
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function buildBuyMenu() {
    const list = $('buy-list');
    list.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const def = item.id === 'armor' ? ARMOR : item.id === 'grenade' ? GRENADE : WEAPONS[item.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.buy = item.id;
      const desc = item.id === 'armor'
        ? 'Absorbs half of all damage'
        : item.id === 'grenade'
          ? 'Thrown with G — big blast radius'
          : `${def.damage} damage · ${def.mag}-round mag${def.auto ? ' · full auto' : ''}`;
      button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${def.name}</span><span class="buy-desc">${desc}</span><span class="buy-price">$${def.price}</span>`;
      button.addEventListener('click', () => buyHandler && buyHandler(item.id));
      list.appendChild(button);
    }
  }
  buildBuyMenu();

  return {
    setHealth(hp, armor) {
      setText(healthValue, 'hp', String(Math.max(0, Math.ceil(hp))));
      setText(armorValue, 'armor', String(Math.max(0, Math.ceil(armor))));
      const hpW = `${Math.max(0, hp)}%`;
      const arW = `${Math.max(0, armor)}%`;
      if (last.hpW !== hpW) { last.hpW = hpW; healthFill.style.width = hpW; }
      if (last.arW !== arW) { last.arW = arW; armorFill.style.width = arW; }
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name, grenades) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      setText(grenadeCount, 'grenades', grenades > 0 ? `G ×${grenades}` : '');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
      setText(buyMoney, 'buyMoney', `$${value}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = phase === 'buy' ? `BUY ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      timerValue.classList.toggle('urgent', phase === 'live' && s <= 10);
    },
    setScore(vipers, jackals, round) {
      setText(scoreV, 'sv', String(vipers));
      setText(scoreJ, 'sj', String(jackals));
      setText(roundLabel, 'round', `ROUND ${round}`);
    },
    setCrosshair(gapPx, scoped) {
      const gap = Math.round(gapPx);
      if (last.gap !== gap) {
        last.gap = gap;
        crosshair.style.setProperty('--gap', `${gap}px`);
      }
      crosshair.style.display = scoped ? 'none' : 'block';
      scopeOverlay.hidden = !scoped;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killfeed(killer, victim, headshot, killerIsViper) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<span class="${killerIsViper ? 'viper' : 'jackal'}">${killer}</span><span class="feed-weapon">${headshot ? '◉' : '✕'}</span><span>${victim}</span>`;
      killfeedEl.prepend(row);
      while (killfeedEl.children.length > 5) killfeedEl.removeChild(killfeedEl.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    setPrompt(text) {
      if (last.prompt === text) return;
      last.prompt = text;
      promptEl.textContent = text ?? '';
      promptEl.hidden = !text;
    },
    setChannel(label, frac) {
      if (label === null) {
        channelEl.hidden = true;
        return;
      }
      channelEl.hidden = false;
      setText(channelLabel, 'channelLabel', label);
      channelFill.style.width = `${Math.round(frac * 100)}%`;
    },
    setBomb(secondsLeft) {
      if (secondsLeft === null) {
        bombBar.hidden = true;
        return;
      }
      bombBar.hidden = false;
      setText(bombLabel, 'bombLabel', `CHARGE DETONATES IN ${Math.ceil(secondsLeft)}s`);
      bombFill.style.width = `${Math.max(0, (secondsLeft / 35) * 100)}%`;
    },
    banner(titleText, subText, side) {
      setText(bannerTitle, 'bannerTitle', titleText);
      setText(bannerSub, 'bannerSub', subText);
      bannerEl.hidden = false;
      bannerEl.dataset.side = side;
    },
    hideBanner() {
      bannerEl.hidden = true;
    },
    showBuy(money, owned) {
      buyOpen = true;
      buyMenu.hidden = false;
      setText(buyMoney, 'buyMoney', `$${money}`);
      for (const button of buyMenu.querySelectorAll('.buy-item')) {
        const id = button.dataset.buy;
        const def = id === 'armor' ? ARMOR : id === 'grenade' ? GRENADE : WEAPONS[id];
        button.classList.toggle('owned', Boolean(owned[id]));
        button.classList.toggle('poor', money < def.price && !owned[id]);
      }
    },
    hideBuy() {
      buyOpen = false;
      buyMenu.hidden = true;
    },
    isBuyOpen() {
      return buyOpen;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    showDead(show) {
      deadPanel.hidden = !show;
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'end') {
        copy.textContent = data.copy ?? '';
        scoreboard.hidden = false;
        scoreboard.innerHTML = data.rows ?? '';
      } else {
        copy.textContent = text.copy;
        scoreboard.hidden = true;
      }
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
