
'use client'

import { useFormState } from 'react-dom';
import { updatePreferencesAction } from './actions';

export default function PreferencesForm({ initialPreferences, userId }: { initialPreferences: any, userId: string }) {
  const updateWithId = updatePreferencesAction.bind(null, userId);
  const [state, formAction] = useFormState(updateWithId, { message: '', success: false });

  return (
    <div className="max-w-2xl mx-auto bg-gray-900 border border-white/10 rounded-xl p-6">
      <form action={formAction} className="space-y-6">
        
        <div className="flex items-center justify-between p-4 bg-black/40 rounded-lg">
           <div>
             <h3 className="font-bold">Email Notifications</h3>
             <p className="text-sm text-gray-400">Receive alerts via email</p>
           </div>
           <label className="relative inline-flex items-center cursor-pointer">
             <input 
                type="checkbox" 
                name="enableEmail" 
                defaultChecked={initialPreferences?.enableEmail ?? true} 
                className="sr-only peer"
             />
             <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
           </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div>
             <label className="block text-sm font-medium mb-1 text-gray-400">Min Discount (%)</label>
             <input 
                type="number" 
                name="minProfitMargin"
                defaultValue={initialPreferences?.minProfitMargin ?? 50}
                className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
             />
           </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div>
             <label className="block text-sm font-medium mb-1 text-gray-400">Min Price ($)</label>
             <input 
                type="number" 
                name="minPrice"
                defaultValue={Number(initialPreferences?.minPrice ?? 0)}
                className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
             />
           </div>
           <div>
             <label className="block text-sm font-medium mb-1 text-gray-400">Max Price ($)</label>
             <input 
                type="number" 
                name="maxPrice"
                defaultValue={Number(initialPreferences?.maxPrice ?? 10000)}
                className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
             />
           </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <button 
             type="submit"
             className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors"
          >
             Save Preferences
          </button>
        </div>

        {state?.message && (
          <div className={`p-4 rounded-lg text-center ${state.success ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
            {state.message}
          </div>
        )}

      </form>
    </div>
  );
}
