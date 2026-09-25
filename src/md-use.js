if (window.marked) {
  const safeId = (text) =>
    String(text)
      .trim()
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-\u0400-\u04ff]/g, '')
      .replace(/-+/g, '-');

  window.marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false,
    smartLists: true,
    smartypants: false
  });

  window.marked.use({
    renderer: {
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${title}"` : '';
        const safeHref = href || '#';
        return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },

      image({ href, title, text }) {
        const altText = text ? ` alt="${text}"` : '';
        const titleAttr = title ? ` title="${title}"` : '';
        return `<img src="${href}"${altText}${titleAttr} class="md-image" loading="lazy" />`;
      },

      heading({ text, depth }) {
        const id = safeId(text);
        return `<h${depth} id="${id}" class="md-heading">${text}</h${depth}>`;
      },

      blockquote({ text }) {
        // 1. Очищаем текст от начального <p> для точного поиска маркера
        const cleanStart = text.trim().replace(/^<p>/i, '').trim();

        // 2. Ищем конструкцию [!ТИП] в самом начале очищенного текста
        const alertMatch = cleanStart.match(/^\[!([A-Z]+)\]/i);

        if (alertMatch) {
          const alertType = alertMatch[1].toLowerCase();
          
          // Удаляем сам маркер [!NOTE] из текста и возвращаем тег <p> на место
          const contentText = '<p>' + cleanStart.replace(/^\[!([A-Z]+)\]/i, '').trim();

          // Карта настроек для каждого типа уведомлений
          const alertConfig = {
            note: { color: '#0078d7', icon: 'ri-information-line', title: 'Примечание' },
            warning: { color: '#ffaa00', icon: 'ri-error-warning-line', title: 'Внимание' },
            tip: { color: '#6cd470', icon: 'ri-lightbulb-line', title: 'Совет' },
            important: { color: '#d261e6', icon: 'ri-alert-line', title: 'Важно' }
          };

          const currentAlert = alertConfig[alertType] || alertConfig.note;

          return `
            <div style="border-left: 2px solid ${currentAlert.color}; padding: 12px; margin-block: 12px; background-color: #0e0e0e;">
              <div style="display: flex; align-items: center; margin-bottom: 8px; gap: 8px;">
                <i class="${currentAlert.icon}" style="color: ${currentAlert.color};"></i>
                <p>${currentAlert.title}</p>
              </div>
              <div style="color: #ffffff;" class="md-alert-content">${contentText}</div>
            </div>
          `;
        }

        // 2. Если это ОБЫЧНАЯ цитата (без восклицательного знака)
        return `
          <div style="border-left: 2px solid #888888; padding-left: 12px; margin-block: 12px; background-color: #0e0e0e; padding: 12px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px; gap: 8px;">
              <i class="ri-double-quotes-r" style="color: #888888;"></i>
              <p>Цитата</p>
            </div>
            <p style="color: #ffffff;">${text}</p>
          </div>
        `;
      },

      code({ text, lang, escaped }) {
        const language = lang ? ` class="language-${lang}"` : '';
        return `<pre class="md-code-block"><code${language}>${escaped ? text : escapeHtml(text)}</code></pre>`;
      },

      paragraph({ tokens }) {
        const content = this.parser.parseInline(tokens);
        return `<p class="md-paragraph">${content}</p>`;
      },

      list({ ordered, start, items }) {
        const tag = ordered ? 'ol' : 'ul';
        const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
        const content = items.map((item) => this.parser.parse(item.tokens)).join('');
        return `<${tag}${startAttr} class="md-list">${content}</${tag}>`;
      }
    }
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.renderMarkdown = (markdown = '') => {
    if (!markdown) return '';
    return window.marked.parse(markdown);
  };
}

