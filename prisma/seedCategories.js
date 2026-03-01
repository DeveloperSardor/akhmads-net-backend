import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { slug: 'music', nameUz: 'Musiqa', nameRu: 'Музыка', nameEn: 'Music', icon: '🎵', sortOrder: 1 },
  { slug: 'download', nameUz: 'Yuklab olish', nameRu: 'Скачивалки', nameEn: 'Downloads', icon: '📥', sortOrder: 2 },
  { slug: 'tools', nameUz: 'Asboblar', nameRu: 'Инструменты', nameEn: 'Tools', icon: '🛠', sortOrder: 3 },
  { slug: 'chat', nameUz: 'Chat va tanishuvlar', nameRu: 'Чаты и знакомства', nameEn: 'Chats & Dating', icon: '💬', sortOrder: 4 },
  { slug: 'gdz', nameUz: 'GDZ', nameRu: 'ГДЗ', nameEn: 'Homework Help', icon: '📚', sortOrder: 5 },
  { slug: 'vpn', nameUz: 'VPN / Proksi', nameRu: 'VPN / Proxy', nameEn: 'VPN / Proxy', icon: '🔒', sortOrder: 6 },
  { slug: 'movies', nameUz: 'Filmlar', nameRu: 'Фильмы', nameEn: 'Movies', icon: '🎬', sortOrder: 7 },
  { slug: 'tests', nameUz: 'Testlar', nameRu: 'Тесты', nameEn: 'Tests', icon: '📝', sortOrder: 8 },
  { slug: 'currency', nameUz: 'Valyuta kurslari', nameRu: 'Курсы валют', nameEn: 'Currency Rates', icon: '💱', sortOrder: 9 },
  { slug: 'games', nameUz: "O'yinlar", nameRu: 'Игры', nameEn: 'Games', icon: '🎮', sortOrder: 10 },
  { slug: 'stickers', nameUz: 'Stikerlar', nameRu: 'Стикеры', nameEn: 'Stickers', icon: '🎨', sortOrder: 11 },
  { slug: 'ai', nameUz: 'AI / Neyrotarmoqlar', nameRu: 'AI / Нейросети', nameEn: 'AI / Neural Networks', icon: '🤖', sortOrder: 12 },
  { slug: 'voice', nameUz: 'Ovozli', nameRu: 'Голосовые', nameEn: 'Voice', icon: '🎙', sortOrder: 13 },
  { slug: 'fitness', nameUz: 'Fitnes / Salomatlik', nameRu: 'Фитнес / Здоровье', nameEn: 'Fitness / Health', icon: '💪', sortOrder: 14 },
  { slug: 'group', nameUz: 'Guruh-botlar', nameRu: 'Групповые / Чат-боты', nameEn: 'Group / Chat Bots', icon: '👥', sortOrder: 15 },
  { slug: 'books', nameUz: 'Kitoblar', nameRu: 'Книги', nameEn: 'Books', icon: '📖', sortOrder: 16 },
  { slug: 'themes', nameUz: 'Temalar', nameRu: 'Темы', nameEn: 'Themes', icon: '🎭', sortOrder: 17 },
  { slug: 'converter', nameUz: 'Fayl konverterlari', nameRu: 'Конвертеры файлов', nameEn: 'File Converters', icon: '🔄', sortOrder: 18 },
  { slug: 'horoscope', nameUz: 'Goroskoplar', nameRu: 'Гороскопы', nameEn: 'Horoscopes', icon: '🔮', sortOrder: 19 },
  { slug: 'other', nameUz: 'Boshqa', nameRu: 'Другое', nameEn: 'Other', icon: '📌', sortOrder: 20 },
];

async function seedCategories() {
  console.log('🌱 Seeding categories...');
  
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { nameUz: cat.nameUz, nameRu: cat.nameRu, nameEn: cat.nameEn, icon: cat.icon, sortOrder: cat.sortOrder },
      create: cat,
    });
    console.log(`  ✅ ${cat.icon} ${cat.slug}`);
  }
  
  console.log(`\n✅ ${DEFAULT_CATEGORIES.length} categories seeded successfully!`);
}

seedCategories()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
