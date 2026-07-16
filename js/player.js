/* ===================================================================
   player.js — Universal lesson player (lesson.html).
   Loads a lesson by ?id= (preferred) or ?class=&unit=&type=,
   renders paragraphs, wires up toolbar, speech, glossary, and
   read-along practice. Saves progress to localStorage for the
   Home page's "Continue reading" strip.
   =================================================================== */
(function(){
  'use strict';

  var els = {};
  var lesson = null;
  var meaningMode = false;
  var translateMode = false;
  var practiceMode = false;
  var darkMode = false;
  var fontStep = 1;
  var readingStars = {};
  var accentMap = { indian:'en-IN', british:'en-GB', american:'en-US' };

  document.addEventListener('DOMContentLoaded', init);

  function qs(id){ return document.getElementById(id); }

  function init(){
    els = {
      title: qs('lessonTitle'), meta: qs('lessonMeta'),
      container: qs('paraContainer'), empty: qs('emptyState'),
      progressFill: qs('progressFill'),
      accentSelect: qs('accentSelect'), speedRange: qs('speedRange'), speedVal: qs('speedVal'),
      btnPlay: qs('btnPlay'), btnPause: qs('btnPause'), btnStop: qs('btnStop'),
      btnMeaning: qs('btnMeaningToggle'), btnTranslate: qs('btnTranslateToggle'),
      btnGlossaryPanel: qs('btnGlossaryPanel'), glossaryPanel: qs('glossaryPanel'), glossaryList: qs('glossaryList'),
      btnPractice: qs('btnPracticeToggle'), totalStarsBar: qs('totalStarsBar'),
      btnDark: qs('themeBtn'), btnFont: qs('fontBtn'), btnFullscreen: qs('fullscreenBtn'),
      popup: qs('popupHost')
    };

    els.btnMeaning.addEventListener('click', toggleMeaningMode);
    els.btnTranslate.addEventListener('click', toggleTranslateMode);
    els.btnGlossaryPanel.addEventListener('click', toggleGlossaryPanel);
    els.btnPractice.addEventListener('click', togglePracticeMode);
    els.btnDark.addEventListener('click', toggleDarkMode);
    els.btnFont.addEventListener('click', cycleFontSize);
    if (els.btnFullscreen) els.btnFullscreen.addEventListener('click', toggleFullscreen);
    els.speedRange.addEventListener('input', function(){
      els.speedVal.textContent = parseFloat(els.speedRange.value).toFixed(1) + 'x';
    });
    els.btnStop.addEventListener('click', function(){ window.ETHSpeech.stop(); });
    els.btnPause.addEventListener('click', function(){ window.ETHSpeech.pause(); });
    els.popup.addEventListener('click', function(e){
      if (e.target.dataset.closePopup) window.ETHGlossary.hidePopup();
    });

    window.addEventListener('scroll', throttledSaveProgress);

    loadLesson();
  }

  function getParam(name){
    return new URLSearchParams(window.location.search).get(name);
  }

  function loadLesson(){
    var id = getParam('id');
    fetch('data/lessons.json').then(function(r){ return r.json(); }).then(function(idx){
      var entry = null;
      if (id){
        entry = idx.lessons.find(function(l){ return l.id === id; });
      } else {
        var cls = getParam('class'), unit = getParam('unit'), type = getParam('type');
        entry = idx.lessons.find(function(l){ return l.class === cls && l.unit === unit && l.type === type; });
      }
      if (!entry){ showEmpty(); return; }
      return fetch(entry.path).then(function(r){ return r.json(); }).then(function(data){
        lesson = data;
        renderLesson(data);
      });
    }).catch(function(){ showEmpty(); });
  }

  function showEmpty(){
    els.empty.style.display = 'block';
    els.container.style.display = 'none';
  }

  function renderLesson(data){
    els.empty.style.display = 'none';
    els.container.style.display = 'block';
    els.title.textContent = data.title || 'Untitled Lesson';
    els.meta.textContent = 'Class ' + data.class + ' \u00b7 Unit ' + data.unit + ' \u00b7 ' + capitalize(data.type);

    window.ETHGlossary.init(data, els.popup);
    readingStars = {};

    els.container.innerHTML = '';
    (data.paragraphs || []).forEach(function(raw, idx){
      var card = document.createElement('div');
      card.className = 'paragraph-card';
      card.innerHTML =
        '<div class="para-num">Paragraph ' + (idx + 1) + '</div>' +
        '<div class="para-text lesson-font" id="para-' + idx + '" data-raw="' + escapeAttr(raw) + '" data-idx="' + idx + '">' + wrapWords(raw) + '</div>' +
        '<div class="translation-box" id="translation-' + idx + '"></div>' +
        '<div class="controls-row">' +
          '<button class="ctrl-btn play-btn" data-idx="' + idx + '">\u25B6\uFE0F Play</button>' +
          '<button class="ctrl-btn repeat-btn" data-idx="' + idx + '">\uD83D\uDD01 Repeat</button>' +
          '<button class="ctrl-btn slow-btn" data-idx="' + idx + '">\uD83D\uDC22 Slow</button>' +
        '</div>' +
        '<div class="practice-row" id="practice-row-' + idx + '" style="display:none;">' +
          '<button class="ctrl-btn mic-btn" data-idx="' + idx + '">\uD83C\uDFA4 Read This Paragraph</button>' +
          '<span class="star-line" id="star-line-' + idx + '">' + starLineHtml(0, null) + '</span>' +
        '</div>';
      els.container.appendChild(card);
    });

    attachParagraphEvents();
    saveOpenedLesson(data);
    updateTotalStarsBar();
  }

  function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function escapeAttr(s){ return s.replace(/"/g, '&quot;'); }

  function wrapWords(raw){
    var parts = raw.split(/(\{\{[^}]+\}\})/);
    return parts.map(function(part){
      var blankMatch = part.match(/^\{\{([^}]+)\}\}$/);
      if (blankMatch){
        var answer = blankMatch[1];
        var clean = answer.toLowerCase().replace(/[^a-z']/g, '');
        return '<span class="word blank" data-word="' + clean + '">' + answer + '</span>';
      }
      return part.split(/(\s+)/).map(function(tok){
        if (/^\s+$/.test(tok) || tok === '') return tok;
        var clean = tok.replace(/[.,!?;:"'\u201C\u201D]/g, '');
        return '<span class="word" data-word="' + clean + '">' + tok + '</span>';
      }).join('');
    }).join('');
  }

  function attachParagraphEvents(){
    document.querySelectorAll('.word').forEach(function(w){
      if (w.classList.contains('blank')){
        w.addEventListener('click', function(){ w.classList.toggle('revealed'); });
        return;
      }
      w.addEventListener('click', function(){
        if (meaningMode) window.ETHGlossary.showWordPopup(w);
        else speakFromWord(w);
      });
    });
    document.querySelectorAll('.play-btn').forEach(function(b){
      b.addEventListener('click', function(){ playParagraph(b.dataset.idx, currentRate()); });
    });
    document.querySelectorAll('.repeat-btn').forEach(function(b){
      b.addEventListener('click', function(){ playParagraph(b.dataset.idx, currentRate()); });
    });
    document.querySelectorAll('.slow-btn').forEach(function(b){
      b.addEventListener('click', function(){ playParagraph(b.dataset.idx, 0.6); });
    });
  }

  function currentRate(){ return parseFloat(els.speedRange.value) || 1; }
  function currentAccent(){ return accentMap[els.accentSelect.value] || 'en-IN'; }

  function playParagraph(idx, rate){
    var paraEl = qs('para-' + idx);
    window.ETHSpeech.speakParagraph(paraEl, rate, currentAccent());
  }

  function speakFromWord(wordEl){
    // Read aloud starting from the exact word tapped, not the start of the paragraph.
    var paraEl = wordEl.closest('.para-text');
    window.ETHSpeech.speakFromWord(paraEl, wordEl, currentRate(), currentAccent());
  }

  /* ---------- Toggles ---------- */
  function toggleMeaningMode(){
    meaningMode = !meaningMode;
    els.btnMeaning.classList.toggle('active', meaningMode);
    els.btnMeaning.textContent = meaningMode ? '\uD83D\uDCD6 Show Meanings: ON' : '\uD83D\uDCD6 Show Meanings: OFF';
    window.ETHGlossary.hidePopup();
  }

  function toggleTranslateMode(){
    translateMode = !translateMode;
    els.btnTranslate.classList.toggle('active', translateMode);
    els.btnTranslate.textContent = translateMode ? '\uD83C\uDDEE\uD83C\uDDF3 Tamil Translation: ON' : '\uD83C\uDDEE\uD83C\uDDF3 Tamil Translation: OFF';
    document.querySelectorAll('.translation-box').forEach(function(box, idx){
      if (translateMode){
        box.textContent = window.ETHGlossary.getTranslation(idx);
        box.classList.add('visible');
      } else {
        box.classList.remove('visible');
      }
    });
  }

  function toggleGlossaryPanel(){
    var showing = els.glossaryPanel.classList.toggle('visible');
    if (showing) window.ETHGlossary.renderGlossaryList(els.glossaryList);
  }

  function togglePracticeMode(){
    practiceMode = !practiceMode;
    els.btnPractice.classList.toggle('active', practiceMode);
    els.btnPractice.textContent = practiceMode ? '\uD83C\uDFA4 Reading Practice: ON' : '\uD83C\uDFA4 Reading Practice: OFF';
    document.querySelectorAll('.practice-row').forEach(function(row){
      row.style.display = practiceMode ? 'flex' : 'none';
    });
    if (practiceMode) attachPracticeEvents();
    updateTotalStarsBar();
  }

  function attachPracticeEvents(){
    document.querySelectorAll('.mic-btn').forEach(function(b){
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', function(){ startReadAlong(parseInt(b.dataset.idx, 10), b); });
    });
  }

  function starLineHtml(stars, msg){
    var filled = '\u2B50'.repeat(stars), empty = '\u2606'.repeat(3 - stars);
    var message = msg || (stars === 0 ? 'Tap the mic and read the paragraph aloud' :
      stars === 3 ? 'Excellent reading!' : stars === 2 ? 'Good \u2014 try again for 3 stars' : 'Keep practising, try again');
    return filled + empty + '<span class="star-msg">' + message + '</span>';
  }

  function startReadAlong(idx, btn){
    var paraEl = qs('para-' + idx);
    btn.classList.add('listening');
    btn.textContent = '\uD83C\uDFA4 Listening...';
    btn.disabled = true;

    window.ETHSpeech.startReadAlong(paraEl,
      function onResult(result){
        readingStars[idx] = Math.max(readingStars[idx] || 0, result.stars);
        qs('star-line-' + idx).innerHTML = starLineHtml(result.stars, result.correctCount + ' of ' + result.total + ' words read correctly');
        updateTotalStarsBar();
        saveStars(idx, readingStars[idx]);
      },
      function onError(msg){
        qs('star-line-' + idx).innerHTML = '<span class="star-msg" style="color:var(--bad);">' + msg + '</span>';
      },
      function onEnd(){
        btn.classList.remove('listening');
        btn.textContent = '\uD83C\uDFA4 Read This Paragraph';
        btn.disabled = false;
      }
    );
  }

  function updateTotalStarsBar(){
    if (!practiceMode || !lesson){ els.totalStarsBar.classList.remove('visible'); return; }
    var total = 0;
    Object.keys(readingStars).forEach(function(k){ total += readingStars[k]; });
    var max = lesson.paragraphs.length * 3;
    els.totalStarsBar.textContent = '\u2B50 Total Stars: ' + total + ' / ' + max;
    els.totalStarsBar.classList.add('visible');
  }

  function toggleDarkMode(){
    darkMode = !darkMode;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }

  function cycleFontSize(){
    fontStep = (fontStep + 1) % 3;
    var sizes = ['16px', '19px', '22px'];
    document.querySelectorAll('.para-text').forEach(function(p){ p.style.fontSize = sizes[fontStep]; });
  }

  function toggleFullscreen(){
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function(){});
    else document.exitFullscreen();
  }

  /* ---------- Progress persistence (for Home page "Continue reading") ---------- */
  function saveOpenedLesson(data){
    try{
      var store = JSON.parse(localStorage.getItem('eth_progress') || '{}');
      store[data.id] = store[data.id] || {};
      store[data.id].title = data.title;
      store[data.id].class = data.class;
      store[data.id].unit = data.unit;
      store[data.id].type = data.type;
      store[data.id].percent = store[data.id].percent || 0;
      store[data.id].updatedAt = Date.now();
      localStorage.setItem('eth_progress', JSON.stringify(store));
    }catch(e){ /* localStorage unavailable, ignore */ }
  }

  var scrollSaveTimer = null;
  function throttledSaveProgress(){
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(saveScrollProgress, 400);
  }

  function saveScrollProgress(){
    if (!lesson) return;
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docH > 0 ? Math.min(100, Math.round((window.scrollY / docH) * 100)) : 0;
    els.progressFill.style.width = pct + '%';
    try{
      var store = JSON.parse(localStorage.getItem('eth_progress') || '{}');
      if (store[lesson.id]){
        store[lesson.id].percent = Math.max(store[lesson.id].percent || 0, pct);
        store[lesson.id].updatedAt = Date.now();
        localStorage.setItem('eth_progress', JSON.stringify(store));
      }
    }catch(e){ /* ignore */ }
  }

  function saveStars(idx, stars){
    if (!lesson) return;
    try{
      var store = JSON.parse(localStorage.getItem('eth_stars') || '{}');
      store[lesson.id] = store[lesson.id] || {};
      store[lesson.id][idx] = stars;
      localStorage.setItem('eth_stars', JSON.stringify(store));
    }catch(e){ /* ignore */ }
  }
})();
