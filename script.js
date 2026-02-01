const audio = document.getElementById("audio-core");
const fileInput = document.getElementById("hidden-file-input");
let db, songs = [], songIndex = 0, isPlaying = false;
let audioCtx, source, filters = [];
let currentSpeed = 1.0;

// --- 1. SYSTEM INITIALIZATION ---
function initializeSystem() {
    // Hide Boot Screen Animation
    const screen = document.getElementById("system-boot-overlay");
    screen.style.opacity = "0";
    setTimeout(() => { screen.style.display = "none"; }, 500);
    
    // Start Core Services
    initDB();
    startClock();
    
    // Auto Greeting Logic
    const h = new Date().getHours();
    const msg = h < 12 ? "Good Morning Sir" : h < 18 ? "Good Afternoon Sir" : "Good Evening Sir";
    
    // Delay slightly to ensure AudioContext is ready
    setTimeout(() => {
        speak(msg + ". Muzio Prime is online.", () => {
            if(songs.length > 0) {
                playSong(0); // Auto Play First Song
                speak("Resuming your library");
            } else {
                speak("Library is empty. Please import songs.");
            }
        });
    }, 800);
}

// --- 2. ADVANCED VOICE AI ---
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function speak(text, callback) {
    if (synth.speaking) synth.cancel();
    
    // Audio Ducking (Lower music volume while AI speaks)
    const prevVol = audio.volume;
    if(isPlaying) audio.volume = 0.2;
    
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1; // Natural Speed
    
    u.onend = () => {
        if(isPlaying) audio.volume = prevVol; // Restore Volume
        if(callback) callback();
    };
    
    synth.speak(u);
}

function activateVoiceAI() {
    if (!SpeechRecognition) { alert("Voice requires Google Chrome Browser"); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    
    // Show UI
    document.getElementById("voice-hud-overlay").classList.add("active");
    const prevVol = audio.volume;
    audio.volume = 0.1; // Duck for listening
    
    rec.start();
    
    rec.onresult = (e) => {
        const cmd = e.results[0][0].transcript.toLowerCase();
        document.getElementById("voice-status-text").innerText = `"${cmd}"`;
        
        setTimeout(() => {
            document.getElementById("voice-hud-overlay").classList.remove("active");
            audio.volume = prevVol; // Restore
            executeCommand(cmd);
        }, 1500);
    };
    
    rec.onerror = () => {
        document.getElementById("voice-hud-overlay").classList.remove("active");
        audio.volume = prevVol;
    };
}

function executeCommand(cmd) {
    if (cmd.includes("play")) { 
        if(audio.paused) togglePlayPause(); 
        speak("Resuming playback"); 
    }
    else if (cmd.includes("stop") || cmd.includes("pause")) { 
        if(!audio.paused) togglePlayPause(); 
        speak("Music paused"); 
    }
    else if (cmd.includes("next")) { 
        playNextSong(); 
        speak("Playing next track"); 
    }
    else if (cmd.includes("previous")) { 
        playPreviousSong(); 
        speak("Previous track"); 
    }
    else if (cmd.includes("volume") && cmd.match(/\d+/)) {
        // Smart Volume (e.g. "Volume 50")
        let level = parseInt(cmd.match(/\d+/)[0]);
        if(level > 1) level = level / 100;
        audio.volume = Math.min(1, Math.max(0, level));
        speak(`Volume set to ${Math.round(level * 100)} percent`);
        updateVolUI();
    }
    else if (cmd.includes("volume up")) { 
        audio.volume = Math.min(1, audio.volume + 0.2); 
        speak("Volume Increased"); 
        updateVolUI();
    }
    else if (cmd.includes("volume down")) { 
        audio.volume = Math.max(0, audio.volume - 0.2); 
        speak("Volume Decreased"); 
        updateVolUI();
    }
    else if (cmd.includes("theme")) { 
        openModal('theme-modal'); 
        speak("Opening theme settings"); 
    }
    else { 
        speak("Command not recognized."); 
    }
}

function updateVolUI() { document.getElementById("volume-slider").value = audio.volume; }

// --- 3. CLOCK ---
function startClock() {
    setInterval(() => {
        const d = new Date();
        document.getElementById("system-clock").innerText = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }, 1000);
}

// --- 4. DATABASE & IMPORT (IndexedDB V99) ---
function initDB() {
    // High version number to force upgrade/reset if schema changed
    const req = indexedDB.open("MuzioPrime_V99", 1);
    req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains("library")) {
            db.createObjectStore("library", { keyPath: "id" });
        }
    };
    req.onsuccess = (e) => {
        db = e.target.result;
        loadLibrary();
    };
}

function triggerFileImport() { document.getElementById("hidden-file-input").click(); }

fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    showToast(`Processing ${files.length} audio files...`);
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
        renderAllSongs();
        speak(`${count} new songs imported`);
        showToast("Import Successful");
        updateStats();
    };
});

function loadLibrary() {
    const tx = db.transaction("library", "readonly");
    const req = tx.objectStore("library").getAll();
    req.onsuccess = () => {
        songs = req.result || [];
        updateStats();
        renderAllSongs();
        renderFavorites();
    };
}

function updateStats() {
    document.getElementById("library-status").innerText = `${songs.length} Tracks Loaded`;
    const empty = document.getElementById("empty-library-state");
    if(songs.length === 0) empty.style.display = "block";
    else empty.style.display = "none";
}

// --- 5. RENDER UI ---
function renderAllSongs() {
    const list = document.getElementById("all-songs-list");
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
                <button class="list-btn fav ${song.isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFav(${song.id})">
                    <i class="${song.isFav ? 'fas' : 'far'} fa-heart"></i>
                </button>
                <button class="list-btn del" onclick="event.stopPropagation(); deleteSong(${song.id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        
        // Asynchronous Art Loading
        setTimeout(() => {
            window.jsmediatags.read(song.file, { onSuccess: (t) => { if(t.tags.picture) applyArt(t.tags.picture, imgId); }});
        }, 0);

        div.onclick = () => playSong(index);
        frag.appendChild(div);
    });
    list.appendChild(frag);
}

// --- 6. ACTIONS ---
function toggleFav(id) {
    const idx = songs.findIndex(s => s.id == id);
    if(idx > -1) {
        songs[idx].isFav = !songs[idx].isFav;
        const tx = db.transaction("library", "readwrite");
        tx.objectStore("library").put(songs[idx]);
        renderAllSongs();
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
        renderAllSongs();
        renderFavorites();
        updateStats();
        showToast("Deleted");
    };
}

function renderFavorites() {
    const list = document.getElementById("fav-songs-list");
    const favs = songs.filter(s => s.isFav);
    list.innerHTML = "";
    
    if(!favs.length) { document.getElementById("fav-empty-state").style.display = "block"; return; }
    document.getElementById("fav-empty-state").style.display = "none";
    
    favs.forEach(song => {
        const div = document.createElement("div");
        div.className = "song-card";
        div.innerHTML = `<i class="fas fa-heart" style="color:var(--primary-color); margin-right:15px"></i> <span class="sc-title">${song.name}</span>`;
        div.onclick = () => playSong(songs.indexOf(song));
        list.appendChild(div);
    });
}

function toggleCurrentFav() { if(songs[songIndex]) toggleFav(songs[songIndex].id); }

// --- 7. PLAYER ENGINE ---
function playSong(index) {
    if(index < 0 || index >= songs.length) return;
    songIndex = index;
    const song = songs[index];
    audio.src = URL.createObjectURL(song.file);
    
    document.getElementById("mini-title").innerText = song.name.replace('.mp3','');
    document.getElementById("main-title").innerText = song.name.replace('.mp3','');
    
    // Reset Art
    const def = "https://cdn-icons-png.flaticon.com/512/461/461238.png";
    document.getElementById("mini-art").src = def;
    document.getElementById("fp-main-img").src = def;
    document.getElementById("fp-blur-bg").src = "";
    
    window.jsmediatags.read(song.file, { onSuccess: (t) => { if(t.tags.picture) {
        applyArt(t.tags.picture, "mini-art");
        applyArt(t.tags.picture, "fp-main-img");
        applyArt(t.tags.picture, "fp-blur-bg");
    }}});

    updatePlayerFav();
    
    // Initialize AudioContext if needed
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
    icon.style.color = isFav ? "var(--primary-color)" : "#fff";
}

function togglePlayPause() {
    if(!songs.length) return;
    if(audio.paused) { 
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        audio.play(); isPlaying=true; 
    } else { 
        audio.pause(); isPlaying=false; 
    }
    updateUI();
}
function updateUI() {
    const icon = IsPlaying ? "fa-pause" : "fa-play";
    document.getElementById("mini-play-icon").className = `fas ${icon}`;
    document.getElementById("main-play-icon").className = `fas ${icon}`;
    document.getElementById("mini-art").style.animationPlayState = isPlaying ? "running" : "paused";
}
function playNextSong() { playSong((songIndex + 1) % songs.length); }
function playPreviousSong() { playSong((songIndex - 1 + songs.length) % songs.length); }
function changeVolume(v) { audio.volume = v; }

// --- 8. UTILS ---
function applyArt(pic, id) {
    const {data, format} = pic;
    let base64 = "";
    for(let i=0; i<data.length; i++) base64 += String.fromCharCode(data[i]);
    document.getElementById(id).src = `data:${format};base64,${window.btoa(base64)}`;
}
function showToast(msg) {
    const box = document.getElementById("toast-container");
    const d = document.createElement("div");
    d.className = "toast-msg";
    d.innerText = msg;
    box.appendChild(d);
    setTimeout(() => d.remove(), 3000);
}
function generateAIMix() {
    const grid = document.getElementById("ai-grid-container");
    grid.innerHTML = "";
    if(!songs.length) return;
    let picks = [...songs].sort(()=>0.5-Math.random()).slice(0,4);
    picks.forEach(s => {
        const d = document.createElement("div");
        d.className = "grid-card";
        d.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" id="mix-${s.id}"><div class="play-overlay"><i class="fas fa-play"></i></div><p>${s.name.substr(0,10)}...</p>`;
        window.jsmediatags.read(s.file, { onSuccess: (t) => { if(t.tags.picture) applyArt(t.tags.picture, `mix-${s.id}`); }});
        d.onclick = () => playSong(songs.indexOf(s));
        grid.appendChild(d);
    });
    showToast("Mix Generated");
}
function wipeAllData() { if(confirm("Factory Reset: Delete all songs?")) { indexedDB.deleteDatabase("MuzioPrime_V25"); location.reload(); } }

// UI Toggles
function toggleSidebar() {
    const s = document.getElementById("sidebar-panel");
    const o = document.getElementById("sidebar-backdrop");
    if(s.style.left==="0px") { s.style.left="-100%"; o.classList.remove("active"); }
    else { s.style.left="0px"; o.classList.add("active"); }
}
function toggleSearchBar() {
    const p = document.getElementById("search-panel");
    if(p.style.display==='flex') { p.style.display='none'; } else { p.style.display='flex'; document.getElementById("search-input").focus(); }
}
function performSearch() {
    const q = document.getElementById("search-input").value.toLowerCase();
    document.querySelectorAll(".song-card").forEach(r => {
        r.style.display = r.innerText.toLowerCase().includes(q) ? "flex" : "none";
    });
}
function expandPlayer() { document.getElementById("full-player-overlay").classList.add("active"); }
function collapsePlayer() { document.getElementById("full-player-overlay").classList.remove("active"); }
function openModal(id) { document.getElementById(id).classList.add("flex"); toggleSidebar(); }
function closeModal(id) { document.getElementById(id).classList.remove("flex"); }
function switchView(t) {
    document.querySelectorAll(".view-section").forEach(v=>v.classList.remove("active"));
    document.getElementById(`view-${t}`).classList.add("active");
    document.querySelectorAll(".tab-item").forEach(b=>b.classList.remove("active"));
    event.target.classList.add("active");
    if(t==='ai-mix') generateAIMix();
}
function setTheme(c) { document.body.setAttribute('data-theme', c); localStorage.setItem('theme', c); closeModal('theme-modal'); }
function setSleepTimer(m) { setTimeout(() => { audio.pause(); isPlaying=false; updateUI(); }, m*60000); closeModal('timer-modal'); showToast(`Timer: ${m} mins`); }
function simulateCut() { showToast("Cutter Saved"); closeModal('cutter-modal'); }

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
        document.getElementById("main-seeker").value = p;
        document.getElementById("mini-progress-fill").style.width = p+"%";
        let m = Math.floor(audio.currentTime/60);
        let s = Math.floor(audio.currentTime%60);
        document.getElementById("current-time").innerText = `${m}:${s<10?'0'+s:s}`;
    }
});
audio.addEventListener("loadedmetadata", () => {
    let m = Math.floor(audio.duration/60);
    let s = Math.floor(audio.duration%60);
    if(m || s) document.getElementById("total-duration").innerText = `${m}:${s<10?'0'+s:s}`;
});
audio.addEventListener("ended", playNextSong);
document.getElementById("main-seeker").addEventListener("input", (e) => audio.currentTime = (e.target.value/100)*audio.duration);
