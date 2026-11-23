(() => {
  const $ = (id) => document.getElementById(id);
  const screens = ["scan", "ready", "play"];
  const audio = $("audio");

  const CLIP_SECONDS = 30;  // lengte van het fragment
  let song = null;          // wordt pas gevuld bij het scannen
  let clipStart = 0;        // startpunt in seconden (optioneel per nummer)
  let clipDone = false;

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
    show("ready");
  }

  // ---------- Tik 1: afspelen ----------
  $("btn-play").onclick = () => {
    showError("");
    clipStart = Number(song.start) || 0;
    clipDone = false;
    audio.src = song.file;
    if (clipStart > 0) {
      audio.addEventListener("loadedmetadata", () => {
        // Nummer korter dan het startpunt: gewoon van het begin
        if (audio.duration > clipStart + 1) audio.currentTime = clipStart;
        else clipStart = 0;
      }, { once: true });
    }
    audio.volume = Number($("volume").value);
    $("answer").hidden = true;
    $("btn-reveal").hidden = false;
    $("btn-pause").textContent = "Pauze";
    show("play");
    audio.play().catch(() => {
      showError("Afspelen is niet gelukt. Controleer of je telefoon niet op stil staat en of het MP3-bestand bestaat.");
    });
  };

  // ---------- Tik 2: onthullen ----------
  $("btn-reveal").onclick = () => {
    $("info-artist").textContent = song.artist;
    $("info-title").textContent = song.title;
    $("info-year").textContent = song.year;
    $("answer").hidden = false;
    $("btn-reveal").hidden = true;
  };

  // ---------- Bediening ----------
  // Stop na 30 seconden (korter nummer: stopt vanzelf aan het einde)
  audio.addEventListener("timeupdate", () => {
    if (!song || clipDone) return;
    if (audio.currentTime >= clipStart + CLIP_SECONDS) {
      audio.pause();
      clipDone = true;
      $("btn-pause").textContent = "Opnieuw afspelen";
    }
  });
  audio.addEventListener("ended", () => {
    clipDone = true;
    $("btn-pause").textContent = "Opnieuw afspelen";
  });
  audio.addEventListener("error", () => {
    if (song && audio.getAttribute("src")) showError("Het MP3-bestand kon niet worden geladen.");
  });

  $("btn-pause").onclick = () => {
    if (clipDone) {
      clipDone = false;
      audio.currentTime = clipStart;
      audio.play();
      $("btn-pause").textContent = "Pauze";
    } else if (audio.paused) {
      audio.play();
      $("btn-pause").textContent = "Pauze";
    } else {
      audio.pause();
      $("btn-pause").textContent = "Play";
    }
  };
  $("volume").oninput = (e) => { audio.volume = Number(e.target.value); };

  $("btn-next").onclick = () => {
    audio.pause();
    audio.removeAttribute("src");
    song = null; clipDone = false;
    history.replaceState(null, "", location.pathname);
    ["info-artist", "info-title", "info-year"].forEach((id) => ($(id).textContent = ""));
    $("answer").hidden = true;
    showError("");
    show("scan");
    document.querySelector("#screen-scan .big").textContent = "Scan de volgende kaart";
  };

  init();
})();
