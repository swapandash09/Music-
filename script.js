const audio = document.getElementById('audio-element');
const fileInput = document.getElementById('file-upload');
const totalTimeEl = document.getElementById('total-time');
const currTimeEl = document.getElementById('curr-time');
const volumeSlider = document.getElementById('volume-slider');
const micBtn = document.getElementById('mic-btn');

let songs = [];
let favorites = [];
let songIndex = 0;
let isPlaying = false;

// 1. INTRO & SETUP
window.onload = () => {
    setTimeout(() => {
        document.getElementById('splash-screen').style.opacity = '0';
        setTimeout(() => document.getElementById('splash-screen').style.display = 'none', 500);
    }, 2000);
    
    // Greeting
    const h = new Date().getHours();
    document.getElementById('greeting-text').innerText = h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
};

// 2. SONG ADDING
fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if(files.length > 0) {
        files.forEach(file => {
            if(!songs.some(s => s.name === file.name)) songs.push(file);
        });
        document.getElementById('total-songs').innerText = songs.length;
        renderList();
        renderSuggestions(); // Update suggestions logic
        
        // Load first if fresh
        if(songs.length === files.length) loadSong(0, false);
    }
});

// 3. RENDER LIST (With Wave Animation Logic)
function renderList() {
    const container = document.getElementById('view-songs');
    document.querySelectorAll('.song-item').forEach(e => e.remove());
    
    if(songs.length === 0) {
        document.getElementById('empty-state-msg').style.display = 'block';
        return;
    } else {
        document.getElementById('empty-state-msg').style.display = 'none';
    }

    songs.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = `song-item ${index === songIndex ? 'active-song' : ''}`;
        div.innerHTML = `
            <img src="https://cdn-icons-png.flaticon.com/512/461/461238.png" id="thumb-${index}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/461/461238.png'">
            <div class="song-info-list">
                <div>${file.name.replace('.mp3','')}</div>
                <div>Local Audio</div>
            </div>
            <div class="music-wave">
                <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
            </div>
        `;
        div.onclick = () => { songIndex = index; loadSong(songIndex, true); openFullPlayer(); };
        container.appendChild(div);
    });
}

// 4. RENDER SUGGESTIONS (Mockup for now)
function renderSuggestions() {
    const container = document.getElementById('suggested-list');
    container.innerHTML = '';
    
    if(songs.length === 0) { 
        container.innerHTML = "<div style='text-align:center; color:#777; margin-top:20px;'>Import music to get suggestions</div>"; 
        return; 
    }
    
    for(let i=0; i < Math.min(3, songs.length); i++) {
        let r = Math.floor(Math.random() * songs.length);
        let file = songs[r];
        const div = document.createElement('div');
        div.className = 'song-item';
        div.innerHTML = `
            <img src="https://cdn-icons-png.flaticon.com/512/461/461238.png">
            <div class="song-info-list">
                <div>${file.name.replace('.mp3','')}</div>
                <div style="color:var(--primary)">Recommended</div>
            </div>
        `;
        div.onclick = () => { songIndex = r; loadSong(songIndex, true); openFullPlayer(); };
        container.appendChild(div);
    }
}

// 5. CORE PLAYER
function loadSong(index, autoPlay = false) {
    if(!songs[index]) return;
    const file = songs[index];
    audio.src = URL.createObjectURL(file);
    const title = file.name.replace('.mp3','');
    
    document.getElementById('main-title').innerText = title;
    document.getElementById('mini-title').innerText = title;
    
    checkFavorite();
    extractArt(file);
    renderList(); // Refreshes list to move the "Wave" to new song
    updateMediaSession(title);

    if(autoPlay) playSong();
}

function extractArt(file) {
    const def = "https://cdn-icons-png.flaticon.com/512/461/461238.png";
    const setArt = (src) => {
        document.getElementById('main-cover').src = src;
        document.getElementById('mini-cover').src = src;
        document.getElementById('bg-blur').src = src;
    };
    setArt(def); // Reset
    
    window.jsmediatags.read(file, {
        onSuccess: function(tag) {
            if(tag.tags.picture) {
                const { data, format } = tag.tags.picture;
                let base64 = "";
                for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i]);
                const src = `data:${format};base64,${window.btoa(base64)}`;
                setArt(src);
                updateMediaSession(document.getElementById('main-title').innerText, src);
            }
        }, onError: () => {}
    });
}

function updateMediaSession(title, art = "https://cdn-icons-png.flaticon.com/512/461/461238.png") {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title, artist: 'Muzio Prime', artwork: [{ src: art, sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', playSong);
        navigator.mediaSession.setActionHandler('pause', pauseSong);
        navigator.mediaSession.setActionHandler('previoustrack', prevSong);
        navigator.mediaSession.setActionHandler('nexttrack', nextSong);
    }
}

function playSong() { audio.play(); isPlaying = true; updateIcons(); }
function pauseSong() { audio.pause(); isPlaying = false; updateIcons(); }
function togglePlay() { isPlaying ? pauseSong() : playSong(); }
function nextSong() { songIndex = (songIndex + 1) % songs.length; loadSong(songIndex, true); }
function prevSong() { songIndex = (songIndex - 1 + songs.length) % songs.length; loadSong(songIndex, true); }

function updateIcons() {
    const playIcon = '<i class="fas fa-play"></i>';
    const pauseIcon = '<i class="fas fa-pause"></i>';
    document.getElementById('mini-play-btn').innerHTML = isPlaying ? pauseIcon : playIcon;
    document.getElementById('main-play-btn').innerHTML = isPlaying ? pauseIcon : playIcon;
}

// 6. FAVORITES
function toggleFavorite() {
    const s = songs[songIndex];
    if(!s) return;
    const idx = favorites.findIndex(f => f.name === s.name);
    if(idx === -1) { favorites.push(s); speak("Added to favorites"); }
    else { favorites.splice(idx, 1); speak("Removed"); }
    checkFavorite(); renderFavorites();
}
function checkFavorite() {
    if(!songs[songIndex]) return;
    const isFav = favorites.some(f => f.name === songs[songIndex].name);
    const btn = document.getElementById('fav-btn');
    btn.className = isFav ? "fas fa-heart" : "far fa-heart";
}
function renderFavorites() {
    const c = document.getElementById('fav-list'); c.innerHTML = '';
    if(favorites.length === 0) { c.innerHTML = "<div style='text-align:center;color:#666;'>No favorites</div>"; return; }
    favorites.forEach(f => {
        const d = document.createElement('div'); d.className='song-item';
        d.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/461/461238.png"><div>${f.name.replace('.mp3','')}</div>`;
        d.onclick = () => { songIndex = songs.findIndex(s => s.name===f.name); loadSong(songIndex,true); openFullPlayer(); };
        c.appendChild(d);
    });
}

// 7. VOICE & CONTROLS
function speak(t) { const u = new SpeechSynthesisUtterance(t); window.speechSynthesis.speak(u); }
function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return alert("Use Chrome");
    const r = new SR(); r.lang='en-US'; r.start(); micBtn.classList.add('active');
    r.onresult = e => { 
        micBtn.classList.remove('active'); 
        const c = e.results[0][0].transcript.toLowerCase();
        if(c.includes('play')) { playSong(); speak("Playing"); }
        else if(c.includes('pause')) { pauseSong(); speak("Paused"); }
        else if(c.includes('next')) { nextSong(); speak("Next song"); }
    };
    r.onend = () => micBtn.classList.remove('active');
}

// UI Handlers
function openFullPlayer() { document.getElementById('full-player').classList.add('active'); }
function closeFullPlayer() { document.getElementById('full-player').classList.remove('active'); }
function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('active'); 
    document.getElementById('overlay').classList.toggle('active'); 
}
function switchTab(t) {
    document.querySelectorAll('.tab').forEach(e => e.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    document.getElementById('view-songs').style.display = t==='songs'?'block':'none';
    document.getElementById('view-favorites').style.display = t==='favorites'?'block':'none';
    document.getElementById('view-suggested').style.display = t==='suggested'?'block':'none';
}
function changeTheme(t) { document.body.setAttribute('data-theme', t); toggleSidebar(); }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function openTimerModal() { document.getElementById('timer-modal').style.display='flex'; }
function setSleepTimer(m) { alert(`Timer set: ${m}m`); closeModal('timer-modal'); }
function filterSongs() {
    const q = document.getElementById('search-input').value.toLowerCase();
    document.querySelectorAll('.song-item').forEach(i => {
        i.style.display = i.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
    });
}

audio.addEventListener('timeupdate', () => {
    if(audio.duration) {
        document.getElementById('progress-bar').value = (audio.currentTime/audio.duration)*100;
        document.getElementById('mini-progress').style.width = (audio.currentTime/audio.duration)*100 + "%";
        currTimeEl.innerText = formatTime(audio.currentTime);
    }
});
audio.addEventListener('loadedmetadata', () => totalTimeEl.innerText = formatTime(audio.duration));
document.getElementById('progress-bar').addEventListener('input', e => audio.currentTime = (e.target.value/100)*audio.duration);
volumeSlider.addEventListener('input', e => audio.volume = e.target.value);
audio.volume = 1;
audio.addEventListener('ended', nextSong);

function formatTime(s) { if(isNaN(s)) return "0:00"; let m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; }
