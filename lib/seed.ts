import { db } from './db'

/** No seed data. New users start with an empty database. */
export async function seedDatabase(): Promise<void> {}

export async function clearDatabase(): Promise<void> {
  await db.transaction('rw', [db.categories, db.stacks, db.cards, db.streakMeta], async () => {
    await db.cards.clear()
    await db.stacks.clear()
    await db.categories.clear()
    await db.streakMeta.clear()
  })
}
