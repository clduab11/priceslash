'use client';

import React, { useState, useEffect } from 'react';

interface VendorCompetitiveness {
  below_market_pct: number;
  at_market_pct: number;
  above_market_pct: number;
}

interface Vendor {
  vendor_id: string;
  vendor_name: string;
  total_skus: number;
  regions_covered: number;
  avg_price_index: number;
  reliability_score: number | null;
  shared_skus: Record<string, number>;
  competitiveness: VendorCompetitiveness;
}

interface NetworkMetrics {
  total_vendors: number;
  total_connections: number;
  avg_shared_skus: string;
  network_density: string;
}

interface MatrixData {
  vendors: string[];
  relationships: number[][];
  metadata: Record<string, {
    name: string;
    total_skus: number;
    avg_price_index: number;
  }>;
}

export default function VendorMatrix() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [networkMetrics, setNetworkMetrics] = useState<NetworkMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');

  useEffect(() => {
    fetchVendorMatrix();
  }, []);

  const fetchVendorMatrix = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/pricepoint/vendors/matrix');
      const result = await response.json();

      if (result.success) {
        setVendors(result.data.vendors);
        setMatrix(result.data.matrix);
        setNetworkMetrics(result.data.network_metrics);
      } else {
        setError(result.error || 'Failed to fetch vendor data');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleVendorSelection = (vendorId: string) => {
    setSelectedVendors(prev =>
      prev.includes(vendorId)
        ? prev.filter(id => id !== vendorId)
        : [...prev, vendorId]
    );
  };

  const getCompetitivenessColor = (below: number) => {
    if (below >= 50) return 'text-green-600';
    if (below >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPriceIndexColor = (index: number) => {
    if (index < 95) return 'bg-green-100 text-green-800';
    if (index <= 105) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getRelationshipStrength = (count: number): string => {
    if (count >= 25) return 'bg-blue-600';
    if (count >= 15) return 'bg-blue-400';
    if (count >= 5) return 'bg-blue-200';
    if (count > 0) return 'bg-blue-100';
    return 'bg-gray-50';
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Vendor Relationship Matrix</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            List View
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              viewMode === 'matrix'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Matrix View
          </button>
        </div>
      </div>

      {/* Network Metrics */}
      {networkMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="text-sm text-indigo-600 font-medium">Total Vendors</div>
            <div className="text-2xl font-bold text-indigo-800">{networkMetrics.total_vendors}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Connections</div>
            <div className="text-2xl font-bold text-blue-800">{networkMetrics.total_connections}</div>
          </div>
          <div className="bg-teal-50 rounded-lg p-4">
            <div className="text-sm text-teal-600 font-medium">Avg Shared SKUs</div>
            <div className="text-2xl font-bold text-teal-800">{networkMetrics.avg_shared_skus}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-purple-600 font-medium">Network Density</div>
            <div className="text-2xl font-bold text-purple-800">{networkMetrics.network_density}%</div>
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        /* List View */
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVendors(vendors.map(v => v.vendor_id));
                      } else {
                        setSelectedVendors([]);
                      }
                    }}
                    checked={selectedVendors.length === vendors.length}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKUs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Regions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price Index</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reliability</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Competitiveness</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {vendors.map((vendor) => (
                <tr
                  key={vendor.vendor_id}
                  className={`hover:bg-gray-50 ${
                    selectedVendors.includes(vendor.vendor_id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedVendors.includes(vendor.vendor_id)}
                      onChange={() => toggleVendorSelection(vendor.vendor_id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{vendor.vendor_name}</div>
                    <div className="text-sm text-gray-500">{vendor.vendor_id}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-900">{vendor.total_skus}</td>
                  <td className="px-6 py-4 text-gray-900">{vendor.regions_covered}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${getPriceIndexColor(vendor.avg_price_index)}`}>
                      {vendor.avg_price_index}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {vendor.reliability_score ? (
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${vendor.reliability_score}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">{vendor.reliability_score}%</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 h-4 flex rounded overflow-hidden">
                        <div
                          className="bg-green-500"
                          style={{ width: `${vendor.competitiveness.below_market_pct}%` }}
                          title={`Below market: ${vendor.competitiveness.below_market_pct}%`}
                        ></div>
                        <div
                          className="bg-yellow-400"
                          style={{ width: `${vendor.competitiveness.at_market_pct}%` }}
                          title={`At market: ${vendor.competitiveness.at_market_pct}%`}
                        ></div>
                        <div
                          className="bg-red-400"
                          style={{ width: `${vendor.competitiveness.above_market_pct}%` }}
                          title={`Above market: ${vendor.competitiveness.above_market_pct}%`}
                        ></div>
                      </div>
                      <span className={`text-sm font-medium ${getCompetitivenessColor(vendor.competitiveness.below_market_pct)}`}>
                        {vendor.competitiveness.below_market_pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Matrix View */
        <div>
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-4 text-sm">
              <span className="font-medium text-gray-600">Shared SKUs:</span>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-100 rounded"></div>
                <span>1-4</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-200 rounded"></div>
                <span>5-14</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-400 rounded"></div>
                <span>15-24</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
                <span>25+</span>
              </div>
            </div>
          </div>

          {matrix && (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500"></th>
                    {matrix.vendors.map((vendorId) => (
                      <th
                        key={vendorId}
                        className="px-3 py-2 text-center text-xs font-medium text-gray-500 transform -rotate-45 origin-left"
                      >
                        {matrix.metadata[vendorId]?.name || vendorId}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.vendors.map((vendorId, rowIndex) => (
                    <tr key={vendorId}>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {matrix.metadata[vendorId]?.name || vendorId}
                      </td>
                      {matrix.relationships[rowIndex].map((value, colIndex) => (
                        <td
                          key={colIndex}
                          className={`px-3 py-2 text-center text-sm ${
                            rowIndex === colIndex
                              ? 'bg-gray-100 font-bold'
                              : getRelationshipStrength(value)
                          }`}
                        >
                          {value > 0 ? value : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Selected Vendors Comparison */}
      {selectedVendors.length >= 2 && (
        <div className="mt-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Comparing {selectedVendors.length} Vendors
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vendors
              .filter(v => selectedVendors.includes(v.vendor_id))
              .map(vendor => (
                <div key={vendor.vendor_id} className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-2">{vendor.vendor_name}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">SKUs:</span>
                      <span className="font-medium">{vendor.total_skus}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Price Index:</span>
                      <span className={`font-medium ${
                        vendor.avg_price_index < 100 ? 'text-green-600' :
                        vendor.avg_price_index > 100 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {vendor.avg_price_index}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Below Market:</span>
                      <span className="font-medium text-green-600">
                        {vendor.competitiveness.below_market_pct}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <strong>Shared SKUs between selected:</strong>{' '}
            {(() => {
              const selected = vendors.filter(v => selectedVendors.includes(v.vendor_id));
              if (selected.length === 2) {
                return selected[0].shared_skus[selected[1].vendor_id] || 0;
              }
              return 'Select exactly 2 vendors to see shared SKUs';
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
