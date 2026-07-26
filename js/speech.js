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

  /** Estimates ms-per-character of speech at a given rate, used when real boundary events don't fire. */
  function estimateMsPerChar(rate){
    // ~15 characters/sec at rate 1.0 is a reasonable average for English speech.
    return 66 / Math.max(rate, 0.3);
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
    var gotRealBoundary = false;
    var fallbackTimers = [];

    function clearFallback(){
      fallbackTimers.forEach(function(t){ clearTimeout(t); });
      fallbackTimers = [];
    }

    function highlightOnly(el){
      ranges.forEach(function(r){ r.el.classList.remove('speaking'); });
      if (el){
        el.classList.add('speaking');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    utter.onboundary = function(e){
      if (e.name !== 'word') return;
      gotRealBoundary = true;
      clearFallback();
      var absoluteIndex = startChar + e.charIndex;
      var match = relevant.find(function(r){ return absoluteIndex >= r.start && absoluteIndex < r.end; });
      highlightOnly(match ? match.el : null);
    };

    utter.onstart = function(){
      // If no real boundary event arrives shortly after speech starts, drive
      // highlighting with an estimated per-word timer instead (Android Chrome
      // frequently never fires 'boundary' at all).
      setTimeout(function(){
        if (gotRealBoundary) return;
        var msPerChar = estimateMsPerChar(rate);
        var elapsed = 0;
        relevant.forEach(function(r){
          var duration = Math.max(80, (r.end - r.start) * msPerChar);
          var t = setTimeout(function(){
            if (gotRealBoundary) return;
            highlightOnly(r.el);
          }, elapsed);
          fallbackTimers.push(t);
          elapsed += duration;
        });
      }, 250);
    };

    utter.onend = function(){
      clearFallback();
      ranges.forEach(function(r){ r.el.classList.remove('speaking'); });
      if (typeof window.ETHSpeech.onParagraphEnd === 'function') window.ETHSpeech.onParagraphEnd();
    };
    utter.oncancel = function(){ clearFallback(); };
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

  /** Read-along: listens as the student reads, highlighting each word green once speech
      recognition finalizes it. Only finalized results are used for matching (interim guesses
      are shown only as a "listening" pulse) because interim text is unstable and caused visible
      mismatches. Android Chrome often drops a "continuous" session after a short pause even
      when the student is still reading, so this auto-restarts seamlessly unless the student
      taps Stop or the paragraph is complete \u2014 that's what makes it feel continuous. */
  function startReadAlong(paraEl, onProgress, onError, onEnd){
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor){
      onError('Speech recognition isn\'t supported in this browser. Try Chrome on Android.');
      return null;
    }
    var wordEls = Array.prototype.slice.call(paraEl.querySelectorAll('.word'));
    wordEls.forEach(function(el){ el.classList.remove('read-correct', 'read-incorrect', 'read-current'); });
    var expected = wordEls.map(function(el){ return cleanWord(el.textContent); });

    var committedTranscript = '';
    var matchedCount = 0;
    var manualStop = false;
    var controller = { stop: function(){ manualStop = true; try{ recognition.stop(); }catch(e){} } };

    function applyTranscript(transcript, isInterimPreview){
      var recognizedWords = transcript.toLowerCase().split(/\s+/).filter(Boolean);
      var ri = 0;
      var newMatchedCount = 0;
      expected.forEach(function(ew, i){
        var matched = false;
        for (var k = ri; k < Math.min(ri + 3, recognizedWords.length); k++){
          var rw = recognizedWords[k];
          if (rw === ew || rw.indexOf(ew) !== -1 || ew.indexOf(rw) !== -1){
            matched = true; ri = k + 1; break;
          }
        }
        if (matched){
          wordEls[i].classList.remove('read-current');
          wordEls[i].classList.add('read-correct');
          newMatchedCount++;
        }
      });
      if (!isInterimPreview) matchedCount = Math.max(matchedCount, newMatchedCount);
      wordEls.forEach(function(el){ el.classList.remove('read-current'); });
      if (wordEls[matchedCount]) wordEls[matchedCount].classList.add('read-current');

      onProgress({ correctCount: matchedCount, total: expected.length,
        pct: expected.length ? matchedCount / expected.length : 0 });

      if (expected.length && matchedCount / expected.length >= 0.9){
        controller.stop();
      }
    }

    var recognition = new Ctor();
    recognition.lang = 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = function(event){
      var newlyFinal = '';
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++){
        var res = event.results[i];
        if (res.isFinal) newlyFinal += res[0].transcript + ' ';
        else interim += res[0].transcript + ' ';
      }
      if (newlyFinal){
        committedTranscript += newlyFinal;
        applyTranscript(committedTranscript, false);
      } else if (interim){
        applyTranscript(committedTranscript + interim, true);
      }
    };
    recognition.onerror = function(evt){
      if (evt.error === 'no-speech' || evt.error === 'aborted') return;
      onError('Didn\'t catch that \u2014 tap the mic and try again.');
    };
    recognition.onend = function(){
      var pct = expected.length ? matchedCount / expected.length : 0;
      if (!manualStop && pct < 0.9){
        // Android often ends the session early even while the student keeps reading.
        // Restart silently so it feels like one continuous listening session.
        try{ recognition.start(); return; }catch(e){ /* fall through to finish */ }
      }
      wordEls.forEach(function(el){ el.classList.remove('read-current'); });
      var stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
      if (onEnd) onEnd({ correctCount: matchedCount, total: expected.length, stars: stars, pct: pct });
    };

    recognition.start();
    return controller;
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
