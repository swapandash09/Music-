const audio = document.getElementById("audio-core");
const fileInput = document.getElementById("file-input");
let db, songs = [], songIndex = 0, isPlaying = false;
let audioCtx, source, filters = [];
let currentSpeed = 1.0;

// --- 1. BOOTSTRAP ---
function startSystem() {
    // UI Animation
    const screen = document.getElementById("boot-overlay");
    screen.style.opacity = "0";
    setTimeout(() => { screen.style.display = "none"; }, 500);
    
    // Core Init
    initDB();
    startClock();
    
    // Auto Greeting
    const h = new Date().getHours();
    const msg = h < 12 ? "Good Morning Sir" : h < 18 ? "Good Afternoon Sir" : "Good Evening Sir";
    
    setTimeout(() => {
        speak(msg + ". Muzio Prime is online.", () => {
            // Auto Play First Song if Exists
            if(songs.length > 0) {
                playSong(0);
                speak("Resuming your library");
            } else {
                speak("Library empty. Please import songs.");
            }
        });
    }, 800);
}

// --- 2. VOICE INTELLIGENCE ---
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function speak(text, callback) {
    if (synth.speaking) synth.cancel();
    
    // Ducking
    const prevVol = audio.volume;
    if(isPlaying) audio.volume = 0.2;
    
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    
    u.onend = () => {
        if(isPlaying) audio.volume = prevVol; 
        if(callback) callback();
    };
    
    synth.speak(u);
}

function activateVoice() {
    if (!SpeechRecognition) { alert("Voice requires Google Chrome"); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    
    const hud = document.getElementById("voice-hud");
    const status = document.getElementById("voice-status");
    
    hud.classList.add("active");
    status.innerText = "Listening...";
    
    const prevVol = audio.volume;
    audio.volume = 0.1;
    
    rec.start();
    
    rec.onresult = (e) => {
        const cmd = e.results[0][0].transcript.toLowerCase();
        status.innerText = `"${cmd}"`;
        
        setTimeout(() => {
            hud.classList.remove("active");
            audio.volume = prevVol;
            processCommand(cmd);
        }, 1500);
    };
    
    rec.onerror = () => {
        hud.classList.remove("active");
        audio.volume = prevVol;
    };
}

function processCommand(cmd) {
    if (cmd.includes("play")) { if(audio.paused) togglePlay(); speak("Resuming playback"); }
    else if (cmd.includes("stop") || cmd.includes("pause")) { if(!audio.paused) togglePlay(); speak("Music paused"); }
    else if (cmd.includes("next")) { playNext(); speak("Next track"); }
    else if (cmd.includes("previous")) { playPrev(); speak("Previous track"); }
    else if (cmd.includes("volume up")) { audio.volume = Math.min(1, audio.volume + 0.2); speak("Volume increased"); }
    else if (cmd.includes("volume down")) { audio.volume = Math.max(0, audio.volume - 0.2); speak("Volume decreased"); }
    else if (cmd.includes("theme")) { openTool('theme-modal'); speak("Opening theme settings"); }
    else { speak("Command not recognized."); }
}

// --- 3. DATABASE (IndexedDB V25) ---
function initDB() {
    const req = indexedDB.open("MuzioPrime_V25", 1);
    req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains("library")) {
            db.createObjectStore("library", { keyPath: "id" });
        }
    };
    req.onsuccess = (e) => {
        db = e.target.result;
        loadSongs();
    };
}

function triggerFileImport() { document.getElementById("file-input").click(); }

fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    showToast(`Processing ${files.length} items...`);
    const tx = db.transaction("library", "readwrite");
    const store = tx.objectStore("library");
    let count = 0;

    files.forEach(file => {
        const song = {
            id: Date.now() + Math.random(),
            name: file.name,
            file: file,
            isFav: false
        };
        store.add(song);
        songs.push(song);
        count++;
    });

    tx.oncomplete = () => {
        renderSongs();
        speak(`${count} new songs imported`);
        showToast("Import Successful");
        updateStats();
    };
});

function loadSongs() {
    const tx = db.transaction("library", "readonly");
    const req = tx.objectStore("library").getAll();
    req.onsuccess = () => {
        songs = req.result || [];
        updateStats();
        renderSongs();
        renderFavorites();
    };
}

function updateStats() {
    document.getElementById("track-stats").innerText = `${songs.length} Tracks`;
    const empty = document.getElementById("empty-state");
    if(songs.length === 0) empty.style.display = "block";
    else empty.style.display = "none";
}

// --- 4. RENDER UI ---
function renderSongs() {
    const list = document.getElementById("song-list");
    list.innerHTML = "";
    
    const frag = document.createDocumentFragment();
    songs.forEach((song, index) => {
        const div = document.createElement("div");
        div.className = `song-card ${index === songIndex ? "playing" : ""}`;
        const imgId = `img-${song.id}`;
        
        div.innerHTML = `
            <img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" class="sc-img" id="${imgId}">
            <div class="sc-info">
                <span class="sc-title">${song.name.replace('.mp3','')}</span>
                <span class="sc-artist">Local Audio</span>
            </div>
            <div class="sc-actions">
                <button onclick="event.stopPropagation(); toggleFav(${song.id})">
                    <i class="${song.isFav ? 'fas' : 'far'} fa-heart ${song.isFav ? 'active' : ''}"></i>
                </button>
                <button onclick="event.stopPropagation(); deleteSong(${song.id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        
        setTimeout(() => {
            window.jsmediatags.read(song.file, { onSuccess: (t) => { if(t.tags.picture) applyArt(t.tags.picture, imgId); }});
        }, 0);

        div.onclick = () => playSong(index);
        frag.appendChild(div);
    });
    list.appendChild(frag);
}

// --- 5. ACTIONS ---
function toggleFav(id) {
    const idx = songs.findIndex(s => s.id == id);
    if(idx > -1) {
        songs[idx].isFav = !songs[idx].isFav;
        const tx = db.transaction("library", "readwrite");
        tx.objectStore("library").put(songs[idx]);
        renderSongs();
        renderFavorites();
        if(songIndex === idx) updatePlayerFav();
    }
}

function deleteSong(id) {
    if(!confirm("Permanently delete song?")) return;
    const tx = db.transaction("library", "readwrite");
    tx.objectStore("library").delete(parseFloat(id));
    tx.oncomplete = () => {
        songs = songs.filter(s => s.id != id);
        renderSongs();
        renderFavorites();
        updateStats();
        showToast("Deleted");
    };
}

function renderFavorites() {
    const list = document.getElementById("fav-list");
    const favs = songs.filter(s => s.isFav);
    list.innerHTML = "";
    
    if(!favs.length) { document.getElementById("fav-empty").style.display = "block"; return; }
    document.getElementById("fav-empty").style.display = "none";
    
    favs.forEach(song => {
        const div = document.createElement("div");
        div.className = "song-card";
        div.innerHTML = `<i class="fas fa-heart" style="color:var(--primary); margin-right:15px"></i> <span>${song.name}</span>`;
        div.onclick = () => playSong(songs.indexOf(song));
        list.appendChild(div);
    });
}

function toggleCurrentFav() { if(songs[songIndex]) toggleFav(songs[songIndex].id); }

// --- 6. PLAYER ---
function playSong(index) {
    if(index < 0 || index >= songs.length) return;
    songIndex = index;
    const song = songs[index];
    audio.src = URL.createObjectURL(song.file);
    
    document.getElementById("mp-title").innerText = song.name.replace('.mp3','');
    document.getElementById("fp-title").innerText = song.name.replace('.mp3','');
    
    // Art
    const def = "https://cdn-icons-png.flaticon.com/512/461/461238.png";
    document.getElementById("mp-img").src = def;
    document.getElementById("fp-main-img").src = def;
    document.getElementById("fp-bg-img").src = "";
    
    window.jsmediatags.read(song.file, { onSuccess: (t) => { if(t.tags.picture) {
        applyArt(t.tags.picture, "mp-img");
        applyArt(t.tags.picture, "fp-main-img");
        applyArt(t.tags.picture, "fp-bg-img");
    }}});

    updatePlayerFav();
    
    // Audio Context Init
    if(!audioCtx) setupEQ();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    
    audio.play();
    isPlaying = true;
    updateUI();
}

function updatePlayerFav() {
    const isFav = songs[songIndex].isFav;
    const icon = document.getElementById("fp-fav-icon");
    icon.className = isFav ? "fas fa-heart" : "far fa-heart";
    icon.style.color = isFav ? "var(--primary)" : "#fff";
}

function togglePlay() {
    if(!songs.length) return;
    if(audio.paused) { audio.play(); isPlaying=true; } else { audio.pause(); isPlaying=false; }
    updateUI();
}
function updateUI() {
    const icon = isPlaying ? "fa-pause" : "fa-play";
    document.getElementById("mp-icon").className = `fas ${icon}`;
    document.getElementById("fp-play-icon").className = `fas ${icon}`;
    document.getElementById("mp-img").style.animationPlayState = isPlaying ? "running" : "paused";
}
function playNext() { playSong((songIndex + 1) % songs.length); }
function playPrev() { playSong((songIndex - 1 + songs.length) % songs.length); }

// --- 7. HELPERS ---
function applyArt(pic, id) {
    const {data, format} = pic;
    let base64 = "";
    for(let i=0; i<data.length; i++) base64 += String.fromCharCode(data[i]);
    document.getElementById(id).src = `data:${format};base64,${window.btoa(base64)}`;
}
function showToast(msg) {
    const box = document.getElementById("smart-toast");
    const txt = document.getElementById("toast-msg");
    txt.innerText = msg;
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 3000);
}
function generateMix() {
    const grid = document.getElementById("ai-grid");
    grid.innerHTML = "";
    if(!songs.length) return;
    let picks = [...songs].sort(()=>0.5-Math.random()).slice(0,4);
    picks.forEach(s => {
        const d = document.createElement("div");
        d.className = "grid-card";
        d.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" id="ai-${s.id}"><div class="play-overlay"><i class="fas fa-play"></i></div><p>${s.name.substr(0,10)}...</p>`;
        window.jsmediatags.read(s.file, { onSuccess: (t) => { if(t.tags.picture) applyArt(t.tags.picture, `ai-${s.id}`); }});
        d.onclick = () => playSong(songs.indexOf(s));
        grid.appendChild(d);
    });
    showToast("Mix Generated");
}
function wipeData() { if(confirm("Factory Reset?")) { indexedDB.deleteDatabase("MuzioPrime_V25"); location.reload(); } }

// UI Toggles
function openMenu() { document.getElementById("main-menu").classList.add("active"); document.getElementById("menu-backdrop").classList.add("active"); }
function closeMenu() { document.getElementById("main-menu").classList.remove("active"); document.getElementById("menu-backdrop").classList.remove("active"); }
function toggleMenu() { document.getElementById("main-menu").classList.contains("active") ? closeMenu() : openMenu(); }

function toggleSearch(show) {
    const s = document.getElementById("search-float");
    if(show === undefined) s.classList.toggle("active");
    else if(show) s.classList.add("active");
    else s.classList.remove("active");
    if(s.classList.contains("active")) document.getElementById("search-input").focus();
}
function searchSongs() {
    const q = document.getElementById("search-input").value.toLowerCase();
    document.querySelectorAll(".song-card").forEach(r => {
        r.style.display = r.innerText.toLowerCase().includes(q) ? "flex" : "none";
    });
}

function expandPlayer() { document.getElementById("full-player").classList.add("active"); }
function collapsePlayer() { document.getElementById("full-player").classList.remove("active"); }

function openTool(id) { document.getElementById(id).classList.add("active"); closeMenu(); }
function closeTool(id) { document.getElementById(id).classList.remove("active"); }

function switchView(t) {
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById(`view-${t}`).classList.add("active");
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    event.target.classList.add("active");
    if(t==='ai') generateMix();
}
function setTheme(c) { document.body.setAttribute('data-theme', c); localStorage.setItem('theme', c); closeTool('theme-modal'); }
function startClock() { setInterval(() => { const d = new Date(); document.getElementById("system-clock").innerText = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }, 1000); }

// EQ
function setupEQ() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaElementSource(audio);
    filters = [60,230,910,4000,14000].map(f => {
        const fi = audioCtx.createBiquadFilter();
        fi.type = "peaking"; fi.frequency.value = f;
        return fi;
    });
    source.connect(filters[0]);
    for(let i=0; i<4; i++) filters[i].connect(filters[i+1]);
    filters[4].connect(audioCtx.destination);
}
function updateEQ(i,v) { if(filters[i]) filters[i].gain.value = v; }

// Progress
audio.addEventListener("timeupdate", () => {
    if(audio.duration) {
        const p = (audio.currentTime/audio.duration)*100;
        document.getElementById("seek-slider").value = p;
        document.getElementById("mp-fill").style.width = p+"%";
        let m = Math.floor(audio.currentTime/60);
        let s = Math.floor(audio.currentTime%60);
        document.getElementById("curr-time").innerText = `${m}:${s<10?'0'+s:s}`;
    }
});
audio.addEventListener("loadedmetadata", () => {
    let m = Math.floor(audio.duration/60);
    let s = Math.floor(audio.duration%60);
    if(m || s) document.getElementById("tot-time").innerText = `${m}:${s<10?'0'+s:s}`;
});
audio.addEventListener("ended", playNext);
document.getElementById("seek-slider").addEventListener("input", (e) => audio.currentTime = (e.target.value/100)*audio.duration);
