/* ===================================================================
   app.js — Home page (index.html): class/unit browsing, search,
   continue reading, and the daily quote.
   =================================================================== */
(function(){
  'use strict';

  var QUOTES = [
    { text: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
    { text: "One language sets you in a corridor for life. Two languages open every door along the way.", author: "Frank Smith" },
    { text: "To have another language is to possess a second soul.", author: "Charlemagne" },
    { text: "Reading is to the mind what exercise is to the body.", author: "Joseph Addison" },
    { text: "A different language is a different vision of life.", author: "Federico Fellini" },
    { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
    { text: "Learning another language is not only learning different words for the same things, but learning another way to think about things.", author: "Flora Lewis" }
  ];

  var SPINE_COLORS = ['#1B2A4A', '#2C4270', '#3A5484', '#C9A227', '#8a6d00', '#5A6072', '#3D8B5F'];

  var classesData = null, lessonsData = null;

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    renderQuote();
    document.getElementById('searchInput').addEventListener('input', onSearch);

    Promise.all([
      fetch('data/classes.json').then(function(r){ return r.json(); }),
      fetch('data/lessons.json').then(function(r){ return r.json(); })
    ]).then(function(results){
      classesData = results[0];
      lessonsData = results[1];
      renderContinueReading();
      renderClasses(classesData.classes);
    }).catch(function(){
      document.getElementById('classGrid').innerHTML = '<p style="color:var(--ink-soft);">Could not load lesson data.</p>';
    });

    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function(){
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    });
  }

  function renderQuote(){
    var dayIndex = Math.floor(Date.now() / 86400000) % QUOTES.length;
    var q = QUOTES[dayIndex];
    document.getElementById('quoteText').textContent = '\u201C' + q.text + '\u201D';
    document.getElementById('quoteAuthor').textContent = '\u2014 ' + q.author;
  }

  function renderContinueReading(){
    var wrap = document.getElementById('continueSection');
    var row = document.getElementById('continueRow');
    var store = {};
    try{ store = JSON.parse(localStorage.getItem('eth_progress') || '{}'); }catch(e){}

    var entries = Object.keys(store).map(function(id){
      return Object.assign({ id: id }, store[id]);
    }).filter(function(e){ return e.percent > 0 && e.percent < 100; })
      .sort(function(a, b){ return b.updatedAt - a.updatedAt; })
      .slice(0, 6);

    if (!entries.length){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    row.innerHTML = entries.map(function(e){
      return '<a class="continue-card" href="lesson.html?id=' + encodeURIComponent(e.id) + '">' +
        '<div class="cc-title">' + e.title + '</div>' +
        '<div class="cc-meta">Class ' + e.class + ' \u00b7 Unit ' + e.unit + '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + e.percent + '%"></div></div>' +
      '</a>';
    }).join('');
  }

  function renderClasses(classes){
    var grid = document.getElementById('classGrid');
    grid.innerHTML = classes.map(function(cls, i){
      var availableCount = 0, totalCount = 0;
      cls.units.forEach(function(u){
        Object.keys(u.types).forEach(function(t){
          totalCount++;
          if (u.types[t].status === 'available') availableCount++;
        });
      });
      var chipsHtml = cls.units.map(function(u){
        var hasAvailable = Object.keys(u.types).some(function(t){ return u.types[t].status === 'available'; });
        return '<span class="unit-chip ' + (hasAvailable ? 'available' : 'soon') + '">Unit ' + u.unit + '</span>';
      }).join('');
      return '<div class="class-card" data-class="' + cls['class'] + '">' +
        '<div class="class-spine" style="background:' + SPINE_COLORS[i % SPINE_COLORS.length] + '"></div>' +
        '<div class="class-body">' +
          '<h3>' + cls.label + '</h3>' +
          '<p>' + availableCount + ' of ' + totalCount + ' lessons ready</p>' +
          '<div class="unit-chip-row">' + chipsHtml + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    grid.querySelectorAll('.class-card').forEach(function(card){
      card.addEventListener('click', function(){
        var cls = classesData.classes.find(function(c){ return c['class'] === card.dataset.class; });
        renderUnitDetail(cls);
      });
    });
  }

  function renderUnitDetail(cls){
    var panel = document.getElementById('unitDetail');
    var typeLabels = classesData.types;
    panel.style.display = 'block';
    panel.innerHTML = '<button class="btn btn-outline" id="closeDetail">\u2190 Back to Classes</button>' +
      '<h2 style="color:var(--navy);font-family:var(--font-display);margin:14px 0 6px;">' + cls.label + '</h2>' +
      cls.units.map(function(u){
        return '<div class="section-heading">Unit ' + u.unit + '</div>' +
          '<div class="type-grid">' +
          Object.keys(u.types).map(function(t){
            var entry = u.types[t];
            var isAvailable = entry.status === 'available';
            var inner = '<div class="type-row' + (isAvailable ? '' : ' soon') + '">' +
              '<div><div class="tr-label">' + typeLabels[t] + '</div><div class="tr-title">' + entry.title + '</div></div>' +
              (isAvailable ? '<span class="btn btn-gold" style="pointer-events:none;">Open</span>' : '<span class="btn btn-outline" style="pointer-events:none;">Coming soon</span>') +
            '</div>';
            return isAvailable ? '<a href="lesson.html?id=' + encodeURIComponent(entry.lessonId) + '">' + inner + '</a>' : inner;
          }).join('') +
          '</div>';
      }).join('');

    document.getElementById('closeDetail').addEventListener('click', function(){
      panel.style.display = 'none';
      panel.innerHTML = '';
    });
    panel.scrollIntoView({ behavior: 'smooth' });
  }

  function onSearch(e){
    var q = e.target.value.trim().toLowerCase();
    var resultsEl = document.getElementById('searchResults');
    if (!q || !lessonsData){ resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }
    var matches = lessonsData.lessons.filter(function(l){
      return l.title.toLowerCase().indexOf(q) !== -1;
    });
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = matches.length ?
      matches.map(function(l){
        return '<a class="type-row" style="display:flex;margin-bottom:8px;" href="lesson.html?id=' + encodeURIComponent(l.id) + '">' +
          '<div><div class="tr-label">' + l.title + '</div><div class="tr-title">Class ' + l.class + ' \u00b7 Unit ' + l.unit + '</div></div>' +
          '<span class="btn btn-gold" style="pointer-events:none;">Open</span></a>';
      }).join('') :
      '<p style="color:var(--ink-soft);font-size:13px;">No lessons found for \u201C' + q + '\u201D yet.</p>';
  }
})();
