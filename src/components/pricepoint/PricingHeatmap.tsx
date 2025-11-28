'use client';

import React, { useState, useEffect } from 'react';

interface HeatmapPoint {
  market_id: string;
  region_name: string;
  latitude: number;
  longitude: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  vendor_count: number;
  sku_count: number;
  price_index: number;
  variance_level: 'low' | 'medium' | 'high';
}

interface HeatmapSummary {
  total_regions: number;
  avg_price_global: number;
  min_avg_price: number;
  max_avg_price: number;
  total_vendors: number;
  total_skus: number;
  price_spread_pct: string;
}

interface PricingHeatmapProps {
  skuId?: string;
  categoryId?: string;
  vendorId?: string;
}

export default function PricingHeatmap({ skuId, categoryId, vendorId }: PricingHeatmapProps) {
  const [data, setData] = useState<HeatmapPoint[]>([]);
  const [summary, setSummary] = useState<HeatmapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<HeatmapPoint | null>(null);

  useEffect(() => {
    fetchHeatmapData();
  }, [skuId, categoryId, vendorId]);

  const fetchHeatmapData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (skuId) params.set('sku_id', skuId);
      if (categoryId) params.set('category_id', categoryId);
      if (vendorId) params.set('vendor_id', vendorId);

      const response = await fetch(`/api/pricepoint/heatmap?${params}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data.points);
        setSummary(result.data.summary);
      } else {
        setError(result.error || 'Failed to fetch heatmap data');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getPriceColor = (priceIndex: number): string => {
    // Color scale from green (low price) to red (high price)
    if (priceIndex < 90) return 'bg-green-500';
    if (priceIndex < 95) return 'bg-green-400';
    if (priceIndex < 100) return 'bg-yellow-400';
    if (priceIndex < 105) return 'bg-orange-400';
    if (priceIndex < 110) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getVarianceIcon = (level: string) => {
    switch (level) {
      case 'low':
        return '●';
      case 'medium':
        return '◐';
      case 'high':
        return '○';
      default:
        return '●';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-md">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Pricing Heatmap by Region</h2>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Total Regions</div>
            <div className="text-2xl font-bold text-blue-800">{summary.total_regions}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Avg Price</div>
            <div className="text-2xl font-bold text-green-800">
              {formatCurrency(summary.avg_price_global)}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-purple-600 font-medium">Price Spread</div>
            <div className="text-2xl font-bold text-purple-800">{summary.price_spread_pct}%</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Total SKUs</div>
            <div className="text-2xl font-bold text-orange-800">{summary.total_skus}</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-600">Price Index:</span>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-xs text-gray-600">&lt;90</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-yellow-400 rounded"></div>
            <span className="text-xs text-gray-600">95-100</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-xs text-gray-600">105-110</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-xs text-gray-600">&gt;110</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-600">Variance:</span>
          <span className="text-xs text-gray-600">● Low</span>
          <span className="text-xs text-gray-600">◐ Medium</span>
          <span className="text-xs text-gray-600">○ High</span>
        </div>
      </div>

      {/* Simplified Map View (Grid representation) */}
      <div className="relative mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {data.map((point) => (
            <div
              key={point.market_id}
              className={`relative p-4 rounded-lg cursor-pointer transition-all hover:scale-105 ${
                selectedRegion?.market_id === point.market_id
                  ? 'ring-2 ring-blue-500'
                  : ''
              } ${getPriceColor(point.price_index)} text-white`}
              onClick={() => setSelectedRegion(point)}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{point.region_name}</h3>
                <span className="text-lg">{getVarianceIcon(point.variance_level)}</span>
              </div>
              <div className="space-y-1 text-sm opacity-90">
                <div>Avg: {formatCurrency(point.avg_price)}</div>
                <div>Index: {point.price_index}</div>
                <div>{point.vendor_count} vendors</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Region Details */}
      {selectedRegion && (
        <div className="border border-gray-200 rounded-lg p-6 mt-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            {selectedRegion.region_name} Details
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-500">Average Price</div>
              <div className="text-lg font-semibold">{formatCurrency(selectedRegion.avg_price)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Min Price</div>
              <div className="text-lg font-semibold">{formatCurrency(selectedRegion.min_price)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Max Price</div>
              <div className="text-lg font-semibold">{formatCurrency(selectedRegion.max_price)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Price Index</div>
              <div className="text-lg font-semibold">{selectedRegion.price_index}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Vendors</div>
              <div className="text-lg font-semibold">{selectedRegion.vendor_count}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">SKUs</div>
              <div className="text-lg font-semibold">{selectedRegion.sku_count}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Variance Level</div>
              <div className={`text-lg font-semibold capitalize ${
                selectedRegion.variance_level === 'low' ? 'text-green-600' :
                selectedRegion.variance_level === 'medium' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {selectedRegion.variance_level}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Coordinates</div>
              <div className="text-sm font-mono">
                {selectedRegion.latitude.toFixed(4)}, {selectedRegion.longitude.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Regional Comparison Table */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Regional Comparison</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Index</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendors</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.sort((a, b) => a.avg_price - b.avg_price).map((point) => (
                <tr key={point.market_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{point.region_name}</td>
                  <td className="px-6 py-4">{formatCurrency(point.avg_price)}</td>
                  <td className="px-6 py-4 text-green-600">{formatCurrency(point.min_price)}</td>
                  <td className="px-6 py-4 text-red-600">{formatCurrency(point.max_price)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                      point.price_index < 100 ? 'bg-green-100 text-green-800' :
                      point.price_index > 100 ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {point.price_index}
                    </span>
                  </td>
                  <td className="px-6 py-4">{point.vendor_count}</td>
                  <td className="px-6 py-4">
                    <span className={`capitalize ${
                      point.variance_level === 'low' ? 'text-green-600' :
                      point.variance_level === 'medium' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {point.variance_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
