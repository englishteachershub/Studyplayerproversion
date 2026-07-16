/* ===================================================================
   glossary.js — Word-tap meanings, Tamil paragraph translation,
   and the whole-lesson glossary panel.
   Exposes window.ETHGlossary
   =================================================================== */
(function(){
  'use strict';

  var glossary = {};      // cleanedKey -> {word, en, ta}
  var translations = [];  // parallel to paragraphs
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
    popupEl = popupHostEl;
  }

  function showWordPopup(wordSpan){
    var key = window.ETHSpeech.cleanWord(wordSpan.textContent);
    var entry = glossary[key];
    var enLine = '', taLine = '(meaning not added yet)';
    if (entry){
      enLine = entry.en || '';
      taLine = entry.ta || '(meaning not added yet)';
    }
    popupEl.innerHTML =
      '<span class="close" data-close-popup="1">\u2715</span>' +
      '<b>' + wordSpan.textContent.trim() + '</b>' +
      (enLine ? '<br>' + enLine : '') +
      '<span class="tamil">' + taLine + '</span>';
    popupEl.style.display = 'block';
    clearTimeout(showWordPopup._t);
    showWordPopup._t = setTimeout(function(){ popupEl.style.display = 'none'; }, 4000);
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
