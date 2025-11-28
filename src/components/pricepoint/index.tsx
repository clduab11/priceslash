'use client';

import React, { useState } from 'react';
import SKUSearch from './SKUSearch';
import PricingHeatmap from './PricingHeatmap';
import VendorMatrix from './VendorMatrix';

type TabType = 'search' | 'heatmap' | 'vendors';

export default function PricePointDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);

  const tabs = [
    { id: 'search' as const, label: 'SKU Search', icon: '🔍' },
    { id: 'heatmap' as const, label: 'Pricing Heatmap', icon: '🗺️' },
    { id: 'vendors' as const, label: 'Vendor Matrix', icon: '🤝' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">PricePoint Intel</h1>
              <p className="text-sm text-gray-500">Pricing Intelligence & Vendor Analysis</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleString()}
              </span>
              <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
                Refresh Data
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === 'search' && (
          <SKUSearch
            onSKUSelect={(sku) => {
              setSelectedSKU(sku.sku_id);
              setActiveTab('heatmap');
            }}
          />
        )}
        {activeTab === 'heatmap' && (
          <PricingHeatmap skuId={selectedSKU || undefined} />
        )}
        {activeTab === 'vendors' && <VendorMatrix />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <div>PricePoint Intel - Data Ingestion Pipeline MVP</div>
            <div className="flex space-x-4">
              <a href="/api/pricepoint/docs" className="hover:text-gray-700">API Docs</a>
              <a href="#" className="hover:text-gray-700">Help</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export { SKUSearch, PricingHeatmap, VendorMatrix };
