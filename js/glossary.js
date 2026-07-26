/* ===================================================================
   glossary.js — Word-tap meanings, Tamil paragraph translation,
   and the whole-lesson glossary panel.
   Exposes window.ETHGlossary
   =================================================================== */
(function(){
  'use strict';

  var glossary = {};      // cleanedKey -> {word, en, ta}
  var translations = [];  // parallel to paragraphs
  var paragraphsPlain = []; // paragraph text with {{blanks}} resolved, for example sentences
  var popupEl = null;

  function init(lessonData, popupHostEl){
    glossary = {};
    if (lessonData.glossary){
      Object.keys(lessonData.glossary).forEach(function(k){
        var ck = window.ETHSpeech.cleanWord(k);
        var val = lessonData.glossary[k];
        if (typeof val === 'object'){
          glossary[ck] = { word: k, en: val.en || '', ta: val.ta || '' };
        } else {
          glossary[ck] = { word: k, en: '', ta: val };
        }
      });
    }
    translations = lessonData.translations || [];
    paragraphsPlain = (lessonData.paragraphs || []).map(function(p){
      return p.replace(/\{\{([^}]+)\}\}/g, '$1');
    });
    popupEl = popupHostEl;
  }

  /** Finds the sentence within a paragraph that actually contains the tapped word,
      so the popup can show real context from the lesson instead of a generic example. */
  function getExampleSentence(paraIdx, wordClean){
    var text = paragraphsPlain[paraIdx];
    if (!text) return '';
    var sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    var found = sentences.find(function(s){
      var words = s.toLowerCase().split(/[^a-z']+/).filter(Boolean);
      return words.indexOf(wordClean) !== -1;
    });
    return (found || sentences[0] || text).trim();
  }

  function showWordPopup(wordSpan){
    var key = window.ETHSpeech.cleanWord(wordSpan.textContent);
    var paraEl = wordSpan.closest('.para-text');
    var paraIdx = paraEl ? parseInt(paraEl.dataset.idx, 10) : -1;
    var example = getExampleSentence(paraIdx, key);

    var entry = glossary[key];
    if (entry){
      renderPopup(wordSpan.textContent.trim(), entry.en, entry.ta, example, 'Lesson glossary');
      return;
    }
    renderPopup(wordSpan.textContent.trim(), '', '\u2026', example, 'Looking up\u2026');
    lookupOnline(key).then(function(ta){
      renderPopup(wordSpan.textContent.trim(), '', ta || '(meaning not available)', example, ta ? 'Online dictionary' : '');
    });
  }

  function renderPopup(word, enLine, taLine, example, sourceTag){
    popupEl.innerHTML =
      '<span class="close" data-close-popup="1">\u2715</span>' +
      '<b>' + word + '</b>' +
      (enLine ? '<br>' + enLine : '') +
      '<span class="tamil">' + taLine + '</span>' +
      (example ? '<span class="example">\u201C' + example + '\u201D</span>' : '') +
      (sourceTag ? '<span class="source-tag">' + sourceTag + '</span>' : '');
    popupEl.style.display = 'block';
    clearTimeout(renderPopup._t);
    renderPopup._t = setTimeout(function(){ popupEl.style.display = 'none'; }, 6000);
  }

  var dictCache = null;
  function loadDictCache(){
    if (dictCache) return dictCache;
    try{ dictCache = JSON.parse(localStorage.getItem('eth_dict_cache') || '{}'); }
    catch(e){ dictCache = {}; }
    return dictCache;
  }
  function saveDictCache(){
    try{ localStorage.setItem('eth_dict_cache', JSON.stringify(dictCache)); }catch(e){ /* ignore */ }
  }

  /** Looks up an English word's Tamil meaning via the free MyMemory API, caching results locally.
      Picks the highest-quality candidate from the match list rather than just the top guess,
      which noticeably improves accuracy for short/ambiguous words. */
  function lookupOnline(word){
    var cache = loadDictCache();
    if (cache[word]) return Promise.resolve(cache[word]);
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=en|ta&de=englishteachershubtheni@gmail.com';
    return fetch(url).then(function(r){ return r.json(); }).then(function(data){
      var best = null;
      if (data && Array.isArray(data.matches) && data.matches.length){
        best = data.matches.reduce(function(a, b){
          return (parseFloat(b.match) || 0) > (parseFloat(a.match) || 0) ? b : a;
        });
      }
      var ta = (best && best.translation) ||
               (data && data.responseData && data.responseData.translatedText);
      if (ta && !/^\s*$/.test(ta)){ cache[word] = ta; saveDictCache(); }
      return ta;
    }).catch(function(){ return null; });
  }

  function hidePopup(){ if (popupEl) popupEl.style.display = 'none'; }

  function getTranslation(idx){
    return translations[idx] || 'Translation not added yet for this paragraph.';
  }

  function renderGlossaryList(container){
    var keys = Object.keys(glossary);
    if (!keys.length){
      container.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;">No glossary words added for this lesson yet.</p>';
      return;
    }
    container.innerHTML = keys.map(function(k){
      var e = glossary[k];
      return '<div class="glossary-row"><span class="gw">' + e.word + '</span>' +
             '<span class="ge">' + e.en + '</span>' +
             '<span class="gt">' + e.ta + '</span></div>';
    }).join('');
  }

  window.ETHGlossary = {
    init: init,
    showWordPopup: showWordPopup,
    hidePopup: hidePopup,
    getTranslation: getTranslation,
    renderGlossaryList: renderGlossaryList
  };
})();
