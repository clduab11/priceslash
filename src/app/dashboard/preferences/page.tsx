
export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import PreferencesForm from './PreferencesForm';

export default async function PreferencesPage() {
    const user = await currentUser();
    if (!user) redirect('/');
    
    // Ensure user exists in DB
    const dbUser = await db.user.upsert({
      where: { clerkId: user.id },
      create: { 
        clerkId: user.id, 
        email: user.emailAddresses[0]?.emailAddress || '' 
      },
      update: { 
        email: user.emailAddresses[0]?.emailAddress 
      },
      include: { preferences: true }
    });

    const serializedPreferences = dbUser.preferences ? {
      ...dbUser.preferences,
      minPrice: Number(dbUser.preferences.minPrice),
      maxPrice: Number(dbUser.preferences.maxPrice),
    } : null;

    return (
      <div className="min-h-screen bg-black text-white">
        <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between">
            <div className="font-bold">pricehawk Preferences</div>
            <a href="/dashboard" className="text-sm hover:text-gray-300">← Back to Dashboard</a>
        </header>

        <div className="p-6">
           <h1 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
             Notification Settings
           </h1>
           <PreferencesForm initialPreferences={serializedPreferences} userId={dbUser.id} />
        </div>
      </div>
    );
}
