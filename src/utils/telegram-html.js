/**
 * Telegram Message to HTML Converter
 * Handles standard entities and premium (custom) emojis
 */
export const messageToHtml = (text, entities = []) => {
  if (!text) return '';
  if (!entities || entities.length === 0) return text;

  // Sort entities by offset in reverse to avoid index shifting
  const sortedEntities = [...entities].sort((a, b) => b.offset - a.offset);
  
  let html = text;

  for (const entity of sortedEntities) {
    const { offset, length, type } = entity;
    const part = text.substring(offset, offset + length);
    let wrapped = part;

    switch (type) {
      case 'bold':
        wrapped = `<b>${part}</b>`;
        break;
      case 'italic':
        wrapped = `<i>${part}</i>`;
        break;
      case 'underline':
        wrapped = `<u>${part}</u>`;
        break;
      case 'strikethrough':
        wrapped = `<s>${part}<s>`;
        break;
      case 'code':
        wrapped = `<code>${part}</code>`;
        break;
      case 'pre':
        wrapped = `<pre>${part}</pre>`;
        break;
      case 'text_link':
        wrapped = `<a href="${entity.url}">${part}</a>`;
        break;
      case 'custom_emoji':
        // ✅ PREMIUM EMOJI SUPPORT
        wrapped = `<tg-emoji emoji-id="${entity.custom_emoji_id}">${part}</tg-emoji>`;
        break;
      default:
        // Skip unknown entities
        continue;
    }

    html = html.substring(0, offset) + wrapped + html.substring(offset + length);
  }

  return html;
};

export default { messageToHtml };
