const sidebarButtons = document.querySelectorAll('.sidebar-btn');
const pages = document.querySelectorAll('.page');

function setActivePage(pageName) {
  sidebarButtons.forEach((button) => {
    const isActive = button.dataset.page === pageName;
    button.classList.toggle('active', isActive);
  });

  pages.forEach((page) => {
    const isActive = page.dataset.page === pageName;
    page.classList.toggle('active', isActive);
  });
}

sidebarButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActivePage(button.dataset.page);
  });
});

const toggleButtons = document.querySelectorAll('.toggle');
toggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.toggle('on');
    button.textContent = button.classList.contains('on') ? 'Вкл' : 'Выкл';
  });
});

function renderModalContent(options = {}) {
  const modal = document.getElementById('app-modal');
  if (!modal) return;

  const titleEl = modal.querySelector('.window-title');
  const bodyEl = modal.querySelector('.window-body');
  const actionsEl = modal.querySelector('.window-actions');

  const config = {
    title: 'Информация',
    text: 'Это модальное окно появляется через функцию showModal().',
    buttons: [{ label: 'Закрыть', className: 'accent', onClick: () => hideModal() }],
    ...options,
  };

  titleEl.textContent = config.title;
  bodyEl.innerHTML = `<p>${config.text}</p>`;

  actionsEl.innerHTML = '';

  config.buttons.forEach((buttonConfig) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = buttonConfig.label;
    button.className = `window-button ${buttonConfig.className || ''}`.trim();
    button.addEventListener('click', () => {
      if (typeof buttonConfig.onClick === 'function') {
        buttonConfig.onClick();
      }
    });
    actionsEl.appendChild(button);
  });
}

function showModal(options = {}) {
  const modal = document.getElementById('app-modal');
  if (!modal) return;

  renderModalContent(options);
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    modal.classList.add('visible');
    modal.classList.remove('closing');
  });
}

function hideModal() {
  const modal = document.getElementById('app-modal');
  if (!modal) return;

  modal.classList.remove('visible');
  modal.classList.add('closing');

  window.setTimeout(() => {
    modal.style.display = 'none';
    modal.classList.remove('closing');
    modal.setAttribute('aria-hidden', 'true');
  }, 180);
}

async function openAboutModal() {
  const appInfo = await window.electronAPI?.getAppInfo?.();

  showModal({
    title: 'О программе',
    text: `NeoQuizzy — приложение для управления тестами и учебными карточками.
      <div class="content-panel" style="margin-top: 16px; font-size: 14px; line-height: 1.5; height: auto; overflow-y: auto;">
        <p>
          <i class="ri-information-line"></i>
          Версия: ${appInfo?.version || '1.0.0'}
        </p>
        <p>
          <i class="ri-information-line"></i>
          Версия Electron: ${appInfo?.electronVersion || 'unknown'}
        </p>
        <p>
          <i class="ri-computer-line"></i>
          Платформа: ${appInfo?.platform || 'unknown'}
        </p>
        <p>
          <i class="ri-user-line"></i>
          Разработчик: Nothing-Byte228
        </p>
      </div>`,
    buttons: [
      { label: 'Закрыть', className: 'accent', onClick: hideModal }
    ]
  });
}

document.querySelectorAll('[data-open-modal]').forEach((button, index) => {
  const modalConfigs = [
    {
      title: 'Проверить обновления',
      text: 'Найдены свежие обновления для NeoQuizzy. Установить их сейчас?',
      buttons: [
        { label: 'Позже', className: '', onClick: hideModal },
        { label: 'Обновить', className: 'accent', onClick: hideModal }
      ]
    }
  ];

  button.addEventListener('click', async () => {
    if (index === 1) {
      await openAboutModal();
      return;
    }

    showModal(modalConfigs[index] || modalConfigs[0]);
  });
});

document.querySelector('.window-close')?.addEventListener('click', hideModal);

document.querySelector('.window')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) {
    hideModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideModal();
  }
});

window.showModal = showModal;
window.hideModal = hideModal;

function closeCardMenus() {
  document.querySelectorAll('.card-menu').forEach((menu) => {
    menu.classList.remove('open');
    menu.style.left = '';
    menu.style.top = '';
  });
}

function attachCardMenuEvents(card) {
  const menu = card.querySelector('.card-menu');

  if (!menu) return;

  card.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const isOpen = menu.classList.contains('open');
    closeCardMenus();

    if (!isOpen) {
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
      menu.classList.add('open');
    }
  });

  menu.querySelectorAll('.menu-action').forEach((actionButton) => {
    actionButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = actionButton.dataset.action;
      const titleEl = card.querySelector('.test-title');
      const metaEl = card.querySelector('.test-meta');
      const title = titleEl ? titleEl.textContent.trim() : '';

      if (action === 'rename') {
        const nextTitle = window.prompt('Введите новое название карточки:', title);
        if (nextTitle && nextTitle.trim()) {
          titleEl.textContent = nextTitle.trim();
        }
      }

      if (action === 'password') {
        const password = window.prompt('Введите пароль для защиты карточки:', '');
        if (password !== null && password.trim()) {
          if (metaEl) {
            metaEl.textContent = 'Защищена';
          }
          card.dataset.protected = 'true';
        }
      }

      if (action === 'duplicate') {
        const newCard = card.cloneNode(true);
        const cloneTitle = title ? `${title} (копия)` : 'Копия';
        const cloneTitleEl = newCard.querySelector('.test-title');
        if (cloneTitleEl) {
          cloneTitleEl.textContent = cloneTitle;
        }
        const grid = document.getElementById('recent-grid');
        if (grid) {
          grid.appendChild(newCard);
          attachCardMenuEvents(newCard);
        }
      }

      if (action === 'delete') {
        const confirmed = window.confirm(`Удалить карточку "${title}"?`);
        if (confirmed) {
          card.remove();
        }
      }

      closeCardMenus();
    });
  });
}

document.querySelectorAll('.test-card').forEach((card) => {
  attachCardMenuEvents(card);
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.card-menu')) {
    closeCardMenus();
  }
});

document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('.test-card')) {
    closeCardMenus();
  }
});

function showEditor() {
  const editor = document.getElementById('editor');
  editor.style.opacity = '1';
  editor.style.visibility = 'visible';
  editor.style.pointerEvents = 'auto';
  editor.style.transform = 'translateX(0)';

  const app = document.getElementById('main-wrapper');
  app.style.transform = 'translateX(-48px)';

  hideMainSidebar();
}

function hideEditor() {
  const editor = document.getElementById('editor');
  editor.style.opacity = '0';
  editor.style.visibility = 'hidden';
  editor.style.pointerEvents = 'none';
  editor.style.transform = 'translateX(48px)';

  const app = document.getElementById('main-wrapper');
  app.style.transform = 'none';

  showMainSidebar();
}

function hideMainSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  sidebar.style.transform = 'translateX(-100%)';
  sidebar.style.transition = 'transform 0.3s cubic-bezier(0.215, 0.610, 0.355, 1)';
}

function showMainSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  sidebar.style.transform = 'translateX(0px)';
  sidebar.style.transition = 'transform 0.3s cubic-bezier(0.215, 0.610, 0.355, 1)';
}

document.querySelectorAll('.test-card').forEach(card => {
  card.addEventListener('click', () => {
    showEditor();
  })
})

function showUnavailableModal(function_name, type) {
  const reasons = {
    testIncompatibleReason: `В настоящее время функция '${function_name}' несовместима с данным форматом теста.`,
    incompatibleReason:     `В настоящее время функция '${function_name}' несовместима с данным компьютером.`,
    incorrectReason:        `В настоящее время функция '${function_name}' недоступна, так как, возможно, была неправильно настроена.`,
    testReason:             `В настоящее время функция '${function_name}' недоступна для данного теста по неизвестной нам причине.`
  };

  const text = reasons[type] || `В настоящее время функция '${function_name}' недоступна по неизвестной нам причине.`;

  showModal({
    title: 'Недоступно', 
    text: text, 
    buttons: [
      {
        label: 'Закрыть', 
        className: '', 
        onClick: () => hideModal()
      }
    ]
  });
}

async function renderQuestions() {
  const test = await readTest();

  for (question of test.tests) {
    const questionList = document.querySelector('#editor-content #questions-list');

    questionList.insertAdjacentHTML('beforeend', `
      <button class="option" style="justify-content: start; padding: 12px; width: 100%;">
        <i class="ri-question-line ri-xl"></i>
        <div style="margin-left: 12px; text-align: start;">
          <p style="color: #ffffff;">${question.text}</p>
        </div>
      </button>
    `)
  }

  // Находим контейнер и все его опции
  const options = document.getElementById('editor-content').querySelectorAll('.option');

  options.forEach(btn => {
    btn.addEventListener('click', () => {
      // 1. Сначала убираем класс active абсолютно у всех опций в этом списке
      options.forEach(item => item.classList.remove('active'));
      
      // 2. И только текущей нажатой кнопке добавляем active
      btn.classList.add('active');
    });
  });
}