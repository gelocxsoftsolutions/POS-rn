import { seedIfNeeded } from "@/lib/db/seed";

export const SeedService = {
  async run(): Promise<void> {
    try {
      await seedIfNeeded();
    } catch {
      // silent fail
    }
  },
};
