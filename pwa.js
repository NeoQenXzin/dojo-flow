'use strict';

(() => {
  const page = document.getElementById('page-data');
  if (!page) return;
  const base = new URL('.', document.currentScript?.src || location.href);
  const title = document.createElement('h2');
  title.textContent = 'Installation & hors ligne';
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('aria-label', 'Installation et disponibilité hors ligne');
  card.innerHTML = `
    <div id="pwaStatus" class="muted" role="status" aria-live="polite">Préparation du mode hors ligne…</div>
    <p id="pwaInstallHelp" class="muted" style="margin-top:10px;line-height:1.5"></p>
    <button id="pwaInstall" class="btn wide" type="button" hidden>Installer DojoFlow</button>
    <p class="muted" style="margin-top:10px;line-height:1.5">Les vidéos enregistrées restent disponibles sans connexion. Le moteur de conversion se télécharge à la première utilisation. Exporte régulièrement une sauvegarde complète.</p>
    <button id="pwaUpdate" class="btn ghost wide" type="button" hidden>Installer la mise à jour</button>
    <div id="pwaUpdateInfo" class="muted" role="status" style="margin-top:8px"></div>`;
  page.prepend(title, card);

  const status = document.getElementById('pwaStatus');
  const help = document.getElementById('pwaInstallHelp');
  const installButton = document.getElementById('pwaInstall');
  const updateButton = document.getElementById('pwaUpdate');
  const updateInfo = document.getElementById('pwaUpdateInfo');
  let offlineReady = false;
  let installPrompt = null;
  let registration = null;
  let applyingUpdate = false;
  let failure = '';

  function renderStatus() {
    status.textContent = failure || (offlineReady
      ? `${navigator.onLine ? 'En ligne' : 'Sans connexion'} · application prête hors ligne.`
      : navigator.onLine ? 'Préparation du mode hors ligne…' : 'Sans connexion · disponibilité hors ligne non confirmée.');
  }

  function renderInstall() {
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    help.textContent = installed
      ? 'DojoFlow est ouvert depuis ton écran d’accueil.'
      : ios
        ? 'Sur iPhone : ouvre ce lien dans Safari, touche Partager, puis « Sur l’écran d’accueil » et « Ajouter ». Lance ensuite DojoFlow depuis sa nouvelle icône.'
        : 'Installe DojoFlow depuis le bouton ci-dessous ou le menu de ton navigateur pour le retrouver sur ton écran d’accueil.';
    installButton.hidden = installed || !installPrompt;
  }

  async function verifyOffline(worker) {
    if (!worker) return;
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      if (!offlineReady) {
        failure = 'Le mode hors ligne n’a pas pu être vérifié. Recharge l’application avec une connexion disponible.';
        renderStatus();
      }
    }, 5000);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.type === 'OFFLINE_STATUS') {
        offlineReady = event.data.ready === true;
        if (offlineReady) failure = '';
        renderStatus();
      }
    };
    worker.postMessage({ type: 'OFFLINE_STATUS' }, [channel.port2]);
  }

  function showUpdate() {
    if (!registration?.waiting) return;
    updateButton.hidden = false;
    updateInfo.textContent = 'Une mise à jour est prête. Termine ta séance et enregistre tes modifications avant de l’installer.';
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    renderInstall();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; renderInstall(); });
  window.addEventListener('online', () => {
    renderStatus();
    registration?.update().catch(() => {});
    verifyOffline(navigator.serviceWorker?.controller || registration?.active);
  });
  window.addEventListener('offline', renderStatus);
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { help.textContent = 'Ouvre le menu de ton navigateur pour installer DojoFlow.'; }
    renderInstall();
  });
  updateButton.addEventListener('click', () => {
    if (!registration?.waiting) return;
    // Never reload over an active exercise or an unsaved editor.
    if (document.querySelector('#player.on, .sheet.on')) {
      updateInfo.textContent = 'Termine la séance ou ferme la fiche ouverte avant d’installer la mise à jour.';
      return;
    }
    applyingUpdate = true;
    updateButton.disabled = true;
    updateInfo.textContent = 'Installation de la mise à jour…';
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  renderInstall();

  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') {
    failure = 'Pour installer DojoFlow et préparer le mode hors ligne, ouvre son adresse HTTPS (ou localhost en développement).';
    renderStatus();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload();
    else verifyOffline(navigator.serviceWorker.controller);
  });
  navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname, updateViaCache: 'none' })
    .then(async result => {
      registration = result;
      showUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') showUpdate();
          if (worker.state === 'redundant' && !registration.active) {
            failure = 'Le téléchargement hors ligne a échoué. Recharge l’application avec une connexion disponible.';
            renderStatus();
          }
        });
      });
      const ready = await navigator.serviceWorker.ready;
      verifyOffline(ready.active);
    })
    .catch(() => {
      failure = 'Mode hors ligne indisponible pour le moment. Recharge l’application avec une connexion disponible.';
      renderStatus();
    });
})();
