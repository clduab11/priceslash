
'use server'

import { db } from '@/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const schema = z.object({
  enableEmail: z.boolean(),
  minProfitMargin: z.number().min(0).max(100),
  minPrice: z.number().min(0),
  maxPrice: z.number().min(0),
  categories: z.array(z.string()),
});

export async function updatePreferencesAction(userId: string, prevState: any, formData: FormData) {
  try {
    const enableEmail = formData.get('enableEmail') === 'on';
    const minProfitMargin = Number(formData.get('minProfitMargin'));
    const minPrice = Number(formData.get('minPrice'));
    const maxPrice = Number(formData.get('maxPrice'));
    // Categories logic depends on how form sends it. 
    // Simplified for now until we have categories list.

    await db.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        enableEmail,
        minProfitMargin,
        minPrice,
        maxPrice,
      },
      update: {
        enableEmail,
        minProfitMargin,
        minPrice,
        maxPrice,
      },
    });

    revalidatePath('/dashboard/preferences');
    return { message: 'Preferences updated successfully', success: true };
  } catch (e) {
    return { message: 'Failed to update preferences', success: false };
  }
}
