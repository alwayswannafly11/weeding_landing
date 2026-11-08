(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Настройка: адрес веб-приложения Google Apps Script (шаг с Code.gs).
     Пока строка пустая, форма покажет ошибку вместо отправки.
     ------------------------------------------------------------------------ */
  var SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwN0bKRhH88JAUqVADvkDFc_NziYB_DOgfXFa8sZlovWSj8722iLVuyDI8tnZwT38R4cw/exec';

  var NOT_ATTENDING = 'К сожалению, нет :(';

  /* ------------------------------------------------------------------------
     1. Фото-заглушки: прячем иконку битой картинки, оставляя бежевую подложку
     ------------------------------------------------------------------------ */
  document.querySelectorAll('.photo img').forEach(function (img) {
    function markMissing() { img.parentElement.classList.add('is-missing'); }

    if (img.complete && img.naturalWidth === 0) {
      markMissing();
    } else {
      img.addEventListener('error', markMissing);
    }
  });

  /* ------------------------------------------------------------------------
     2. Появление элементов секций по очереди при прокрутке
     Классы ставятся только здесь: без JS или при отключённой анимации
     всё сразу видно.
     ------------------------------------------------------------------------ */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Что анимируется внутри секции: её прямые потомки, а у групп (галерея,
  // образцы цвета, список пожеланий, анкета, полароиды) — каждый элемент группы отдельно.
  // Плёнка анимируется сама (п. 3).
  var GROUPS = '.venue__gallery, .swatches, .wishes__list, .rsvp__body, .snaps, .intro__media';
  var ITEMS =
    ':scope > *:not(.reel):not(' + GROUPS.replace(/, /g, '):not(') + '),' +
    '.venue__gallery > .photo, .swatches > .swatch, .wishes__list > li, .rsvp__body > *, ' +
    '.snaps > .snap, .intro__media > *';

  if (!reduceMotion && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });

    document.querySelectorAll('main .section, .finale').forEach(function (section) {
      section.querySelectorAll(ITEMS).forEach(function (item, i) {
        item.classList.add('reveal-item');
        item.style.setProperty('--i', i);
      });
      observer.observe(section);
    });
  }

  /* ------------------------------------------------------------------------
     3. Кинопленка «разматывается» сверху вниз по мере прокрутки
     ------------------------------------------------------------------------ */
  var reel = document.getElementById('reel');

  if (reel && !reduceMotion) {
    var svgs = reel.querySelectorAll('.reel__svg');
    // Фото в тайминге появляется по тому же правилу, что и кадры:
    // когда кончик плёнки доходит до его верхнего края
    var cards = reel.querySelectorAll('.reel__card, .reel__snap');
    var ticking = false;

    reel.classList.add('is-animated');

    function activeSvg() {
      for (var i = 0; i < svgs.length; i++) {
        if (svgs[i].getBoundingClientRect().width > 0) return svgs[i];
      }
      return null;
    }

    function updateReel() {
      ticking = false;
      var svg = activeSvg();
      if (!svg) return;

      // Плёнка начинает разматываться, когда её верх на 85% высоты экрана,
      // и разматывается целиком, когда её низ поднимается до 60%
      var rect = reel.getBoundingClientRect();
      var vh = window.innerHeight;
      var start = vh * 0.85;
      var end = vh * 0.6;
      var p = (start - rect.top) / (rect.height + start - end);
      p = Math.min(1, Math.max(0, p));

      svg.querySelector('.reel__progress').style.strokeDashoffset = String(1 - p);

      // Где сейчас «кончик» плёнки по вертикали (доля высоты)
      var path = svg.querySelector('defs > path');
      var tip = path.getPointAtLength(p * path.getTotalLength());
      var tipY = tip.y / svg.viewBox.baseVal.height;

      cards.forEach(function (card) {
        var cardY = card.offsetTop / reel.offsetHeight; // top кадра = точка изгиба
        card.classList.toggle('is-shown', tipY >= cardY - 0.02);
      });
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateReel);
      }
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    updateReel();
  }

  /* ------------------------------------------------------------------------
     3. Анкета
     ------------------------------------------------------------------------ */
  var form = document.getElementById('rsvp-form');
  if (!form) return;

  var hero = document.querySelector('.hero');
  var main = document.querySelector('main');
  var finale = document.getElementById('finale');
  var errorBox = document.getElementById('form-error');
  var submitBtn = document.getElementById('form-submit');
  var otherToggle = document.getElementById('drinks-other-toggle');
  var otherInput = document.getElementById('drinks-other');
  var attendingOnly = form.querySelectorAll('[data-if-attending]');

  // «Иное»: текстовое поле активно только при отмеченном чекбоксе
  otherToggle.addEventListener('change', function () {
    otherInput.disabled = !otherToggle.checked;
    if (otherToggle.checked) otherInput.focus();
    else otherInput.value = '';
  });

  // Если гость не придёт — вопросы про пару и напитки не нужны
  form.querySelectorAll('input[name="attendance"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      var hide = getAttendance() === NOT_ATTENDING;
      attendingOnly.forEach(function (el) { el.hidden = hide; });
      clearInvalid(radio.closest('.form__field'));
    });
  });

  form.elements.name.addEventListener('input', function () {
    clearInvalid(form.elements.name.closest('.form__field'));
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    hideError();

    var firstInvalid = validate();
    if (firstInvalid) {
      showError('Пожалуйста, укажите имя и ответьте, придёте ли Вы.');
      firstInvalid.focus();
      return;
    }

    if (!SCRIPT_URL) {
      showError('Форма пока не подключена к таблице: укажите SCRIPT_URL в js/main.js.');
      return;
    }

    setSending(true);

    fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script не отдаёт CORS-заголовки; ответ нам и не нужен
      body: collectData()
    })
      .then(showFinale)
      .catch(function () {
        setSending(false);
        showError('Не удалось отправить ответ. Проверьте подключение к интернету и нажмите «Отправить» ещё раз.');
      });
  });

  /* --- вспомогательные функции ------------------------------------------- */

  function getAttendance() {
    var checked = form.querySelector('input[name="attendance"]:checked');
    return checked ? checked.value : '';
  }

  function validate() {
    var firstInvalid = null;
    var nameInput = form.elements.name;

    if (!nameInput.value.trim()) {
      markInvalid(nameInput.closest('.form__field'));
      firstInvalid = nameInput;
    }
    if (!getAttendance()) {
      var firstRadio = form.querySelector('input[name="attendance"]');
      markInvalid(firstRadio.closest('.form__field'));
      firstInvalid = firstInvalid || firstRadio;
    }
    return firstInvalid;
  }

  function collectData() {
    var attending = getAttendance() !== NOT_ATTENDING;
    var drinks = [];

    if (attending) {
      form.querySelectorAll('input[name="drinks"]:checked').forEach(function (box) {
        if (box === otherToggle) {
          var other = otherInput.value.trim();
          drinks.push(other ? 'Иное: ' + other : 'Иное');
        } else {
          drinks.push(box.value);
        }
      });
    }

    var data = new URLSearchParams();
    data.append('name', form.elements.name.value.trim());
    data.append('attendance', getAttendance());
    data.append('partner', attending ? form.elements.partner.value.trim() : '');
    data.append('drinks', drinks.join(', '));
    return data;
  }

  // После отправки на странице остаётся только финал «Мы Вас очень ждем…» —
  // он и есть ответ гостю. Остальное (обложка, все блоки, анкета) скрыто до
  // перезагрузки: за локацией и таймингом гость зайдёт на страницу заново.
  // Фокус — на финал, чтобы скринридер прочитал его, а не потерял фокус
  // на исчезнувшей кнопке.
  function showFinale() {
    hero.hidden = true;
    main.hidden = true;
    document.body.classList.add('is-rsvp-done'); // финал на весь экран, см. CSS
    window.scrollTo(0, 0);
    finale.focus({ preventScroll: true });
  }

  function setSending(isSending) {
    submitBtn.disabled = isSending;
    submitBtn.textContent = isSending ? 'Отправляем…' : 'Отправить';
  }

  function markInvalid(field) { field.classList.add('is-invalid'); }

  function clearInvalid(field) {
    field.classList.remove('is-invalid');
    if (!form.querySelector('.is-invalid')) hideError();
  }

  function showError(text) {
    errorBox.textContent = text;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }
})();
