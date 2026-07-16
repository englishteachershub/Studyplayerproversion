/* ===================================================================
   speech.js — Text-to-speech playback and read-along recognition.
   Exposes window.ETHSpeech
   =================================================================== */
(function(){
  'use strict';

  function cleanWord(raw){
    return raw.toLowerCase().replace(/[^a-z']/g, '');
  }

  var currentRate = 1;

  /** Walks a paragraph's child nodes to get accurate {el, start, end} character ranges for each word span. */
  function buildWordRanges(paraEl){
    var ranges = [];
    var pos = 0;
    Array.prototype.forEach.call(paraEl.childNodes, function(node){
      if (node.nodeType === 3){
        pos += node.textContent.length;
      } else if (node.nodeType === 1){
        var len = node.textContent.length;
        if (node.classList.contains('word')) ranges.push({ el: node, start: pos, end: pos + len });
        pos += len;
      }
    });
    return ranges;
  }

  function pickVoice(accentLang){
    var voices = window.speechSynthesis.getVoices();
    var lang = accentLang || 'en-IN';
    return voices.find(function(v){ return v.lang === lang; }) ||
           voices.find(function(v){ return v.lang && v.lang.indexOf('en') === 0; });
  }

  /** Speaks a paragraph starting from the word at rangeIndex (0 = from the beginning), highlighting as it goes. */
  function speakFromIndex(paraEl, ranges, rangeIndex, rate, accentLang){
    currentRate = rate;
    window.speechSynthesis.cancel();
    var fullText = paraEl.textContent;
    var startChar = ranges[rangeIndex] ? ranges[rangeIndex].start : 0;
    var subText = fullText.slice(startChar);
    if (!subText.trim()) return;

    var utter = new SpeechSynthesisUtterance(subText);
    utter.rate = rate;
    var voice = pickVoice(accentLang);
    if (voice) utter.voice = voice;

    var relevant = ranges.slice(rangeIndex);
    utter.onboundary = function(e){
      if (e.name !== 'word') return;
      var absoluteIndex = startChar + e.charIndex;
      ranges.forEach(function(r){ r.el.classList.remove('speaking'); });
      var match = relevant.find(function(r){ return absoluteIndex >= r.start && absoluteIndex < r.end; });
      if (match){
        match.el.classList.add('speaking');
        match.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    utter.onend = function(){
      ranges.forEach(function(r){ r.el.classList.remove('speaking'); });
      if (typeof window.ETHSpeech.onParagraphEnd === 'function') window.ETHSpeech.onParagraphEnd();
    };
    window.speechSynthesis.speak(utter);
  }

  /** Speak a paragraph from the beginning. */
  function speakParagraph(paraEl, rate, accentLang){
    speakFromIndex(paraEl, buildWordRanges(paraEl), 0, rate, accentLang);
  }

  /** Speak a paragraph starting from a specific word span the student tapped. */
  function speakFromWord(paraEl, wordEl, rate, accentLang){
    var ranges = buildWordRanges(paraEl);
    var idx = ranges.findIndex(function(r){ return r.el === wordEl; });
    speakFromIndex(paraEl, ranges, idx === -1 ? 0 : idx, rate, accentLang);
  }

  function pause(){ window.speechSynthesis.pause(); }
  function resume(){ window.speechSynthesis.resume(); }
  function stop(){ window.speechSynthesis.cancel(); }

  /** Read-along: listens to the student read a paragraph aloud and scores word accuracy. */
  function startReadAlong(paraEl, onResult, onError, onEnd){
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor){
      onError('Speech recognition isn\'t supported in this browser. Try Chrome on Android.');
      return null;
    }
    var recognition = new Ctor();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function(event){
      var transcript = event.results[0][0].transcript.toLowerCase();
      var result = scoreReading(paraEl, transcript);
      onResult(result);
    };
    recognition.onerror = function(){
      onError('Didn\'t catch that — tap the mic and try again.');
    };
    recognition.onend = function(){ if (onEnd) onEnd(); };
    recognition.start();
    return recognition;
  }

  /** Compares recognized speech to the expected words in a paragraph and highlights them. */
  function scoreReading(paraEl, transcript){
    var wordEls = Array.prototype.slice.call(paraEl.querySelectorAll('.word'));
    wordEls.forEach(function(el){ el.classList.remove('read-correct', 'read-incorrect'); });

    var expected = wordEls.map(function(el){ return cleanWord(el.textContent); });
    var recognizedWords = transcript.split(/\s+/).filter(Boolean);

    var ri = 0, correctCount = 0;
    expected.forEach(function(ew, i){
      var matched = false;
      for (var k = ri; k < Math.min(ri + 3, recognizedWords.length); k++){
        var rw = recognizedWords[k];
        if (rw === ew || rw.indexOf(ew) !== -1 || ew.indexOf(rw) !== -1){
          matched = true; ri = k + 1; break;
        }
      }
      wordEls[i].classList.add(matched ? 'read-correct' : 'read-incorrect');
      if (matched) correctCount++;
    });

    var pct = expected.length ? correctCount / expected.length : 0;
    var stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
    return { correctCount: correctCount, total: expected.length, stars: stars, pct: pct };
  }

  window.ETHSpeech = {
    cleanWord: cleanWord,
    speakParagraph: speakParagraph,
    speakFromWord: speakFromWord,
    pause: pause,
    resume: resume,
    stop: stop,
    startReadAlong: startReadAlong,
    onParagraphEnd: null
  };

  // Warm up voice list (Chrome loads voices asynchronously).
  if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined){
    window.speechSynthesis.onvoiceschanged = function(){};
  }
})();
