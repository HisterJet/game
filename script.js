(() => {
  const $ = (id) => document.getElementById(id);
  const screens = ["scan", "turn", "blocked", "play"];
  const audio = $("audio");
  // Korte stille WAV om de audio-speler te "ontgrendelen" (nodig op iPhone/Android)
  const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

  let song = null;          // wordt pas gevuld bij het scannen
  let started = false;      // nummer is gestart
  let listening = false;    // sensoren actief
  let baseline = null;
  let fallbackTimer = null;

  function show(name) {
    screens.forEach((s) => ($("screen-" + s).hidden = s !== name));
  }
  function showError(msg) {
    $("error").textContent = msg;
    $("error").hidden = !msg;
  }

  // ---------- Start ----------
  async function init() {
    const id = new URLSearchParams(location.search).get("song");
    if (!id) return show("scan");
    try {
      const res = await fetch("songs.json", { cache: "no-store" });
      const list = await res.json();
      song = list.find((s) => String(s.id) === String(id));
      if (!song) throw new Error();
    } catch (e) {
      show("scan");
      return showError("Deze kaart is niet gevonden. Scan een andere QR-code.");
    }
    show("turn");
    prepareSensors();
  }

  // ---------- Sensoren ----------
  function needsPermission() {
    return (
      (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") ||
      (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function")
    );
  }

  function prepareSensors() {
    if (!("DeviceOrientationEvent" in window) && !("DeviceMotionEvent" in window)) {
      return fallbackUi("Je telefoon geeft geen bewegingsdata door.");
    }
    if (needsPermission()) {
      // iPhone: toestemming en audio kunnen alleen na een tik
      $("btn-enable").hidden = false;
      $("btn-enable").onclick = enableFromTap;
    } else {
      startListening();
      // Android: audio kan geblokkeerd zijn, dat vangen we later netjes af
      armFallback();
    }
  }

  async function enableFromTap() {
    unlockAudio();
    try {
      const reqs = [];
      if (typeof DeviceMotionEvent.requestPermission === "function") reqs.push(DeviceMotionEvent.requestPermission());
      if (typeof DeviceOrientationEvent.requestPermission === "function") reqs.push(DeviceOrientationEvent.requestPermission());
      const results = await Promise.all(reqs);
      if (results.some((r) => r !== "granted")) throw new Error("denied");
    } catch (e) {
      return fallbackUi("Toestemming voor bewegingssensoren is geweigerd. Zet dit aan in Instellingen > Safari > Beweging en oriëntatie, of tik hieronder.");
    }
    $("btn-enable").hidden = true;
    startListening();
    armFallback();
  }

  function unlockAudio() {
    audio.src = SILENCE;
    const p = audio.play();
    if (p && p.then) p.then(() => audio.pause()).catch(() => {});
  }

  function startListening() {
    if (listening) return;
    listening = true;
    baseline = null;
    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);
  }
  function stopListening() {
    listening = false;
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("devicemotion", onMotion);
    clearTimeout(fallbackTimer);
  }

  // Hoekverschil (met wrap-around)
  const diff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!baseline) { baseline = { beta: e.beta, gamma: e.gamma, t: Date.now() }; return; }
    if (Date.now() - baseline.t < 400) return; // eerst even stabiliseren
    // beta: -180..180 (voor/achter), gamma: -90..90 (links/rechts)
    if (diff(e.beta, baseline.beta) > 70 || Math.abs(e.gamma - baseline.gamma) > 70) trigger();
  }

  function onMotion(e) {
    const r = e.rotationRate;
    if (!r) return;
    const speed = Math.abs(r.alpha || 0) + Math.abs(r.beta || 0) + Math.abs(r.gamma || 0);
    if (speed > 300) trigger(); // snelle draai (graden/seconde)
  }

  function armFallback() {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      if (!started) $("btn-fallback").hidden = false;
    }, 4000);
  }
  function fallbackUi(msg) {
    $("turn-hint").textContent = msg;
    $("turn-hint").hidden = false;
    $("btn-fallback").hidden = false;
  }
  $("btn-fallback").onclick = () => { unlockAudio(); trigger(); };

  // ---------- Afspelen ----------
  function trigger() {
    if (started || !song) return;
    started = true;
    stopListening();
    audio.src = song.file;
    audio.volume = Number($("volume").value);
    const p = audio.play();
    if (p && p.catch) {
      p.catch(() => {
        // Autoplay geblokkeerd: vraag één tik
        started = false;
        show("blocked");
      });
    }
  }

  // Antwoord pas tonen als het geluid echt begint
  audio.addEventListener("playing", () => {
    if (!song || audio.src.startsWith("data:")) return;
    $("info-artist").textContent = song.artist;
    $("info-title").textContent = song.title;
    $("info-year").textContent = song.year;
    $("btn-pause").textContent = "Pauze";
    show("play");
  });
  audio.addEventListener("error", () => {
    if (audio.src.startsWith("data:") || !song) return;
    showError("Het MP3-bestand kon niet worden geladen.");
  });
  audio.addEventListener("ended", () => { $("btn-pause").textContent = "Opnieuw afspelen"; });

  $("btn-blocked").onclick = () => {
    started = true;
    audio.src = song.file;
    audio.play().catch(() => showError("Afspelen is niet gelukt. Controleer of je telefoon niet op stil staat."));
  };

  $("btn-pause").onclick = () => {
    if (audio.paused) { audio.play(); $("btn-pause").textContent = "Pauze"; }
    else { audio.pause(); $("btn-pause").textContent = "Play"; }
  };
  $("volume").oninput = (e) => { audio.volume = Number(e.target.value); };

  $("btn-next").onclick = () => {
    audio.pause();
    audio.removeAttribute("src");
    stopListening();
    song = null; started = false;
    history.replaceState(null, "", location.pathname);
    ["info-artist", "info-title", "info-year"].forEach((id) => ($(id).textContent = ""));
    showError("");
    show("scan");
    document.querySelector("#screen-scan .big").textContent = "Scan de volgende kaart";
  };

  init();
})();
