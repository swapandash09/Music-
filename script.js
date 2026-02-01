const audio = document.getElementById("audio-core");
const fileInput = document.getElementById("hidden-file-input");
let db, songs = [], songIndex = 0, isPlaying = false;
let audioCtx, source, filters = [];
let currentSpeed = 1.0;

// --- 1. SYSTEM INITIALIZATION ---
function initializeSystem() {
    document.getElementById("boot-screen").style.opacity = "0";
    setTimeout(() => { document.getElementById("boot-screen").style.display = "none"; }, 500);
    
    initDB();
    startClock();
    
    // Greeting
    const h = new Date().getHours();
    const msg = h < 12 ? "Good Morning Sir" : h < 18 ? "Good Afternoon Sir" : "Good Evening Sir";
    
    setTimeout(() => {
        speak(msg + ". Welcome to Muzio Ultimate.", () => {
            if(songs.length > 0) {
                playSong(0);
                speak("Playing your library");
            } else {
                speak("Library is empty. Import songs to begin.");
            }
        });
    }, 800);
}

// --- 2. VOICE ENGINE ---
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function speak(text, callback) {
    if (synth.speaking) synth.cancel();
    
    // Duck Volume
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

function activateVoiceAI() {
    if (!SpeechRecognition) { alert("Voice features require Google Chrome."); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    
    document.getElementById("ai-overlay").classList.add("active");
    const prevVol = audio.volume;
    audio.volume = 0.1;
    
    rec.start();
    
    rec.onresult = (e) => {
        const cmd = e.results[0][0].transcript.toLowerCase();
        document.getElementById("ai-status").innerText = `"${cmd}"`;
        
        setTimeout(() => {
            document.getElementById("ai-overlay").classList.remove("active");
            audio.volume = prevVol;
            executeCommand(cmd);
        }, 1500);
    };
    
    rec.onerror = () => {
        document.getElementById("ai-overlay").classList.remove("active");
        audio.volume = prevVol;
    };
}

function executeCommand(cmd) {
    if (cmd.includes("play")) { if(audio.paused) togglePlayPause(); speak("Playing"); }
    else if (cmd.includes("stop") || cmd.includes("pause")) { if(!audio.paused) togglePlayPause(); speak("Paused"); }
    else if (cmd.includes("next")) { playNextSong(); speak("Next track"); }
    else if (cmd.includes("previous")) { playPreviousSong(); speak("Previous track"); }
    else if (cmd.includes("volume up")) { audio.volume = Math.min(1, audio.volume + 0.2); speak("Volume Increased"); updateVolUI(); }
    else if (cmd.includes("volume down")) { audio.volume = Math.max(0, audio.volume - 0.2); speak("Volume Decreased"); updateVolUI(); }
    else if (cmd.includes("theme")) { openModal('theme-modal'); speak("Opening Themes"); }
    else { speak("I didn't catch that."); }
}

function updateVolUI() { document.getElementById("volume-slider").value = audio.volume; }

// --- 3. CLOCK ---
function startClock() {
    setInterval(() => {
        const now = new Date();
        let h = now.getHours();
        let m = now.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; h = h ? h : 12; 
        m = m < 10 ? '0'+m : m;
        document.getElementById("digital-clock").innerText = `${h}:${m} ${ampm}`;
    }, 1000);
}

// --- 4. DATABASE & IMPORT ---
function initDB() {
    // V14 ensures clean start
    const req = indexedDB.open("MuzioPrime_V14", 1);
    req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("library")) {
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
    
    showToast(`Adding ${files.length} songs...`);
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
        speak(`${count} songs added to library`);
        showToast("Import Successful");
        updateCounter();
    };
});

function loadLibrary() {
    const tx = db.transaction("library", "readonly");
    const req = tx.objectStore("library").getAll();
    req.onsuccess = () => {
        songs = req.result || [];
        updateCounter();
        renderAllSongs();
        renderFavorites();
    };
}

function updateCounter() {
    document.getElementById("track-counter").innerText = `${songs.length} Tracks Loaded`;
    if(songs.length === 0) {
        document.getElementById("empty-library").style.display = "block";
        document.getElementById("library-status").innerText = "Empty Database";
    } else {
        document.getElementById("empty-library").style.display = "none";
        document.getElementById("library-status").innerText = "System Ready";
    }
}

// --- 5. RENDER UI ---
function renderAllSongs() {
    const list = document.getElementById("all-songs-list");
    list.innerHTML = "";
    
    const frag = document.createDocumentFragment();
    songs.forEach((song, index) => {
        const div = document.createElement("div");
        div.className = `song-card song-row ${index === songIndex ? "playing" : ""}`;
        const imgId = `img-${song.id}`;
        
        div.innerHTML = `
            <img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" class="sc-img" id="${imgId}">
            <div class="sc-info">
                <span class="sc-title">${song.name.replace('.mp3','')}</span>
                <span class="sc-artist">Local File</span>
            </div>
            <div class="sc-actions">
                <button class="list-btn fav ${song.isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFav(${song.id})">
                    <i class="${song.isFav ? 'fas' : 'far'} fa-heart"></i>
                </button>
                <button class="list-btn del" onclick="event.stopPropagation(); deleteSong(${song.id})">
                    <i class="fas fa-trash"></i>
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
        updateCounter();
        showToast("Deleted");
    };
}

function renderFavorites() {
    const list = document.getElementById("fav-songs-list");
    const favs = songs.filter(s => s.isFav);
    list.innerHTML = "";
    
    if(!favs.length) { document.getElementById("fav-empty").style.display = "block"; return; }
    document.getElementById("fav-empty").style.display = "none";
    
    favs.forEach(song => {
        const div = document.createElement("div");
        div.className = "song-card song-row";
        div.innerHTML = `<i class="fas fa-heart" style="color:#ff4757; margin-right:15px"></i> <span class="sc-title">${song.name}</span>`;
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
    
    const def = "https://cdn-icons-png.flaticon.com/512/461/461238.png";
    document.getElementById("mini-art").src = def;
    document.getElementById("main-art").src = def;
    document.getElementById("player-blur-bg").src = "";
    
    window.jsmediatags.read(song.file, { onSuccess: (t) => { if(t.tags.picture) {
        applyArt(t.tags.picture, "mini-art");
        applyArt(t.tags.picture, "main-art");
        applyArt(t.tags.picture, "player-blur-bg");
    }}});

    updatePlayerFav();
    
    // Ensure Audio Context
    if(!audioCtx) setupEQ();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    
    audio.play();
    isPlaying = true;
    updateUI();
}

function updatePlayerFav() {
    const isFav = songs[songIndex].isFav;
    const icon = document.getElementById("main-fav-icon");
    icon.className = isFav ? "fas fa-heart" : "far fa-heart";
    icon.style.color = isFav ? "#ff4757" : "#fff";
}

function togglePlayPause() {
    if(!songs.length) return;
    if(audio.paused) { 
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        audio.play(); 
        isPlaying=true; 
    } else { 
        audio.pause(); 
        isPlaying=false; 
    }
    updateUI();
}
function updateUI() {
    const icon = isPlaying ? "fa-pause" : "fa-play";
    document.getElementById("mini-play-icon").className = `fas ${icon}`;
    document.getElementById("main-play-icon").className = `fas ${icon}`;
    document.getElementById("mini-art").style.animationPlayState = isPlaying ? "running" : "paused";
}
function playNextSong() { playSong((songIndex + 1) % songs.length); }
function playPreviousSong() { playSong((songIndex - 1 + songs.length) % songs.length); }
function changeVolume(v) { audio.volume = v; }

// --- 8. UTILITIES & TOOLS ---
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
    const grid = document.getElementById("ai-grid");
    grid.innerHTML = "";
    if(!songs.length) return;
    let picks = [...songs].sort(()=>0.5-Math.random()).slice(0,4);
    picks.forEach(s => {
        const d = document.createElement("div");
        d.className = "grid-item";
        d.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" id="mix-${s.id}"><div class="play-overlay"><i class="fas fa-play"></i></div><p>${s.name.substr(0,10)}...</p>`;
        window.jsmediatags.read(s.file, { onSuccess: (t) => { if(t.tags.picture) applyArt(t.tags.picture, `mix-${s.id}`); }});
        d.onclick = () => playSong(songs.indexOf(s));
        grid.appendChild(d);
    });
    showToast("AI Mix Refreshed");
}
function wipeAllData() { if(confirm("WARNING: This will delete all songs!")) { indexedDB.deleteDatabase("MuzioPrime_ProDB"); location.reload(); } }

// UI Helpers
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
function expandPlayer() { document.getElementById("full-player").classList.add("active"); }
function collapsePlayer() { document.getElementById("full-player").classList.remove("active"); }
function openModal(id) { document.getElementById(id).classList.add("active"); toggleSidebar(); }
function closeModal(id) { document.getElementById(id).classList.remove("active"); }
function switchView(t) {
    document.querySelectorAll(".view-section").forEach(v=>v.classList.remove("active"));
    document.getElementById(`view-${t}`).classList.add("active");
    document.querySelectorAll(".tab-item").forEach(b=>b.classList.remove("active"));
    event.target.classList.add("active");
    if(t==='ai-mix') generateAIMix();
}
function applyTheme(c) { document.body.setAttribute('data-theme', c); localStorage.setItem('theme', c); closeModal('theme-modal'); }
function setSleepTimer(m) { setTimeout(() => { audio.pause(); isPlaying=false; updateUI(); }, m*60000); closeModal('timer-modal'); showToast(`Timer: ${m} mins`); }
function simulateCut() { showToast("Cutter Saved"); closeModal('cutter-modal'); }

// Equalizer
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

// Progress & Time
audio.addEventListener("timeupdate", () => {
    if(audio.duration) {
        const p = (audio.currentTime/audio.duration)*100;
        document.getElementById("main-seeker").value = p;
        document.getElementById("mini-progress-bar").style.width = p+"%";
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
