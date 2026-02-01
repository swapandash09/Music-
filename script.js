const audio = document.getElementById("audio-core");
const fileInput = document.getElementById("file-input");
let db, songs = [], songIndex = 0, isPlaying = false;
let audioCtx, source, filters = [];
let currentSpeed = 1.0;

// --- 1. STARTUP ---
function initializeApp() {
    document.getElementById("start-overlay").style.display = "none";
    initDB();
    startClock();
    
    // Auto Greeting & Auto Play
    const h = new Date().getHours();
    const msg = h < 12 ? "Good Morning Sir" : h < 18 ? "Good Afternoon Sir" : "Good Evening Sir";
    
    speak(msg + ". Welcome to Muzio.", () => {
        // Try to auto-play if songs exist
        if(songs.length > 0) {
            playSong(0);
            speak("Playing your music");
        }
    });
}

// --- 2. VOICE SYSTEM ---
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function speak(text, callback) {
    if (synth.speaking) synth.cancel();
    
    // Ducking: Lower volume while speaking
    const prevVol = audio.volume;
    if(isPlaying) audio.volume = 0.2;
    
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    
    u.onend = () => {
        if(isPlaying) audio.volume = prevVol; // Restore
        if(callback) callback();
    };
    
    synth.speak(u);
}

function activateVoice() {
    if (!SpeechRecognition) { alert("Use Google Chrome"); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    
    document.getElementById("voice-overlay").classList.add("active");
    
    // Ducking for listening
    const prevVol = audio.volume;
    audio.volume = 0.1;
    
    rec.start();
    
    rec.onresult = (e) => {
        const cmd = e.results[0][0].transcript.toLowerCase();
        document.getElementById("voice-text").innerText = `"${cmd}"`;
        setTimeout(() => document.getElementById("voice-overlay").classList.remove("active"), 1500);
        
        audio.volume = prevVol;
        processCommand(cmd);
    };
    
    rec.onerror = () => {
        document.getElementById("voice-overlay").classList.remove("active");
        audio.volume = prevVol;
    };
}

function processCommand(cmd) {
    if (cmd.includes("play")) { if(audio.paused) togglePlay(); speak("Resuming music"); }
    else if (cmd.includes("stop") || cmd.includes("pause")) { if(!audio.paused) togglePlay(); speak("Music paused"); }
    else if (cmd.includes("next")) { nextSong(); speak("Playing next track"); }
    else if (cmd.includes("previous")) { prevSong(); speak("Previous track"); }
    else if (cmd.includes("volume up")) { audio.volume = Math.min(1, audio.volume + 0.2); speak("Volume up"); updateVolumeSlider(); }
    else if (cmd.includes("volume down")) { audio.volume = Math.max(0, audio.volume - 0.2); speak("Volume down"); updateVolumeSlider(); }
    else if (cmd.includes("time")) { speak("It is " + new Date().toLocaleTimeString()); }
    else { speak("I didn't understand that."); }
}

function updateVolumeSlider() { document.getElementById("vol-slider").value = audio.volume; }

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
    const req = indexedDB.open("MuzioFinal_V12", 1);
    req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("library")) {
            db.createObjectStore("library", { keyPath: "id" });
        }
    };
    req.onsuccess = (e) => {
        db = e.target.result;
        loadSongs();
    };
}

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
        renderList();
        speak(`${count} songs added successfully`);
        showToast(`${count} Songs Added`);
        updateCounter();
    };
});

function loadSongs() {
    const tx = db.transaction("library", "readonly");
    const req = tx.objectStore("library").getAll();
    req.onsuccess = () => {
        songs = req.result || [];
        updateCounter();
        renderList();
        renderFavorites();
    };
}

function updateCounter() {
    document.getElementById("track-counter").innerText = `${songs.length} Tracks`;
}

// --- 5. RENDER UI ---
function renderList() {
    const list = document.getElementById("song-list");
    list.innerHTML = "";
    
    if (!songs.length) { document.getElementById("empty-state").style.display = "block"; return; }
    document.getElementById("empty-state").style.display = "none";

    const frag = document.createDocumentFragment();
    songs.forEach((song, index) => {
        const div = document.createElement("div");
        div.className = `song-row ${index === songIndex ? "playing" : ""}`;
        const imgId = `img-${song.id}`;
        
        div.innerHTML = `
            <img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" class="s-img" id="${imgId}">
            <div class="s-data">
                <span class="s-title">${song.name.replace('.mp3','')}</span>
                <span class="s-artist">Local Audio</span>
            </div>
            <div class="s-actions">
                <button class="act-btn fav ${song.isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFav(${song.id})">
                    <i class="${song.isFav ? 'fas' : 'far'} fa-heart"></i>
                </button>
                <button class="act-btn del" onclick="event.stopPropagation(); deleteSong(${song.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Lazy Art Extraction for Mix
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
        renderList();
        renderFavorites();
        if(songIndex === idx) updatePlayerFav();
    }
}

function deleteSong(id) {
    if(!confirm("Permanently delete?")) return;
    const tx = db.transaction("library", "readwrite");
    tx.objectStore("library").delete(parseFloat(id));
    tx.oncomplete = () => {
        songs = songs.filter(s => s.id != id);
        renderList();
        renderFavorites();
        updateCounter();
        showToast("Song Deleted");
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
        div.className = "song-row";
        div.innerHTML = `<i class="fas fa-heart" style="color:#ff4757; margin-right:15px"></i> <span class="s-title">${song.name}</span>`;
        div.onclick = () => playSong(songs.indexOf(song));
        list.appendChild(div);
    });
}

function toggleCurrentFav() { if(songs[songIndex]) toggleFav(songs[songIndex].id); }

// --- 7. PLAYER ---
function playSong(index) {
    if(index < 0 || index >= songs.length) return;
    songIndex = index;
    const song = songs[index];
    audio.src = URL.createObjectURL(song.file);
    
    document.getElementById("mp-title").innerText = song.name.replace('.mp3','');
    document.getElementById("fp-title").innerText = song.name.replace('.mp3','');
    
    const def = "https://cdn-icons-png.flaticon.com/512/461/461238.png";
    document.getElementById("mp-img").src = def;
    document.getElementById("fp-img").src = def;
    document.getElementById("fp-bg").src = "";
    
    window.jsmediatags.read(song.file, { onSuccess: (t) => { if(t.tags.picture) {
        applyArt(t.tags.picture, "mp-img");
        applyArt(t.tags.picture, "fp-img");
        applyArt(t.tags.picture, "fp-bg");
    }}});

    updatePlayerFav();
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
    icon.style.color = isFav ? "#ff4757" : "#fff";
}

function togglePlay() {
    if(!songs.length) return;
    if(audio.paused) { audio.play(); isPlaying=true; } else { audio.pause(); isPlaying=false; }
    updateUI();
}
function updateUI() {
    const icon = isPlaying ? "fa-pause" : "fa-play";
    document.getElementById("mp-play-icon").className = `fas ${icon}`;
    document.getElementById("fp-play-lg").className = `fas ${icon}`;
    document.getElementById("mp-img").style.animationPlayState = isPlaying ? "running" : "paused";
}
function nextSong() { playSong((songIndex + 1) % songs.length); }
function prevSong() { playSong((songIndex - 1 + songs.length) % songs.length); }
function setVolume(v) { audio.volume = v; }

// --- 8. UTILS & SEARCH ---
function toggleSearch() {
    const bar = document.getElementById("search-bar-container");
    if(bar.style.display === 'flex') { bar.style.display = 'none'; }
    else { bar.style.display = 'flex'; document.getElementById("search-input").focus(); }
}

function filterSongs() {
    const q = document.getElementById("search-input").value.toLowerCase();
    const rows = document.querySelectorAll(".song-row");
    rows.forEach(r => {
        const txt = r.innerText.toLowerCase();
        r.style.display = txt.includes(q) ? "flex" : "none";
    });
}

function applyArt(pic, id) {
    const {data, format} = pic;
    let base64 = "";
    for(let i=0; i<data.length; i++) base64 += String.fromCharCode(data[i]);
    document.getElementById(id).src = `data:${format};base64,${window.btoa(base64)}`;
}
function showToast(msg) {
    const box = document.getElementById("toast-box");
    const d = document.createElement("div");
    d.className = "toast";
    d.innerText = msg;
    box.appendChild(d);
    setTimeout(() => d.remove(), 3000);
}
function generateMix() {
    const grid = document.getElementById("ai-grid");
    grid.innerHTML = "";
    if(!songs.length) return;
    let picks = [...songs].sort(()=>0.5-Math.random()).slice(0,4);
    picks.forEach(s => {
        const d = document.createElement("div");
        d.className = "grid-item";
        d.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/461/461238.png"><div class="play-overlay"><i class="fas fa-play"></i></div><p>${s.name.substr(0,10)}...</p>`;
        
        // Extract Mix Art
        const id = `mix-img-${s.id}`;
        d.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" id="${id}"><div class="play-overlay"><i class="fas fa-play"></i></div>`;
        window.jsmediatags.read(s.file, { onSuccess: (t) => { if(t.tags.picture) applyArt(t.tags.picture, id); }});

        d.onclick = () => playSong(songs.indexOf(s));
        grid.appendChild(d);
    });
    showToast("Mix Generated");
}
function wipeDatabase() { if(confirm("Reset all data?")) { indexedDB.deleteDatabase("MuzioFinal_V12"); location.reload(); } }

// UI Toggles
function toggleMenu() {
    const s = document.getElementById("sidebar");
    const o = document.getElementById("sidebar-overlay");
    if(s.style.left === "0px") { s.style.left = "-100%"; o.classList.remove("active"); }
    else { s.style.left = "0px"; o.classList.add("active"); }
}
function openFullPlayer() { document.getElementById("full-player").classList.add("active"); }
function closeFullPlayer() { document.getElementById("full-player").classList.remove("active"); }
function openModal(id) { document.getElementById(id).classList.add("flex"); toggleMenu(); }
function closeModal(id) { document.getElementById(id).classList.remove("flex"); }
function switchTab(t) {
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById(`view-${t}`).classList.add("active");
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    event.target.classList.add("active");
    if(t==='ai') generateMix();
}
function setTheme(c) { document.body.setAttribute('data-theme', c); localStorage.setItem('theme', c); closeModal('theme-modal'); }
function startTimer(m) { setTimeout(() => { audio.pause(); isPlaying=false; updateUI(); }, m*60000); closeModal('timer-modal'); showToast(`Timer: ${m} mins`); }
function simulateCut() { showToast("Ringtone Saved"); closeModal('cutter-modal'); }

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

// Progress & Time Fix
audio.addEventListener("timeupdate", () => {
    if(audio.duration) {
        const p = (audio.currentTime/audio.duration)*100;
        document.getElementById("seek-slider").value = p;
        document.getElementById("mp-bar").style.width = p+"%";
        let m = Math.floor(audio.currentTime/60);
        let s = Math.floor(audio.currentTime%60);
        document.getElementById("curr-time").innerText = `${m}:${s<10?'0'+s:s}`;
    }
});
audio.addEventListener("loadedmetadata", () => {
    let m = Math.floor(audio.duration/60);
    let s = Math.floor(audio.duration%60);
    if(m && s) document.getElementById("tot-time").innerText = `${m}:${s<10?'0'+s:s}`;
});
audio.addEventListener("ended", nextSong);
document.getElementById("seek-slider").addEventListener("input", (e) => audio.currentTime = (e.target.value/100)*audio.duration);
