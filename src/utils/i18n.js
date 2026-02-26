import uz from '../locales/uz.js';
import ru from '../locales/ru.js';
import en from '../locales/en.js';

const locales = { uz, ru, en };

class I18n {
  /**
   * Translate a key for a given locale
   * @param {string} locale - 'uz', 'ru', or 'en'
   * @param {string} key - Translation key
   * @param {Object} params - Dynamic parameters (e.g., { name: 'John' })
   * @returns {string} - Translated text
   */
  t(locale, key, params = {}) {
    const lang = locales[locale] || locales.uz;
    let text = lang[key] || locales.en[key] || key;

    // Replace parameters
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });

    return text;
  }

  /**
   * Get emoji IDs for the given locale
   * @param {string} locale 
   * @returns {Object}
   */
  emojis(locale) {
    const lang = locales[locale] || locales.uz;
    return lang.emojis || locales.uz.emojis;
  }
}

const i18n = new I18n();
export default i18n;
